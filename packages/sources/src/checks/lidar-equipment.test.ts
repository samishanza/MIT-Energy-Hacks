import { describe, expect, it } from "vitest";
import type { LidarPoint } from "../ept.ts";
import { detectEquipment } from "./lidar-equipment.ts";

// A synthetic scene, in metres: flat ground, a road along y = 0, a building, two poles with a wire, a tree,
// a service drop, a pad-mount box by the wall, and a car on the road.
function scene(): LidarPoint[] {
  const points: LidarPoint[] = [];
  const add = (x: number, y: number, h: number, classification = 1) => points.push({ x, y, z: 100 + h, classification });
  for (let x = -10; x <= 130; x += 0.5) for (let y = -15; y <= 75; y += 0.5) add(x, y, 0, 2);
  for (let x = 30; x <= 70; x += 0.5) for (let y = 30; y <= 55; y += 0.5) add(x, y, 8, 6);
  for (const [px, py] of [[20, 6], [80, 6]] as const) for (let h = 1; h <= 10; h += 0.3) add(px + ((h * 7) % 3) * 0.05, py, h);
  for (let x = 21; x < 80; x += 0.5) add(x, 6, 7.5);
  // A tree: a wide canopy, which isn't a pole.
  for (let a = 0; a < 360; a += 8) for (let r = 0; r <= 3; r += 0.5) for (let h = 4; h <= 10; h += 1.5) add(105 + r * Math.cos((a * Math.PI) / 180), 20 + r * Math.sin((a * Math.PI) / 180), h, 5);
  for (let h = 1; h <= 10; h += 0.3) add(105, 20, h, 5);
  // A drop from the second pole to the building's south wall.
  for (let t = 0.05; t < 1; t += 0.02) add(80 + (66 - 80) * t, 6 + (30 - 6) * t, 6.5 - t);
  // A pad-mount by the wall, open above.
  for (let x = 24; x <= 26; x += 0.25) for (let y = 31; y <= 33; y += 0.25) add(x, y, 1.6);
  // A car on the road.
  for (let x = 50; x <= 54.5; x += 0.25) for (let y = 0; y <= 1.8; y += 0.25) add(x, y, 1.5);
  return points;
}

const building: [number, number][] = [[30, 30], [70, 30], [70, 55], [30, 55], [30, 30]];
const road = { name: "Test St", line: [[-10, 0], [130, 0]] as [number, number][], onAddress: true };

describe("finding grid equipment in lidar by shape", () => {
  const found = detectEquipment(scene(), [building], [road]);

  it("finds the two poles along the road, and not the tree", () => {
    expect(found.poles.map((pole) => pole.at.map(Math.round)).sort()).toEqual([[20, 6], [80, 6]]);
    expect(found.poles.every((pole) => pole.road === "Test St" && pole.high >= 9)).toBe(true);
  });

  it("finds the conductor strung between them", () => {
    expect(found.conductors).toHaveLength(1);
    expect(found.conductors[0]!.coverage).toBeGreaterThan(0.9);
    expect(found.conductors[0]!.heightM).toBeCloseTo(7.5, 0);
  });

  it("finds the service drop from the second pole to the building", () => {
    expect(found.drop?.pole.at.map(Math.round)).toEqual([80, 6]);
    expect(found.drop!.wall[1]).toBeCloseTo(30, 0);
  });

  it("finds the box by the wall as a possible pad-mount, and not the car on the road", () => {
    expect(found.padMounts.map((pad) => pad.at.map(Math.round))).toEqual([[25, 32]]);
  });

  it("finds nothing in an empty cloud", () => {
    expect(detectEquipment([], [building], [road])).toEqual({ poles: [], conductors: [], drop: null, padMounts: [] });
  });
});
