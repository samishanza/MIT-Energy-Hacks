import { describe, expect, it } from "vitest";
import type { LidarPoint } from "../ept.ts";
import { detectEquipment } from "./lidar-equipment.ts";

// A synthetic scene in metres, flat ground at z = 100, a road along y = 0, and a building from y = 30 to 55.
type Add = (x: number, y: number, h: number, classification?: number, returns?: number) => void;
function scene(build: (add: Add) => void): LidarPoint[] {
  const points: LidarPoint[] = [];
  const add: Add = (x, y, h, classification = 1, returns = 1) => points.push({ x, y, z: 100 + h, classification, returns });
  for (let x = -20; x <= 200; x += 0.5) for (let y = -15; y <= 75; y += 0.5) add(x, y, 0, 2);
  for (let x = 30; x <= 110; x += 0.5) for (let y = 30; y <= 55; y += 0.5) add(x, y, 8, 6);
  build(add);
  return points;
}
// A pole: a thin column of returns from 1 m to 11 m, with a crossarm at the top. The returns a classifier
// would label as vegetation, as 3DEP often does beside trees, so classes don't decide.
const pole = (add: Add, x: number, y: number) => {
  for (let h = 1; h <= 11; h += 0.25) add(x + ((h * 7) % 3) * 0.05, y, h, 5, 2);
  for (let dx = -1.2; dx <= 1.2; dx += 0.3) add(x + dx, y, 10.6, 5, 2);
};
const wire = (add: Add, x0: number, x1: number, y: number) => {
  for (let x = x0 + 1; x < x1; x += 0.5) add(x, y, 9 - 1.5 * Math.sin((Math.PI * (x - x0)) / (x1 - x0)), 1, 1);
};
const crown = (add: Add, x: number, y: number, top: number, radius = 3.5) => {
  for (let a = 0; a < 360; a += 6) for (let r = 0; r <= radius; r += 0.4) for (let h = 3.5; h <= top; h += 0.7) add(x + r * Math.cos((a * Math.PI) / 180), y + r * Math.sin((a * Math.PI) / 180), h - (r / radius) * 1.5, 5, 3);
};
const building: [number, number][] = [[30, 30], [110, 30], [110, 55], [30, 55], [30, 30]];
const road = { name: "Test St", line: [[-20, 0], [200, 0]] as [number, number][], onAddress: true };
const rounded = (p: [number, number]) => p.map(Math.round);

describe("finding grid equipment in lidar by shape", () => {
  // Poles every 40 m along the road; the one at x = 120 stands inside a tree's crown.
  const found = detectEquipment(
    scene((add) => {
      for (const x of [0, 40, 80, 160]) pole(add, x, 6);
      wire(add, 0, 40, 6); wire(add, 40, 80, 6); wire(add, 80, 120, 6); wire(add, 120, 160, 6);
      crown(add, 120, 6, 10.5);
      for (let h = 1; h <= 11.5; h += 0.25) add(120, 6, h, 5, 2);
      crown(add, 20, 14, 11); // a roadside tree with no pole in it
      for (let x = 50; x <= 54.5; x += 0.25) for (let y = 1; y <= 2.8; y += 0.25) add(x, y, 1.5); // a car on the road
      for (let x = 60; x <= 61.5; x += 0.25) for (let y = 31; y <= 32.5; y += 0.25) add(x, y, 1.4, 4, 3); // a bush by the wall
      for (let x = 70; x <= 71.5; x += 0.25) for (let y = 40; y <= 41.5; y += 0.25) add(x, y, 9.5); // a rooftop unit
      for (let x = 135; x <= 136.75; x += 0.25) for (let y = 38; y <= 39.5; y += 0.25) add(x, y, 1.6); // a solid box in the open
    }),
    [building],
    [road],
  );

  it("finds the poles in the open, and the one hidden in a crown between them, and not the roadside tree", () => {
    expect(found.poles.map((p) => rounded(p.at)).sort((a, b) => a[0]! - b[0]!)).toEqual([[0, 6], [40, 6], [80, 6], [120, 6], [160, 6]]);
    expect(found.poles.find((p) => Math.round(p.at[0]) === 120)!.inCanopy).toBe(true);
    expect(found.poles.filter((p) => !p.inCanopy).every((p) => p.road === "Test St" && p.heightM >= 10.5)).toBe(true);
  });

  it("strings conductors pole to pole along the road", () => {
    const spans = found.conductors.map((span) => [Math.round(Math.min(span.from[0], span.to[0])), Math.round(Math.max(span.from[0], span.to[0]))]).sort((a, b) => a[0]! - b[0]!);
    expect(spans).toEqual([[0, 40], [40, 80], [80, 120], [120, 160]]);
  });

  it("reports the solid box in the open, and not the bush, the car, or the rooftop unit", () => {
    expect(found.padMounts.map((pad) => rounded(pad.at))).toEqual([[136, 39]]);
    expect(found.padMounts[0]!.heightM).toBeCloseTo(1.6, 1);
  });

  it("reports no service drop where no wire runs to the building", () => {
    expect(found.drop).toBeNull();
  });

  it("finds a narrow drop from a pole to the wall below the roof, with the roof height", () => {
    const withDrop = detectEquipment(
      scene((add) => {
        for (const x of [0, 40, 80]) pole(add, x, 6);
        wire(add, 0, 40, 6); wire(add, 40, 80, 6);
        for (let t = 0.02; t < 1; t += 0.015) add(40 + (60 - 40) * t, 6 + (30 - 6) * t, 9.5 - 3 * t);
      }),
      [building],
      [road],
    );
    expect(rounded(withDrop.drop!.pole.at)).toEqual([40, 6]);
    expect(withDrop.drop!.wall[1]).toBeCloseTo(30, 0);
    expect(withDrop.drop!.roofM).toBeCloseTo(8, 0);
  });

  it("finds nothing in an empty cloud", () => {
    expect(detectEquipment([], [building], [road])).toEqual({ poles: [], conductors: [], drop: null, padMounts: [] });
  });
});
