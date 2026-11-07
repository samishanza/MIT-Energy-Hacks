import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ReadinessReportSchema, RecordVersionSchema, routes } from "@eqore/contract";
import type { Observation, ObservedValue, RecordVersion } from "@eqore/contract";
import { deriveValues, fixtureFetch } from "@eqore/sources";
import { checkReadiness } from "./readiness.ts";
import { createEngineerApp } from "./routes.ts";
import { Store } from "./store.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));

const verifiedBy = { verifierName: "A. Engineer", verifiedAt: "2026-11-07T12:00:00Z", evidence: [{ kind: "document" as const, description: "SYNTHETIC TEST bill" }] };

let sequence = 0;
function reading(field: string, value: ObservedValue, extra: Partial<Observation> = {}): Observation {
  sequence += 1;
  return {
    id: `obs-${sequence}`,
    siteId: "test-site",
    field,
    kind: "reading",
    value,
    source: { id: "test", name: "SYNTHETIC TEST source", kind: "human_evidence", dataOrigin: "synthetic" },
    retrievedAt: "2026-11-07T10:00:00Z",
    sourceDate: null,
    method: "source_read",
    locator: {},
    identity: { sourceId: "test", query: field, contentHash: `hash-${sequence}` },
    grade: "reference",
    synthetic: true,
    ...extra,
  };
}

const verified = (field: string, value: ObservedValue) =>
  reading(field, value, { kind: "verification", method: "person_entered", verification: verifiedBy });

function record(observations: Observation[]): RecordVersion {
  return RecordVersionSchema.parse({
    id: "test-site-v1",
    contractVersion: "1",
    version: 1,
    createdAt: "2026-11-07T12:00:00Z",
    trigger: "run",
    snapshot: false,
    synthetic: true,
    site: { id: "test-site", address: "1 SYNTHETIC TEST Way, Worcester, MA", region: "massachusetts", location: null, locationMethod: null },
    values: deriveValues(observations),
    observations,
    features: [],
    baseMap: null,
    sourceRuns: [],
  });
}

const NATIONAL_GRID = reading("serving_utility", { type: "text", value: "National Grid" });
const item = (report: ReturnType<typeof checkReadiness>, id: string) => report.items.find((entry) => entry.id === id)!;

