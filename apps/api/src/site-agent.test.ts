import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MapFeature, RecordVersion } from "@eqore/contract";
import { checkProposal, decideProposal, listProposals, reviewSite } from "./site-agent.ts";
import { Store } from "./store.ts";
import type { ApiDeps } from "./run.ts";

const mock = JSON.parse(readFileSync(new URL("../../web/src/mock/worcester.record.json", import.meta.url), "utf8")) as RecordVersion;
const building = mock.features.find((f) => f.kind === "building_outline")!;
const ring = (building.geometry.type === "Polygon" ? (building.geometry.coordinates as [number, number][][])[0] : (building.geometry.coordinates as [number, number][][][])[0]![0]) as [number, number][];
const centre: [number, number] = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
// A test equipment box 12 m east of the building's centre, as the lidar collector would add it.
const box: MapFeature = {
  id: "lidar-pad-mount-1",
  kind: "existing_equipment",
  field: "detected_grid_equipment",
  geometry: { type: "Point", coordinates: [centre[0] + 12 / (111320 * Math.cos((centre[1] * Math.PI) / 180)), centre[1]] },
  label: "(E) EQUIPMENT BOX, LIKELIEST TRANSFORMER",
  attributes: { equipment_type: { type: "text", value: "pad_mount_transformer_candidate" }, candidate_rank: { type: "quantity", value: 1, unit: "rank" } },
};

function depsWithSite(): ApiDeps {
  const store = new Store();
  const record = { ...mock, features: [...mock.features, box] };
  store.saveSite(record.site);
  store.appendObservations(record.observations);
  store.saveVersion(record);
  let tick = 0;
  return { store, fetch: globalThis.fetch, now: () => `2026-11-08T00:00:${String(tick++ % 60).padStart(2, "0")}.000Z` };
}

// A stand-in for Claude that plays a fixed script of turns and records what it was sent.
function scripted(turns: { tools?: { name: string; input: unknown }[]; text?: string }[]) {
  const sent: unknown[] = [];
  let turn = 0;
  const client = {
    messages: {
      create: async (request: { messages: unknown[] }) => {
        sent.push(structuredClone(request.messages));
        const step = turns[turn++]!;
        const content = step.tools
          ? step.tools.map((tool, i) => ({ type: "tool_use", id: `call-${turn}-${i}`, name: tool.name, input: tool.input }))
          : [{ type: "text", text: step.text ?? "" }];
        return { content, stop_reason: step.tools ? "tool_use" : "end_turn" };
      },
    },
  };
  return { client: client as never, sent };
}

let evalDir: string;
beforeEach(() => { evalDir = mkdtempSync(join(tmpdir(), "eval-")); process.env.EVAL_DIR = evalDir; });
afterEach(() => { delete process.env.EVAL_DIR; });

describe("the site review agent", () => {
  it("reports itself unavailable without an API key, and changes nothing", async () => {
    const deps = depsWithSite();
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const result = await reviewSite(deps, mock.site.id);
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    expect(result.status).toBe("unavailable");
    expect(deps.store.latestVersionNumber(mock.site.id)).toBe(mock.version);
  });

  it("reads the site through its tools and stores only proposals that pass the checks", async () => {
    const deps = depsWithSite();
    const { client, sent } = scripted([
      { tools: [{ name: "read_site", input: {} }, { name: "list_equipment", input: {} }, { name: "check_site_plan", input: {} }, { name: "past_decisions", input: {} }] },
      { tools: [
        { name: "propose", input: { type: "pin", field: "utility_transformer_location", featureId: "lidar-pad-mount-1", rationale: "The box the lidar ranked likeliest." } },
        { name: "propose", input: { type: "pin", field: "meter_location", longitude: centre[0] + 0.01, latitude: centre[1], rationale: "Far away." } },
        { name: "propose", input: { type: "pin", field: "roof_area", featureId: "lidar-pad-mount-1", rationale: "Not a pin field." } },
      ] },
      { text: "Proposed the transformer pin." },
    ]);
    const result = await reviewSite(deps, mock.site.id, client);
    expect(result.status).toBe("done");
    expect(result.summary).toBe("Proposed the transformer pin.");
    expect(result.proposals.map((p) => p.payload)).toMatchObject([{ type: "pin", field: "utility_transformer_location" }]);
    // The tool results went back to the model, including why two proposals were refused.
    const lastSent = JSON.stringify(sent.at(-1));
    expect(lastSent).toMatch(/too far/);
    expect(lastSent).toMatch(/Not a valid proposal/);
    expect(lastSent).toContain("lidar-pad-mount-1");
    // Nothing on the record changed.
    expect(deps.store.latestVersionNumber(mock.site.id)).toBe(mock.version);
  });

  it("applies an accepted pin in the person's name, records the label, and shows the decision at the next review", async () => {
    const deps = depsWithSite();
    const { client } = scripted([
      { tools: [{ name: "propose", input: { type: "pin", field: "utility_transformer_location", featureId: "lidar-pad-mount-1", rationale: "Likeliest box." } }] },
      { text: "done" },
    ]);
    const [proposal] = (await reviewSite(deps, mock.site.id, client)).proposals;
    expect(() => decideProposal(deps, proposal!.id, "accepted", { verifierName: "" })).toThrow(/name of the person/);
    const { record } = decideProposal(deps, proposal!.id, "accepted", { verifierName: "Engineer", reason: "Matches the plan set." });
    expect(record!.version).toBe(mock.version + 1);
    expect(record!.features.find((f) => f.kind === "capture_pin" && f.field === "utility_transformer_location")).toBeTruthy();
    expect(() => decideProposal(deps, proposal!.id, "rejected", { verifierName: "Engineer", reason: "x" })).toThrow(/already accepted/);
    const labels = JSON.parse(readFileSync(join(evalDir, "labels.json"), "utf8"));
    expect(labels).toMatchObject([{ siteId: mock.site.id, kind: "transformer", proposalId: proposal!.id }]);

    const next = scripted([{ tools: [{ name: "past_decisions", input: {} }] }, { text: "done" }]);
    await reviewSite(deps, mock.site.id, next.client);
    expect(JSON.stringify(next.sent.at(-1))).toMatch(/accepted.*Matches the plan set/);
  });

  it("records a rejection with its reason and changes nothing", async () => {
    const deps = depsWithSite();
    const { client } = scripted([{ tools: [{ name: "propose", input: { type: "question", text: "Where is the meter?", rationale: "No meter data." } }] }, { text: "done" }]);
    const [proposal] = (await reviewSite(deps, mock.site.id, client)).proposals;
    decideProposal(deps, proposal!.id, "rejected", { verifierName: "Engineer", reason: "Already known from the bill." });
    expect(listProposals(deps, { siteId: mock.site.id })[0]!.decision).toMatchObject({ decision: "rejected", reason: "Already known from the bill." });
    expect(deps.store.latestVersionNumber(mock.site.id)).toBe(mock.version);
  });

  it("refuses a conflict resolution for a value that isn't conflicting", () => {
    const record = { ...mock, features: [...mock.features, box] };
    const verified = mock.values.find((v) => v.state !== "conflicting")!;
    expect(checkProposal(record, { type: "resolve_conflict", field: verified.field, candidateId: "x", rationale: "r" })).toMatchObject({ ok: false });
  });
});
