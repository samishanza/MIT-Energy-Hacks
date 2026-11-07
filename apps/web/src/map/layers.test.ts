import { describe, expect, it } from "vitest";
import { sampleRecord } from "../test/fixtures";
import { baseSource, HIT_LAYERS, pointFeatures, toFeatureCollection } from "./layers";

describe("map data", () => {
  it("draws lines and areas as geojson, keyed by feature id", () => {
    const collection = toFeatureCollection(sampleRecord().features);
    expect(collection.features.map((f) => f.properties.id)).toEqual(["f-property", "f-feeder"]);
    expect(collection.features[0]!.properties).toMatchObject({ kind: "property_line", field: "property_line" });
  });

  it("draws equipment and photo pins as callouts rather than map symbols", () => {
    expect(pointFeatures(sampleRecord().features).map((f) => f.id)).toEqual(["f-gear"]);
  });

  it("hit-tests lines before the building and the building before the parcel", () => {
    expect(HIT_LAYERS).toEqual(["utility-line", "building-outline", "property-fill"]);
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
