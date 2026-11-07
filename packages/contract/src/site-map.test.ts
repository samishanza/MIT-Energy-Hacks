import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONCEPT_GRADE_NOTE,
  CONTRACT_VERSION,
  MapFeatureSchema,
  SiteMapExportSchema,
  SiteSchema,
  routes,
} from "./index.ts";

function sample(): Record<string, any> {
  return JSON.parse(readFileSync(new URL("../samples/site-map.sample.json", import.meta.url), "utf8"));
}

describe("site map export", () => {
  it("accepts the sample, which is marked synthetic and on the current contract version", () => {
    const parsed = SiteMapExportSchema.parse(sample());
    expect(parsed.synthetic).toBe(true);
    expect(parsed.contractVersion).toBe(CONTRACT_VERSION);
    expect(parsed.site.address).toContain("SYNTHETIC SAMPLE");
  });

  it("can't drop or reword the concept-grade note", () => {
    const { note: _note, ...noNote } = sample();
    expect(SiteMapExportSchema.safeParse(noNote).success).toBe(false);
    expect(SiteMapExportSchema.safeParse({ ...sample(), note: "Approved for construction." }).success).toBe(false);
    expect(sample().note).toBe(CONCEPT_GRADE_NOTE);
  });

  it("keeps each feature's state, so a consumer can't mistake an inferred value for a verified one", () => {
    const body = sample();
    delete body.features.features[0].properties.state;
    expect(SiteMapExportSchema.safeParse(body).success).toBe(false);
  });

  it("carries a dimension line that points at the value behind its label", () => {
    const parsed = SiteMapExportSchema.parse(sample());
    const dimension = parsed.features.features.find((f) => f.properties.kind === "dimension_line");
    expect(dimension?.geometry.type).toBe("LineString");
    expect(parsed.values.map((v) => v.field)).toContain(dimension?.properties.field);
  });

  it("gives every feature a value in the export", () => {
    const parsed = SiteMapExportSchema.parse(sample());
    const fields = new Set(parsed.values.map((v) => v.field));
    for (const feature of parsed.features.features) expect(fields).toContain(feature.properties.field);
  });

  it("is served by the engineer API, never the capture listener", () => {
    expect(routes.readSiteMap.listener).toBe("engineer");
    expect(routes.readSiteMap.path).toBe("/api/sites/:siteId/versions/:version/site-map");
    expect(routes.readSiteMap.response).toBe(SiteMapExportSchema);
  });
});

describe("additions for the map", () => {
  it("accepts dimension lines on the record's map features", () => {
    const line = {
      id: "dim-1",
      kind: "dimension_line",
      field: "lot_width_ft",
      geometry: { type: "LineString", coordinates: [[-71.8, 42.26], [-71.79, 42.26]] },
      label: "810 ft",
    };
    expect(MapFeatureSchema.safeParse(line).success).toBe(true);
  });

  it("lets a site be marked as a capture trial, and defaults to no mark", () => {
    const site = { id: "s", address: "a", region: "r", location: null, locationMethod: null };
    expect(SiteSchema.parse(site).captureTest).toBeUndefined();
    expect(SiteSchema.parse({ ...site, captureTest: true }).captureTest).toBe(true);
  });
});
