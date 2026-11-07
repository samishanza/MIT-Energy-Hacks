import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Value } from "@eqore/contract";
import { REGIONS, massachusetts, californiaPge, type CollectContext, type FetchLike, type RegionConfig } from "../index.ts";
import { collectSite, siteIdFor } from "../collect.ts";
import { deriveValues } from "../derive.ts";
import { fixtureFetch } from "../fixtures.ts";
import { selectRegion } from "../registry.ts";
import { canonicalAddress, parseAddress, resolveSite } from "../resolve-site.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));
const context = (fetch: FetchLike = recorded, extra: Partial<CollectContext> = {}): CollectContext => ({ siteId: "test-site", fetch, now: () => "2026-11-07T20:00:00.000Z", retryDelayMs: 0, ...extra });

async function collect(address: string, fetch: FetchLike = recorded, extra: Partial<CollectContext> = {}, region: RegionConfig = massachusetts) {
  const ctx = context(fetch, extra);
  const resolved = await resolveSite(address, region, ctx);
  if (resolved.status !== "resolved") throw new Error(`Expected one match for ${address}`);
  const progress: { features: string[]; running: number }[] = [];
  const collection = await collectSite(address, region, resolved.anchor, ctx, (update) =>
    progress.push({ features: update.features.map((feature) => feature.kind), running: update.sourceRuns.filter((run) => run.status === "pending").length }),
  );
  const values = deriveValues(collection.observations);
  return { collection, progress, value: (field: string): Value => values.find((entry) => entry.field === field)! };
}

const stubRegion = (id: string, states: string[], cities?: string[]): RegionConfig => ({ id, name: id, states, cities, grid: [], unavailable: [], personRoutes: [] });

describe("the general registry", () => {
  it("selects a region added only in config by city, with the most specific winning", () => {
    const santaClara = stubRegion("santa-clara", ["CA"], ["San Jose", "Sunnyvale"]);
    const regions = [...REGIONS, santaClara];
    expect(selectRegion("100 First St, San Jose, CA", regions)?.id).toBe("santa-clara");
    expect(selectRegion("47200 Bayside Pkwy, Fremont, CA", regions)?.id).toBe("california-pge");
    expect(selectRegion("100 Research Dr, Worcester, MA", regions)?.id).toBe("massachusetts");
    expect(selectRegion("1 Main St, Austin, TX", regions)).toBeNull();
  });

  it("collects a layer added only in config", async () => {
    const withLayer: RegionConfig = {
      ...stubRegion("test", ["ZZ"]),
      layers: [{
        mode: { kind: "one", pick: "first" },
        entry: { kind: "arcgis_rest", id: "test-layer", name: "SYNTHETIC TEST layer", serviceUrl: "https://example.invalid/FeatureServer", layer: 0, searchRadiusMeters: 0, licenseNote: "Test", robotsChecked: "2026-11-07", objectIdAttribute: "ID", outFields: ["ID", "T"], fields: [{ field: "municipality", attribute: "T", type: "text", grade: "reference" }] },
      }],
    };
    const fetch: FetchLike = async () => new Response(JSON.stringify({ features: [{ attributes: { ID: 1, T: "Testville" } }] }));
    const ctx = context(fetch);
    const collection = await collectSite("1 Test Way, Town, ZZ", withLayer, { kind: "point", longitude: -71, latitude: 42, method: "hand_placed" }, ctx);
    expect(deriveValues(collection.observations).find((value) => value.field === "municipality")!.current).toEqual({ type: "text", value: "Testville" });
    expect(collection.sourceRuns.map((run) => run.sourceId)).toEqual(["test-layer"]);
  });
});

