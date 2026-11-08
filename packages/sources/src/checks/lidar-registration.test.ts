import { describe, expect, it } from "vitest";
import type { MapFeature } from "@eqore/contract";
import { massachusetts } from "../../config/index.ts";
import type { CollectContext } from "../arcgis.ts";
import type { LidarPoint } from "../ept.ts";
import { collectLidarEquipment } from "./lidar-collect.ts";
import { describeShift, estimateShift } from "./lidar-registration.ts";

// Synthetic scenes in metres around a building's centre: an 80 by 25 m building, its roof 8 m up, a road 36 m south,
// and three wired poles 30 m south. `offset` moves every return, as a lidar registered off the map would be.
type Point = [number, number];
const outline: Point[] = [[-40, -12.5], [40, -12.5], [40, 12.5], [-40, 12.5], [-40, -12.5]];
function scene(offset: Point, { roof = 0.5, poles = true } = {}): LidarPoint[] {
  const points: LidarPoint[] = [];
  const add = (x: number, y: number, h: number, classification = 1) => points.push({ x: x + offset[0], y: y + offset[1], z: 100 + h, classification, returns: 1 });
  for (let x = -60; x <= 60; x += 0.5) for (let y = -45; y <= 20; y += 0.5) if (Math.abs(x) > 40 || Math.abs(y) > 12.5) add(x, y, 0, 2);
  for (let x = -40 + roof / 2; x < 40; x += roof) for (let y = -12.5 + roof / 2; y < 12.5; y += roof) add(x, y, 8, 6);
  if (poles) {
    for (const x of [-40, 0, 40]) {
      for (let h = 1; h <= 11; h += 0.25) add(x + ((h * 7) % 3) * 0.05, -30, h, 5);
      for (let dy = -1.2; dy <= 1.2; dy += 0.3) add(x, -30 + dy, 10.6, 5);
    }
    for (const [x0, x1] of [[-40, 0], [0, 40]] as const) for (let x = x0 + 1; x < x1; x += 0.5) add(x, -30, 9 - 1.5 * Math.sin((Math.PI * (x - x0)) / (x1 - x0)));
  }
  return points;
}

describe("registering the lidar to the building outline", () => {
  it("recovers a 1.5 m eastward offset of the building returns within 0.25 m", () => {
    const fit = estimateShift(scene([1.5, 0], { poles: false }), [outline]);
    expect(fit.applied).toBe(true);
    expect(Math.abs(fit.dx - 1.5)).toBeLessThan(0.25);
    expect(Math.abs(fit.dy)).toBeLessThan(0.25);
    expect(describeShift(fit)).toMatch(/^1\.[4-6] m toward 2(6[5-9]|7[0-5])°$/);
  });

  it("recovers a diagonal offset too", () => {
    const fit = estimateShift(scene([-0.8, 1.1], { poles: false }), [outline]);
    expect(Math.abs(fit.dx + 0.8)).toBeLessThan(0.25);
    expect(Math.abs(fit.dy - 1.1)).toBeLessThan(0.25);
  });

  it("applies no shift without a building outline, with too few building returns, or when the lidar already fits", () => {
    expect(estimateShift(scene([1.5, 0]), []).applied).toBe(false);
    const sparse = estimateShift(scene([1.5, 0], { roof: 6 }), [outline]);
    expect(sparse.applied).toBe(false);
    expect(sparse.reason).toMatch(/too few/);
    const aligned = estimateShift(scene([0, 0]), [outline]);
    expect(aligned.applied).toBe(false);
    expect([aligned.dx, aligned.dy]).toEqual([0, 0]);
    expect(describeShift(aligned)).toBe("none");
  });
});

describe("lidar equipment in the map's frame", () => {
  const center: Point = [-71.4, 42.2];
  const perLon = 111320 * Math.cos((center[1] * Math.PI) / 180);
  const lonLat = ([x, y]: Point): Point => [center[0] + x / perLon, center[1] + y / 111320];
  const local = ([lon, lat]: Point): Point => [(lon - center[0]) * perLon, (lat - center[1]) * 111320];
  const ctx: CollectContext = { siteId: "test-site", fetch, now: () => "2026-11-07T20:00:00.000Z" };
  const road = { objectId: "1", attributes: { NAME: "Test St", MTFCC: "S1400" }, geometry: { type: "LineString" as const, coordinates: [lonLat([-60, -36]), lonLat([60, -36])] } };
  const run = async (offset: Point) => {
    const part = await collectLidarEquipment(
      massachusetts.lidarPoints!,
      async () => ({ base: "synthetic", points: scene(offset) }),
      [{ type: "Polygon", coordinates: [outline.map(lonLat)] }],
      [road],
      "NAME",
      "1 Test St, Testville, MA",
      ctx,
    );
    return part!.features.filter((f) => (f.attributes?.equipment_type as { value?: string } | undefined)?.value === "utility_pole");
  };
  const at = (f: MapFeature) => local(f.geometry.coordinates as Point);
  const sorted = (features: MapFeature[]) => features.map(at).sort((a, b) => a[0] - b[0]);

  it("moves every pole back by the shift, onto where it stands on the map, and records the shift", async () => {
    const truth = sorted(await run([0, 0]));
    const offset = await run([1.5, 0]);
    const moved = sorted(offset);
    expect(truth).toHaveLength(3);
    expect(moved).toHaveLength(3);
    moved.forEach((p, i) => {
      expect(Math.abs(p[0] - truth[i]![0])).toBeLessThan(0.25);
      expect(Math.abs(p[1] - truth[i]![1])).toBeLessThan(0.25);
    });
    const attributes = offset[0]!.attributes as Record<string, { value?: unknown }>;
    expect(String(attributes.registration_shift_m!.value)).toMatch(/^1\.[4-6] m toward 2(6[5-9]|7[0-5])°$/);
    expect(String(attributes.confidence_reason!.value)).toMatch(/moved 1\.[4-6] m toward .* to register the lidar to the mapped building outline/);
  });

  it("records that no shift was applied when the lidar already fits", async () => {
    const attributes = (await run([0, 0]))[0]!.attributes as Record<string, { value?: unknown }>;
    expect(attributes.registration_shift_m!.value).toBe("none");
    expect(String(attributes.confidence_reason!.value)).toMatch(/No registration shift is applied/);
  });
});
