import { describe, expect, it } from "vitest";
import type { MapFeature, ObservedValue, RecordVersion, Value } from "@eqore/contract";
import { PRE_APPLICATION_NOTE, preApplicationDraft, preApplicationText } from "./pre-application.ts";

// A labeled synthetic record: only the parts the draft reads.
function value(field: string, current: ObservedValue | null): Value {
  return { field, label: field, state: current ? "inferred" : "missing", current, flags: [], observationIds: [], owner: "utility", grade: "reference", synthetic: true } as unknown as Value;
}

function record(values: Value[], features: MapFeature[] = []): RecordVersion {
  return {
    id: "synthetic-site-v1",
    version: 1,
    site: { id: "synthetic-site", address: "SYNTHETIC TEST SITE, ANYTOWN, MA", region: "massachusetts", location: [-71.5, 42.2], locationMethod: "hand_placed" },
    values,
    features,
    synthetic: true,
  } as unknown as RecordVersion;
}

const line = (feeder: string, lon: number): MapFeature =>
  ({ id: feeder, kind: "utility_line", field: "feeder", geometry: { type: "LineString", coordinates: [[lon, 42.2], [lon + 0.001, 42.2]] }, attributes: { feeder: { type: "text", value: feeder } } }) as unknown as MapFeature;

const text = (value: string) => ({ type: "text" as const, value });

describe("the Pre-Application Report request draft", () => {
  const site = record(
    [value("serving_utility", text("National Grid")), value("feeder", text("SYN-01")), value("feeder_phase", text("3-phase")), value("feeder_voltage", { type: "quantity", value: 13.2, unit: "kV" })],
    // One feeder 80 m away, one about 4 km away.
    [line("SYN-01", -71.499), line("SYN-FAR", -71.45)],
  );
  const draft = preApplicationDraft(site);

  it("is required at 250 kW, at the $250 fee, on National Grid's form", () => {
    expect(draft).toMatchObject({ note: PRE_APPLICATION_NOTE, sizeKw: 250, required: true, fee: { usd: 250 }, utility: { formApplies: true } });
  });

  it("leaves contacts and customer facts as needs-input, never filled", () => {
    expect(draft.contacts.every((row) => row.answer === null && row.state === "needs_input" && row.who === "customer")).toBe(true);
    expect(draft.facility.find((row) => row.item.startsWith("6a"))).toMatchObject({ answer: null, state: "needs_input", who: "customer" });
  });

  it("states the configuration's size and type as estimates, citing where they came from", () => {
    expect(draft.facility.find((row) => row.item.startsWith("3)"))).toMatchObject({ answer: "250 kW", state: "estimate" });
    expect(draft.facility.find((row) => row.item.startsWith("3)"))!.reason).toContain("not confirmed as EQORE's standard");
  });

  it("sets public data beside the report's items, and only feeders within half a mile", () => {
    const item = (number: number) => draft.reportItems.find((row) => row.number === number)!;
    expect(item(2)).toMatchObject({ publicData: "SYN-01", state: "inferred" });
    expect(item(1)).toMatchObject({ publicData: "13.2 kV" });
    expect(item(12)).toMatchObject({ publicData: "SYN-01" });
    expect(item(5)).toMatchObject({ publicData: null, state: "needs_input" });
    expect(draft.reportItems.map((row) => row.number)).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
  });

  it("infers a radial system from an overhead service, and leaves it open otherwise", () => {
    const overhead = preApplicationDraft(record([value("grid_service_path", text("Likely fed overhead from a pole on Test St"))]));
    expect(overhead.reportItems[10]).toMatchObject({ number: 11, state: "inferred" });
    expect(overhead.reportItems[10]!.publicData).toContain("likely radial");
    expect(draft.reportItems[10]).toMatchObject({ number: 11, publicData: null, state: "needs_input" });
  });

  it("says when the serving utility files its own form", () => {
    const other = preApplicationDraft(record([value("serving_utility", text("Eversource"))]));
    expect(other.utility.formApplies).toBe(false);
    expect(other.utility.reason).toContain("Eversource files its own");
  });

  it("prints a reviewable text with the draft note and the non-binding disclaimer", () => {
    const printed = preApplicationText(draft);
    expect(printed.startsWith(PRE_APPLICATION_NOTE)).toBe(true);
    expect(printed).toContain("NEEDS INPUT, customer");
    expect(printed).toContain("non-binding");
  });
});
