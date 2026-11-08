import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Observation, Source, SourceRun } from "@eqore/contract";
import { observe, sha256, type CollectContext, type PolygonGeometry } from "./arcgis.ts";
import { convertUnit } from "./units.ts";

// What the adapter asks Earth Engine for. Each answer is plain JSON, so it records and replays like any other source.
export type EarthEngineRequest = { kind: "land_cover" | "terrain" | "imagery"; geometry: PolygonGeometry };
export type EarthEngineRunner = (request: EarthEngineRequest) => Promise<unknown>;

export type EarthEngineConfig = {
  landCover: boolean;
  // Where a better local slope exists, Earth Engine's is a second observation.
  terrain: boolean;
  // Only where no local imagery is configured.
  imagery: boolean;
};

export const WORLDCOVER = { id: "ESA/WorldCover/v200", year: "2021", meters: 10 };
export const DEM_3DEP = { id: "USGS/3DEP/10m", meters: 10 };
export const NAIP = { id: "USDA/NAIP/DOQQ" };

const LICENSE = "Google Earth Engine, used under its noncommercial terms for this build.";
const source = (id: string, name: string, dataset: string, license: string): Source => ({
  id,
  name,
  kind: "earth_engine",
  dataOrigin: "real",
  url: `https://developers.google.com/earth-engine/datasets/catalog/${dataset.replace(/\//g, "_")}`,
  licenseNote: `${license} ${LICENSE}`,
});

export const LAND_COVER_SOURCE = source("earth-engine-worldcover", "ESA WorldCover 10 m, through Earth Engine", WORLDCOVER.id, "ESA WorldCover 2021, CC BY 4.0.");
export const TERRAIN_SOURCE = source("earth-engine-3dep", "USGS 3DEP 10 m elevation, through Earth Engine", DEM_3DEP.id, "USGS, public domain.");
export const IMAGERY_SOURCE = source("earth-engine-naip", "USDA NAIP imagery, through Earth Engine", NAIP.id, "USDA NAIP, public domain.");

// ESA WorldCover class codes.
const CLASSES: Record<string, string> = {
  "10": "tree cover",
  "20": "shrubland",
  "30": "grassland",
  "40": "cropland",
  "50": "built-up",
  "60": "bare or sparse vegetation",
  "70": "snow and ice",
  "80": "open water",
  "90": "herbaceous wetland",
  "95": "mangroves",
  "100": "moss and lichen",
};

export type LandCover = { classes: { name: string; percent: number }[]; source: Source; sourceDate: string; retrievedAt: string; query: string };

const queryOf = (request: EarthEngineRequest, dataset: string) => `${dataset} ${request.kind} over polygon ${sha256(JSON.stringify(request.geometry)).slice(0, 16)}`;

