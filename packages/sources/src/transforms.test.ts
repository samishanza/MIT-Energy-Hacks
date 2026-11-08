import { describe, expect, it } from "vitest";
import { readMapping } from "./arcgis.ts";
import { applyTransform } from "./transforms.ts";

const limits = { kind: "lowest_of" as const, unit: "MW", limits: { a: "thermal", b: "anti-islanding", c: "flicker" } };

describe("named transforms", () => {
  it("reads a percentage printed as text, and refuses text that isn't one", () => {
    expect(applyTransform({ kind: "percent_text" }, "P", { P: "54.30%" })).toEqual({ value: { type: "quantity", value: 54.3, unit: "percent" } });
    expect(applyTransform({ kind: "percent_text" }, "P", { P: "n/a" })).toEqual({ reason: "P isn't a percentage: n/a" });
  });

  it("keeps every limit and names the lowest, skipping a sentinel", () => {
    expect(applyTransform(limits, undefined, { a: 2.5, b: -99.99, c: 20 }, [-99.99])).toEqual({ value: { type: "text", value: "2.5 MW, limited by thermal (also flicker 20 MW)" } });
    expect(applyTransform(limits, undefined, { a: -99.99, b: null, c: "" }, [-99.99])).toEqual({ reason: "No limit is published for this location" });
  });

  it("stores a sentinel such as -99.99 as missing, not as a number", () => {
    const mapping = { field: "feeder_hosting_capacity", attribute: "GenCapacity_kW", type: "quantity" as const, sourceUnit: "kW", unit: "MW", sentinels: [-99.99], grade: "reference" as const };
    expect(readMapping(mapping, { objectId: "1", attributes: { GenCapacity_kW: -99.99 }, geometry: null })).toEqual({ reason: "GenCapacity_kW is -99.99, which the source uses to mean no value" });
    // kW is converted to MW before it's stored, never mixed.
    expect(readMapping(mapping, { objectId: "1", attributes: { GenCapacity_kW: 559 }, geometry: null })).toEqual({ value: { type: "quantity", value: 0.559, unit: "MW" } });
  });

  it("reads a series as one value, and refuses one with a gap", () => {
    const series = { kind: "series" as const, attributes: ["y0", "y1"], unit: "MVA", describe: "this year and next" };
    expect(applyTransform(series, undefined, { y0: 6.4, y1: 7.8 })).toEqual({ value: { type: "text", value: "6.4, 7.8 MVA (this year and next)" } });
    expect(applyTransform(series, undefined, { y0: 6.4 })).toEqual({ reason: "y1 is blank in the source" });
  });
});

describe("measuring a turned building", () => {
  it("gives the sides of a rectangle turned 18 degrees, not its north-south box", async () => {
    const { fittedRect } = await import("./geometry.ts");
    const t = (18 * Math.PI) / 180;
    const turn = ([x, y]: [number, number]): [number, number] => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
    const rect = fittedRect(([[0, 0], [460, 0], [460, 182], [0, 182]] as [number, number][]).map(turn));
    expect(rect.width).toBeCloseTo(460, 3);
    expect(rect.depth).toBeCloseTo(182, 3);
  });

  it("keeps width as the side nearer east-west, whichever edge the fit starts from", async () => {
    const { fittedRect } = await import("./geometry.ts");
    const rect = fittedRect([[0, 0], [0, 300], [-100, 300], [-100, 0]]);
    expect(rect.width).toBeCloseTo(100, 3);
    expect(rect.depth).toBeCloseTo(300, 3);
  });
});
