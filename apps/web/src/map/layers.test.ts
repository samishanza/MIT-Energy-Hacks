import type { MapFeature } from "@eqore/contract";
import { describe, expect, it } from "vitest";
import { sampleRecord, worcesterRecord } from "../test/fixtures";
import { baseSource, buildingHeights, HIT_LAYERS, layerOf, pointFeatures, toFeatureCollection, zoneTier } from "./layers";

const square: MapFeature["geometry"] = {
  type: "Polygon",
  coordinates: [
    [
      [-71.8, 42.26],
      [-71.799, 42.26],
      [-71.799, 42.261],
      [-71.8, 42.26],
    ],
  ],
};

const zone = (tier?: string): MapFeature => ({
  id: `zone-${tier}`,
  kind: "candidate_area",
  field: "eligibility_zones",
  geometry: square,
  ...(tier ? { attributes: { tier: { type: "text", value: tier } } } : {}),
});

describe("map data", () => {
  it("draws lines and areas as geojson, keyed by feature id and layer", () => {
    const collection = toFeatureCollection(sampleRecord().features);
    expect(collection.features.map((f) => f.properties.id)).toEqual(["f-property", "f-feeder"]);
    expect(collection.features[0]!.properties).toMatchObject({ kind: "property_line", field: "property_line", layer: "lot" });
  });

  it("draws points as labels rather than map symbols", () => {
    expect(pointFeatures(sampleRecord().features).map((f) => f.id)).toEqual(["f-gear"]);
  });

  it("gives each collected kind on Worcester its own layer", () => {
    const layers = new Set(worcesterRecord().features.map(layerOf));
    expect(layers).toEqual(new Set(["lot", "buildings", "utility", "dimensions", "wetlands", "fire_stations"]));
  });

  it("tells wetlands and fire stations apart from other constraints", () => {
    const constraint = (field: string): MapFeature => ({ id: field, kind: "constraint", field, geometry: square });
    expect(layerOf(constraint("wetlands_nearby"))).toBe("wetlands");
    expect(layerOf(constraint("fire_stations_nearby"))).toBe("fire_stations");
    expect(layerOf(constraint("flood_zone"))).toBe("constraints");
    expect(layerOf({ id: "r", kind: "road", field: "road_name", geometry: square })).toBe("roads");
    expect(layerOf({ id: "s", kind: "substation", field: "feeder", geometry: square })).toBe("substations");
  });

  it.each([
    ["remote", "remote"],
    ["Near exposure", "near_exposure"],
    ["eligible_with_exception", "exception"],
    ["excluded", "excluded"],
    ["something else", "unknown"],
  ])("reads the zone tier %s as %s", (tier, expected) => {
    expect(zoneTier(zone(tier))).toBe(expected);
    expect(layerOf(zone(tier))).toBe(`zone_${expected}`);
  });

  it("calls a zone with no tier unknown rather than guessing", () => {
    expect(zoneTier(zone())).toBe("unknown");
  });

  it("raises only the main building, from the site's estimated height", () => {
    const record = worcesterRecord();
    const heights = buildingHeights(record.features, record.values);
    expect([...heights.values()]).toEqual([56]);
    const [raised] = [...heights.keys()];
    const collection = toFeatureCollection(record.features, heights);
    const flat = collection.features.filter((f) => f.properties.layer === "buildings" && f.properties.heightM === 0);
    expect(flat).toHaveLength(5);
    expect(collection.features.find((f) => f.properties.id === raised)!.properties.heightM).toBeCloseTo(56 / 3.28084);
  });

  it("raises no building when no height is on record", () => {
    const record = worcesterRecord();
    record.values = record.values.filter((v) => v.field !== "building_height_ft");
    expect(buildingHeights(record.features, record.values).size).toBe(0);
  });

  it("picks dimension and utility lines before buildings, and the lot last", () => {
    expect(HIT_LAYERS.indexOf("dimension-line")).toBeLessThan(HIT_LAYERS.indexOf("building-fill"));
    expect(HIT_LAYERS.indexOf("utility-line")).toBeLessThan(HIT_LAYERS.indexOf("building-fill"));
    expect(HIT_LAYERS.indexOf("building-fill")).toBeLessThan(HIT_LAYERS.indexOf("zone-fill"));
    expect(HIT_LAYERS.indexOf("zone-fill")).toBeLessThan(HIT_LAYERS.indexOf("wetland-fill"));
    expect(HIT_LAYERS.indexOf("wetland-fill")).toBeLessThan(HIT_LAYERS.indexOf("road-line"));
    expect(HIT_LAYERS.at(-1)).toBe("property-fill");
  });

  it("builds the base from the record, not from a region", () => {
    const base = sampleRecord().baseMap!;
    expect(baseSource(base)).toMatchObject({
      type: "raster",
      tiles: [base.tileUrlTemplate],
      maxzoom: base.maxZoom,
      attribution: base.attribution,
    });
  });
});