// Land cover inside any polygon, by share of its area. The eligibility screen calls this for candidate areas.
export async function landCoverIn(geometry: PolygonGeometry, run: EarthEngineRunner, now: () => string): Promise<LandCover | { failure: string }> {
  const request: EarthEngineRequest = { kind: "land_cover", geometry };
  let answer: unknown;
  try {
    answer = await run(request);
  } catch (error) {
    return { failure: `Earth Engine didn't answer: ${(error as Error).message}` };
  }
  const histogram = (answer as { Map?: Record<string, number> } | null)?.Map;
  const total = histogram ? Object.values(histogram).reduce((sum, count) => sum + count, 0) : 0;
  if (!histogram || total === 0) return { failure: "WorldCover has no pixels in this area." };
  const classes = Object.entries(histogram)
    .map(([code, count]) => ({ name: CLASSES[code] ?? `class ${code}`, percent: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  return { classes, source: LAND_COVER_SOURCE, sourceDate: WORLDCOVER.year, retrievedAt: now(), query: queryOf(request, WORLDCOVER.id) };
}

export function describeLandCover(cover: LandCover): string {
  const shown = cover.classes.filter((entry) => entry.percent >= 2);
  const rest = Math.round((100 - shown.reduce((sum, entry) => sum + entry.percent, 0)) * 10) / 10;
  return [...shown.map((entry) => `${entry.name} ${entry.percent}%`), ...(rest >= 0.5 ? [`other ${rest}%`] : [])].join(", ");
}

type Terrain = { elevation_mean?: number; elevation_min?: number; elevation_max?: number; slope_mean?: number };

export type EarthEngineCollection = { observations: Observation[]; runs: SourceRun[] };

const FIELDS_BY_SOURCE: [Source, string[]][] = [
  [LAND_COVER_SOURCE, ["land_cover"]],
  [TERRAIN_SOURCE, ["site_slope_pct", "ground_elevation_ft"]],
  [IMAGERY_SOURCE, ["aerial_image"]],
];

export function earthEngineMissing(config: EarthEngineConfig, reason: string, ctx: CollectContext): EarthEngineCollection {
  const wanted = FIELDS_BY_SOURCE.filter(([entry]) => (entry === LAND_COVER_SOURCE ? config.landCover : entry === TERRAIN_SOURCE ? config.terrain : config.imagery));
  return {
    observations: wanted.flatMap(([entry, fields]) => fields.map((field) => observe({ source: entry, query: `${entry.id} not asked`, retrievedAt: ctx.now() }, ctx, { field, kind: "no_value", value: null, reason }))),
    runs: wanted.map(([entry]) => ({ sourceId: entry.id, name: entry.name, status: "missing", reason })),
  };
}

// The raster facts no vector layer holds. Where a local source is better, its value is read after this one, so it stays current.
export async function collectEarthEngine(config: EarthEngineConfig, area: PolygonGeometry, run: EarthEngineRunner, ctx: CollectContext): Promise<EarthEngineCollection> {
  const observations: Observation[] = [];
  const runs: SourceRun[] = [];
  const failed = (entry: Source, query: string, fields: string[], reason: string) => {
    runs.push({ sourceId: entry.id, name: entry.name, status: "missing", reason });
    for (const field of fields) observations.push(observe({ source: entry, query, retrievedAt: ctx.now() }, ctx, { field, kind: "no_value", value: null, reason }));
  };

  const tasks: Promise<void>[] = [];
  if (config.landCover) {
    tasks.push(
      landCoverIn(area, run, ctx.now).then((cover) => {
        if ("failure" in cover) return failed(LAND_COVER_SOURCE, queryOf({ kind: "land_cover", geometry: area }, WORLDCOVER.id), ["land_cover"], cover.failure);
        runs.push({ sourceId: LAND_COVER_SOURCE.id, name: LAND_COVER_SOURCE.name, status: "done" });
        observations.push(
          observe({ source: cover.source, query: cover.query, retrievedAt: cover.retrievedAt }, ctx, {
            field: "land_cover",
            kind: "reading",
            value: { type: "text", value: describeLandCover(cover) },
            attribute: "share of the site's area by WorldCover class",
            method: "computed",
            sourceDate: cover.sourceDate,
            grade: "reference",
            reason: "A 10 m grid from 2021 sorts the whole site into broad classes. It can't show the surface at a pad.",
          }),
        );
      }),
    );
  }
  if (config.terrain) {
    const request: EarthEngineRequest = { kind: "terrain", geometry: area };
    const query = queryOf(request, DEM_3DEP.id);
    tasks.push(
      run(request).then(
        (answer) => {
          const terrain = (answer ?? {}) as Terrain;
          if (typeof terrain.slope_mean !== "number" || typeof terrain.elevation_mean !== "number") return failed(TERRAIN_SOURCE, query, ["site_slope_pct", "ground_elevation_ft"], "3DEP has no elevation in this area.");
          runs.push({ sourceId: TERRAIN_SOURCE.id, name: TERRAIN_SOURCE.name, status: "done" });
          const origin = { source: TERRAIN_SOURCE, query, retrievedAt: ctx.now() };
          const feet = (meters: number) => Math.round(convertUnit(meters, "m", "ft") * 10) / 10;
          const shared = { kind: "reading" as const, method: "computed" as const, grade: "reference" as const };
          observations.push(
            observe(origin, ctx, {
              ...shared,
              field: "site_slope_pct",
              value: { type: "quantity", value: Math.round(Math.tan((terrain.slope_mean * Math.PI) / 180) * 10000) / 100, unit: "percent" },
              attribute: "mean slope across the site",
              reason: "The mean slope across the site from a 10 m elevation grid, not at a chosen pad.",
            }),
            observe(origin, ctx, {
              ...shared,
              field: "ground_elevation_ft",
              value: { type: "quantity", value: feet(terrain.elevation_mean), unit: "ft" },
              attribute: "mean elevation across the site",
              reason: "The mean across the site from a 10 m grid. A point service reads one spot.",
            }),
          );
          for (const [field, meters] of [["site_elevation_min_ft", terrain.elevation_min], ["site_elevation_max_ft", terrain.elevation_max]] as const) {
            if (typeof meters === "number") observations.push(observe(origin, ctx, { ...shared, field, value: { type: "quantity", value: feet(meters), unit: "ft" }, attribute: field }));
          }
        },
        (error: Error) => failed(TERRAIN_SOURCE, query, ["site_slope_pct", "ground_elevation_ft"], `Earth Engine didn't answer: ${error.message}`),
      ),
    );
  }
  if (config.imagery) {
    const request: EarthEngineRequest = { kind: "imagery", geometry: area };
    const query = queryOf(request, NAIP.id);
    tasks.push(
      run(request).then(
        (answer) => {
          const image = answer as { date?: string; meters?: number } | null;
          if (!image?.date) return failed(IMAGERY_SOURCE, query, ["aerial_image"], "NAIP has no image over this site.");
          runs.push({ sourceId: IMAGERY_SOURCE.id, name: IMAGERY_SOURCE.name, status: "done" });
          observations.push(
            observe({ source: IMAGERY_SOURCE, query, retrievedAt: ctx.now() }, ctx, {
              field: "aerial_image",
              kind: "reading",
              value: { type: "text", value: `USDA NAIP image of ${image.date}${image.meters ? `, about ${Math.round(image.meters * 10) / 10} m per pixel` : ""}` },
              attribute: "latest NAIP image over the site",
              sourceDate: image.date,
              grade: "reference",
            }),
          );
        },
        (error: Error) => failed(IMAGERY_SOURCE, query, ["aerial_image"], `Earth Engine didn't answer: ${error.message}`),
      ),
    );
  }
  await Promise.all(tasks);
  // Fixed order, whatever order the answers came in.
  const order = (observation: Observation) => FIELDS_BY_SOURCE.findIndex(([entry]) => entry.id === observation.source.id);
  observations.sort((a, b) => order(a) - order(b));
  runs.sort((a, b) => FIELDS_BY_SOURCE.findIndex(([entry]) => entry.id === a.sourceId) - FIELDS_BY_SOURCE.findIndex(([entry]) => entry.id === b.sourceId));
  return { observations, runs };
}

const keyOf = (request: EarthEngineRequest) => sha256(JSON.stringify(request)).slice(0, 16);

// Replays recorded answers. A request with no recording fails, as a fetch with no fixture does.
export function recordedEarthEngine(directory: string): EarthEngineRunner {
  const recorded = new Map<string, unknown>();
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".json")) continue;
    const entry = JSON.parse(readFileSync(join(directory, name), "utf8")) as { request: EarthEngineRequest; response: unknown };
    recorded.set(keyOf(entry.request), entry.response);
  }
  return async (request) => {
    const key = keyOf(request);
    if (!recorded.has(key)) throw new Error(`No recorded Earth Engine answer for ${request.kind}`);
    return recorded.get(key);
  };
}

