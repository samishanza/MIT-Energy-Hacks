// Ground slope at the pad, from the MassGIS LiDAR bare-earth DEM.
//
// Slope is decision-critical and cheap to get wrong. A pad over roughly 2% needs grading
// or a stepped foundation, which is real money and a real schedule item, and nothing in
// the parcel or footprint layers hints at it.
//
// Two facts about this service that are not documented and were determined by probing it,
// because getting either wrong silently corrupts every slope it produces:
//
//   1. The DEM's vertical unit is METRES. Sampling the Mount Wachusett summit (2,006 ft
//      / 611 m) returns 606, not 2006. Horizontal work here is in feet, so the rise is
//      converted before the ratio is taken — otherwise every slope is 3.28x too small.
//   2. getSamples returns `value` as a space-separated string of band values, e.g.
//      "104.584 1". Only the first band is elevation.
//
// USGS 3DEP would be the national equivalent and is what the plan calls for, but it was
// returning 504s and 500s when this was written, so this uses the in-state LiDAR instead.

import type { FetchLike } from '@eqore/sources';
import type { SourceDoc } from './types.ts';

const DEM_SERVICE =
  'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/LiDAR/DEM_lidar_2013to2021_32bitFloat/ImageServer';

/** Determined empirically; see the note above. */
export const DEM_VERTICAL_UNIT = 'meters' as const;
const FT_PER_M = 3.280839895;
const FT_PER_DEG_LAT = 364_000;
const ftPerDegLon = (lat: number) => FT_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

export interface ElevationSampleLonLat {
  lon: number;
  lat: number;
  /** Elevation in feet, converted from the service's metres. */
  elevationFt: number;
}

export interface SlopeResult extends SourceDoc {
  /** Steepest slope across the sampled area, as a percentage (rise/run x 100). */
  slopePercent: number;
  /** Compass direction the ground falls toward, in degrees from north. */
  aspectDegrees: number;
  /** Highest minus lowest sample, in feet. */
  reliefFt: number;
  sampleCount: number;
  /** Ground sample distance of the DEM, in feet. The floor on what this can resolve. */
  demResolutionFt: number;
}

export interface LonLatBoxInput {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface RawSample {
  value?: string;
  location?: { x: number; y: number };
}

/** Parse "104.584 1" -> 104.584. Returns null for NoData. */
export function firstBand(value: string | undefined): number | null {
  if (!value) return null;
  const first = value.trim().split(/[\s,]+/)[0];
  const n = Number(first);
  return Number.isFinite(n) ? n : null;
}

export async function sampleElevations(
  box: LonLatBoxInput,
  fetchImpl: FetchLike,
  sampleCount = 36,
): Promise<ElevationSampleLonLat[]> {
  const params = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ ...box, xmin: box.west, ymin: box.south, xmax: box.east, ymax: box.north, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryEnvelope',
    sampleCount: String(sampleCount),
    returnFirstValueOnly: 'true',
    outSR: '4326',
  });

  const res = await fetchImpl(`${DEM_SERVICE}/getSamples?${params.toString()}`);
  if (!res.ok) throw new Error(`MassGIS DEM returned ${res.status}`);
  const body = (await res.json()) as { samples?: RawSample[]; error?: unknown };
  if (body.error || !body.samples) throw new Error('MassGIS DEM returned no samples');

  const out: ElevationSampleLonLat[] = [];
  for (const s of body.samples) {
    const metres = firstBand(s.value);
    if (metres === null || !s.location) continue; // NoData over water and outside coverage
    out.push({ lon: s.location.x, lat: s.location.y, elevationFt: metres * FT_PER_M });
  }
  return out;
}

/**
 * Least-squares plane through the samples, reported as a slope percentage and the
 * direction the ground falls toward.
 *
 * A plane fit rather than a max-pairwise-difference, because a single noisy LiDAR return
 * on a parked vehicle or a fence post would otherwise set the answer for the whole pad.
 */
export function fitSlope(samples: ElevationSampleLonLat[]): { slopePercent: number; aspectDegrees: number; reliefFt: number } | null {
  if (samples.length < 3) return null;

  const lat0 = samples.reduce((s, p) => s + p.lat, 0) / samples.length;
  const lon0 = samples.reduce((s, p) => s + p.lon, 0) / samples.length;
  const kx = ftPerDegLon(lat0);

  // Local feet, east-positive and north-positive, centred on the sample cloud.
  const pts = samples.map((p) => ({
    x: (p.lon - lon0) * kx,
    y: (p.lat - lat0) * FT_PER_DEG_LAT,
    z: p.elevationFt,
  }));

  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  const zBar = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  for (const p of pts) {
    sxx += p.x * p.x;
    sxy += p.x * p.y;
    syy += p.y * p.y;
    sxz += p.x * (p.z - zBar);
    syz += p.y * (p.z - zBar);
  }

  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9) return null; // samples collinear; no plane to fit

  // z = a*x + b*y + c — a and b are rise per foot east and north.
  const a = (sxz * syy - syz * sxy) / det;
  const b = (syz * sxx - sxz * sxy) / det;

  const grade = Math.hypot(a, b);
  // Downhill direction, as a compass bearing from north.
  const aspect = (((Math.atan2(-a, -b) * 180) / Math.PI) + 360) % 360;

  const zs = pts.map((p) => p.z);
  return {
    slopePercent: round2(grade * 100),
    aspectDegrees: round1(aspect),
    reliefFt: round2(Math.max(...zs) - Math.min(...zs)),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fetch and fit in one step. Returns null when the DEM has no coverage here. */
export async function measureSlope(
  box: LonLatBoxInput,
  fetchImpl: FetchLike,
  sampleCount = 36,
): Promise<SlopeResult | null> {
  const samples = await sampleElevations(box, fetchImpl, sampleCount);
  const fit = fitSlope(samples);
  if (!fit) return null;

  return {
    ref: `${DEM_SERVICE}/getSamples`,
    label: 'MassGIS LiDAR bare-earth DEM, 2013–2021',
    ...fit,
    sampleCount: samples.length,
    // 1.38 m pixels, from the service's own pixelSize.
    demResolutionFt: round2(1.3778565541850953 * FT_PER_M),
  };
}
