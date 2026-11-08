import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RecordVersion } from "@eqore/contract";
import { inspectStep, STEP_IDS, stepSummary } from "./collection-steps.ts";

const mock = JSON.parse(readFileSync(new URL("../../web/src/mock/worcester.record.json", import.meta.url), "utf8")) as RecordVersion;
const withValue = (record: RecordVersion, field: string, value: number, unit: string): RecordVersion => ({
  ...record,
  values: [...record.values.filter((v) => v.field !== field), { ...record.values[0]!, field, state: "inferred", current: { type: "quantity", value, unit } } as RecordVersion["values"][number]],
});

describe("collection step checks", () => {
  it("reports every step with its sources, values, and checks", () => {
    const summary = stepSummary(mock);
    expect(summary.map((s) => s.step)).toEqual(STEP_IDS);
    for (const step of STEP_IDS) expect(inspectStep(mock, step).checks.length).toBeGreaterThan(0);
  });

  it("fails a stall count that needs more paving than was mapped", () => {
    const record = withValue(withValue(mock, "paved_area_sqft", 1000, "sq ft"), "parking_stall_count", 20, "stalls");
    expect(inspectStep(record, "parking").checks.find((c) => c.check === "the stalls fit in the paved area")).toMatchObject({ result: "fail" });
    const fits = withValue(withValue(mock, "paved_area_sqft", 10000, "sq ft"), "parking_stall_count", 20, "stalls");
    expect(inspectStep(fits, "parking").checks.find((c) => c.check === "the stalls fit in the paved area")).toMatchObject({ result: "pass" });
  });

  it("fails a lot size far from the parcel polygon's area, and says unknown when either is missing", () => {
    const far = withValue(mock, "lot_size_acres", 500, "acre");
    expect(inspectStep(far, "site").checks.find((c) => c.check.startsWith("parcel area"))).toMatchObject({ result: "fail" });
    const none = { ...mock, values: mock.values.filter((v) => v.field !== "lot_size_acres") };
    expect(inspectStep(none, "site").checks.find((c) => c.check.startsWith("parcel area"))).toMatchObject({ result: "unknown" });
  });

  it("fails the switchboard check until a person places one", () => {
    expect(inspectStep(mock, "service").checks[0]).toMatchObject({ check: "switchboard placed", result: "fail" });
    const pinned = { ...mock, features: [...mock.features, { id: "pin-switchboard_location", kind: "capture_pin", field: "switchboard_location", geometry: { type: "Point", coordinates: mock.site.location }, label: "pin" }] } as RecordVersion;
    expect(inspectStep(pinned, "service").checks[0]).toMatchObject({ result: "pass" });
  });
});