// Saves each answer, never the credential, so tests can replay it.
export function recordingEarthEngine(directory: string, slug: string, live: EarthEngineRunner, now: () => string): EarthEngineRunner {
  mkdirSync(directory, { recursive: true });
  return async (request) => {
    const response = await live(request);
    writeFileSync(join(directory, `${slug}-${request.kind}-${keyOf(request)}.json`), `${JSON.stringify({ request, retrievedAt: now(), response }, null, 1)}\n`);
    return response;
  };
}

// Signs in with the service account named in the environment. The key file is read here and passed
// straight to the client: it's never logged, stored, or put in an error.
export async function liveEarthEngine(env: Record<string, string | undefined> = process.env): Promise<EarthEngineRunner | { missing: string }> {
  const file = env.EARTHENGINE_SERVICE_ACCOUNT_FILE;
  const project = env.EARTHENGINE_PROJECT;
  if (!file || !project) return { missing: "Earth Engine isn't set up here: EARTHENGINE_SERVICE_ACCOUNT_FILE and EARTHENGINE_PROJECT aren't both set." };
  let key: unknown;
  try {
    key = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { missing: "The Earth Engine service account file named in EARTHENGINE_SERVICE_ACCOUNT_FILE couldn't be read." };
  }
  // Named through a variable because the client ships without types.
  const client = "@google/earthengine";
  const { default: ee } = (await import(client)) as { default: EarthEngineClient };
  try {
    await new Promise<void>((resolve, reject) => ee.data.authenticateViaPrivateKey(key, () => resolve(), (error: unknown) => reject(new Error(String(error)))));
    await new Promise<void>((resolve, reject) => ee.initialize(null, null, () => resolve(), (error: unknown) => reject(new Error(String(error))), null, project));
  } catch (error) {
    return { missing: `Earth Engine sign-in failed: ${(error as Error).message.slice(0, 200)}` };
  }
  return (request) => evaluate(ee, request);
}

// The Earth Engine client is untyped JavaScript.
type EarthEngineClient = any;

function evaluate(ee: EarthEngineClient, request: EarthEngineRequest): Promise<unknown> {
  const region = ee.Geometry(request.geometry);
  let computed;
  if (request.kind === "land_cover") {
    computed = ee.ImageCollection(WORLDCOVER.id).first().select("Map").reduceRegion({ reducer: ee.Reducer.frequencyHistogram(), geometry: region, scale: WORLDCOVER.meters, maxPixels: 1e8 });
  } else if (request.kind === "terrain") {
    const dem = ee.Image(DEM_3DEP.id).select("elevation");
    const slope = ee.Terrain.slope(dem).rename("slope");
    computed = dem
      .addBands(slope)
      .reduceRegion({ reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true }), geometry: region, scale: DEM_3DEP.meters, maxPixels: 1e8 });
  } else {
    const latest = ee.ImageCollection(NAIP.id).filterBounds(region).sort("system:time_start", false).first();
    computed = ee.Algorithms.If(
      latest,
      ee.Dictionary({ date: ee.Date(ee.Image(latest).get("system:time_start")).format("YYYY-MM-dd"), meters: ee.Image(latest).select(0).projection().nominalScale() }),
      null,
    );
  }
  return new Promise((resolve, reject) => ee.Dictionary(computed).evaluate((result: unknown, error?: string) => (error ? reject(new Error(error)) : resolve(result))));
}
