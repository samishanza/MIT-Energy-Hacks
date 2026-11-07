// Live Massachusetts data, behind the same SourceClient seam the fixtures use.
//
// This is the adapter that makes the agent layer autonomous: it runs the team's
// collection pipeline (@eqore/sources — Census geocode, then MassGIS parcels, building
// structures, and the National Grid feeder and hosting-capacity layers) and reshapes the
// result into the payloads the agents already read. No agent, gatekeeper rule or engine
// changes; swapping makeFixtureSources() for makeLiveSources() is the whole difference.
//
// The hard discipline here is what it REFUSES to supply. MassGIS L3 carries no owner and
// no zoning district; no GIS layer carries openings, pad zones, surface type or a bus
// rating. Those come back null, the agents report them unresolved, and the engine ranks
// them — which is the correct behaviour and the entire point of the record. An adapter
// that quietly filled them with plausible numbers would be worse than no adapter.

import type { Geometry, MapFeature, Observation, SourceRun } from '@eqore/contract';
import {
  REGIONS,
  collectSite,
  resolveSite,
  selectRegion,
  siteIdFor,
  type CollectContext,
  type FetchLike,
  type RegionConfig,
} from '@eqore/sources';
import type {
  AssessorRecord,
  CodeProfile,
  FootprintRecord,
  ParcelRecord,
  SiteInput,
  SourceClient,
} from './types.ts';

// ------------------------------------------------------------------ geometry

/** Feet per degree of latitude. Constant enough at the scale of one parcel. */
const FT_PER_DEG_LAT = 364_000;
const ftPerDegLon = (lat: number) => FT_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

export interface LonLatBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

function positionsOf(g: Geometry): [number, number][] {
  switch (g.type) {
    case 'Point':
      return [g.coordinates];
    case 'LineString':
      return g.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return g.coordinates.flat() as [number, number][];
    case 'MultiPolygon':
      return g.coordinates.flat(2) as [number, number][];
  }
}

export function boundsOf(g: Geometry): LonLatBox | null {
  const pts = positionsOf(g);
  if (!pts.length) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lon, lat] of pts) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return { west, south, east, north };
}

/** Box dimensions in feet, measured at its own latitude. */
export function boxSizeFt(b: LonLatBox): { widthFt: number; depthFt: number } {
  const midLat = (b.north + b.south) / 2;
  return {
    widthFt: round1((b.east - b.west) * ftPerDegLon(midLat)),
    depthFt: round1((b.north - b.south) * FT_PER_DEG_LAT),
  };
}

/**
 * Offset of `inner`'s north-west corner from `outer`'s, in feet.
 * The record models y as growing southward, which is how the Setback sheets are drawn.
 */
