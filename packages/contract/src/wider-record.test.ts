import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  CONTRACT_VERSION,
  ConfirmValueRequestSchema,
  MapFeatureSchema,
  RecordVersionSchema,
  RunProgressSchema,
  SiteMapExportSchema,
  ValueSchema,
  routes,
} from "./index.ts";

const value = {
  field: "lot_width_ft",
  label: "Lot width",
  state: "inferred",
  grade: "reference",
  owner: "public_data",
  current: { type: "quantity", value: 540, unit: "ft" },
  method: "computed",
  candidates: [],
  observationIds: ["obs-1"],
  flags: [],
  synthetic: false,
};

describe("the wider record", () => {
  it("is a new contract version", () => {
    expect(CONTRACT_VERSION).toBe("4");
  });

  it("lets a value name its family, its current reading, and how it was cross-checked", () => {
    const parsed = ValueSchema.parse({
      ...value,
      family: "physical",
      currentObservationId: "obs-1",
      crossChecks: [{ label: "Polygon area against stated lot size", result: "disagrees", detail: "3.3% apart" }],
    });
    expect(parsed.family).toBe("physical");
    expect(parsed.currentObservationId).toBe("obs-1");
    expect(parsed.crossChecks?.[0]?.result).toBe("disagrees");
  });

  it("rejects a cross-check with an unknown result", () => {
    expect(ValueSchema.safeParse({ ...value, crossChecks: [{ label: "x", result: "probably fine" }] }).success).toBe(false);
  });

  it("draws candidate areas, substations, roads, and mapped constraints", () => {
    for (const kind of ["candidate_area", "substation", "road", "constraint"]) {
      const feature = { id: "f", kind, field: "lot_width_ft", geometry: { type: "Point", coordinates: [-71.8, 42.26] } };
      expect(MapFeatureSchema.safeParse(feature).success).toBe(true);
    }
  });

  it("lets a feature carry facts about one item", () => {
    const parsed = MapFeatureSchema.parse({
      id: "area-1",
      kind: "candidate_area",
      field: "candidate_areas",
      geometry: { type: "Point", coordinates: [-71.8, 42.26] },
      attributes: { area: { type: "quantity", value: 24, unit: "acre" } },
    });
    expect(parsed.attributes?.area).toEqual({ type: "quantity", value: 24, unit: "acre" });
  });

  it("names listed candidates apart from feeders", () => {
    const candidate = (id: string) => ({ id, value: { type: "text", value: id }, observationId: "obs-1", sourceName: "OpenEI" });
    const parsed = ValueSchema.parse({
      ...value,
      state: "conflicting",
      current: null,
      candidates: [candidate("a"), candidate("b")],
      conflictKind: "listed_candidates",
    });
    expect(parsed.conflictKind).toBe("listed_candidates");
  });

  it("requires a confirm to name the reading the person saw", () => {
    const actor = { verifierName: "A. Engineer", evidence: [{ kind: "document", description: "Bill, page 1" }] };
    expect(ConfirmValueRequestSchema.safeParse(actor).success).toBe(false);
    expect(ConfirmValueRequestSchema.safeParse({ ...actor, expectedObservationId: "obs-1" }).success).toBe(true);
  });

  it("has an error for a stale confirm", () => {
    expect(ApiErrorSchema.safeParse({ code: "stale_value", message: "This value changed." }).success).toBe(true);
  });

  it("reports progress during a run, with what's drawable so far", () => {
    const progress = RunProgressSchema.parse({
      status: "running",
      sourceRuns: [{ sourceId: "massgis-l3-parcels", name: "MassGIS L3", status: "done" }],
      features: [],
    });
    expect(progress.status).toBe("running");
    expect(routes.readRunProgress.listener).toBe("engineer");
    expect(routes.readRunProgress.path).toBe("/api/sites/progress");
  });

  it("carries optional coverage on the record and the export", () => {
    const coverage = { filled: 12, total: 78, byOwner: { customer: 20, engineer: 30 } };
    const shape = RecordVersionSchema.shape.coverage.safeParse(coverage);
    expect(shape.success).toBe(true);
    expect(SiteMapExportSchema.shape.coverage.safeParse(coverage).success).toBe(true);
    expect(RecordVersionSchema.shape.coverage.safeParse(undefined).success).toBe(true);
  });
});
