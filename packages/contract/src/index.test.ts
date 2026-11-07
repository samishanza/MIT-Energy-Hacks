import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CaptureSampleSchema,
  ENGINEER_PORT,
  CAPTURE_PORT,
  OWNERS,
  ObservationSchema,
  ReadinessReportSchema,
  RecordVersionSchema,
  VALUE_STATES,
  ValueSchema,
  routes,
  type RecordVersion,
  type ReadinessReport,
} from "./index.ts";

function sample(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8"));
}

const source = {
  id: "massgis-l3",
  name: "MassGIS L3 parcels",
  kind: "arcgis_rest",
  dataOrigin: "real",
};

const reading = {
  id: "obs-1",
  siteId: "site-1",
  field: "lot_size_acres",
  kind: "reading",
  value: { type: "quantity", value: 7.339, unit: "acre" },
  source,
  retrievedAt: "2026-11-07T10:00:00Z",
  sourceDate: "2025-01-01",
  method: "source_read",
  locator: { query: "SITE_ADDR='11 BARTZAK DR'", attribute: "LOT_SIZE" },
  identity: { sourceId: "massgis-l3", query: "SITE_ADDR='11 BARTZAK DR'", contentHash: "abc123" },
  synthetic: false,
};

const verifiedValue = {
  field: "main_device_rating",
  label: "Main device rating",
  state: "verified",
  grade: "nameplate",
  owner: "engineer",
  current: { type: "quantity", value: 600, unit: "A" },
  candidates: [],
  observationIds: ["obs-1"],
  verification: {
    verifierName: "A. Engineer",
    verifiedAt: "2026-11-07T11:00:00Z",
    evidence: [{ kind: "observation", observationId: "obs-1" }],
  },
  flags: [],
  synthetic: true,
};

const candidate = (id: string, value: number) => ({
  id,
  value: { type: "quantity", value, unit: "acre" },
  observationId: "obs-1",
  sourceName: "MassGIS L3 parcels",
});

const conflictingValue = {
  field: "lot_size_acres",
  label: "Lot size",
  state: "conflicting",
  grade: "reference",
  owner: "public_data",
  current: null,
  candidates: [candidate("a", 7.339), candidate("b", 6.98)],
  conflictKind: "source_disagreement",
  observationIds: ["obs-1"],
  flags: [],
  synthetic: false,
};

describe("value rules", () => {
  it("rejects a verified value with no named verifier", () => {
    const { verification: _omitted, ...noVerification } = verifiedValue;
    expect(ValueSchema.safeParse(noVerification).success).toBe(false);

    const blankName = {
      ...verifiedValue,
      verification: { ...verifiedValue.verification, verifierName: "   " },
    };
    expect(ValueSchema.safeParse(blankName).success).toBe(false);
  });

  it("rejects a verified value with no cited evidence", () => {
    const noEvidence = {
      ...verifiedValue,
      verification: { ...verifiedValue.verification, evidence: [] },
    };
    expect(ValueSchema.safeParse(noEvidence).success).toBe(false);
  });

  it("accepts a verified value with a named verifier and evidence", () => {
    expect(ValueSchema.safeParse(verifiedValue).success).toBe(true);
  });

  it("rejects a conflicting value with one candidate", () => {
    const oneCandidate = { ...conflictingValue, candidates: [candidate("a", 7.339)] };
    expect(ValueSchema.safeParse(oneCandidate).success).toBe(false);
  });

  it("keeps every candidate on a conflicting value", () => {
    expect(ValueSchema.parse(conflictingValue).candidates).toHaveLength(2);
  });

  it("rejects a missing value that claims a current value", () => {
    const missing = {
      field: "building_area",
      label: "Building area",
      state: "missing",
      grade: null,
      owner: "customer",
      current: { type: "quantity", value: 0, unit: "sqft" },
      candidates: [],
      observationIds: [],
      flags: [],
      synthetic: false,
    };
    expect(ValueSchema.safeParse(missing).success).toBe(false);
  });

  it("keeps 'none' apart from missing", () => {
    const none = {
      field: "existing_generation",
      label: "Existing generation",
      state: "inferred",
      grade: "reference",
      owner: "customer",
      current: { type: "none" },
      method: "source_read",
      candidates: [],
      observationIds: ["obs-1"],
      flags: [],
      synthetic: false,
    };
    expect(ValueSchema.safeParse(none).success).toBe(true);
  });
});

describe("synthetic labeling", () => {
  it("rejects a synthetic observation with no synthetic flag", () => {
    const { synthetic: _omitted, ...unflagged } = reading;
    const fromSyntheticSource = {
      ...unflagged,
      source: { ...source, dataOrigin: "synthetic" },
    };
    expect(ObservationSchema.safeParse(fromSyntheticSource).success).toBe(false);
  });

  it("rejects a synthetic source flagged as real data", () => {
    const mislabeled = {
      ...reading,
      source: { ...source, dataOrigin: "synthetic" },
      synthetic: false,
    };
    expect(ObservationSchema.safeParse(mislabeled).success).toBe(false);
  });

  it("accepts real public data labeled as real", () => {
    expect(ObservationSchema.safeParse(reading).success).toBe(true);
  });
});

