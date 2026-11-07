import { describe, expect, it } from "vitest";
import type { RecordVersion } from "@eqore/contract";
import { assessRecord, blockingFactOf } from "./from-record.ts";

const value = (field: string, v: number | string, unit?: string) => ({
  field, label: field, state: "inferred" as const, grade: "reference" as const, owner: "public_data" as const,
  current: typeof v === "number" ? { type: "quantity" as const, value: v, unit: unit ?? "ft" } : { type: "text" as const, value: v },
  method: "source_read" as const, candidates: [], observationIds: ["o"], flags: [], synthetic: false,
});

const record = (fields: ReturnType<typeof value>[]): RecordVersion =>
  ({
    id: "r", contractVersion: "4", version: 1, createdAt: "2026-11-07T20:00:00.000Z",
    trigger: "run", snapshot: false, synthetic: false,
    site: { id: "s", address: "100 Research Dr, Worcester, MA", region: "massachusetts", location: [-71.76, 42.27], locationMethod: "source_read" },
    values: fields, observations: [], features: [], baseMap: null, sourceRuns: [],
  }) as unknown as RecordVersion;

const WITH_SERVICE = [
  value("lot_width_ft", 560), value("lot_depth_ft", 840),
  value("building_x_ft", 60), value("building_y_ft", 210),
  value("building_width_ft", 290), value("building_depth_ft", 580),
  value("service_voltage", 480, "V"), value("main_device_rating", 1600, "A"),
];

describe("the design-rule check, run on a contract record", () => {
  it("compiles a record into a real fit and interconnection answer", () => {
    const a = assessRecord(record(WITH_SERVICE));
    expect(a.result.checks.length).toBeGreaterThan(4);
    expect(["pass", "warn", "fail"]).toContain(a.result.status);
    expect(["load-side", "supply-side"]).toContain(a.result.electrical.method);
  });

  it("labels every substituted dimension as a placeholder, not as a reading", () => {
    const a = assessRecord(record([]));
    // Nothing in the record, so everything is standing in — and says so.
    expect(a.site.lot.w.source.kind).toBe("assumed");
    expect(a.site.service.busRatingA.source.label).toMatch(/PLACEHOLDER/);
  });

  it("keeps a value that IS in the record as a reading", () => {
    const a = assessRecord(record(WITH_SERVICE));
    expect(a.site.lot.w.source.kind).not.toBe("assumed");
    expect(a.site.lot.w.value).toBe(560);
  });

  it("bands a missing bus rating by the main it carries, and says why", () => {
    const a = assessRecord(record(WITH_SERVICE));
    const gap = a.gaps.find((g) => g.field === "bus_rating")!;
    expect(gap.band).toEqual([1600, 2000]);
    expect(gap.basis).toMatch(/cannot be smaller than the 1600 A main/);
  });

  it("calls the gap blocking only when the two ends disagree", () => {
    const a = assessRecord(record(WITH_SERVICE));
    const gap = a.gaps.find((g) => g.field === "bus_rating")!;
    const methods = new Set(gap.outcomes.map((o) => o.method));
    expect(gap.blocksDecision).toBe(methods.size > 1);
  });

  it("reports no gap once the bus rating is known", () => {
    const a = assessRecord(record([...WITH_SERVICE, value("bus_rating", 2000, "A")]));
    expect(a.gaps.find((g) => g.field === "bus_rating")).toBeUndefined();
    expect(a.topGap).toBeNull();
    expect(blockingFactOf(a)).toBeNull();
  });

  it("shapes the top gap for the sheet, in words a reader can act on", () => {
    const a = assessRecord(record(WITH_SERVICE));
    const fact = blockingFactOf(a);
    if (a.topGap) {
      expect(fact!.label).toBe("Switchgear bus rating");
      expect(fact!.outcomes!.join(" ")).toMatch(/At 1600 A|At 2000 A/);
      expect(fact!.resolver).toMatch(/nameplate photo/);
    }
  });

  it("says when the pad came from the record rather than a placeholder", () => {
    expect(assessRecord(record(WITH_SERVICE)).padFromRecord).toBe(false);
  });
});
