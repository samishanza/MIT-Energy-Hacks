// Real site geometry, in feet, on a local plane.
//
// The DRC solver works in a flat (x, y) frame measured in feet from the parcel's
// north-west corner, with y growing southward — the frame the sheets are drawn in. Real
// parcels arrive as lon/lat polygons, so everything here is about getting between those
// two honestly, and then measuring on the polygons rather than on their bounding boxes.
//
// Why this matters: a bounding box is a different shape from the lot. On an irregular
// parcel the box overstates the yard, so a pad can clear its setbacks on the box and
// violate them on the real lot line. That is the kind of error that reaches a drawing.

import type { Feature, Polygon as GeoPolygon, MultiPolygon, Position } from 'geojson';
import area from '@turf/area';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import difference from '@turf/difference';
import buffer from '@turf/buffer';
import { featureCollection, polygon as turfPolygon } from '@turf/helpers';

/** Axis-aligned rectangle in local feet. Declared here so this package depends on nothing internal. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A ring of points in local feet. First point is not repeated. */
export type Ring = { x: number; y: number }[];

export interface LocalPolygon {
  /** Outer ring, feet, y southward. */
  outer: Ring;
  /** Holes, if the source geometry had any. */
  holes?: Ring[];
}

const FT_PER_DEG_LAT = 364_000;
const ftPerDegLon = (lat: number) => FT_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

export interface LocalFrame {
  /** Longitude of local x = 0. */
  originLon: number;
  /** Latitude of local y = 0 (the northern edge). */
  originLat: number;
  ftPerLon: number;
}

/** Build the frame from the parcel's own north-west corner. */
export function frameFor(lonLat: Position[]): LocalFrame {
  let west = Infinity;
  let north = -Infinity;
  let sumLat = 0;
  for (const [lon, lat] of lonLat) {
    if (lon !== undefined && lon < west) west = lon;
    if (lat !== undefined && lat > north) north = lat;
    sumLat += lat ?? 0;
  }
  const midLat = lonLat.length ? sumLat / lonLat.length : 0;
  return { originLon: west, originLat: north, ftPerLon: ftPerDegLon(midLat) };
}

export const toLocal = (f: LocalFrame, [lon, lat]: Position) => ({
  x: round2((lon! - f.originLon) * f.ftPerLon),
  y: round2((f.originLat - lat!) * FT_PER_DEG_LAT),
});

export const toLonLat = (f: LocalFrame, p: { x: number; y: number }): Position => [
  f.originLon + p.x / f.ftPerLon,
  f.originLat - p.y / FT_PER_DEG_LAT,
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** GeoJSON polygon (lon/lat) to local feet. Drops the repeated closing point. */
export function toLocalPolygon(g: GeoPolygon | MultiPolygon, frame: LocalFrame): LocalPolygon[] {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((rings) => ({
    outer: (rings[0] ?? []).slice(0, -1).map((p) => toLocal(frame, p)),
    holes: rings.slice(1).map((r) => r.slice(0, -1).map((p) => toLocal(frame, p))),
  }));
}

function toTurf(p: LocalPolygon, frame: LocalFrame): Feature<GeoPolygon> {
  const ring = (r: Ring) => {
    const pts = r.map((pt) => toLonLat(frame, pt));
    return pts.length && pts[0] ? [...pts, pts[0]] : pts;
  };
  return turfPolygon([ring(p.outer), ...(p.holes ?? []).map(ring)]);
}

// ------------------------------------------------------------------ measuring

/** Shortest distance from a point to a polygon edge, in feet. Negative when inside. */
export function signedDistanceToEdge(poly: LocalPolygon, p: { x: number; y: number }): number {
  let best = Infinity;
  const rings = [poly.outer, ...(poly.holes ?? [])];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      best = Math.min(best, pointSegmentDistance(p, a, b));
    }
  }
  return pointInRing(poly.outer, p) ? -best : best;
}

