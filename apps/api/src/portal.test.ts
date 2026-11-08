import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiErrorSchema, RecordVersionSchema, routes } from "@eqore/contract";
import { fixtureFetch } from "@eqore/sources";
import { createCaptureApp } from "./capture-server.ts";
import type { CaptureDeps } from "./capture.ts";
import type { DraftReading, Extraction, ExtractionRequest, Extractor } from "./extract.ts";
import { PORTAL_MAX_UPLOADS } from "./portal.ts";
import { createEngineerApp } from "./routes.ts";
import { Store } from "./store.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));
const SITE = "100-research-dr-worcester-ma";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0xe8, 0, 0, 0x01, 0xf4]);
const PDF = new TextEncoder().encode("%PDF-1.7\n% synthetic test drawing\n");
const reading = (field: string, extra: Partial<DraftReading>): DraftReading => ({ field, readable: true, text: null, number: null, unit: null, note: "", page: 1, region: null, ...extra });

async function setup(extraction: Extraction) {
  const calls: ExtractionRequest[] = [];
  const extractor: Extractor = async (request) => { calls.push(request); return extraction; };
  let clock = "2026-11-07T12:00:00.000Z";
  const deps: CaptureDeps = { store: new Store(), fetch: recorded, now: () => clock, uploadDir: mkdtempSync(join(tmpdir(), "portal-test-")), capturePublicUrl: "https://tunnel.invalid", extractor };
  const engineer = createEngineerApp(deps);
  const capture = createCaptureApp(deps);
  await engineer.request(routes.runSite.path, { method: "POST", body: JSON.stringify({ address: "100 Research Dr, Worcester, MA" }) });
  const link = await (await engineer.request(`/api/sites/${SITE}/portal-links`, { method: "POST" })).json() as { url: string };
  const token = link.url.split("/portal/")[1]!;
  const upload = (kind: string, bytes: Uint8Array = PNG, name = "label.png") => {
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", new File([Buffer.from(bytes)], name));
    return capture.request(`/portal/${token}/upload`, { method: "POST", body: form });
  };
  const read = async () => (await capture.request(`/portal/${token}`, { headers: { accept: "application/json" } })).json() as Promise<{ documents: { kind: string; status: string }[]; uploads: { kind: string; fileName: string }[]; uploadsLeft: number; address: string }>;
  const latest = async () => RecordVersionSchema.parse(await (await engineer.request(`/api/sites/${SITE}/versions/latest`)).json());
  const value = async (field: string) => (await latest()).values.find((v) => v.field === field)!;
  return { deps, engineer, capture, token, link, upload, read, latest, value, calls, setClock: (t: string) => (clock = t) };
}

describe("the customer document portal", () => {
  it("shows the customer what is needed, and nothing of the record's values", async () => {
    const t = await setup({ kind: "readings", readings: [] });
    const page = await t.read();
    expect(page.address).toMatch(/100 Research Dr/);
    expect(page.documents.map((d) => d.kind)).toEqual(["utility_bill", "switchgear_label", "transformer_nameplate", "electrical_drawings", "other"]);
    expect(page.documents.find((d) => d.kind === "switchgear_label")!.status).toBe("needed");
    expect(JSON.stringify(page)).not.toMatch(/observation|source|National Grid/);
    // Only a hash of the token is stored.
    expect(JSON.stringify(t.deps.store.db.prepare("SELECT * FROM portal_links").all())).not.toContain(t.token.slice(0, 20));
  });

  it("drafts the switchboard's values from its label as inferred, for an engineer to verify", async () => {
    const t = await setup({ kind: "readings", readings: [reading("main_device_rating", { number: 1200, unit: "amps" }), reading("kaic_rating", { number: 65, unit: "kAIC" }), reading("service_voltage", { text: "480Y/277 V" })] });
    const response = await t.upload("switchgear_label");
    expect(await response.json()).toMatchObject({ received: true, state: "read" });
    expect(t.calls[0]!.fields.map((f) => f.field)).toEqual(["main_device_rating", "service_voltage", "bus_rating", "kaic_rating", "switchgear_make_model"]);
    expect(await t.value("main_device_rating")).toMatchObject({ state: "inferred", method: "model_draft", current: { type: "quantity", value: 1200, unit: "A" } });
    expect(await t.value("kaic_rating")).toMatchObject({ state: "inferred", current: { type: "quantity", value: 65, unit: "kA" } });
    expect((await t.latest()).trigger).toBe("capture");
    expect((await t.read()).documents.find((d) => d.kind === "switchgear_label")!.status).toBe("received");
  });

  it("records drawings as provided, and never re-reads a value a person verified", async () => {
    const t = await setup({ kind: "readings", readings: [reading("service_voltage", { text: "208Y/120 V" })] });
    await t.engineer.request(`/api/sites/${SITE}/values/service_voltage/correct`, {
      method: "POST",
      body: JSON.stringify({ verifierName: "Engineer", evidence: [{ kind: "document", description: "Site visit" }], value: { type: "text", value: "480Y/277 V" } }),
    });
    await t.upload("electrical_drawings", PDF, "one-line.pdf");
    expect(t.calls[0]!.fields.map((f) => f.field)).not.toContain("service_voltage");
    expect(await t.value("service_voltage")).toMatchObject({ state: "verified", current: { type: "text", value: "480Y/277 V" } });
    expect(await t.value("one_line_diagram")).toMatchObject({ state: "inferred", current: { type: "text", value: "Provided by the customer: one-line.pdf" } });
    expect((await t.read()).uploads).toMatchObject([{ kind: "electrical_drawings", fileName: "one-line.pdf" }]);
  });

  it("refuses an unknown kind, a file that isn't an image or PDF, an expired link, and uploads past the limit", async () => {
    const t = await setup({ kind: "readings", readings: [] });
    const code = async (r: Response) => ApiErrorSchema.parse(await r.json()).code;
    expect(await code(await t.upload("lease"))).toBe("not_found");
    expect(await code(await t.upload("other", new TextEncoder().encode("<html>")))).toBe("file_type");
    expect(readdirSync(t.deps.uploadDir)).toHaveLength(0);
    t.deps.store.db.prepare("UPDATE portal_links SET uploads_used = ?").run(PORTAL_MAX_UPLOADS);
    expect(await code(await t.upload("other"))).toBe("upload_limit");
    t.setClock("2026-12-31T00:00:00.000Z");
    expect(await code(await t.upload("other"))).toBe("token_expired");
  });
});
