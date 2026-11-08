import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Value } from "@eqore/contract";
import { californiaPge, massachusetts, type CollectContext, type RegionConfig } from "./index.ts";
import { crossCheck } from "./checks/cross-checks.ts";
import { collectSite } from "./collect.ts";
import { deriveValues } from "./derive.ts";
import { describeLandCover, landCoverIn, liveEarthEngine, recordedEarthEngine, type EarthEngineRunner } from "./earthengine.ts";
import { fixtureFetch } from "./fixtures.ts";
import { resolveSite } from "./resolve-site.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));
const earth = recordedEarthEngine(dir("earthengine"));
const lidar = async () => ({ slopePercent: 6.96, sampleCount: 35, demResolutionFt: 4.9 });

async function collect(address: string, region: RegionConfig, extra: Partial<CollectContext> = {}) {
  const ctx: CollectContext = { siteId: "test-site", fetch: recorded, now: () => "2026-11-07T20:00:00.000Z", retryDelayMs: 0, earthEngine: earth, ...extra };
  const resolved = await resolveSite(address, region, ctx);
  if (resolved.status !== "resolved") throw new Error(`Expected one match for ${address}`);
  const collection = await collectSite(address, region, resolved.anchor, ctx);
  const values = crossCheck({ address, values: deriveValues(collection.observations), observations: collection.observations, features: collection.features });
  return { collection, value: (field: string): Value => values.find((entry) => entry.field === field)! };
}

describe("the Earth Engine adapter", () => {
  it("answers land cover for a Worcester polygon from recorded data, with its source and date", async () => {
    const resolved = await resolveSite("100 Research Dr, Worcester, MA", massachusetts, { siteId: "t", fetch: recorded, now: () => "2026-11-07T20:00:00.000Z" });
    if (resolved.status !== "resolved" || resolved.anchor.kind !== "parcel") throw new Error("Expected a parcel");
    const cover = await landCoverIn(resolved.anchor.parcel.geometry as never, earth, () => "2026-11-07T20:00:00.000Z");
    if ("failure" in cover) throw new Error(cover.failure);
    expect(cover.source.id).toBe("earth-engine-worldcover");
    expect(cover.sourceDate).toBe("2021");
    expect(cover.classes.reduce((sum, entry) => sum + entry.percent, 0)).toBeCloseTo(100, 0);
    expect(describeLandCover(cover)).toMatch(/built-up \d/);
  });

  it("stores land cover, slope, and elevation with source, retrieval date, and method", async () => {
    const { value, collection } = await collect("100 Research Dr, Worcester, MA", massachusetts);
    expect(value("land_cover")).toMatchObject({ state: "inferred", method: "computed" });
    const slope = collection.observations.filter((observation) => observation.field === "site_slope_pct" && observation.kind === "reading");
    expect(slope.map((observation) => observation.source.id)).toEqual(["earth-engine-3dep"]);
    expect(slope[0]).toMatchObject({ method: "computed", retrievedAt: "2026-11-07T20:00:00.000Z" });
  });

  it("keeps lidar slope current in Massachusetts, with Earth Engine's as a second reading and no conflict", async () => {
    const { value, collection } = await collect("100 Research Dr, Worcester, MA", massachusetts, { measureSlope: lidar });
    const readings = collection.observations.filter((observation) => observation.field === "site_slope_pct" && observation.kind === "reading");
    expect(readings.map((observation) => observation.source.id)).toEqual(["earth-engine-3dep", "massgis-lidar-dem"]);
    expect(value("site_slope_pct")).toMatchObject({ state: "inferred", current: { type: "quantity", value: 6.96, unit: "percent" } });
  });

  it("keeps the MassGIS base map and asks Earth Engine for no imagery in Massachusetts", async () => {
    const asked: string[] = [];
    const watching: EarthEngineRunner = (request) => {
      asked.push(request.kind);
      return earth(request);
    };
    const { collection } = await collect("100 Research Dr, Worcester, MA", massachusetts, { earthEngine: watching });
    expect(asked.sort()).toEqual(["land_cover", "terrain"]);
    expect(collection.baseMap?.sourceId).toBe("massgis-imagery-2025");
  });

  it("shows imagery and slope for a Fremont address, where no local source has them", async () => {
    const { value } = await collect("47200 Bayside Pkwy, Fremont, CA", californiaPge);
    expect(value("aerial_image")).toMatchObject({ state: "inferred", current: { type: "text", value: expect.stringMatching(/^USDA NAIP image of \d{4}-\d{2}-\d{2}/) } });
    expect(value("site_slope_pct").state).toBe("inferred");
    expect(value("land_cover").state).toBe("inferred");
  });

  it("checks the USGS point against the 3DEP range across the site", async () => {
    const { value } = await collect("100 Research Dr, Worcester, MA", massachusetts);
    expect(value("ground_elevation_ft").crossChecks![0]).toMatchObject({ result: "agrees", detail: expect.stringContaining("The point reads 545.4 ft") });
    // The 1 m point stays current over the 10 m site mean.
    expect(value("ground_elevation_ft").current).toEqual({ type: "quantity", value: 545.4, unit: "ft" });
  });

  it("stores missing with the reason when credentials aren't set, and the Massachusetts path still completes", async () => {
    const missing = await liveEarthEngine({});
    expect(missing).toEqual({ missing: "Earth Engine isn't set up here: EARTHENGINE_SERVICE_ACCOUNT_FILE and EARTHENGINE_PROJECT aren't both set." });
    const { value, collection } = await collect("100 Research Dr, Worcester, MA", massachusetts, { earthEngine: missing as { missing: string } });
    expect(value("land_cover")).toMatchObject({ state: "missing", reason: expect.stringContaining("Earth Engine isn't set up here") });
    expect(collection.sourceRuns.find((run) => run.sourceId === "earth-engine-worldcover")).toMatchObject({ status: "missing" });
    expect(value("parcel_id").state).toBe("inferred");
  });
});
