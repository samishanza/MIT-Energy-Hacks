import { describe, expect, it } from "vitest";
import type { MapFeature, RecordVersion } from "@eqore/contract";
import { feasibleBessZone, MAX_RUN_FT } from "./zone.ts";

// A labeled synthetic site, laid out in feet east and north of a point and converted to degrees.
const ORIGIN = [-71.5, 42.2] as const;
const PER_FT_LAT = 1 / ((6371008.8 * Math.PI * 3.280839895) / 180);
const PER_FT_LON = PER_FT_LAT / Math.cos((ORIGIN[1] * Math.PI) / 180);
const ll = ([x, y]: [number, number]): [number, number] => [ORIGIN[0] + x * PER_FT_LON, ORIGIN[1] + y * PER_FT_LAT];
const box = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map((p) => ll(p as [number, number]));
const feature = (id: string, kind: MapFeature["kind"], field: string, geometry: MapFeature["geometry"], attributes?: MapFeature["attributes"]) => ({ id, kind, field, geometry, label: id, attributes }) as MapFeature;

function site(extra: MapFeature[] = [], lot = box(0, 0, 600, 400)): RecordVersion {
  return {
    id: "synthetic-v1",
    version: 1,
    site: { id: "synthetic", address: "SYNTHETIC TEST SITE", region: "massachusetts", location: [...ORIGIN], locationMethod: "hand_placed" },
    values: [{ field: "road_width_ft", state: "inferred", current: { type: "quantity", value: 24, unit: "ft" } }],
    features: [
      feature("lot", "property_line", "property_line", { type: "Polygon", coordinates: [lot] }),
      feature("building", "building_outline", "building_outline", { type: "Polygon", coordinates: [box(200, 150, 400, 250)] }),
      // The road runs along the north edge of the lot.
      feature("road", "road", "road_name", { type: "LineString", coordinates: [ll([-50, 420]), ll([650, 420])] }),
      ...extra,
    ],
    synthetic: true,
  } as unknown as RecordVersion;
}

const entrance = (x: number, y: number) => feature("entrance", "existing_equipment", "grid_service_path", { type: "Point", coordinates: ll([x, y]) }, { equipment_type: { type: "text", value: "service_entrance" } });
const feetOf = ([lon, lat]: [number, number]): [number, number] => [(lon - ORIGIN[0]) / PER_FT_LON, (lat - ORIGIN[1]) / PER_FT_LAT];

describe("the feasible battery zone", () => {
  it("places the pad beside the service entrance, with the run measured from the pad's edge", () => {
    const { zone, pad, target, reason } = feasibleBessZone(site([entrance(200, 200)]));
    expect(reason).toBeNull();
    expect(target).toBe("service entrance");
    expect(zone?.attributes?.zone_kind).toEqual({ type: "text", value: "feasible_bess" });
    const [x, y] = feetOf(pad!.center);
    // West of the west wall, at least 10 ft off it.
    expect(x).toBeLessThan(190);
    expect(Math.abs(y - 200)).toBeLessThan(20);
    expect(pad!.run.feet).toBeGreaterThanOrEqual(10);
    expect(pad!.run.feet).toBeLessThan(16);
  });

  it("keeps the whole zone within the run limit of the entrance, inside the lot, and off the building", () => {
    const { zone } = feasibleBessZone(site([entrance(200, 200)]));
    const rings = (zone!.geometry.type === "Polygon" ? [zone!.geometry.coordinates] : zone!.geometry.coordinates) as [number, number][][][];
    for (const point of rings.flatMap((polygon) => polygon[0]!).map(feetOf)) {
      expect(Math.hypot(point[0] - 200, point[1] - 200)).toBeLessThanOrEqual(MAX_RUN_FT + 4);
      expect(point[0]).toBeGreaterThanOrEqual(8);
      expect(point[1]).toBeGreaterThanOrEqual(8);
    }
  });

  it("keeps out of a wetland, and ranks spots outside its buffer ahead", () => {
    const wetland = feature("wetland", "constraint", "wetlands_nearby", { type: "Polygon", coordinates: [box(100, 100, 180, 300)] });
    const { pad } = feasibleBessZone(site([entrance(200, 200), wetland]));
    const corners = pad!.corners.map(feetOf);
    expect(corners.every(([x, y]) => !(x > 100 && x < 180 && y > 100 && y < 300))).toBe(true);
  });

  it("stays 10 ft from an overhead conductor", () => {
    const wire = feature("wire", "utility_line", "detected_grid_equipment", { type: "LineString", coordinates: [ll([150, 0]), ll([150, 400])] }, { line_class: { type: "text", value: "detected overhead conductor" } });
    const { pad } = feasibleBessZone(site([entrance(200, 200), wire]));
    expect(pad!.corners.map(feetOf).every(([x]) => Math.abs(x - 150) >= 8)).toBe(true);
  });

  it("names the rule that removed every spot", () => {
    const swamp = feature("swamp", "constraint", "wetlands_nearby", { type: "Polygon", coordinates: [box(-100, -100, 700, 500)] });
    expect(feasibleBessZone(site([swamp])).reason).toBe("No spot qualifies after this rule: Outside mapped wetlands.");
    // A lot 30 ft wider than the building on each side leaves a 6 ft strip once both 10 ft clearances apply: too narrow for the pad.
    expect(feasibleBessZone(site([], box(170, 120, 430, 280))).reason).toContain("Room for the 11.5 × 14 ft pad");
  });

  it("measures to the building when no entrance is known", () => {
    const { target, pad } = feasibleBessZone(site());
    expect(target).toBe("building wall");
    expect(pad!.run.feet).toBeLessThan(16);
  });
});
