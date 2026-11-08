import { describe, expect, it } from "vitest";
import type { MapFeature, RecordVersion } from "@eqore/contract";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APPLIED_RULES, NOT_CHECKED, feasibleBessZone, MAX_RUN_FT, PREFERRED_STRAIGHT_FT, RECOMMENDED_REACH_FT } from "./zone.ts";

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
    expect(feasibleBessZone(site([], box(170, 120, 430, 280))).reason).toContain("Room for the 11.5 x 14 ft pad");
  });

  it("measures to the building when no entrance is known", () => {
    const { target, pad } = feasibleBessZone(site());
    expect(target).toBe("building wall");
    expect(pad!.run.feet).toBeLessThan(16);
  });
});

describe("where the battery should go", () => {
  const pole = (x: number, y: number) => feature(`pole-${x}`, "existing_equipment", "grid_service_path", { type: "Point", coordinates: ll([x, y]) }, { equipment_type: { type: "text", value: "utility_pole" } });
  const pointsOf = (f: MapFeature) => ((f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as [number, number][][][]).flatMap((polygon) => polygon[0]!).map(feetOf);

  it("keeps the preferred zone within a 150 ft routed run, about 104 ft straight, of the entrance", () => {
    expect(Math.round(PREFERRED_STRAIGHT_FT)).toBe(104);
    const { zone, preferred } = feasibleBessZone(site([entrance(200, 200)]));
    expect(preferred?.attributes?.zone_kind).toEqual({ type: "text", value: "feasible_bess_preferred" });
    for (const [x, y] of pointsOf(preferred!)) expect(Math.hypot(x - 200, y - 200)).toBeLessThanOrEqual(PREFERRED_STRAIGHT_FT + 4);
    const area = (f: MapFeature) => (f.attributes!["area_sqft"] as { value: number }).value;
    expect(area(preferred!)).toBeLessThan(area(zone!) / 2);
  });

  it("without a known entrance, measures from the wall nearest the utility pole, and says it's assumed", () => {
    // The pole is north of the building's east end, by the road.
    const { preferred, pad, target } = feasibleBessZone(site([pole(380, 300)]));
    expect(target).toBe("building wall nearest the utility supply");
    expect(String((preferred!.attributes!["confidence_reason"] as { value: string }).value)).toMatch(/assumed/);
    for (const [x, y] of pointsOf(preferred!)) expect(Math.hypot(x - 380, y - 250)).toBeLessThanOrEqual(PREFERRED_STRAIGHT_FT + 4);
    const [x, y] = feetOf(pad!.center);
    expect(Math.hypot(x - 380, y - 250)).toBeLessThan(60);
  });

  it("without a known entrance, measures from the wall nearest the likeliest transformer box, ahead of the pole", () => {
    // The lidar's likeliest transformer is 20 ft south of the building's west end; the pole is by the road.
    const box1 = feature("box-1", "existing_equipment", "detected_grid_equipment", { type: "Point", coordinates: ll([220, 130]) }, {
      equipment_type: { type: "text", value: "pad_mount_transformer_candidate" },
      candidate_rank: { type: "quantity", value: 1, unit: "rank" },
    });
    const { preferred, target } = feasibleBessZone(site([pole(380, 300), box1]));
    expect(target).toBe("building wall nearest the likeliest transformer");
    expect(String((preferred!.attributes!["confidence_reason"] as { value: string }).value)).toMatch(/likeliest to be the transformer/);
    for (const [x, y] of pointsOf(preferred!)) expect(Math.hypot(x - 220, y - 150)).toBeLessThanOrEqual(PREFERRED_STRAIGHT_FT + 4);
  });

  it("ignores a transformer box too far from the building to say where the service enters", () => {
    const far = feature("box-1", "existing_equipment", "detected_grid_equipment", { type: "Point", coordinates: ll([220, 60]) }, {
      equipment_type: { type: "text", value: "pad_mount_transformer_candidate" },
      candidate_rank: { type: "quantity", value: 1, unit: "rank" },
    });
    expect(feasibleBessZone(site([pole(380, 300), far])).target).toBe("building wall nearest the utility supply");
  });

  it("measures from a main switchboard a person placed, ahead of the assumed wall", () => {
    const placed = feature("pin", "capture_pin", "switchboard_location", { type: "Point", coordinates: ll([210, 160]) });
    const { preferred, target } = feasibleBessZone(site([pole(380, 300), placed]));
    expect(target).toBe("main switchboard");
    for (const [x, y] of pointsOf(preferred!)) expect(Math.hypot(x - 210, y - 160)).toBeLessThanOrEqual(PREFERRED_STRAIGHT_FT + 4);
  });

  it("puts the pad on unpaved ground when paved parking surrounds the entrance", () => {
    // Paving covers everything within 40 ft of the west wall; grass lies beyond it.
    const paving = feature("paved", "constraint", "paved_area_sqft", { type: "Polygon", coordinates: [box(150, 100, 200, 300)] });
    const { pad } = feasibleBessZone(site([entrance(200, 200), paving]));
    const [x] = feetOf(pad!.center);
    expect(x).toBeLessThan(150);
    expect(pad!.run.feet).toBeLessThanOrEqual(150);
  });

  it("narrows to where the pad would realistically go: around the best pad, a fraction of the preferred zone", () => {
    const { recommended, preferred, pad } = feasibleBessZone(site([entrance(200, 200)]));
    const area = (f: MapFeature) => (f.attributes!["area_sqft"] as { value: number }).value;
    expect(area(recommended!)).toBeLessThan(area(preferred!) / 2);
    const [cx, cy] = feetOf(pad!.center);
    // Every corner of the area lies within the reach of the best pad, plus half a pad and a cell.
    for (const [x, y] of pointsOf(recommended!)) expect(Math.hypot(x - cx, y - cy)).toBeLessThanOrEqual(RECOMMENDED_REACH_FT + 12);
  });

  it("keeps the pad beside a paved drive, for delivery, over open grass farther out", () => {
    // A drive runs north-south 60 ft west of the building; grass lies on both sides of it.
    const drive = feature("drive", "constraint", "paved_area_sqft", { type: "Polygon", coordinates: [box(120, 100, 140, 300)] });
    const { pad } = feasibleBessZone(site([entrance(200, 200), drive]));
    const [x] = feetOf(pad!.center);
    // Beside the drive (within 20 ft of its edges, off it), not out in the grass beyond.
    expect(x > 140 || x < 120).toBe(true);
    expect(Math.min(Math.abs(x - 140), Math.abs(x - 120))).toBeLessThan(20 + 14);
  });

  it("without an entrance, measures from the wall nearest a known utility transformer, ahead of the nearest pole", () => {
    // The pole is north by the road; the transformer a photo placed is south-west of the building.
    const transformer = feature("xfmr", "capture_pin", "utility_transformer_location", { type: "Point", coordinates: ll([180, 130]) });
    const { preferred, target } = feasibleBessZone(site([pole(380, 300), transformer]));
    expect(target).toBe("building wall nearest the utility transformer");
    for (const [x, y] of pointsOf(preferred!)) expect(Math.hypot(x - 200, y - 150)).toBeLessThanOrEqual(PREFERRED_STRAIGHT_FT + 30);
  });

  it("falls back to every wall when there's no entrance and no supply nearby", () => {
    expect(feasibleBessZone(site()).target).toBe("building wall");
  });
});

describe("the siting rule table", () => {
  const table = JSON.parse(readFileSync(fileURLToPath(new URL("../../../fixtures/bess-siting-rules.json", import.meta.url)), "utf8")) as { id: string; notes?: string }[];

  it("applies and lists only rules in the table, with the table's status", () => {
    const ids = new Set(table.map((rule) => rule.id));
    for (const rule of [...APPLIED_RULES, ...NOT_CHECKED]) expect(ids.has(rule.id), rule.id).toBe(true);
    for (const rule of APPLIED_RULES) {
      const notes = table.find((entry) => entry.id === rule.id)!.notes ?? "";
      expect(notes.toUpperCase().startsWith(rule.status.toUpperCase()), `${rule.id} is ${rule.status}`).toBe(true);
    }
  });

  it("marks the remote part of the zone and the pad's exposure, and lists what it can't check", () => {
    const big = site([entrance(200, 200)], box(-300, -300, 900, 400));
    const { zone, remote, pad } = feasibleBessZone(big);
    expect(remote?.attributes?.zone_kind).toEqual({ type: "text", value: "feasible_bess_remote" });
    expect(pad!.exposure).toBe("needs_hazard_analysis");
    expect(String((zone!.attributes!.not_checked as { value: string }).value)).toContain("fire.egress_10ft");
    expect(String((zone!.attributes!.rules_applied as { value: string }).value)).toContain("heuristic");
    expect(feasibleBessZone(big, { energyKwh: 500 }).pad!.exposure).toBe("near_exposures");
  });
});