describe("evidence and provenance", () => {
  it("requires the location within the source and the evidence identity", () => {
    const { locator: _locator, ...noLocator } = reading;
    expect(ObservationSchema.safeParse(noLocator).success).toBe(false);
    const { identity: _identity, ...noIdentity } = reading;
    expect(ObservationSchema.safeParse(noIdentity).success).toBe(false);
  });

  it("rejects a model draft recorded as a verification", () => {
    const fromModel = {
      ...reading,
      kind: "verification",
      method: "model_draft",
      verification: {
        verifierName: "A. Engineer",
        verifiedAt: "2026-11-07T11:00:00Z",
        evidence: [{ kind: "observation", observationId: "obs-1" }],
      },
    };
    expect(ObservationSchema.safeParse(fromModel).success).toBe(false);
  });
});

describe("readiness rules", () => {
  it("shows no share when no requirements table applies", () => {
    const parsed = ReadinessReportSchema.parse(sample("readiness.sample.json"));
    const noTable = {
      ...parsed,
      requirementsTable: null,
      noTableReason: "No configured utility returned a feeder at this site.",
    };
    expect(ReadinessReportSchema.safeParse(noTable).success).toBe(false);
    expect(
      ReadinessReportSchema.safeParse({ ...noTable, share: null, items: [] }).success,
    ).toBe(true);
  });

  it("never offers a capture link for a qualified-person gap", () => {
    const parsed = ReadinessReportSchema.parse(sample("readiness.sample.json"));
    const gap = parsed.gaps.find((g) => g.route === "qualified_person");
    expect(gap?.captureLinkAllowed).toBe(false);
    const report = {
      ...parsed,
      gaps: parsed.gaps.map((g) =>
        g.route === "qualified_person" ? { ...g, captureLinkAllowed: true } : g,
      ),
    };
    expect(ReadinessReportSchema.safeParse(report).success).toBe(false);
  });

  it("requires an input row to name its parent and be labeled team-derived", () => {
    const parsed = ReadinessReportSchema.parse(sample("readiness.sample.json"));
    const report = {
      ...parsed,
      items: parsed.items.map((i) =>
        i.rowKind === "input" ? { ...i, teamDerived: false } : i,
      ),
    };
    expect(ReadinessReportSchema.safeParse(report).success).toBe(false);
  });
});

describe("sample payloads", () => {
  const record: RecordVersion = RecordVersionSchema.parse(sample("record.sample.json"));
  const readiness: ReadinessReport = ReadinessReportSchema.parse(sample("readiness.sample.json"));
  const capture = CaptureSampleSchema.parse(sample("capture.sample.json"));

  it("all pass validation and are marked synthetic", () => {
    expect(record.synthetic).toBe(true);
    expect(readiness.synthetic).toBe(true);
    expect(capture.synthetic).toBe(true);
    expect(record.observations.every((o) => o.synthetic)).toBe(true);
  });

  it("cover every state and owner", () => {
    expect(new Set(record.values.map((v) => v.state))).toEqual(new Set(VALUE_STATES));
    expect(new Set(readiness.items.map((i) => i.owner))).toEqual(new Set(OWNERS));
  });

  it("reference only observations and fields that exist", () => {
    const observationIds = new Set(record.observations.map((o) => o.id));
    const fields = new Set(record.values.map((v) => v.field));
    for (const value of record.values) {
      for (const id of value.observationIds) expect(observationIds).toContain(id);
    }
    for (const feature of record.features) expect(fields).toContain(feature.field);
    for (const item of readiness.items) {
      for (const field of item.fields) expect(fields).toContain(field);
    }
  });

  it("show both feeder candidates and a source conflict separately", () => {
    const kinds = record.values.filter((v) => v.state === "conflicting").map((v) => v.conflictKind);
    expect(new Set(kinds)).toEqual(new Set(["source_disagreement", "feeder_candidates"]));
  });
});

describe("route table", () => {
  it("keeps engineer and capture routes on separate listeners", () => {
    const entries = Object.values(routes);
    expect(ENGINEER_PORT).not.toBe(CAPTURE_PORT);
    for (const route of entries) {
      if (route.listener === "capture") expect(route.path.startsWith("/capture/")).toBe(true);
      else expect(route.path.startsWith("/api/")).toBe(true);
    }
    expect(entries.filter((r) => r.listener === "capture").map((r) => r.path)).toEqual([
      "/capture/:token",
      "/capture/:token/submit",
    ]);
  });

  it("requires a named verifier and evidence on every human action", () => {
    for (const action of [routes.confirmValue, routes.correctValue, routes.resolveConflict]) {
      const shape = action.request.safeParse({});
      expect(shape.success).toBe(false);
    }
    expect(
      routes.confirmValue.request.safeParse({ verifierName: "A. Engineer", evidence: [] }).success,
    ).toBe(false);
    expect(
      routes.confirmValue.request.safeParse({
        verifierName: "A. Engineer",
        evidence: [{ kind: "document", description: "Signed contract, page 2" }],
      }).success,
    ).toBe(true);
  });
});
