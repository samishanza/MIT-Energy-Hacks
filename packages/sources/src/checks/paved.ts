import { area, buffer, difference, featureCollection, intersect, polygon as turfPolygon, multiPolygon, union } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { MapFeature, Observation, SourceRun } from "@eqore/contract";
import { observe, queryArcgis, type CollectContext, type PolygonGeometry } from "../arcgis.ts";
import type { ArcgisEntry } from "../registry.ts";

// Paved parking and drives on the lot: the impervious land cover mapped from 2016 aerial imagery, inside the
// lot, less the buildings and the public road surface. The land cover doesn't tell a parking stall from a drive
// aisle or a sidewalk, so each area is paved surface, which a person divides into stalls and aisles.

export type PavedSurfaces = { entry: ArcgisEntry; coverAttribute: string; imperviousCode: number; sourceDate: string };
export type PavedCollection = { observations: Observation[]; features: MapFeature[]; run: SourceRun };

const SQFT_PER_SQM = 10.7639;
// Pieces smaller than this are slivers left at edges, not lots.
const MIN_AREA_SQM = 60;

type Shape = Feature<Polygon | MultiPolygon>;
const asShape = (geometry: PolygonGeometry): Shape => (geometry.type === "Polygon" ? turfPolygon(geometry.coordinates as number[][][]) : multiPolygon(geometry.coordinates as number[][][][]));
const merge = (shapes: Shape[]): Shape | null => (shapes.length === 0 ? null : shapes.length === 1 ? shapes[0]! : (union(featureCollection(shapes)) as Shape | null));
const minus = (shape: Shape | null, cut: Shape | null): Shape | null => (shape && cut ? (difference(featureCollection([shape, cut])) as Shape | null) : shape);

type XY = [number, number];

