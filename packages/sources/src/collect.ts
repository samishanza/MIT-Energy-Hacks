import type { BaseMap, MapFeature, Observation, Site, SourceRun } from "@eqore/contract";
import { observe, queryArcgis, type CollectContext, type FetchLike, type PolygonGeometry } from "./arcgis.ts";
import { queryTerritories, servingUtility } from "./checks/energy.ts";
import { area } from "@turf/turf";
import { collectGrid } from "./checks/grid.ts";
import { collectLidarEquipment } from "./checks/lidar-collect.ts";
import { collectParkingStalls } from "./checks/parking.ts";
import { collectPavedSurfaces } from "./checks/paved.ts";
import { inferServicePath } from "./checks/service-path.ts";
import { padCandidates, type CandidateResult } from "./checks/candidates.ts";
import { measureSite, type Measurements } from "./checks/measure.ts";
import { anchorPhysical, collectOutlines } from "./checks/physical.ts";
import { boxOf, verticesOf } from "./geometry.ts";
import { collectEarthEngine, earthEngineMissing, IMAGERY_SOURCE, LAND_COVER_SOURCE, TERRAIN_SOURCE } from "./earthengine.ts";
import { appliesTo, collectJson } from "./json-api.ts";
import { collectLayer } from "./layers.ts";
import { sourceOf, type NamedRoute, type RegionConfig } from "./registry.ts";
import { parseAddress, type SiteAnchor } from "./resolve-site.ts";

export type SiteCollection = {
  site: Site;
  observations: Observation[];
  features: MapFeature[];
  baseMap: BaseMap | null;
  sourceRuns: SourceRun[];
};

export type CollectProgress = { site: Site; sourceRuns: SourceRun[]; features: MapFeature[] };

// Cold MassGIS queries took up to 55 seconds. The parcel is resolved before this clock starts.
export const RUN_DEADLINE_MS = 90_000;

class RunDeadlineError extends Error {
  override name = "RunDeadlineError";
}

// Finding the site before the run starts, so a cold parcel service can't hold a run for minutes.
export const RESOLVE_DEADLINE_MS = 100_000;

// Past the deadline every unanswered request fails, and each source reports that through its usual path.
export function withRunDeadline(fetchImpl: FetchLike, milliseconds: number, what = "run") {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new RunDeadlineError(`No answer before the ${what}'s ${Math.round(milliseconds / 1000)}-second deadline`);
      controller.abort(error);
      reject(error);
    }, milliseconds);
    timer.unref?.();
  });
  deadline.catch(() => {});
  const limited: FetchLike = (url, init) => {
    const signal = init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    return Promise.race([fetchImpl(url, { ...init, signal }), deadline]);
  };
  return {
    limited,
    cancel: () => {
      clearTimeout(timer);
      controller.abort(new Error("The run ended"));
    },
  };
}

