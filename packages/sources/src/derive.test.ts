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