describe("the readiness check", () => {
  it("lists every required item with its owner for a record with nothing else in it", () => {
    const report = checkReadiness(record([NATIONAL_GRID]));

    expect(report.requirementsTable).toEqual({ utility: "National Grid", form: "M.D.P.U. No. 1632, Exhibit C", formDate: "2026-05-01", superseded: false });
    expect(report.items.map((entry) => [entry.id, entry.owner])).toEqual([
      ["applicant-contacts", "customer"],
      ["site-control", "customer"],
      ["single-parcel", "engineer"],
      ["existing-generation", "customer"],
      ["existing-facility", "customer"],
      ["new-or-change", "engineer"],
      ["facility-address", "public_data"],
      ["distribution-company", "utility"],
      ["account-number", "customer"],
      ["meter-number", "customer"],
      ["pre-application-report", "utility"],
      ["system-capacity", "engineer"],
      ["generating-equipment", "engineer"],
      ["export-plan", "engineer"],
      ["applicant-signature", "engineer"],
      ["generator-characteristics", "engineer"],
      ["interconnection-equipment", "engineer"],
      ["one-line", "engineer"],
      ["service-voltage", "customer"],
      ["main-device", "engineer"],
      ["bus", "qualified_person"],
      ["kaic", "qualified_person"],
      ["site-documentation", "engineer"],
      ["property-line", "public_data"],
      ["building-outline", "public_data"],
      ["aerial", "public_data"],
      ["switchboard-location", "customer"],
      ["meter-location", "customer"],
      ["transformer-location", "customer"],
      ["protective-interface-location", "engineer"],
      ["protection-schematics", "engineer"],
    ]);
    expect(item(report, "one-line").citation).toBe("M.D.P.U. No. 1632, Exhibit C, Page 124");
    expect(item(report, "site-control").citation).toBe("M.D.P.U. No. 1632, Exhibit C, Page 116, 125 to 128");
    expect(item(report, "meter-number").citation).toBe("M.D.P.U. No. 1632, Exhibit C, Page 115, 117");
    expect(item(report, "new-or-change").citation).toBe("M.D.P.U. No. 1632, Exhibit C, Page 117");
    expect(item(report, "main-device")).toMatchObject({ rowKind: "input", teamDerived: true, parentItemId: "one-line" });
    expect(() => ReadinessReportSchema.parse(report)).not.toThrow();
  });

  it("clears only the meter item when a verified bill fills the meter number", () => {
    const before = checkReadiness(record([NATIONAL_GRID]));
    const after = checkReadiness(record([NATIONAL_GRID, verified("meter_number", { type: "text", value: "M-1" })]));

    const changed = after.items.filter((entry) => entry.status !== item(before, entry.id).status).map((entry) => entry.id);
    expect(changed).toEqual(["meter-number"]);
    expect(item(after, "meter-number").status).toBe("has_evidence");
    // The same bill can still fill the account number.
    expect(after.gaps.find((gap) => gap.id === "bill")).toMatchObject({ field: "account_number", rowsFilled: ["account-number"] });
  });

  it("clears a nameplate's input row and updates the ranking, while the one-line stays engineer-owned", () => {
    const before = checkReadiness(record([NATIONAL_GRID]));
    expect(before.gaps.find((gap) => gap.id === "nameplate-photo")!.rowsFilled).toEqual(["service-voltage", "main-device"]);

    const after = checkReadiness(record([NATIONAL_GRID, verified("main_device_rating", { type: "quantity", value: 600, unit: "A" })]));
    expect(item(after, "main-device").status).toBe("has_evidence");
    expect(item(after, "one-line")).toMatchObject({ status: "engineer_owned", inputsWithEvidence: { have: 1, total: 4 } });
    expect(after.gaps.find((gap) => gap.id === "nameplate-photo")!.rowsFilled).toEqual(["service-voltage"]);
    expect(after.gaps.find((gap) => gap.id === "nameplate-photo")!.rank).toBeGreaterThan(before.gaps.find((gap) => gap.id === "nameplate-photo")!.rank);
  });

  it("shows no readiness share and names the bill when a record has no serving utility", () => {
    const report = checkReadiness(record([]));
    expect(report.requirementsTable).toBeNull();
    expect(report.share).toBeNull();
    expect(report.items).toEqual([]);
    expect(report.noTableReason).toContain("no serving utility");
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0]).toMatchObject({ route: "capture_bill", rank: 1, captureLinkAllowed: true });
  });

  it("says the table isn't built for a utility with none, without a share", () => {
    const report = checkReadiness(record([reading("serving_utility", { type: "text", value: "PG&E" })]));
    expect(report.requirementsTable).toBeNull();
    expect(report.share).toBeNull();
    expect(report.noTableReason).toContain("PG&E");
  });

  it("treats inferred feeder data as a preview, not as the Pre-Application Report", () => {
    const report = checkReadiness(record([NATIONAL_GRID, reading("feeder", { type: "text", value: "05_01_27W2" })]));
    expect(item(report, "pre-application-report").status).toBe("preview_only");
    expect(report.gaps.find((gap) => gap.id === "pre-application-report")).toMatchObject({ route: "pre_application_report", owner: "utility", captureLinkAllowed: false });
  });

  it("keeps engineer-owned items engineer-owned whatever data arrives", () => {
    const report = checkReadiness(record([NATIONAL_GRID, verified("one_line_diagram", { type: "text", value: "SYNTHETIC TEST drawing" }), verified("system_capacity_kw", { type: "quantity", value: 100, unit: "kW" })]));
    expect(item(report, "one-line").status).toBe("engineer_owned");
    expect(item(report, "system-capacity").status).toBe("engineer_owned");
    expect(report.gaps.some((gap) => gap.id === "engineer-one-line")).toBe(false);
    expect(report.gaps.find((gap) => gap.id === "engineer-export-plan")).toMatchObject({ route: "engineer", rowsFilled: [] });
  });

  it("routes a bus rating to a qualified person with no capture link", () => {
    const report = checkReadiness(record([NATIONAL_GRID]));
    const gap = report.gaps.find((entry) => entry.field === "bus_rating")!;
    expect(gap).toMatchObject({ route: "qualified_person", owner: "qualified_person", captureLinkAllowed: false });
    expect(gap.draftRequest).toContain("Facility staff should not open the equipment");
  });

  it("ranks the same way on repeated runs of one version", () => {
    const version = record([NATIONAL_GRID]);
    const first = checkReadiness(version);
    expect(checkReadiness(version)).toEqual(first);
    expect(first.gaps.map((gap) => gap.id).slice(0, 4)).toEqual(["bill", "contract-documents", "existing-generation-record", "nameplate-photo"]);
    expect(first.gaps.map((gap) => gap.rank)).toEqual(first.gaps.map((_, index) => index + 1));
  });

  it("says the Pre-Application Report is required at 250 kW, optional below, and both when no size is set", () => {
    const size = (value: number) => checkReadiness(record([NATIONAL_GRID, verified("system_capacity_kw", { type: "quantity", value, unit: "kW" })]));
    expect(item(size(250), "pre-application-report").label).toContain("required: 250 kW");
    expect(item(size(249), "pre-application-report").label).toContain("optional: 249 kW");
    const unset = item(checkReadiness(record([NATIONAL_GRID])), "pre-application-report").label;
    expect(unset).toContain("required at 250 kW or above, optional below");
  });

  it("marks every drafted request as a draft that hasn't been sent", () => {
    const report = checkReadiness(record([NATIONAL_GRID]));
    for (const gap of report.gaps) expect(gap.draftRequest).toContain("DRAFT for a person to review and send");
    const preApplication = report.gaps.find((gap) => gap.id === "pre-application-report")!;
    expect(preApplication.draftRequest).toContain("Size in AC kW, an engineer decision: [to be filled in by a person]");
  });

  it("reports the Worcester demo site through the API, counting form rows and input rows apart", async () => {
    const app = createEngineerApp({
      store: new Store(),
      fetch: recorded,
      now: () => new Date().toISOString(),
      uploadDir: join(tmpdir(), "readiness-test-uploads"),
      capturePublicUrl: "https://tunnel.invalid",
      extractor: async () => ({ kind: "failed", reason: "No model call in this test" }),
    });
    await app.request(routes.runSite.path, { method: "POST", body: JSON.stringify({ address: "100 Research Dr, Worcester, MA" }) });
    const response = await app.request("/api/sites/100-research-dr-worcester-ma/versions/latest/readiness");
    const report = ReadinessReportSchema.parse(await response.json());

    expect(report.recordVersionId).toBe("100-research-dr-worcester-ma-v1");
    expect(report.synthetic).toBe(false);
    expect(report.share?.formRows).toEqual({ withEvidence: 2, total: 21 });
    expect(report.share?.inputRows).toEqual({ withEvidence: 3, total: 10 });
    // The new-or-change block isn't filled from public data.
    expect(item(report, "existing-facility").status).toBe("needs_evidence");
    expect(item(report, "new-or-change").status).toBe("engineer_owned");
    expect(item(report, "pre-application-report").status).toBe("preview_only");
    expect(report.gaps[0]).toMatchObject({ id: "bill", route: "capture_bill" });
  });
});
