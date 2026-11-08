import { describe, expect, it } from "vitest";
import type { Observation } from "@eqore/contract";
import { deriveValue } from "./derive.ts";
import type { FieldDefinition } from "./fields.ts";

const reading = (id: string, field: string, text: string): Observation => ({
  id,
  siteId: "site",
  field,
  kind: "reading",
  value: { type: "text", value: text },
  source: { id: "source", name: "Test source", kind: "json_api", dataOrigin: "real" },
  retrievedAt: "2026-11-07T10:00:00Z",
  sourceDate: null,
  method: "source_read",
  locator: { query: id },
  identity: { sourceId: "source", query: id, contentHash: id },
  grade: "reference",
  synthetic: false,
});

const definition = (field: string): FieldDefinition => ({
  field,
  label: field,
  owner: "utility",
  grade: "reference",
  comparison: { kind: "candidates" },
});

describe("listed candidates", () => {
  it("reports several feeders as feeder candidates", () => {
    const value = deriveValue(definition("feeder"), [reading("a", "feeder", "A"), reading("b", "feeder", "B")]);
    expect(value.state).toBe("conflicting");
    expect(value.conflictKind).toBe("feeder_candidates");
  });

  it("reports other lists, like rate schedules, apart from feeders and from source conflicts", () => {
    const value = deriveValue(definition("rate_schedule"), [reading("a", "rate_schedule", "G-1"), reading("b", "rate_schedule", "G-2")]);
    expect(value.state).toBe("conflicting");
    expect(value.conflictKind).toBe("listed_candidates");
    expect(value.candidates).toHaveLength(2);
  });
});

describe("a source taking back its own reading", () => {
  const placeholder = (id: string, retrievedAt: string, kind: "reading" | "no_value", objectId?: string): Observation => ({
    ...reading(id, "zoning_district", "0"),
    kind,
    value: kind === "reading" ? { type: "text", value: "0" } : null,
    retrievedAt,
    locator: { query: id, attribute: "ZONING", objectId },
    identity: { sourceId: "source", query: id, contentHash: `${id}-${kind}` },
    ...(kind === "no_value" ? { reason: "ZONING is 0 in the source, which means it has no value" } : {}),
  });
  const zoning: FieldDefinition = { field: "zoning_district", label: "Zoning district", owner: "public_data", grade: "reference" };

  it("lets a newer no-value for the same object supersede older readings, which stay in the evidence", () => {
    const observations = [placeholder("old-1", "2026-11-07T10:00:00Z", "reading", "parcel-1"), placeholder("old-2", "2026-11-07T11:00:00Z", "reading", "parcel-1"), placeholder("new", "2026-11-07T12:00:00Z", "no_value", "parcel-1")];
    const value = deriveValue(zoning, observations);
    expect(value).toMatchObject({ state: "missing", current: null, reason: "ZONING is 0 in the source, which means it has no value" });
    expect(observations).toHaveLength(3);
  });

  it("keeps the reading when the no-value names no object, as when the source failed", () => {
    const value = deriveValue(zoning, [placeholder("old", "2026-11-07T10:00:00Z", "reading", "parcel-1"), placeholder("outage", "2026-11-07T12:00:00Z", "no_value")]);
    expect(value).toMatchObject({ state: "inferred", current: { type: "text", value: "0" } });
  });

  it("keeps a reading taken after the no-value", () => {
    const value = deriveValue(zoning, [placeholder("gone", "2026-11-07T10:00:00Z", "no_value", "parcel-1"), { ...placeholder("back", "2026-11-07T12:00:00Z", "reading", "parcel-1"), value: { type: "text", value: "B-2" } }]);
    expect(value).toMatchObject({ state: "inferred", current: { type: "text", value: "B-2" } });
  });
});

describe("a later run of a source", () => {
  const territory = (id: string, utility: string, retrievedAt: string, query = "point -71.4,42.2"): Observation => ({
    ...reading(id, "serving_utility", utility),
    retrievedAt,
    locator: { query, attribute: "NAME", objectId: utility },
    identity: { sourceId: "source", query, contentHash: `${id}-${utility}` },
  });
  const firstRun = ["A", "B", "C"].map((utility) => territory(`run1-${utility}`, utility, "2026-11-07T10:00:00Z"));

  it("replaces the earlier run's readings: candidates A, B, C, then only A, gives A", () => {
    const value = deriveValue(definition("serving_utility"), [...firstRun, territory("run2-A", "A", "2026-11-07T12:00:00Z")]);
    expect(value).toMatchObject({ state: "inferred", current: { type: "text", value: "A" } });
  });

  it("keeps several readings from the same answer as candidates", () => {
    expect(deriveValue(definition("serving_utility"), firstRun).state).toBe("conflicting");
  });

  it("leaves readings to a different question alone, such as another feeder's detail query", () => {
    const value = deriveValue(definition("serving_utility"), [territory("x", "A", "2026-11-07T10:00:00Z", "feeder 1"), territory("y", "B", "2026-11-07T12:00:00Z", "feeder 2")]);
    expect(value.state).toBe("conflicting");
  });

  it("leaves a person's evidence alone", () => {
    const photo = (id: string, text: string, retrievedAt: string): Observation => ({ ...territory(id, text, retrievedAt), source: { id: "source", name: "Photo", kind: "human_evidence", dataOrigin: "real" } });
    expect(deriveValue(definition("serving_utility"), [photo("p1", "A", "2026-11-07T10:00:00Z"), photo("p2", "B", "2026-11-07T12:00:00Z")]).state).toBe("conflicting");
  });
});

describe("a later run that looked and found nothing", () => {
  const drop = (id: string, kind: "reading" | "no_value", retrievedAt: string, query: string, attribute?: string): Observation => ({
    ...reading(id, "grid_service_path", "Likely fed overhead"),
    kind,
    value: kind === "reading" ? { type: "text", value: "Likely fed overhead" } : null,
    retrievedAt,
    locator: { query, attribute },
    identity: { sourceId: "source", query, contentHash: id },
    ...(kind === "no_value" ? { reason: "No overhead service drop found" } : {}),
  });
  const path: FieldDefinition = { field: "grid_service_path", label: "Service path", owner: "utility", grade: "reference" };

  it("takes back an earlier reading of the same attribute, even from a differently worded query", () => {
    const value = deriveValue(path, [drop("old", "reading", "2026-11-07T10:00:00Z", "points within 115 m", "service drop detected in lidar"), drop("new", "no_value", "2026-11-08T10:00:00Z", "lidar around the buildings", "service drop detected in lidar")]);
    expect(value).toMatchObject({ state: "missing", current: null, reason: "No overhead service drop found" });
  });

  it("keeps the reading when the later no-value names no attribute, as when the source failed", () => {
    const value = deriveValue(path, [drop("old", "reading", "2026-11-07T10:00:00Z", "q", "service drop detected in lidar"), drop("outage", "no_value", "2026-11-08T10:00:00Z", "q")]);
    expect(value.state).toBe("inferred");
  });
});