// Douglas-Peucker in local metres.
function simplify(points: XY[], tolerance: number): XY[] {
  if (points.length < 3) return points;
  const [a, b] = [points[0]!, points.at(-1)!];
  let worst = 0, at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1;
    const d = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

// The main building's long axis, in radians from east, from its minimum-area rectangle.
export function buildingAxis(ring: XY[]): number {
  let best = { area: Infinity, angle: 0 };
  for (let i = 1; i < ring.length; i++) {
    const angle = Math.atan2(ring[i]![1] - ring[i - 1]![1], ring[i]![0] - ring[i - 1]![0]);
    const c = Math.cos(-angle), s = Math.sin(-angle);
    const us = ring.map(([x, y]) => x * c - y * s), vs = ring.map(([x, y]) => x * s + y * c);
    const boxArea = (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
    if (boxArea < best.area) best = { area: boxArea, angle };
  }
  return best.angle;
}

// Straightens areas traced from imagery cells: rasterized on a half-metre grid turned to the building's axis,
// smoothed by closing then opening about 2 m, traced, and simplified within 1.5 m to flatten the grid's steps.
// Edges along the building's axes come out straight, angled edges as clean diagonals, and the outline stays on
// the area it traces rather than cutting across it.
export function regularizeArea(polygons: XY[][][], axis: number): XY[][][] {
  const CELL = 0.5;
  // Smoothing reach in cells: notches and bumps narrower than about 2 m go.
  const R = 4;
  const c = Math.cos(-axis), s = Math.sin(-axis);
  const turn = ([x, y]: XY): XY => [x * c - y * s, x * s + y * c];
  const back = ([u, v]: XY): XY => [u * Math.cos(axis) - v * Math.sin(axis), u * Math.sin(axis) + v * Math.cos(axis)];
  const turned = polygons.map((polygon) => polygon.map((ring) => ring.map(turn)));
  const all = turned.flat(2);
  if (all.length === 0) return polygons;
  const minU = Math.min(...all.map((p) => p[0])) - 3, minV = Math.min(...all.map((p) => p[1])) - 3;
  const w = Math.ceil((Math.max(...all.map((p) => p[0])) + 3 - minU) / CELL), h = Math.ceil((Math.max(...all.map((p) => p[1])) + 3 - minV) / CELL);
  let mask = new Uint8Array(w * h);
  for (const polygon of turned) {
    for (let y = 0; y < h; y++) {
      const v = minV + (y + 0.5) * CELL;
      const crossings: number[] = [];
      for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
        const [au, av] = ring[i - 1]!, [bu, bv] = ring[i]!;
        if ((av > v) !== (bv > v)) crossings.push(au + ((v - av) * (bu - au)) / (bv - av));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        for (let x = Math.max(0, Math.ceil((crossings[i]! - minU) / CELL - 0.5)); x <= Math.min(w - 1, Math.floor((crossings[i + 1]! - minU) / CELL - 0.5)); x++) mask[y * w + x] = 1;
      }
    }
  }
  const morph = (source: Uint8Array, keep: (count: number) => boolean) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let count = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && source[ny * w + nx]) count++;
      }
      out[y * w + x] = keep(count) ? 1 : 0;
    }
    return out;
  };
  const dilate = (m: Uint8Array) => morph(m, (n) => n > 0), erode = (m: Uint8Array) => morph(m, (n) => n === (2 * R + 1) ** 2);
  mask = dilate(erode(erode(dilate(mask))));

  // Trace the cells' outlines, inside on the left.
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const next = new Map<string, XY[]>();
  const edge = (a: XY, b: XY) => { const key = `${a[0]},${a[1]}`; (next.get(key) ?? next.set(key, []).get(key)!).push(b); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) edge([x, y], [x + 1, y]);
    if (!at(x + 1, y)) edge([x + 1, y], [x + 1, y + 1]);
    if (!at(x, y + 1)) edge([x + 1, y + 1], [x, y + 1]);
    if (!at(x - 1, y)) edge([x, y + 1], [x, y]);
  }
  const rings: XY[][] = [];
  for (const [key] of next) {
    while ((next.get(key)?.length ?? 0) > 0) {
      const start = key.split(",").map(Number) as XY;
      const ring: XY[] = [start];
      for (let current = start; ; ) {
        const list = next.get(`${current[0]},${current[1]}`);
        if (!list?.length) break;
        current = list.pop()!;
        ring.push(current);
        if (current[0] === start[0] && current[1] === start[1]) break;
      }
      if (ring.length < 5) continue;
      const open = ring.slice(0, -1).map(([x, y]): XY => [minU + x * CELL, minV + y * CELL]);
      const far = open.reduce((best, q, i) => (Math.hypot(q[0] - open[0]![0], q[1] - open[0]![1]) > Math.hypot(open[best]![0] - open[0]![0], open[best]![1] - open[0]![1]) ? i : best), 0);
      const simple = [...simplify(open.slice(0, far + 1), 1.5).slice(0, -1), ...simplify([...open.slice(far), open[0]!], 1.5).slice(0, -1)];
      if (simple.length >= 3) rings.push([...simple, simple[0]!].map(back));
    }
  }
  const signed = (r: XY[]) => r.reduce((sum, p, i) => (i === 0 ? 0 : sum + (r[i - 1]![0] * p[1] - p[0] * r[i - 1]![1])), 0) / 2;
  const insideRing = (p: XY, r: XY[]) => {
    let hit = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i]!, b = r[j]!;
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  };
  // The tracing runs with the inside on the left in grid order, whose y grows the same way as north here.
  const outers = rings.filter((r) => signed(r) > 0), holes = rings.filter((r) => signed(r) <= 0);
  return outers.map((outer) => [outer, ...holes.filter((hole) => insideRing(hole[0]!, outer))]);
}