export function offsetFt(outer: LonLatBox, inner: LonLatBox): { xFt: number; yFt: number } {
  const midLat = (outer.north + outer.south) / 2;
  return {
    xFt: round1((inner.west - outer.west) * ftPerDegLon(midLat)),
    yFt: round1((outer.north - inner.north) * FT_PER_DEG_LAT),
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// -------------------------------------------------------------- observations

function readNumber(obs: Observation[], field: string): number | null {
  for (const o of obs) {
    if (o.field === field && o.value?.type === 'quantity') return o.value.value;
  }
  return null;
}

function readText(obs: Observation[], field: string): string | null {
  for (const o of obs) {
    if (o.field === field && o.value?.type === 'text') return o.value.value;
  }
  return null;
}

const featureOf = (features: MapFeature[], kind: MapFeature['kind']) =>
  features.find((f) => f.kind === kind) ?? null;

/**
 * Roofprints for a parcel, largest first.
 *
 * ArcGIS does not guarantee feature order, so taking the first one is taking an
 * arbitrary structure. On a 59-acre industrial parcel that meant reporting a 10 x 36 ft
 * shed as the building, roughly 500x too small by area, with nothing to indicate it was
 * wrong. Sorting by footprint area makes the primary structure the primary structure.
 */
export function buildingsByArea(features: MapFeature[]): { bounds: LonLatBox; areaFt2: number }[] {
  return features
    .filter((f) => f.kind === 'building_outline')
    .flatMap((f) => {
      const b = boundsOf(f.geometry);
      if (!b) return [];
      const { widthFt, depthFt } = boxSizeFt(b);
      return [{ bounds: b, areaFt2: widthFt * depthFt }];
    })
    .sort((a, b) => b.areaFt2 - a.areaFt2);
}

// ------------------------------------------------------------------- adapter

export interface LiveOptions {
  address: string;
  /** Inject a replaying fetch to run offline against recorded responses. */
  fetch?: FetchLike;
  now?: () => string;
  region?: RegionConfig;
  /**
   * Codes in force are not in any GIS service — they come from a maintained table.
   * Supply one for the jurisdiction, or the code agent reports them unresolved, which
   * is the honest outcome for a town nobody has entered yet.
   */
  codeProfile?: CodeProfile | null;
}

export interface LiveSources {
  site: SiteInput;
  sources: SourceClient;
  /** Per-source status from the collection run, for the agent control tower. */
  runs: SourceRun[];
  /** Fields the live sources structurally cannot supply, named up front. */
  notAvailableLive: string[];
}

/** What no Massachusetts GIS layer can answer, whatever address you give it. */
export const NOT_AVAILABLE_FROM_GIS = [
  'site.owner',
  'zoning.district',
  'openings[].wall',
  'openings[].kind',
  'openings[].at_ft',
  'openings[].width_ft',
  'pad_zone.x_ft',
  'pad_zone.y_ft',
  'pad_zone.width_ft',
  'pad_zone.depth_ft',
  'site.surface_type',
  'electrical.bus_rating_a',
  'electrical.main_breaker_a',
  'electrical.spare_spaces',
  'room.working_clearance_ft',
] as const;

export async function makeLiveSources(opts: LiveOptions): Promise<LiveSources> {
  const { address } = opts;
  const region = opts.region ?? selectRegion(address, REGIONS);
  if (!region) throw new Error(`No configured region covers "${address}"`);

  const ctx: CollectContext = {
    siteId: siteIdFor(address),
    fetch: opts.fetch ?? ((url, init) => fetch(url, init)),
    now: opts.now ?? (() => new Date().toISOString()),
  };

  const resolved = await resolveSite(address, region, ctx);
  if (resolved.status !== 'resolved') {
    throw new Error(
      `"${address}" matched ${resolved.candidates.length} parcels. A person has to pick one before this site can be collected.`,
    );
  }

  const collection = await collectSite(address, region, resolved.anchor, ctx);
  const { observations, features } = collection;

  const parcelFeature = featureOf(features, 'property_line');
  const lotBounds = parcelFeature ? boundsOf(parcelFeature.geometry) : null;
  const allBuildings = buildingsByArea(features);
  const buildingBounds = allBuildings[0]?.bounds ?? null;

  const site: SiteInput = {
    siteId: collection.site.id,
    address: collection.site.address,
    city: address.split(',')[1]?.trim() ?? '',
    state: (region.states[0] as SiteInput['state']) ?? 'MA',
    lon: collection.site.location?.[0],
    lat: collection.site.location?.[1],
  };

  // --- parcel: real geometry, and openly missing owner and zoning
  const parcelId = readText(observations, 'parcel_id');
  const lotSizeAcres = readNumber(observations, 'lot_size_acres');
  const parcel: ParcelRecord | null =
    parcelId && lotBounds
      ? {
          ref: `massgis://l3-parcels/${parcelId}`,
          label: `MassGIS L3 property tax parcel ${parcelId}${lotSizeAcres ? ` (${lotSizeAcres} ac)` : ''}`,
          parcelId,
          address: collection.site.address,
          // Reported as the bounding box of the recorded polygon. MassGIS states L3 is
          // reference grade, not survey grade, so a lot line that decides a setback
          // still has to come from the recorded plot plan.
          lotWidthFt: boxSizeFt(lotBounds).widthFt,
          lotDepthFt: boxSizeFt(lotBounds).depthFt,
          toleranceFt: 10,
          roadSide: 'south',
        }
      : null;

  // --- assessor-derived attributes that ride along on the parcel layer
  const yearBuilt = readNumber(observations, 'year_built');
  const buildingAreaSqft = readNumber(observations, 'building_area_sqft');
  const assessor: AssessorRecord | null =
    yearBuilt !== null || buildingAreaSqft !== null
      ? {
          ref: `massgis://l3-parcels/${parcelId ?? 'unknown'}#assessor`,
          label: 'MassGIS L3 standardized assessor attributes',
          yearBuilt: yearBuilt ?? 0,
          buildingAreaSqft: buildingAreaSqft ?? 0,
        }
      : null;

  // --- footprint: vector extents, no image and therefore no crop
  const footprint: FootprintRecord | null =
    lotBounds && buildingBounds
      ? {
          ref: 'massgis://building-structures',
          label: `MassGIS building structures (roofprints), largest of ${allBuildings.length} on the parcel`,
          lot: boxSizeFt(lotBounds),
          building: {
            offsetXFt: offsetFt(lotBounds, buildingBounds).xFt,
            offsetYFt: offsetFt(lotBounds, buildingBounds).yFt,
            widthFt: boxSizeFt(buildingBounds).widthFt,
            depthFt: boxSizeFt(buildingBounds).depthFt,
          },
          toleranceFt: 10,
          buildingAreaSqft: buildingAreaSqft ?? undefined,
          otherBuildings: allBuildings.slice(1).map((b) => ({
            offsetXFt: offsetFt(lotBounds, b.bounds).xFt,
            offsetYFt: offsetFt(lotBounds, b.bounds).yFt,
            widthFt: boxSizeFt(b.bounds).widthFt,
            depthFt: boxSizeFt(b.bounds).depthFt,
          })),
        }
      : null;

  const hostingKw = readNumber(observations, 'hosting_capacity');
  const utilityName = readText(observations, 'serving_utility');

  const sources: SourceClient = {
    async parcel() {
      return parcel;
    },
    async assessor() {
      return assessor;
    },
    async footprint() {
      return footprint;
    },
    // No aerial image is read here. The footprint method carries the geometry instead,
    // so nothing claims to have measured a photo it never looked at.
    async aerial() {
      return null;
    },
    async elevation() {
      return null;
    },
    async streetLevel() {
      return null;
    },
    async hydrants() {
      return null;
    },
    async permitRecords() {
      return [];
    },
    async codeTable() {
      return opts.codeProfile ?? null;
    },
    async tariff() {
      return utilityName
        ? {
            ref: 'national-grid://system-data-portal',
            label: `Serving utility from the feeder layer: ${utilityName}`,
            utility: utilityName,
            rateSchedule: '',
          }
        : null;
    },
    async hostingCapacity() {
      return hostingKw === null
        ? null
        : {
            ref: 'national-grid://hosting-capacity',
            label: 'National Grid MA system data portal, hosting capacity',
            feederHostingKw: hostingKw,
            existingDgKw: 0,
          };
    },
    async customerDocs() {
      return [];
    },
  };

  return { site, sources, runs: collection.sourceRuns, notAvailableLive: [...NOT_AVAILABLE_FROM_GIS] };
}
