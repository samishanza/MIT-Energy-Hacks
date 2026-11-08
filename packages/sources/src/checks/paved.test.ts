import { describe, expect, it } from "vitest";
import type { PolygonGeometry } from "../arcgis.ts";
import { collectPavedSurfaces, type PavedSurfaces } from "./paved.ts";

// A labeled synthetic lot, 100 m square, in degrees near 42.2 N.
const DEG_LAT = 1 / 111320, DEG_LON = DEG_LAT / Math.cos((42.2 * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [-71.5 + x * DEG_LON, 42.2 + y * DEG_LAT];
const square = (x0: number, y0: number, x1: number, y1: number): PolygonGeometry => ({ type: "Polygon", coordinates: [[at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)]] });

const config: PavedSurfaces = {
  coverAttribute: "COVERCODE",
  imperviousCode: 2,
  sourceDate: "2016",
  entry: { kind: "arcgis_rest", id: "synthetic-land-cover", name: "Synthetic land cover", serviceUrl: "https://example.invalid/MapServer", layer: 0, searchRadiusMeters: 0, licenseNote: "Synthetic test data", robotsChecked: "2026-11-08", objectIdAttribute: "OBJECTID", outFields: ["OBJECTID", "COVERCODE"], fields: [] },
};
const ctx = (features: unknown[]) => ({
  siteId: "synthetic",
  now: () => "2026-11-08T00:00:00.000Z",
  fetch: async () => new Response(JSON.stringify({ features })),
});
const esri = (code: number, geometry: PolygonGeometry, id: number) => ({ attributes: { OBJECTID: id, COVERCODE: code }, geometry: { rings: geometry.coordinates } });

describe("paved parking and drives", () => {
  it("is the impervious cover inside the lot, less the building and the road surface", async () => {
    const lot = square(0, 0, 100, 100);
    // Impervious everywhere on the lot, and some grass that isn't counted.
    const part = await collectPavedSurfaces(config, lot, [square(30, 30, 70, 70)], [{ line: [at(-10, 95), at(110, 95)], halfWidthM: 5 }], ctx([esri(2, square(-20, -20, 120, 120), 1), esri(5, square(0, 0, 10, 10), 2)]));
    const sqft = (part.observations[0]!.value as { value: number }).value;
    // 100 x 100 less the 40 x 40 building (and its half-metre margin) less the road, 5 m each side of y = 95.
    const expected = (10000 - 41 * 41 - 10 * 100) * 10.7639;
    expect(Math.abs(sqft - expected) / expected).toBeLessThan(0.02);
    expect(part.features[0]).toMatchObject({ kind: "constraint", field: "paved_area_sqft", label: "(E) PAVED PARKING AND DRIVES" });
  });

  it("says when nothing is paved, and passes a failure through", async () => {
    const none = await collectPavedSurfaces(config, square(0, 0, 100, 100), [], [], ctx([esri(5, square(0, 0, 100, 100), 1)]));
    expect(none.observations[0]).toMatchObject({ kind: "no_value", locator: { attribute: "COVERCODE" } });
    const failed = await collectPavedSurfaces(config, square(0, 0, 100, 100), [], [], { siteId: "s", now: () => "2026-11-08T00:00:00.000Z", fetch: async () => new Response("nope", { status: 500 }), retryDelayMs: 0 });
    expect(failed.observations[0]!.kind).toBe("no_value");
    expect(failed.features).toEqual([]);
  });
});