export function pointSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Even-odd ray cast. */
export function pointInRing(ring: Ring, p: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Shortest distance between a rectangle and a polygon's boundary, in feet.
 * This is what replaces measuring against a bounding box.
 */
export function rectToPolygonDistance(r: Rect, poly: LocalPolygon): { d: number; witness: { x1: number; y1: number; x2: number; y2: number } } {
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  let best = Infinity;
  let witness = { x1: corners[0]!.x, y1: corners[0]!.y, x2: corners[0]!.x, y2: corners[0]!.y };

  const rings = [poly.outer, ...(poly.holes ?? [])];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      for (const c of corners) {
        const d = pointSegmentDistance(c, a, b);
        if (d < best) {
          best = d;
          const t = projectT(c, a, b);
          witness = { x1: c.x, y1: c.y, x2: a.x + t * (b.x - a.x), y2: a.y + t * (b.y - a.y) };
        }
      }
    }
  }
  return { d: round2(best), witness };
}

function projectT(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  return len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
}

/** True when every corner of the rect is inside the polygon. */
export function polygonContainsRect(poly: LocalPolygon, r: Rect): boolean {
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  if (!corners.every((c) => pointInRing(poly.outer, c))) return false;
  for (const hole of poly.holes ?? []) {
    if (corners.some((c) => pointInRing(hole, c))) return false;
  }
  return true;
}

export function polygonAreaSqft(poly: LocalPolygon): number {
  const shoelace = (ring: Ring) => {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  };
  return Math.round(shoelace(poly.outer) - (poly.holes ?? []).reduce((s, h) => s + shoelace(h), 0));
}