export async function collectPavedSurfaces(
  config: PavedSurfaces,
  parcel: PolygonGeometry,
  buildings: PolygonGeometry[],
  roads: { line: number[][]; halfWidthM: number }[],
  ctx: CollectContext,
): Promise<PavedCollection> {
  const result = await queryArcgis(config.entry, { kind: "polygon", geometry: parcel, bufferMeters: 0 }, ctx);
  if (result.failure) {
    return { observations: [observe(result, ctx, { field: "paved_area_sqft", kind: "no_value", value: null, reason: result.failure })], features: [], run: result.run };
  }
  const impervious = result.features
    .filter((feature) => Number(feature.attributes[config.coverAttribute]) === config.imperviousCode && feature.geometry && (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"))
    .map((feature) => asShape(feature.geometry as PolygonGeometry));

  let paved = merge(impervious);
  paved = paved ? (intersect(featureCollection([paved, asShape(parcel)])) as Shape | null) : null;
  paved = minus(paved, merge(buildings.map((building) => buffer(asShape(building), 0.5, { units: "meters" }) as Shape)));
  const streets = roads.filter((road) => road.line.length > 1).map((road) => buffer({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: road.line } }, road.halfWidthM, { units: "meters" }) as Shape);
  paved = minus(paved, merge(streets));

  const raw: number[][][][] = !paved ? [] : paved.geometry.type === "Polygon" ? [paved.geometry.coordinates] : paved.geometry.coordinates;
  // Straighten each outline to the main building's axis, in local metres.
  const all = raw.flat(2);
  const lon0 = all.reduce((s, p) => s + p[0]!, 0) / Math.max(1, all.length), lat0 = all.reduce((s, p) => s + p[1]!, 0) / Math.max(1, all.length);
  const perLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toXY = (p: number[]): XY => [(p[0]! - lon0) * perLon, (p[1]! - lat0) * 111320];
  const toLonLat = ([x, y]: XY): number[] => [lon0 + x / perLon, lat0 + y / 111320];
  const main = buildings.map((b) => (b.type === "Polygon" ? b.coordinates[0]! : b.coordinates[0]![0]!).map((p) => toXY(p as number[]))).sort((a, b) => area(turfPolygon([b.map(toLonLat)])) - area(turfPolygon([a.map(toLonLat)])))[0];
  const axis = main ? buildingAxis(main) : 0;
  const pieces: number[][][][] = regularizeArea(raw.map((polygon) => polygon.map((ring) => ring.map(toXY))), axis).map((polygon) => polygon.map((ring) => ring.map(toLonLat)));
  const kept = pieces.map((coordinates) => ({ coordinates, sqm: area(turfPolygon(coordinates)) })).filter((piece) => piece.sqm >= MIN_AREA_SQM).sort((a, b) => b.sqm - a.sqm);
  const totalSqft = Math.round(kept.reduce((sum, piece) => sum + piece.sqm, 0) * SQFT_PER_SQM);

  const reason = `Impervious land cover from ${config.entry.name}, mapped from ${config.sourceDate} aerial imagery, inside the lot, less the buildings and the public road surface. It doesn't separate parking stalls from drive aisles and walks.`;
  const features: MapFeature[] = kept.map((piece, index) => ({
    id: `paved-area-${index + 1}`,
    kind: "constraint",
    field: "paved_area_sqft",
    geometry: { type: "Polygon", coordinates: piece.coordinates.map((ring) => ring.map(([x, y]) => [x!, y!] as [number, number])) },
    label: "(E) PAVED PARKING AND DRIVES",
    attributes: {
      surface_kind: { type: "text", value: "paved_parking_and_drives" },
      area_sqft: { type: "quantity", value: Math.round(piece.sqm * SQFT_PER_SQM), unit: "sqft" },
      basis: { type: "text", value: "public map" },
      confidence_reason: { type: "text", value: reason },
    },
  }));
  const observations = [
    kept.length
      ? observe(result, ctx, { field: "paved_area_sqft", kind: "reading", value: { type: "quantity", value: totalSqft, unit: "sqft" }, attribute: config.coverAttribute, sourceDate: config.sourceDate, grade: "reference", reason })
      : observe(result, ctx, { field: "paved_area_sqft", kind: "no_value", value: null, attribute: config.coverAttribute, reason: "No impervious land cover is mapped on the lot outside the buildings and roads." }),
  ];
  return { observations, features, run: result.run };
}
