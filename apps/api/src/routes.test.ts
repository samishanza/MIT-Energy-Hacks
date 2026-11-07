import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiErrorSchema, RecordVersionSchema, RunProgressSchema, RunSiteResponseSchema, routes } from "@eqore/contract";
import type { Observation, ObservedValue, RecordVersion, Value } from "@eqore/contract";
import { fixtureFetch } from "@eqore/sources";
import type { CaptureDeps } from "./capture.ts";
import { createEngineerApp } from "./routes.ts";
import { checkReadiness } from "./readiness.ts";
import { nextVersion } from "./run.ts";
import { Store } from "./store.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));

const ADDRESS = "100 Research Dr, Worcester, MA";
const SITE = "100-research-dr-worcester-ma";
const evidence = [{ kind: "document", description: "Survey on file" }];

const testDeps = (snapshot = false): CaptureDeps => ({
  store: new Store(),
  fetch: recorded,
  now: () => new Date().toISOString(),
  snapshot,
  uploadDir: join(tmpdir(), "engineer-api-test-uploads"),
  capturePublicUrl: "https://tunnel.invalid",
  extractor: async () => ({ kind: "failed", reason: "No model call in this test" }),
});

function setup() {
  const deps = testDeps();
  const app = createEngineerApp(deps);
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const value = (record: RecordVersion, field: string): Value => record.values.find((entry) => entry.field === field)!;
  const run = async (address = ADDRESS) => {
    const response = await post(routes.runSite.path, { address });
    const body = RunSiteResponseSchema.parse(await response.json());
    if (body.status !== "ok") throw new Error("Expected a record");
    return body.record;
  };
  return { deps, app, post, value, run };
}

// A labeled synthetic draft, as the capture path would store it from a nameplate photo.
function draft(id: string, number: number, siteId = SITE): Observation {
  return {
    id,
    siteId,
    field: "main_device_rating",
    kind: "reading",
    value: { type: "quantity", value: number, unit: "A" },
    source: { id: "capture-draft", name: "SYNTHETIC TEST draft from a nameplate photo", kind: "human_evidence", dataOrigin: "synthetic" },
    retrievedAt: "2026-11-07T10:00:00Z",
    sourceDate: null,
    method: "model_draft",
    locator: { evidenceFileId: "file-1", imageRegion: { x: 1, y: 2, width: 3, height: 4 } },
    identity: { sourceId: "capture-draft", query: "main_device_rating", contentHash: `hash-${number}` },
    grade: "nameplate",
    synthetic: true,
  };
}