export const boundingRect = (poly: LocalPolygon): Rect => {
  const xs = poly.outer.map((p) => p.x);
  const ys = poly.outer.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// --------------------------------------------------------------- pad zones

export interface PadCandidate {
  /** The usable open area, in local feet. */
  polygon: LocalPolygon;
  areaSqft: number;
  /** The largest axis-aligned rectangle we could inscribe in it. */
  rect: Rect;
  /** How this candidate was arrived at, for the record's rationale. */
  basis: string;
}

export interface PadZoneOptions {
  /** Keep-out around the building, in feet. */
  buildingBufferFt: number;
  /** Keep-out inside the lot line, in feet. */
  lotSetbackFt: number;
  /** Ignore slivers below this. */
  minAreaSqft: number;
  /** Grid step for the inscribed-rectangle search, in feet. */
  stepFt?: number;
}

/**
 * Derive candidate pad areas: the lot, minus a buffer around the building, minus the
 * setback strip inside the lot line.
 *
 * This is geometry, not imagery. It tells you where there is OPEN GROUND, which is a
 * genuinely different claim from where there is PAVED, UNOBSTRUCTED ground — surface
 * type, parked trailers, drainage and easements are all invisible here. Every candidate
 * says so in its basis, and surface type stays unresolved until something can see it.
 */
export function derivePadCandidates(
  lot: LocalPolygon,
  buildings: LocalPolygon[],
  frame: LocalFrame,
  opts: PadZoneOptions,
): PadCandidate[] {
  const lotFeature = toTurf(lot, frame);
  const metresPerFt = 0.3048;

  let open: Feature<GeoPolygon | MultiPolygon> | null = opts.lotSetbackFt
    ? (buffer(lotFeature, -opts.lotSetbackFt * metresPerFt, { units: 'meters' }) ?? null)
    : lotFeature;
  if (!open) return [];

  for (const b of buildings) {
    const keepOut = buffer(toTurf(b, frame), opts.buildingBufferFt * metresPerFt, { units: 'meters' });
    if (!keepOut) continue;
    const cut = difference(featureCollection([open, keepOut]));
    if (!cut) return [];
    open = cut as Feature<GeoPolygon | MultiPolygon>;
  }

  const parts = toLocalPolygon(open.geometry, frame);
  const basis =
    `Lot polygon less a ${opts.buildingBufferFt} ft buffer around the building and the ` +
    `${opts.lotSetbackFt} ft strip inside the lot line. Open ground by geometry — not a claim ` +
    `that it is paved, level or unobstructed, which no vector layer can tell you.`;

  return parts
    .map((polygon) => ({
      polygon,
      areaSqft: polygonAreaSqft(polygon),
      rect: largestInscribedRect(polygon, opts.stepFt ?? 5),
      basis,
    }))
    .filter((c) => c.areaSqft >= opts.minAreaSqft && c.rect.w > 0 && c.rect.h > 0)
    .sort((a, b) => b.areaSqft - a.areaSqft);
}

/**
 * Cap on grid cells, so a large parcel cannot make this quadratic in wall time.
 *
 * The search tests four corners per cell against every edge of the ring, so cost is
 * cells x ring length. A 59-acre lot at a 5 ft step is ~100,000 cells, which on a real
 * parcel ring took long enough to time out the collection pass. Capping the cell count
 * and coarsening the step instead keeps it bounded; the effective step is returned, so
 * the loss of resolution is stated rather than hidden.
 */
const MAX_GRID_CELLS = 16_000;

/** The step this search would actually use for a polygon, after the cell cap. */
export function effectiveStepFt(poly: LocalPolygon, stepFt: number): number {
  const bb = boundingRect(poly);
  if (bb.w <= 0 || bb.h <= 0) return stepFt;
  const cells = (bb.w / stepFt) * (bb.h / stepFt);
  if (cells <= MAX_GRID_CELLS) return stepFt;
  return round2(stepFt * Math.sqrt(cells / MAX_GRID_CELLS));
}

/**
 * Largest axis-aligned rectangle that fits inside a polygon, found on a grid.
 * Approximate by construction — the step size is the resolution, and it is reported
 * rather than hidden, because a pad placed on a 5 ft grid is a 5 ft claim.
 */
export function largestInscribedRect(poly: LocalPolygon, stepFt: number): Rect {
  const bb = boundingRect(poly);
  if (bb.w <= 0 || bb.h <= 0) return { x: 0, y: 0, w: 0, h: 0 };

  const step = effectiveStepFt(poly, stepFt);
  const cols = Math.max(1, Math.floor(bb.w / step));
  const rows = Math.max(1, Math.floor(bb.h / step));

  // A cell counts only when ALL FOUR of its corners are inside — not its centre.
  // Testing the centre lets the winning rectangle overhang the boundary by up to half a
  // step, which on a concave lot means a pad that reads as fitting and does not. Being
  // conservative costs one cell of margin per side and cannot produce a false fit.
  const cellInside = (c: number, r: number) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const p = { x: bb.x + (c + dx) * step, y: bb.y + (r + dy) * step };
      if (!pointInRing(poly.outer, p)) return false;
      if ((poly.holes ?? []).some((h) => pointInRing(h, p))) return false;
    }
    return true;
  };

  const inside: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) row.push(cellInside(c, r));
    inside.push(row);
  }

  // Maximal rectangle in a binary matrix, by histogram over each row.
  const heights = new Array<number>(cols).fill(0);
  let best = { area: 0, r: 0, c: 0, w: 0, h: 0 };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights[c] = inside[r]![c] ? heights[c]! + 1 : 0;
    const stack: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const h = c === cols ? 0 : heights[c]!;
      while (stack.length && heights[stack[stack.length - 1]!]! >= h) {
        const top = stack.pop()!;
        const height = heights[top]!;
        const left = stack.length ? stack[stack.length - 1]! + 1 : 0;
        const width = c - left;
        const areaCells = width * height;
        if (areaCells > best.area) best = { area: areaCells, r: r - height + 1, c: left, w: width, h: height };
      }
      stack.push(c);
    }
  }

  return {
    x: round2(bb.x + best.c * step),
    y: round2(bb.y + best.r * step),
    w: round2(best.w * step),
    h: round2(best.h * step),
  };
}

export { area as turfArea, booleanPointInPolygon };
