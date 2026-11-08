import { booleanIntersects } from "@turf/turf";
import type { Geometry } from "@eqore/contract";

export type Point = [number, number];
export type Segment = [Point, Point];
export type Box = { minX: number; maxX: number; minY: number; maxY: number };
export type Gap = { feet: number; from: Point; to: Point };

// Same sphere as Turf, flattened around the site, which is accurate at the size of a site.
const FEET_PER_DEGREE = (6371008.8 * Math.PI * 3.280839895) / 180;

function ringsOf(geometry: Geometry): Point[][] {
  switch (geometry.type) {
    case "Polygon":
      return geometry.coordinates as Point[][];
    case "MultiPolygon":
      return geometry.coordinates.flat() as Point[][];
    case "LineString":
      return [geometry.coordinates as Point[]];
    case "MultiLineString":
      return geometry.coordinates as Point[][];
    case "Point":
      return [[geometry.coordinates as Point]];
  }
}

export function verticesOf(geometry: Geometry): Point[] {
  return ringsOf(geometry).flat();
}

export function frameAround(geometry: Geometry) {
  const points = verticesOf(geometry);
  const latitudes = points.map(([, latitude]) => latitude);
  const lat0 = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const lon0 = points[0]![0];
  const perLon = FEET_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  return {
    toFeet: ([lon, lat]: Point): Point => [(lon - lon0) * perLon, (lat - lat0) * FEET_PER_DEGREE],
    toLonLat: ([x, y]: Point): Point => [lon0 + x / perLon, lat0 + y / FEET_PER_DEGREE],
  };
}

export function segmentsOf(geometry: Geometry, toFeet: (point: Point) => Point): Segment[] {
  return ringsOf(geometry).flatMap((ring) => {
    const points = ring.map(toFeet);
    if (points.length === 1) return [[points[0]!, points[0]!] as Segment];
    return points.slice(1).map((point, index): Segment => [points[index]!, point]);
  });
}

export function boxOf(points: Point[]): Box {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// The smallest rectangle around a shape, turned to fit it. A turned building's north-south and east-west
// box overstates both sides; this measures the sides as drawn. "width" is the side nearer east-west.
export type FittedRect = { width: number; depth: number; corners: [Point, Point, Point, Point]; bearingDeg: number };
export function fittedRect(points: Point[]): FittedRect {
  let best: { area: number; angle: number; u0: number; u1: number; v0: number; v1: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(angle), s = Math.sin(angle);
    const us = points.map(([x, y]) => x * c + y * s), vs = points.map(([x, y]) => -x * s + y * c);
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area - 1e-6) best = { area, angle, u0, u1, v0, v1 };
  }
  if (!best) return { width: 0, depth: 0, corners: [[0, 0], [0, 0], [0, 0], [0, 0]], bearingDeg: 90 };
  let { angle, u0, u1, v0, v1 } = best;
  // Turn by a quarter if needed so the u axis is the one nearer east-west.
  const norm = ((angle % Math.PI) + Math.PI) % Math.PI;
  if (norm > Math.PI / 4 && norm < (3 * Math.PI) / 4) {
    angle -= Math.PI / 2;
    [u0, u1, v0, v1] = [v0, v1, -u1, -u0];
  }
  const c = Math.cos(angle), s = Math.sin(angle);
  const at = (u: number, v: number): Point => [u * c - v * s, u * s + v * c];
  return { width: u1 - u0, depth: v1 - v0, corners: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], bearingDeg: (((90 - (angle * 180) / Math.PI) % 180) + 180) % 180 };
}

export function closestPointOn([a, b]: Segment, point: Point): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return [a[0] + t * dx, a[1] + t * dy];
}

// The closest two non-crossing sets of segments get is always at an endpoint of one of them.
export function closestGap(first: Segment[], second: Segment[]): Gap {
  let best: Gap = { feet: Number.POSITIVE_INFINITY, from: [0, 0], to: [0, 0] };
  const consider = (from: Point, segments: Segment[], swap: boolean) => {
    for (const segment of segments) {
      const to = closestPointOn(segment, from);
      const feet = Math.hypot(from[0] - to[0], from[1] - to[1]);
      if (feet < best.feet) best = swap ? { feet, from: to, to: from } : { feet, from, to };
    }
  };
  for (const [a, b] of first) {
    consider(a, second, false);
    consider(b, second, false);
  }
  for (const [a, b] of second) {
    consider(a, first, true);
    consider(b, first, true);
  }
  return best;
}

export function feetBetween(first: Geometry, second: Geometry): number {
  if (booleanIntersects(first, second)) return 0;
  const { toFeet } = frameAround(first);
  return closestGap(segmentsOf(first, toFeet), segmentsOf(second, toFeet)).feet;
}

