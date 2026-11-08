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