describe("the engineer API", () => {
  it("runs a site end to end from fixtures, with every source accounted for", async () => {
    const { run, deps } = setup();
    const record = await run();

    expect(() => RecordVersionSchema.parse(record)).not.toThrow();
    expect(record.version).toBe(1);
    expect(record.trigger).toBe("run");
    expect(record.synthetic).toBe(false);
    expect(record.sourceRuns.map((source) => [source.sourceId, source.status])).toEqual([
      ["massgis-l3-parcels", "done"],
      ["massgis-imagery-2025", "done"],
      ["massgis-roofprints", "done"],
      ["national-grid-hosting-capacity", "done"],
      ["national-grid-feeder-lines", "done"],
      ["national-grid-feeder-loading", "done"],
      ["national-grid-construction-1", "done"],
      ["national-grid-construction-2", "done"],
      ["national-grid-construction-4", "done"],
      ["national-grid-construction-5", "done"],
      ["national-grid-group-studies", "done"],
      ["national-grid-nodal-feeders", "done"],
      ["national-grid-nodal-primary", "done"],
      ["census-tiger-local-roads", "done"],
      ["national-grid-substations", "done"],
      ["massgis-municipalities", "done"],
      ["massdot-roads", "done"],
      ["massdep-wetlands", "done"],
      ["massgis-fire-stations", "done"],
      ["usgs-epqs", "done"],
      ["hifld-retail-territories", "done"],
      ["massgis-lidar-dem", "done"],
      ["earth-engine", "missing"],
      ["fema-flood-map", "person_only"],
    ]);
    expect(deps.store.observations(SITE).length).toBe(record.observations.length);
    expect(record.baseMap?.tileUrlTemplate).toContain("Massachusetts_Aerial_Imagery_2025");
  });

  it("returns the candidates and stores nothing when an address needs a choice", async () => {
    const { deps } = setup();
    deps.fetch = async () => new Response(JSON.stringify({ features: [] }));
    const app = createEngineerApp(deps);
    const response = await app.request(routes.runSite.path, {
      method: "POST",
      body: JSON.stringify({ address: "999 Nowhere Rd, Worcester, MA" }),
    });
    expect(await response.json()).toEqual({ status: "needs_choice", candidates: [] });
    expect(deps.store.observations("999-nowhere-rd-worcester-ma")).toEqual([]);
  });

  it("keeps a draft of 800 A and makes a correction to 600 A verified with the verifier's name", async () => {
    const { deps, post, run, value } = setup();
    const first = await run();
    deps.store.appendObservations([draft("draft-1", 800)]);
    const withDraft = nextVersion(deps, first, "capture");
    expect(value(withDraft, "main_device_rating")).toMatchObject({ state: "inferred", method: "model_draft" });

    const corrected: ObservedValue = { type: "quantity", value: 600, unit: "A" };
    const response = await post(`/api/sites/${SITE}/values/main_device_rating/correct`, {
      verifierName: "A. Engineer",
      evidence: [{ kind: "observation", observationId: "draft-1" }],
      value: corrected,
    });
    const record = RecordVersionSchema.parse(await response.json());
    const rating = value(record, "main_device_rating");

    expect(rating.state).toBe("verified");
    expect(rating.current).toEqual(corrected);
    expect(rating.verification?.verifierName).toBe("A. Engineer");
    expect(rating.observationIds).toContain("draft-1");
    const kept = record.observations.find((observation) => observation.id === "draft-1")!;
    expect(kept.value).toEqual({ type: "quantity", value: 800, unit: "A" });
    expect(kept.method).toBe("model_draft");
  });

  it("rejects a verify request with no named person or no evidence, and changes nothing", async () => {
    const { deps, post, run } = setup();
    await run();
    const before = deps.store.observations(SITE).length;

    const noName = await post(`/api/sites/${SITE}/values/parcel_id/confirm`, { verifierName: " ", evidence });
    expect(noName.status).toBe(400);
    expect(ApiErrorSchema.parse(await noName.json()).code).toBe("verifier_required");

    const noEvidence = await post(`/api/sites/${SITE}/values/parcel_id/confirm`, { verifierName: "A. Engineer", evidence: [] });
    expect(noEvidence.status).toBe(400);
    expect(ApiErrorSchema.parse(await noEvidence.json()).code).toBe("evidence_required");

    const made_up = await post(`/api/sites/${SITE}/values/parcel_id/confirm`, {
      verifierName: "A. Engineer",
      evidence: [{ kind: "observation", observationId: "not-on-this-record" }],
    });
    expect(ApiErrorSchema.parse(await made_up.json()).code).toBe("evidence_required");
    expect(deps.store.observations(SITE).length).toBe(before);
  });

  it("moves a verified value to conflicting on newer evidence and keeps the verifier's record", async () => {
    const { deps, post, run, value } = setup();
    const first = await run();
    deps.store.appendObservations([draft("draft-1", 800)]);
    nextVersion(deps, first, "capture");
    const confirmed = RecordVersionSchema.parse(
      await (
        await post(`/api/sites/${SITE}/values/main_device_rating/confirm`, {
          verifierName: "A. Engineer",
          evidence: [{ kind: "observation", observationId: "draft-1" }],
          expectedObservationId: "draft-1",
        })
      ).json(),
    );
    expect(value(confirmed, "main_device_rating").state).toBe("verified");

    deps.store.appendObservations([draft("draft-2", 1200)]);
    const record = nextVersion(deps, confirmed, "capture");
    const rating = value(record, "main_device_rating");

    expect(rating.state).toBe("conflicting");
    expect(rating.verification?.verifierName).toBe("A. Engineer");
    expect(rating.candidates.map((candidate) => candidate.value)).toEqual([
      { type: "quantity", value: 800, unit: "A" },
      { type: "quantity", value: 1200, unit: "A" },
    ]);
  });

  it("keeps a verified lot-size conflict verified after a re-run from the same fixture", async () => {
    const { deps, post, run, value } = setup();
    const first = await run();
    const lotSize = value(first, "lot_size_acres");
    expect(lotSize.state).toBe("conflicting");

    const resolved = await post(`/api/sites/${SITE}/values/lot_size_acres/resolve`, {
      verifierName: "A. Engineer",
      evidence,
      candidateId: lotSize.candidates[0]!.id,
    });
    expect(resolved.status).toBe(200);
    const before = deps.store.observations(SITE).length;

    const again = await run();
    expect(value(again, "lot_size_acres")).toMatchObject({ state: "verified", current: lotSize.candidates[0]!.value });
    expect(value(again, "lot_size_acres").candidates).toHaveLength(2);
    // The repeat read is on file.
    expect(deps.store.observations(SITE).length).toBeGreaterThan(before);
    expect(again.version).toBe(3);
  });

  it("lets a named person with evidence verify a missing or unreadable value, and refuses without either", async () => {
    const { deps, post, run, value } = setup();
    const first = await run();
    const entered = { type: "text", value: "M-1234" };

    const refused = await post(`/api/sites/${SITE}/values/meter_number/correct`, { evidence, value: entered });
    expect(ApiErrorSchema.parse(await refused.json()).code).toBe("verifier_required");

    const missing = RecordVersionSchema.parse(
      await (await post(`/api/sites/${SITE}/values/meter_number/correct`, { verifierName: "A. Engineer", evidence, value: entered })).json(),
    );
    expect(value(missing, "meter_number")).toMatchObject({ state: "verified", current: entered });

    deps.store.appendObservations([
      { ...draft("blurred", 0), field: "account_number", kind: "unreadable", value: null, reason: "Too blurred to read", identity: { sourceId: "capture-draft", query: "account_number", contentHash: "blur" } },
    ]);
    const blurred = nextVersion(deps, first, "capture");
    expect(value(blurred, "account_number").state).toBe("unreadable");
    const read = RecordVersionSchema.parse(
      await (await post(`/api/sites/${SITE}/values/account_number/correct`, { verifierName: "A. Engineer", evidence, value: { type: "text", value: "A-9" } })).json(),
    );
    expect(value(read, "account_number").state).toBe("verified");
  });

  it("leaves an inferred value inferred after a failed retake", async () => {
    const { deps, run, value } = setup();
    const first = await run();
    deps.store.appendObservations([
      draft("draft-1", 800),
      { ...draft("retake", 0), kind: "unreadable", value: null, reason: "Too dark", identity: { sourceId: "capture-draft", query: "main_device_rating", contentHash: "dark" } },
      { ...draft("failed", 0), kind: "failed_extraction", value: null, reason: "Connection reset", identity: { sourceId: "capture-draft", query: "main_device_rating", contentHash: "err" } },
    ]);
    const record = nextVersion(deps, first, "capture");
    const rating = value(record, "main_device_rating");
    expect(rating.state).toBe("inferred");
    expect(rating.current).toEqual({ type: "quantity", value: 800, unit: "A" });
    expect(rating.flags.join(" ")).toContain("Connection reset");
  });

  it("refuses transitions the state model doesn't allow", async () => {
    const { post, run } = setup();
    await run();
    const confirmMissing = await post(`/api/sites/${SITE}/values/meter_number/confirm`, { verifierName: "A. Engineer", evidence, expectedObservationId: "none" });
    expect(confirmMissing.status).toBe(409);
    expect(ApiErrorSchema.parse(await confirmMissing.json()).code).toBe("illegal_transition");

    const resolveInferred = await post(`/api/sites/${SITE}/values/parcel_id/resolve`, { verifierName: "A. Engineer", evidence, candidateId: "x" });
    expect(resolveInferred.status).toBe(409);
  });

  it("returns an older version's original values", async () => {
    const { app, post, run, value } = setup();
    const first = await run();
    await post(`/api/sites/${SITE}/values/parcel_id/confirm`, { verifierName: "A. Engineer", evidence, expectedObservationId: value(first, "parcel_id").currentObservationId });

    const older = RecordVersionSchema.parse(await (await app.request(`/api/sites/${SITE}/versions/1`)).json());
    const latest = RecordVersionSchema.parse(await (await app.request(`/api/sites/${SITE}/versions/latest`)).json());
    expect(value(older, "parcel_id").state).toBe("inferred");
    expect(older).toEqual(first);
    expect(latest.version).toBe(2);
    expect(value(latest, "parcel_id").state).toBe("verified");

    const none = await app.request(`/api/sites/${SITE}/versions/99`);
    expect(none.status).toBe(404);
  });

  it("records a moved pin as placed by hand and labels the equipment once verified", async () => {
    const { post, run, value } = setup();
    await run();
    const pinned = RecordVersionSchema.parse(
      await (await post(`/api/sites/${SITE}/pins`, { field: "switchboard_location", latitude: 42.276, longitude: -71.769, placedBy: "A. Engineer" })).json(),
    );
    expect(pinned.features.find((feature) => feature.id === "pin-switchboard_location")).toMatchObject({ kind: "capture_pin", placedByHand: true });
    expect(value(pinned, "switchboard_location")).toMatchObject({ state: "inferred", method: "hand_placed" });

    // Moving it again replaces the reading rather than reading as a source conflict.
    const moved = RecordVersionSchema.parse(
      await (await post(`/api/sites/${SITE}/pins`, { field: "switchboard_location", latitude: 42.277, longitude: -71.769, placedBy: "A. Engineer" })).json(),
    );
    expect(value(moved, "switchboard_location")).toMatchObject({ state: "inferred", current: { type: "text", value: "42.277, -71.769" } });
    expect(moved.features.filter((feature) => feature.id === "pin-switchboard_location")).toHaveLength(1);

    const verified = RecordVersionSchema.parse(
      await (await post(`/api/sites/${SITE}/values/switchboard_location/confirm`, { verifierName: "A. Engineer", evidence, expectedObservationId: value(moved, "switchboard_location").currentObservationId })).json(),
    );
    expect(verified.features.find((feature) => feature.id === "pin-switchboard_location")).toMatchObject({
      kind: "existing_equipment",
      label: "(E) MAIN SWITCHBOARD",
    });
  });

  it("marks a record served from recorded data as a snapshot", async () => {
    const response = await createEngineerApp(testDeps(true)).request(routes.runSite.path, { method: "POST", body: JSON.stringify({ address: ADDRESS }) });
    const body = RunSiteResponseSchema.parse(await response.json());
    if (body.status !== "ok") throw new Error("Expected a record");
    expect(body.record.snapshot).toBe(true);
    expect(body.record.sourceRuns[0]!.status).toBe("snapshot");
  });

  it("takes a pin moved back to an earlier spot, so the value and the map agree", async () => {
    const { post, run, value } = setup();
    await run();
    const move = async (latitude: number) =>
      RecordVersionSchema.parse(await (await post(`/api/sites/${SITE}/pins`, { field: "meter_location", latitude, longitude: -71.769, placedBy: "A. Engineer" })).json());
    await move(42.276);
    await move(42.277);
    const back = await move(42.276);
    expect(value(back, "meter_location").current).toEqual({ type: "text", value: "42.276, -71.769" });
    expect(back.features.find((feature) => feature.id === "pin-meter_location")!.geometry).toEqual({ type: "Point", coordinates: [-71.769, 42.276] });
  });

  it("refuses a confirm that names a reading the value no longer rests on", async () => {
    const { post, run, value } = setup();
    await run();
    const pin = async (latitude: number) =>
      RecordVersionSchema.parse(await (await post(`/api/sites/${SITE}/pins`, { field: "meter_location", latitude, longitude: -71.769, placedBy: "A. Engineer" })).json());
    const first = await pin(42.276);
    const seen = value(first, "meter_location").observationIds.at(-1)!;
    const moved = await pin(42.277);
    const confirm = (observationId: string) => post(`/api/sites/${SITE}/values/meter_location/confirm`, { verifierName: "A. Engineer", evidence: [{ kind: "observation", observationId }], expectedObservationId: observationId });

    const refused = await confirm(seen);
    expect(refused.status).toBe(409);
    expect(ApiErrorSchema.parse(await refused.json()).code).toBe("stale_value");

    const accepted = await confirm(value(moved, "meter_location").observationIds.at(-1)!);
    expect(accepted.status).toBe(200);
  });

  it("keeps the record when the parcel source fails on a re-run, and keeps working once it returns", async () => {
    const { deps, app, post, run, value } = setup();
    const first = await run();
    const before = deps.store.observations(SITE).length;
    const realFetch = deps.fetch;
    deps.fetch = async (url, init) => {
      if (url.includes("Massachusetts_Property_Tax_Parcels")) return new Response(JSON.stringify({ error: { message: "Invalid query parameters." } }));
      if (url.includes("geocoding.geo.census.gov")) {
        return new Response(JSON.stringify({ result: { addressMatches: [{ matchedAddress: "100 RESEARCH DR", coordinates: { x: -71.77, y: 42.27 } }] } }));
      }
      return realFetch(url, init);
    };
    deps.retryDelayMs = 0;
    const response = await post(routes.runSite.path, { address: ADDRESS });
    expect(response.status).toBe(502);
    expect(ApiErrorSchema.parse(await response.json()).code).toBe("source_failed");
    expect(deps.store.observations(SITE).length).toBe(before);

    deps.fetch = realFetch;
    const again = await run();
    expect(value(again, "site_location")).toMatchObject({ state: "inferred", method: "computed" });
    expect(value(again, "feeder").candidates).toHaveLength(value(first, "feeder").candidates.length);
    expect((await app.request(`/api/sites/${SITE}/versions/latest`)).status).toBe(200);
  });

  it("refuses requests from another site or a rebound host, and accepts the local app", async () => {
    const { app, run, value } = setup();
    const first = await run();
    const expectedObservationId = value(first, "parcel_id").currentObservationId;
    const confirm = (headers: Record<string, string>) =>
      app.request(`/api/sites/${SITE}/values/parcel_id/confirm`, { method: "POST", headers, body: JSON.stringify({ verifierName: "Forged", evidence, expectedObservationId }) });

    const upload = new FormData();
    upload.append("file", new Blob(["forged"], { type: "image/png" }), "forged.png");
    const forgedUpload = await app.request(`/api/sites/${SITE}/values/meter_number/evidence`, { method: "POST", headers: { origin: "https://evil.example" }, body: upload });
    expect(forgedUpload.status).toBe(403);

    expect((await confirm({ "content-type": "text/plain", origin: "https://evil.example" })).status).toBe(403);
    expect((await confirm({ origin: "null" })).status).toBe(403);
    expect((await confirm({ host: "attacker.example:8787" })).status).toBe(403);
    expect((await app.request(`/api/sites/${SITE}/versions/latest`, { headers: { host: "attacker.example:8787" } })).status).toBe(403);

    const local = await confirm({ host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" });
    expect(local.status).toBe(200);
  });

  it("answers run progress by the address as typed, and 404 when there's no run", async () => {
    const deps = { ...testDeps(), progress: new Map() };
    const app = createEngineerApp(deps);
    await app.request(routes.runSite.path, { method: "POST", body: JSON.stringify({ address: ADDRESS }) });
    const response = await app.request(`${routes.readRunProgress.path}?address=${encodeURIComponent(ADDRESS)}`);
    const progress = RunProgressSchema.parse(await response.json());
    expect(progress.status).toBe("done");
    expect(progress.site?.id).toBe(SITE);
    expect(progress.features.some((feature) => feature.kind === "property_line")).toBe(true);
    expect((await app.request(`${routes.readRunProgress.path}?address=nowhere`)).status).toBe(404);
  });

  it("says why when an address can't be settled, rather than offering an empty choice", async () => {
    const { deps } = setup();
    deps.fetch = async (url) => new Response(JSON.stringify(url.includes("geocoder") ? { result: { addressMatches: [] } } : { features: [] }));
    const app = createEngineerApp(deps);
    const unknown = await app.request(routes.runSite.path, { method: "POST", body: JSON.stringify({ address: "nowhere in particular" }) });
    expect(unknown.status).toBe(404);
    deps.fetch = async () => new Response("down", { status: 503 });
    const down = await createEngineerApp(deps).request(routes.runSite.path, { method: "POST", body: JSON.stringify({ address: "nowhere in particular" }) });
    expect(down.status).toBe(502);
    expect(ApiErrorSchema.parse(await down.json()).message).toContain("HTTP 503");
  });

  it("falls back to the geocoded point when the parcel lookup outlasts its limit, and still finishes", async () => {
    const { deps, value } = setup();
    deps.fetch = (url, init) => (url.includes("Property_Tax_Parcels") ? new Promise(() => {}) : recorded(url, init));
    deps.resolveDeadlineMs = 50;
    deps.runDeadlineMs = 50;
    const response = await createEngineerApp(deps).request(routes.runSite.path, { method: "POST", body: JSON.stringify({ address: "11 Bartzak Dr, Holliston, MA" }) });
    const body = RunSiteResponseSchema.parse(await response.json());
    if (body.status !== "ok") throw new Error("Expected a record");
    expect(body.record.site.locationMethod).toBe("geocoded_interpolated");
    expect(value(body.record, "parcel_id").reason).toContain("parcel lookup's 0-second deadline");
  });

  it("resolves a pin choice to a site", async () => {
    const { post } = setup();
    const response = await post(routes.runSite.path, { address: ADDRESS, choice: { kind: "pin", latitude: 42.27614096601859, longitude: -71.7694444626631 } });
    const body = RunSiteResponseSchema.parse(await response.json());
    if (body.status !== "ok") throw new Error("Expected a record");
    expect(body.record.site.id).toBe(SITE);
  });

  it("names the utility and shows no readiness share where no requirements table applies", async () => {
    const { run, value } = setup();
    const hyannis = await run("367 Main St, Hyannis, MA");
    expect(value(hyannis, "serving_utility").current).toEqual({ type: "text", value: "Eversource" });
    expect(checkReadiness(hyannis).share).toBeNull();
    const holliston = await run("11 Bartzak Dr, Holliston, MA");
    expect(value(holliston, "serving_utility").state).toBe("conflicting");
    expect(checkReadiness(holliston).share).toBeNull();
    expect(checkReadiness(await run()).share).not.toBeNull();
  });

  it("sets catalog coverage on the record", async () => {
    const { run } = setup();
    const record = await run();
    expect(record.coverage?.total).toBeGreaterThan(70);
    expect(record.coverage?.filled).toBeGreaterThan(10);
  });

  it("sends no CORS headers", async () => {
    const { app } = setup();
    const response = await app.request(`/api/sites/${SITE}/versions/latest`, { headers: { origin: "https://example.invalid" } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
