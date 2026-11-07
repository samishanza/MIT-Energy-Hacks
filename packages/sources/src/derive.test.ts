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