// Spellings of one address name one site: 100 Research Drive, Worcester, MA 01605 and 100 Research Dr, Worcester, MA.
export function siteIdFor(address: string): string {
  const parsed = parseAddress(address);
  return (parsed ? `${parsed.street} ${parsed.city} ${parsed.state ?? ""}` : address)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function routeObservations(route: NamedRoute, kind: "earth_engine" | "human_evidence", ctx: CollectContext): Observation[] {
  const origin = {
    source: { id: route.sourceId, name: route.name, kind, dataOrigin: "real" as const },
    query: `route ${route.sourceId}`,
    retrievedAt: ctx.now(),
  };
  return route.fields.map((field) => observe(origin, ctx, { field, kind: "no_value", value: null, reason: route.reason }));
}

// A small square around a point, for a site with no parcel polygon.
function squareAround([longitude, latitude]: [number, number], meters: number): PolygonGeometry {
  const dLat = meters / 111_320;
  const dLon = meters / (111_320 * Math.cos((latitude * Math.PI) / 180));
  const ring: [number, number][] = [
    [longitude - dLon, latitude - dLat],
    [longitude + dLon, latitude - dLat],
    [longitude + dLon, latitude + dLat],
    [longitude - dLon, latitude + dLat],
    [longitude - dLon, latitude - dLat],
  ];
  return { type: "Polygon", coordinates: [ring] };
}

async function collectRaster(region: RegionConfig, area: PolygonGeometry, ctx: CollectContext) {
  if (!region.earthEngine) return null;
  if (!ctx.earthEngine || "missing" in ctx.earthEngine) return earthEngineMissing(region.earthEngine, ctx.earthEngine?.missing ?? "Earth Engine isn't connected for this run.", ctx);
  return collectEarthEngine(region.earthEngine, area, ctx.earthEngine, ctx);
}

// Measured by the agent layer's sampler, which the caller passes in, because it can't be imported from here.
async function collectSlope(region: RegionConfig, parcel: PolygonGeometry | null, ctx: CollectContext) {
  const config = region.lidarSlope;
  if (!config || !ctx.measureSlope || !parcel) return null;
  const box = boxOf(verticesOf(parcel));
  const origin = { source: config.source, query: `samples ${box.minX},${box.minY},${box.maxX},${box.maxY}`, retrievedAt: ctx.now() };
  const source = { sourceId: config.source.id, name: config.source.name };
  let reason = "The lidar elevation service returned too few samples across this parcel.";
  try {
    const slope = await ctx.measureSlope({ west: box.minX, south: box.minY, east: box.maxX, north: box.maxY }, ctx.fetch);
    if (slope) {
      return {
        run: { ...source, status: "done" as const },
        observations: [
          observe(origin, ctx, {
            field: "site_slope_pct",
            kind: "reading",
            value: { type: "quantity", value: Math.round(slope.slopePercent * 100) / 100, unit: "percent" },
            attribute: "steepest slope fitted to elevation samples across the parcel",
            method: "computed",
            sourceDate: config.sourceDate,
            grade: "reference",
            reason:
              `From ${slope.sampleCount} samples across the parcel at about ${Math.round(slope.demResolutionFt)} ft resolution, not at a chosen pad.` +
              (slope.aspectDegrees === undefined ? "" : ` The ground falls toward ${Math.round(slope.aspectDegrees)} degrees from north.`),
          }),
        ],
      };
    }
  } catch (error) {
    reason = `The lidar elevation service could not be reached: ${(error as Error).message}`;
  }
  return { run: { ...source, status: "missing" as const, reason }, observations: [observe(origin, ctx, { field: "site_slope_pct", kind: "no_value", value: null, reason })] };
}

// Runs every source configured for the region at once. A failed or late source reports its reason, and the rest still run.
export async function collectSite(address: string, region: RegionConfig, anchor: SiteAnchor, baseCtx: CollectContext, onProgress?: (progress: CollectProgress) => void): Promise<SiteCollection> {
  const { limited, cancel } = withRunDeadline(baseCtx.fetch, baseCtx.runDeadlineMs ?? RUN_DEADLINE_MS);
  try {
    return await collectWithin(address, region, anchor, { ...baseCtx, fetch: limited }, onProgress);
  } finally {
    cancel();
  }
}

async function collectWithin(address: string, region: RegionConfig, anchor: SiteAnchor, ctx: CollectContext, onProgress?: (progress: CollectProgress) => void): Promise<SiteCollection> {

  const physical = anchorPhysical(region, anchor, ctx);
  const site: Site = { id: ctx.siteId, address, region: region.id, location: physical.location, locationMethod: physical.locationMethod };

  // Results land in any order, so runs are listed up front and final observations are assembled in a fixed order.
  const runs = new Map<string, SourceRun>(physical.runs.map((run) => [run.sourceId, run]));
  const pending = (sourceId: string, name: string) => {
    if (!runs.has(sourceId)) runs.set(sourceId, { sourceId, name, status: "pending" });
  };
  const parcel = physical.measurable;
  if (region.buildings && physical.parcelGeometry) pending(region.buildings.entry.id, region.buildings.entry.name);
  for (const source of region.grid) {
    pending(source.entry.id, source.entry.name);
    if (source.lineGeometry) pending(source.lineGeometry.id, source.lineGeometry.name);
    for (const detail of source.details ?? []) for (const entry of detail.kind === "construction" ? detail.entries : [detail.entry]) pending(entry.id, entry.name);
    for (const entry of source.segments?.entries ?? []) pending(entry.id, entry.name);
  }
  if (region.roads && parcel) pending(region.roads.entry.id, region.roads.entry.name);
  for (const layer of region.layers ?? []) pending(layer.entry.id, layer.entry.name);
  const jsonSources = (region.jsonSources ?? []).filter((source) => appliesTo(source, address));
  for (const json of jsonSources) pending(json.id, json.name);
  if (region.territories) pending(region.territories.entry.id, region.territories.entry.name);
  if (region.lidarPoints && ctx.readLidar && region.buildings && physical.parcelGeometry) pending(region.lidarPoints.source.id, region.lidarPoints.source.name);
  if (region.pavedSurfaces && physical.parcelGeometry) pending(region.pavedSurfaces.entry.id, region.pavedSurfaces.entry.name);
  if (region.pavedSurfaces && region.imagery && ctx.decodeImage && physical.parcelGeometry) pending(`${region.imagery.id}-stalls`, `${region.imagery.name}, stall stripes`);
  if (region.earthEngine) {
    const { landCover, terrain, imagery } = region.earthEngine;
    for (const [wanted, entry] of [[landCover, LAND_COVER_SOURCE], [terrain, TERRAIN_SOURCE], [imagery, IMAGERY_SOURCE]] as const) if (wanted) pending(entry.id, entry.name);
  }
  if (region.lidarSlope && ctx.measureSlope && physical.parcelGeometry) pending(region.lidarSlope.source.id, region.lidarSlope.source.name);

  const liveFeatures: MapFeature[] = [...physical.features];
  const report = () => onProgress?.({ site, sourceRuns: [...runs.values()], features: [...liveFeatures] });
  const landed = <Part extends { runs?: SourceRun[]; run?: SourceRun; features?: MapFeature[] }>(part: Part): Part => {
    for (const run of part.runs ?? (part.run ? [part.run] : [])) runs.set(run.sourceId, run);
    liveFeatures.push(...(part.features ?? []));
    report();
    return part;
  };
  report();

  const layerAnchor = { parcel: physical.parcelGeometry, location: physical.location };
  const request = { location: physical.location, address };

  const outlinesRead = region.buildings && physical.parcelGeometry ? collectOutlines(region.buildings, physical.parcelGeometry, parcel?.yearBuilt ?? null, ctx).then(landed) : Promise.resolve(null);
  const roadsRead =
    region.roads && parcel
      ? queryArcgis(region.roads.entry, { kind: "polygon", geometry: parcel.parcel.geometry, bufferMeters: region.roads.entry.searchRadiusMeters }, ctx).then((result) => {
          landed({ run: result.run });
          return result;
        })
      : Promise.resolve(null);
  // Lidar needs the buildings and roads first, then runs alongside the rest.
  const lidarRead = Promise.all([outlinesRead, roadsRead]).then(([found, roadResult]) =>
    region.lidarPoints && ctx.readLidar && found && region.roads
      ? collectLidarEquipment(region.lidarPoints, ctx.readLidar, found.measurable.features.map((feature) => feature.geometry), roadResult?.features ?? [], region.roads.nameAttribute, address, ctx).then((part) => (part ? landed(part) : null))
      : null,
  );

  // Paved parking and drives need the buildings and roads too, to take them out of the impervious cover.
  const pavedRead = Promise.all([outlinesRead, roadsRead]).then(([found, roadResult]) =>
    region.pavedSurfaces && physical.parcelGeometry
      ? collectPavedSurfaces(
          region.pavedSurfaces,
          physical.parcelGeometry,
          found?.measurable.features.map((feature) => feature.geometry) ?? [],
          (roadResult?.features ?? []).flatMap((feature) => {
            const g = feature.geometry;
            const lines = g?.type === "LineString" ? [g.coordinates] : g?.type === "MultiLineString" ? g.coordinates : [];
            // Half a typical two-lane surface: the road's own width isn't read until the layers land.
            return (lines as number[][][]).map((line) => ({ line, halfWidthM: 4 }));
          }),
          ctx,
        ).then(landed)
      : null,
  );

  // Stall stripes, read from the imagery inside the paved areas once those land.
  const stallSource = region.imagery
    ? { id: `${region.imagery.id}-stalls`, name: `${region.imagery.name}, stall stripes`, kind: "arcgis_rest" as const, dataOrigin: "real" as const, url: region.imagery.serviceUrl, licenseNote: region.imagery.licenseNote }
    : null;
  const stallsRead = pavedRead.then((part) =>
    stallSource && region.imagery && ctx.decodeImage && part?.features.length
      ? collectParkingStalls({ tileUrlTemplate: region.imagery.tileUrlTemplate, zoom: Math.min(20, region.imagery.maxZoom), source: stallSource, sourceDate: region.imagery.sourceDate }, part.features, ctx.decodeImage, ctx).then((stalls) => (stalls ? landed(stalls) : null))
      : null,
  );

  const [outlines, grid, roads, layers, json, slope, territories, earth, lidar, paved, stalls] = await Promise.all([
    outlinesRead,
    collectGrid(region, physical.parcelGeometry ? { parcel: physical.parcelGeometry } : { longitude: physical.location[0], latitude: physical.location[1] }, ctx).then(landed),
    roadsRead,
    Promise.all((region.layers ?? []).map((layer) => collectLayer(layer, layerAnchor, address, ctx).then(landed))),
    Promise.all(jsonSources.map((source) => collectJson(source, request, ctx).then(landed))),
    collectSlope(region, physical.parcelGeometry, ctx).then((part) => (part ? landed(part) : null)),
    region.territories
      ? queryTerritories(region.territories, physical.location, ctx).then((result) => {
          landed({ run: result.run });
          return result;
        })
      : null,
    collectRaster(region, physical.parcelGeometry ?? squareAround(physical.location, 50), ctx).then((part) => (part ? landed(part) : null)),
    lidarRead,
    pavedRead,
    stallsRead,
  ]);

  const collected = [...physical.observations, ...(outlines?.observations ?? []), ...grid.observations];
  const mainBuilding = [...(outlines?.measurable.features ?? [])].sort((a, b) => area(b.geometry) - area(a.geometry))[0];
  // A service drop seen in the lidar is direct evidence, so it replaces the guess from the nearest mapped line.
  const service = region.grid.some((source) => source.segments) && !lidar?.servicePathDetected ? inferServicePath(mainBuilding?.geometry ?? null, grid.segments, grid.lines[0]?.result ?? null, ctx) : null;
  let measurements: Measurements = { observations: [], features: [] };
  if (parcel) {
    const assessorArea = collected.find((observation) => observation.field === "building_area_sqft" && observation.value?.type === "quantity")?.value;
    measurements = measureSite(
      {
        address,
        lookup: parcel.lookup,
        parcel: parcel.parcel,
        outlines: outlines?.measurable ?? null,
        lines: grid.lines,
        roads: roads && region.roads ? { result: roads, features: roads.features, nameAttribute: region.roads.nameAttribute } : null,
        assessorAreaSqft: assessorArea?.type === "quantity" ? assessorArea.value : null,
      },
      ctx,
    );
  }

  // Candidate pad areas are derived here, once, so the record carries them and the
  // site-plan sheet draws what the record says instead of recomputing its own.
  let candidates: CandidateResult = { observations: [], features: [] };
  if (parcel && region.parcels) {
    candidates = padCandidates(
      {
        parcel: parcel.parcel.geometry,
        outlines: (outlines?.measurable.features ?? []).map((feature) => feature.geometry),
        origin: {
          source: sourceOf(region.parcels.entry),
          query: "derived from the collected parcel and roofprint geometry",
          retrievedAt: ctx.now(),
        },
      },
      ctx,
    );
  }

  const unavailable = region.unavailable.flatMap((route) => routeObservations(route, "earth_engine", ctx));
  const personRoutes = region.personRoutes.flatMap((route) => routeObservations(route, "human_evidence", ctx));
  for (const route of region.unavailable) runs.set(route.sourceId, { sourceId: route.sourceId, name: route.name, status: "missing", reason: route.reason });
  for (const route of region.personRoutes) runs.set(route.sourceId, { sourceId: route.sourceId, name: route.name, status: "person_only", reason: route.reason });

  return {
    site,
    observations: [
      ...collected,
      ...measurements.observations,
      ...(service?.observations ?? []),
      ...(lidar?.observations ?? []),
      ...(paved?.observations ?? []),
      ...(stalls?.observations ?? []),
      ...candidates.observations,
      // A better local value, such as lidar slope or a 1 m point elevation, is read after Earth Engine's, so it stays current.
      ...(earth?.observations ?? []),
      ...layers.flatMap((layer) => layer.observations),
      ...json.flatMap((source) => source.observations),
      ...(slope?.observations ?? []),
      ...(territories && region.territories ? servingUtility(region.territories, territories, grid.outcomes, ctx) : []),
      ...unavailable,
      ...personRoutes,
    ],
    features: [...physical.features, ...(outlines?.features ?? []), ...grid.features, ...measurements.features, ...candidates.features, ...layers.flatMap((layer) => layer.features), ...(service?.features ?? []), ...(lidar?.features ?? []), ...(paved?.features ?? []), ...(stalls?.features ?? [])],
    baseMap: physical.baseMap,
    // A source still pending at the end was never read, such as a feeder's detail layers when no feeder was found.
    // The value it would have filled says why, so the finished record lists only sources that ran.
    sourceRuns: [...runs.values()].filter((run) => run.status !== "pending"),
  };
}