describe("address spellings", () => {
  it("reaches one site from all four spellings", async () => {
    const spellings = ["100 Research Dr, Worcester, MA", "100 Research Dr, Worcester MA", "100 Research Dr Worcester MA 01605", "100 Research Drive, Worcester, Massachusetts"];
    const ids = await Promise.all(spellings.map(async (spelling) => siteIdFor((await canonicalAddress(spelling, context()))!)));
    expect(new Set(ids)).toEqual(new Set(["100-research-dr-worcester-ma"]));
  });

  it("accepts a state name, a code, and a ZIP, and doesn't take a street name for a state", () => {
    expect(parseAddress("1 Main St, New York, New York 10001")).toEqual({ street: "1 MAIN ST", city: "NEW YORK", state: "NY" });
    expect(parseAddress("1 Main St, Boston, ma")).toEqual({ street: "1 MAIN ST", city: "BOSTON", state: "MA" });
    expect(parseAddress("12 Court St, Worcester")).toEqual({ street: "12 COURT ST", city: "WORCESTER" });
    expect(parseAddress("no comma at all")).toBeNull();
  });

  it("gives no address when the geocoder can't settle on one", async () => {
    const none: FetchLike = async () => new Response(JSON.stringify({ result: { addressMatches: [] } }));
    expect(await canonicalAddress("nowhere in particular", context(none))).toBeNull();
  });
});

describe("running sources in parallel, with a deadline", () => {
  it("stores a source that never answers as missing at the deadline, and still finishes", async () => {
    const hang: FetchLike = (url, init) => (url.includes("DEP_Wetlands") ? new Promise(() => {}) : recorded(url, init));
    const { value, collection } = await collect("100 Research Dr, Worcester, MA", hang, { runDeadlineMs: 50 });
    expect(value("wetlands_nearby").state).toBe("missing");
    expect(value("wetlands_nearby").reason).toContain("deadline");
    expect(collection.sourceRuns.find((run) => run.sourceId === "massdep-wetlands")).toMatchObject({ status: "missing" });
    expect(value("municipality").state).toBe("inferred");
  });

  it("reports the parcel before the other sources land, with the rest pending", async () => {
    const { progress } = await collect("100 Research Dr, Worcester, MA");
    expect(progress[0]!.features).toEqual(["property_line"]);
    expect(progress[0]!.running).toBeGreaterThan(5);
    expect(progress.at(-1)!.running).toBe(0);
  });
});

