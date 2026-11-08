import { describe, expect, it } from "vitest";
import type { GridStep } from "../app/gridPath";
import { aimAt, alongLine, bestPano, fovOf, lookFrom, type Found } from "./StreetWalk";

type LonLat = [number, number];
const step = (at: LonLat, heightM = 10): GridStep => ({ role: "pole", title: "", detail: "", basis: "detected", featureId: null, field: null, at, heightM, link: null });
const found = (meters: number): Found => ({ id: String(meters), at: [0, 0], date: null, meters, target: [0, 0] });

describe("street walk", () => {
  it("stands back from a pole rather than at its foot", () => {
    expect(bestPano([found(2), found(19), found(60)])!.id).toBe("19");
    expect(bestPano([found(3)])!.id).toBe("3");
    expect(bestPano([found(25), found(45)], 30)!.id).toBe("25");
    expect(bestPano([])).toBeNull();
  });

  it("looks for panoramas either side of the step along the nearest road", () => {
    const road: LonLat[] = [[-71.001, 42.3], [-70.999, 42.3]];
    const places = lookFrom(step([-71.0, 42.3001]), [road]);
    expect(places).toHaveLength(4);
    expect(places[0]![1]).toBeCloseTo(42.3, 6);
    expect(Math.abs(places[0]![0] - places[1]![0])).toBeGreaterThan(0.0003);
    expect(lookFrom(step([-71.0, 42.31]), [road])).toEqual([[-71.0, 42.31]]);
  });

  it("aims up at two thirds of a pole's height and zooms in on far things", () => {
    const near = aimAt([-71.0, 42.3], step([-71.0, 42.3002], 12));
    expect(near.heading).toBe(0);
    expect(near.pitch).toBeGreaterThan(10);
    expect(near.zoom).toBe(1);
    expect(aimAt([-71.0, 42.3], step([-71.0, 42.301], 12)).zoom).toBe(2);
    expect(fovOf(1)).toBe(90);
  });

  it("samples a cross-country line near the site, nearest first", () => {
    const line: LonLat[] = [[-71.05, 42.3], [-70.95, 42.3]];
    const pts = alongLine([line], [-71.0, 42.3]);
    expect(pts.length).toBeGreaterThan(10);
    expect(Math.abs(pts[0]![0] + 71.0)).toBeLessThan(0.002);
  });
});
