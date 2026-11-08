import { describe, expect, it } from "vitest";
import type { RecordVersion } from "@eqore/contract";
import { CONFIGURATIONS, EQUIPMENT, PLAN_SET_250KW_760KWH, WIT_100K_ALTERNATIVE } from "./catalog.ts";
import { designFromRecord } from "./design.ts";

const record = { id: "synthetic-v1", version: 1, site: { address: "SYNTHETIC TEST SITE", region: "massachusetts", location: [-71.5, 42.2] }, values: [], features: [], synthetic: true } as unknown as RecordVersion;
const calc = (configuration: typeof PLAN_SET_250KW_760KWH, id: string) => designFromRecord(record, configuration).designs[0]!.calculations.find((entry) => entry.id === id)!;

describe("the equipment catalog", () => {
  it("cites a document and revision for every model, with the same fields in each", () => {
    const keys = Object.keys(EQUIPMENT[0]!).filter((key) => key !== "energyKwh").sort();
    for (const model of EQUIPMENT) {
      expect(model.source.document.length).toBeGreaterThan(0);
      expect(Object.keys(model).filter((key) => key !== "energyKwh").sort()).toEqual(keys);
    }
    expect(CONFIGURATIONS.map((configuration) => configuration.id)).toEqual(["plan-set-250kw-760kwh", "wit-100k-alternative"]);
  });

  it("sizes the MPS-125 on its 150 A rated output", () => {
    expect(calc(PLAN_SET_250KW_760KWH, "inverter-ac").steps[0]).toBe("150 A rated output per unit × 1.25 = 187.5 A");
    expect(calc(PLAN_SET_250KW_760KWH, "dc-window").status).toBe("passes");
  });

  it("sizes the WIT 100K on its larger AC input, but its busbar backfeed on its output", () => {
    expect(calc(WIT_100K_ALTERNATIVE, "inverter-ac").steps[0]).toBe("240.7 A maximum AC input, above the 132.4 A rated output per unit × 1.25 = 300.9 A");
    expect(calc(WIT_100K_ALTERNATIVE, "busbar").steps[0]).toBe("Source output 264.8 A × 1.25 = 331 A");
  });

  it("refuses the plan set's battery on the WIT, whose DC range is lower", () => {
    expect(calc(WIT_100K_ALTERNATIVE, "dc-window")).toMatchObject({ status: "fails", result: "1069.2-1425.6 V is outside 750-1000 V; this inverter needs a different battery" });
  });
});