describe("the wider physical record", () => {
  it("fills Worcester's new values from recorded data, each with its source", async () => {
    const { value, collection } = await collect("100 Research Dr, Worcester, MA");
    expect(value("zoning_district").current).toEqual({ type: "text", value: "ML-.5" });
    expect(value("building_stories").current).toEqual({ type: "quantity", value: 4, unit: "stories" });
    expect(value("municipality").current).toEqual({ type: "text", value: "WORCESTER" });
    expect(value("county").current).toEqual({ type: "text", value: "WORCESTER" });
    expect(value("ground_elevation_ft").current).toEqual({ type: "quantity", value: 545.4, unit: "ft" });
    const zoning = collection.observations.find((observation) => observation.field === "zoning_district")!;
    expect(zoning).toMatchObject({ sourceDate: "FY2026", source: { id: "massgis-l3-parcels" }, locator: { attribute: "ZONING" } });
  });

  it("finds the fronting road by the street in the address, and stores its blank width as missing", async () => {
    const { value } = await collect("100 Research Dr, Worcester, MA");
    expect(value("road_name").current).toEqual({ type: "text", value: "RESEARCH DRIVE" });
    expect(value("road_width_ft").state).toBe("missing");
    expect(value("road_width_ft").reason).toContain("SURFACE_WD is blank");
  });

  it("stores a coded blank as missing, not as a surface type of 0", async () => {
    const { value } = await collect("11 Bartzak Dr, Holliston, MA");
    expect(value("road_surface_type").state).toBe("missing");
    expect(value("road_width_ft").reason).toContain("SURFACE_WD is 0");
  });

  it("stores nearby items as one summary reading plus a feature for each, not as a conflict", async () => {
    const { value, collection } = await collect("100 Research Dr, Worcester, MA");
    expect(value("wetlands_nearby").state).toBe("inferred");
    expect(value("wetlands_nearby").flags.join(" ")).toContain("not a delineation");
    const wetlands = collection.features.filter((feature) => feature.field === "wetlands_nearby");
    expect(wetlands).toHaveLength(5);
    expect(wetlands[0]).toMatchObject({ kind: "constraint", attributes: { distance_ft: { unit: "ft" } } });
    expect(value("fire_stations_nearby").state).toBe("inferred");
    expect(collection.features.filter((feature) => feature.field === "fire_stations_nearby")).toHaveLength(3);
  });

  it("stores no wetlands as none mapped within the distance, and not as missing", async () => {
    const empty: FetchLike = async (url, init) => (url.includes("DEP_Wetlands") ? new Response(JSON.stringify({ features: [] })) : recorded(url, init));
    const { value } = await collect("100 Research Dr, Worcester, MA", empty);
    expect(value("wetlands_nearby")).toMatchObject({ state: "inferred", current: { type: "text", value: "None mapped within 500 m" } });
    expect(value("wetlands_nearby").flags.join(" ")).toContain("not that none exist");
  });

  it("says an empty flood layer doesn't show the site is out of a flood zone", async () => {
    const { value } = await collect("100 Research Dr, Worcester, MA");
    expect(value("flood_zone").state).toBe("missing");
    expect(value("flood_zone").reason).toContain("doesn't show the site is out of a flood zone");
  });

  it("estimates height as stories times a stated assumption, and never from blank stories", async () => {
    const { value } = await collect("100 Research Dr, Worcester, MA");
    expect(value("building_height_ft")).toMatchObject({ state: "inferred", method: "assumed", current: { type: "quantity", value: 56, unit: "ft" } });
    expect(value("building_height_ft").flags.join(" ")).toContain("An estimate, not a measurement");
    const blank = await collect("11 Bartzak Dr, Holliston, MA");
    expect(blank.value("building_height_ft").state).toBe("missing");
    expect(blank.value("building_height_ft").current).toBeNull();
  });

  it("takes slope from the measure the caller passes, and leaves it missing with the reason if it fails", async () => {
    const measured = await collect("100 Research Dr, Worcester, MA", recorded, { measureSlope: async () => ({ slopePercent: 6.957, sampleCount: 35, demResolutionFt: 4.9 }) });
    expect(measured.value("site_slope_pct")).toMatchObject({ state: "inferred", method: "computed", current: { type: "quantity", value: 6.96, unit: "percent" } });
    expect(measured.value("site_slope_pct").flags.join(" ")).toContain("not at a chosen pad");

    const failed = await collect("100 Research Dr, Worcester, MA", recorded, { measureSlope: async () => { throw new Error("502"); } });
    expect(failed.value("site_slope_pct").state).toBe("missing");
    expect(failed.value("site_slope_pct").reason).toContain("502");
    expect(failed.collection.sourceRuns.find((run) => run.sourceId === "massgis-lidar-dem")).toMatchObject({ status: "missing" });
  });

  it("reads elevation at a Fremont point, with no parcel needed", async () => {
    const { value } = await collect("47200 Bayside Pkwy, Fremont, CA", recorded, {}, californiaPge);
    expect(value("ground_elevation_ft").state).toBe("inferred");
    expect(value("municipality").state).toBe("missing");
  });
});

describe("what never gets stored", () => {
  it("keeps owner fields out of every recording and every requested field list", () => {
    for (const folder of ["arcgis", "geocoder"]) {
      for (const name of readdirSync(dir(folder))) expect(readFileSync(join(dir(folder), name), "utf8"), name).not.toMatch(/OWNER1|OWN_ADDR|OWN_CITY/);
    }
    expect(massachusetts.parcels!.entry.outFields.filter((field) => field.startsWith("OWN"))).toEqual([]);
  });
});
