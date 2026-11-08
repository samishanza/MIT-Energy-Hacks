import type { LidarPoint } from "../ept.ts";

// Grid equipment found by shape in airborne lidar. USGS 3DEP labels ground, vegetation, and buildings but not
// poles or wires, and it often labels a pole beside a tree as vegetation and a wire as high noise. So each rule below
// is a geometric test, strict enough that a tree, a bush, a car, a light, or a rooftop unit fails it:
//
// - A pole is a compact top 8.5 to 15 m above ground, within 10 m of a public street's centerline, with no building
//   returns within 2 m, with its returns at mid-height packed into a single column, as a pole body is and a tree
//   crown isn't, and wired to another pole. It is placed at the centre of that column, not at its top return, which
//   is often a crossarm tip or the head of a leaning pole.
// - A wire is a thin layer of returns along the line between two poles 20 to 70 m apart, at the height of a
//   conductor hung between their tops, with little beside it. Canopy is thick and wide, so it isn't a wire.
// - A pole hidden in a tree's crown is found only between two poles on the same road, where the gap is about twice
//   the usual span, as a single column near the middle with wire running to both. Unless its own shape passes the
//   pole test, it is reported as inferred, not measured.
// - A service drop is a narrow, continuous run of returns from a pole to a wall, below the roof.
// - An equipment box is a flat-topped block 0.8 to 2.5 m tall and 0.8 to 3.2 m across, not tall vegetation, with
//   nothing overhanging, off the street, not car-sized, and not well inside a paved lot. Boxes are ranked by how
//   transformer-like they are.
// - A light pole is a compact head 4 to 13 m up over open ground, with only a thin column under it and no crown around.
// - A hydrant candidate is a small isolated object 0.5 to 1.1 m tall over open ground near a road or paved edge. The
//   lidar gives a hydrant only a return or two, so these are weak.
//
// Tuned against engineered plan sets for two Massachusetts sites, their 2025 orthophotos, and the 2021 lidar. Lights
// and hydrants under a tree's crown are missed, and every result is a detection to confirm.

type Point = [number, number];
// `street` is false for a road a distribution line doesn't follow, such as a parking-lot aisle or a service drive.
// Poles are looked for only along streets; every road still keeps equipment boxes off the pavement.
export type Road = { name: string; line: Point[]; onAddress: boolean; street?: boolean };
// `detection` is "measured" when the pole's own shape passed the pole test, and "inferred" when only the wires on
// either side and a column in a crown place it.
export type Pole = { at: Point; heightM: number; roadFeet: number; road: string; inCanopy: boolean; detection: "measured" | "inferred" };
export type Span = { from: Point; to: Point; returns: number; coverage: number; heightM: number; lengthM: number };
// A box found by shape. 3DEP often labels low equipment as low or medium vegetation, so the class doesn't decide;
// solidity, a flat top, and a filled rectangle do, and the tests it passed are kept.
export type PadMount = { at: Point; widthM: number; depthM: number; heightM: number; wallM: number; fill: number; singleReturns: number; topSpreadM: number; labelledVegetation: boolean; score: number };
// A light standard: a compact head 4 to 13 m up over open ground, with almost nothing under it but the thin pole.
export type LightPole = { at: Point; heightM: number; headReturns: number; headSpanM: number };
// A hydrant: a small, isolated object 0.4 to 1.2 m tall over open ground, near a road or drive.
// `roadM` is the distance to the nearest road centreline or paved edge.
export type Hydrant = { at: Point; heightM: number; returns: number; roadM: number };
export type Detection = {
  poles: Pole[];
  conductors: Span[];
  drop: (Span & { pole: Pole; wall: Point; roofM: number | null }) | null;
  padMounts: PadMount[];
  lightPoles: LightPole[];
  hydrants: Hydrant[];
};

// High noise (18) is kept, because 3DEP projects often put wire returns there, but it is read only as wire evidence.
const NOT_ABOVE_GROUND = new Set([2, 6, 7, 9]);
const HIGH_NOISE = 18;
const BUILDING = 6;
const VEGETATION = new Set([3, 4, 5]);
const FEET = 3.280839895;

// Wood distribution poles are mostly 30 to 45 ft long, set about 10% of their length plus 2 ft into the ground, so a
// 35 ft pole stands about 8.8 m and a 45 ft pole about 11.7 m, with crossarms and insulators a little higher; the
// taller 50 to 55 ft poles reach about 13 to 14.5 m. Below the band are street and parking-lot lights, signs, and the
// short service poles; above it are trees and transmission structures.
const POLE_TOP_MIN_M = 8.5;
const POLE_TOP_MAX_M = 15;
// A candidate with building returns this close is a roof corner, parapet, chimney, or rooftop unit.
const BUILDING_CLEARANCE_M = 2;
const BUILDING_RETURNS = 3;

// The thresholds of the box, light-pole, and hydrant rules, in metres unless named otherwise. The defaults are the
// tuned values; an evaluation run passes others to compare against plan sets.
export const DEFAULT_PARAMS = {
  box: {
    minHeightM: 0.8, maxHeightM: 2.5, minSizeM: 0.8, maxSizeM: 3.2, joinToleranceM: 0.35, maxTopSpreadM: 0.3,
    minFill: 0.5, minSingleReturns: 0.5, minWallM: 1, maxWallM: 40, streetClearanceM: 4, pavedDepthM: 1.5, typicalHeightM: 1.5,
  },
  light: {
    minTopM: 4, maxTopM: 13, headDepthM: 1.5, minHeadReturns: 3, maxHeadSpanM: 2.5, bodyFromM: 2.5, maxBodyExtentM: 1,
    ringRadiusM: 4, maxRingReturns: 4, minOpenShare: 0.4,
  },
  hydrant: {
    minTopM: 0.5, maxTopM: 1.1, maxRingReturns: 1, clearAboveM: 1.3, maxRoadM: 12, maxPavedEdgeM: 4, minOpenShare: 0.5,
  },
};
export type DetectorParams = typeof DEFAULT_PARAMS;

// Points bucketed by 1 m cell, for radius queries.
class Grid {
  private cells = new Map<number, number[]>();
  private xs: Float64Array;
  private ys: Float64Array;
  constructor(xs: Float64Array, ys: Float64Array) {
    this.xs = xs;
    this.ys = ys;
    for (let i = 0; i < xs.length; i++) {
      const key = Grid.key(Math.floor(xs[i]!), Math.floor(ys[i]!));
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(i);
      else this.cells.set(key, [i]);
    }
  }
  static key(i: number, j: number) {
    return (i + 50000) * 100000 + (j + 50000);
  }
  near(x: number, y: number, radius: number): number[] {
    const found: number[] = [];
    const r2 = radius * radius;
    for (let i = Math.floor(x - radius); i <= Math.floor(x + radius); i++) {
      for (let j = Math.floor(y - radius); j <= Math.floor(y + radius); j++) {
        for (const index of this.cells.get(Grid.key(i, j)) ?? []) {
          const dx = this.xs[index]! - x, dy = this.ys[index]! - y;
          if (dx * dx + dy * dy <= r2) found.push(index);
        }
      }
    }
    return found;
  }
}

// The ground surface as the lowest ground return in each 1 m cell, with gaps filled from neighbors.
function groundModel(points: LidarPoint[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const width = Math.floor(maxX - minX) + 1;
  const height = Math.floor(maxY - minY) + 1;
  let grid = new Float64Array(width * height).fill(NaN);
  for (const p of points) {
    if (p.classification !== 2) continue;
    const index = Math.floor(p.x - minX) * height + Math.floor(p.y - minY);
    if (!(grid[index]! <= p.z)) grid[index] = p.z;
  }
  for (let pass = 0; pass < 60; pass++) {
    let empty = 0;
    const next = grid.slice();
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        if (!Number.isNaN(grid[i * height + j]!)) continue;
        let sum = 0, count = 0;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= width || nj >= height) continue;
          const value = grid[ni * height + nj]!;
          if (!Number.isNaN(value)) { sum += value; count++; }
        }
        if (count) next[i * height + j] = sum / count;
        else empty++;
      }
    }
    grid = next;
    if (!empty) break;
  }
  return (x: number, y: number) => {
    const i = Math.min(width - 1, Math.max(0, Math.floor(x - minX)));
    const j = Math.min(height - 1, Math.max(0, Math.floor(y - minY)));
    return grid[i * height + j]!;
  };
}

function toSegment(p: Point, a: Point, b: Point): { distance: number; at: Point; direction: Point } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  const at: Point = [a[0] + t * dx, a[1] + t * dy];
  const norm = Math.sqrt(length) || 1;
  return { distance: Math.hypot(p[0] - at[0], p[1] - at[1]), at, direction: [dx / norm, dy / norm] };
}

function nearestOnLines(p: Point, lines: Point[][]): { distance: number; at: Point; line: number; direction: Point } {
  let best = { distance: Infinity, at: p, line: -1, direction: [1, 0] as Point };
  lines.forEach((line, index) => {
    for (let i = 1; i < line.length; i++) {
      const hit = toSegment(p, line[i - 1]!, line[i]!);
      if (hit.distance < best.distance) best = { ...hit, line: index };
    }
  });
  return best;
}

const offLine = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.hypot(dx, dy);
};
const along = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
};
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const insideRing = (p: Point, ring: Point[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

// `paved` holds the outer rings of paved parking and drives, in the same frame, when known. A box well inside one is
// a parked car, not equipment.
export function detectEquipment(points: LidarPoint[], buildings: Point[][], roads: Road[], paved: Point[][] = [], params: DetectorParams = DEFAULT_PARAMS): Detection {
  const { box: B, light: L, hydrant: H } = params;
  if (points.length === 0) return { poles: [], conductors: [], drop: null, padMounts: [], lightPoles: [], hydrants: [] };
  const ground = groundModel(points);
  const roadLines = roads.map((road) => road.line);
  const streets = roads.filter((road) => road.street !== false);
  const streetLines = streets.map((road) => road.line);

  // Everything above the ground that isn't ground, building, or water. High noise only counts as wire.
  const kept = points.filter((p) => !NOT_ABOVE_GROUND.has(p.classification));
  const xs = new Float64Array(kept.length), ys = new Float64Array(kept.length), hs = new Float64Array(kept.length);
  const noise = new Uint8Array(kept.length);
  kept.forEach((p, i) => { xs[i] = p.x; ys[i] = p.y; hs[i] = p.z - ground(p.x, p.y); noise[i] = p.classification === HIGH_NOISE ? 1 : 0; });
  const grid = new Grid(xs, ys);
  const at = (i: number): Point => [xs[i]!, ys[i]!];
  const within = (p: Point, radius: number, test: (h: number, i: number) => boolean) => grid.near(p[0], p[1], radius).filter((i) => !noise[i] && test(hs[i]!, i));
  const roofs = points.filter((p) => p.classification === BUILDING);
  const roofGrid = new Grid(Float64Array.from(roofs, (p) => p.x), Float64Array.from(roofs, (p) => p.y));
  const byBuilding = (p: Point) => roofGrid.near(p[0], p[1], BUILDING_CLEARANCE_M).length >= BUILDING_RETURNS;

  // A pole body: the returns from 3 m up, above cars and shrubs, to 2.5 m below the top, under the crossarms and the
  // pole-top equipment. Its centre comes from medians over shrinking circles that start at the top return, so a
  // crossarm tip or a leaning head 1 to 2 m away doesn't move it, and its position from the lower half of the body,
  // nearest the base. `filled` is the share of 1 m slices of the body with a return within 0.5 m of the centre.
  const describe = (i: number) => {
    const top = hs[i]!, p = at(i);
    const low = 3, high = top - 2.5;
    const body = (h: number) => h >= low && h <= high;
    let centre = p;
    for (const radius of [2.5, 1.2, 0.6]) {
      const near = within(centre, radius, body);
      if (near.length < 3) break;
      centre = [median(near.map((j) => xs[j]!))!, median(near.map((j) => ys[j]!))!];
    }
    const lower = within(centre, 0.6, (h) => h >= low && h <= (low + high) / 2);
    const base: Point = lower.length >= 3 ? [median(lower.map((j) => xs[j]!))!, median(lower.map((j) => ys[j]!))!] : centre;
    const slices = new Set(within(centre, 0.5, body).map((j) => Math.floor(hs[j]! - low)));
    const filled = slices.size / Math.max(1, Math.ceil(high - low));
    const ring = within(p, 4, (h, j) => h >= top - 2.5 && distance(at(j), p) >= 1.5).length;
    const head = within(p, 1.5, (h) => h >= top - 2);
    const hx = head.map((j) => xs[j]!), hy = head.map((j) => ys[j]!);
    const span = head.length > 1 ? Math.max(Math.max(...hx) - Math.min(...hx), Math.max(...hy) - Math.min(...hy)) : 0;
    const mid1 = within(centre, 1, body).length;
    const mid2 = within(centre, 2, body).length;
    return { top, at: base, ring, span, mid1, mid2, filled };
  };
  type Shape = ReturnType<typeof describe>;
  const poleShaped = (shape: Shape) => shape.ring <= 20 && shape.span <= 3 && shape.mid1 >= 10 && shape.mid2 <= 1.6 * shape.mid1;

  // Pole candidates: the local top within 3 m, at pole height, near a street, off the buildings, with a
  // single-column body.
  type Candidate = { index: number; at: Point; top: number; mid1: number; road: { distance: number; line: number; direction: Point } };
  const candidates: Candidate[] = [];
  for (let i = 0; i < kept.length; i++) {
    if (noise[i] || hs[i]! < POLE_TOP_MIN_M || hs[i]! > POLE_TOP_MAX_M) continue;
    const p = at(i);
    // The cheap tests first: near a street and off the buildings, then the local top.
    if (nearestOnLines(p, streetLines).distance > 10) continue;
    if (buildings.length && nearestOnLines(p, buildings).distance < 2) continue;
    if (byBuilding(p)) continue;
    if (within(p, 3, (h) => h > hs[i]! + 1e-6).length) continue;
    const shape = describe(i);
    if (!poleShaped(shape) || byBuilding(shape.at)) continue;
    const road = nearestOnLines(shape.at, streetLines);
    if (road.distance > 10) continue;
    candidates.push({ index: i, at: shape.at, top: shape.top, mid1: shape.mid1, road });
  }
  candidates.sort((a, b) => b.mid1 - a.mid1);
  const distinct: Candidate[] = [];
  for (const candidate of candidates) if (distinct.every((other) => distance(other.at, candidate.at) >= 4)) distinct.push(candidate);

  // Wire between two pole tops, read 2 m at a time from 1.5 m off each pole. A stretch holds wire when it has returns
  // within 1.6 m of the line (a crossarm spreads the phases about 1.2 m either side) at conductor height, between
  // 5 m below and 1 m above the straight line joining the two tops; when everything within 1.6 m of the line, from
  // 7 m below that line, falls in no more than five 0.5 m layers, as a few wires do and a crown's body doesn't; and
  // when fewer returns at conductor height lie 1.6 to 3.5 m off the line than on it. Canopy is thick and wide, so a
  // stretch that fails is canopy, and a thin stretch beside canopy is taken for the crown's edge rather than wire.
  // 3DEP often samples a wire with only a few returns per span, so the test counts thin stretches rather than asking
  // for an unbroken run.
  type Wire = Omit<Span, "from" | "to"> & { wireBins: number; canopyBins: number; bins: number };
  const wireBetween = (a: Point, topA: number, b: Point, topB: number): Wire => {
    const length = distance(a, b);
    const count = Math.max(1, Math.floor((length - 3) / 2));
    const bins = Array.from({ length: count }, () => ({ heights: [] as number[], layers: new Set<number>(), side: 0 }));
    for (const i of grid.near((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, length / 2 + 1)) {
      const s = along(at(i), a, b) * length;
      if (s < 1.5 || s >= length - 1.5) continue;
      const line = topA + ((topB - topA) * s) / length;
      const h = hs[i]!;
      if (h < Math.max(3, line - 7) || h > line + 1) continue;
      const bin = bins[Math.min(count - 1, Math.floor((s - 1.5) / 2))]!;
      const off = offLine(at(i), a, b);
      const conductor = h >= Math.max(4, line - 5);
      if (off < 1.6) {
        bin.layers.add(Math.floor(h * 2));
        if (conductor) bin.heights.push(h);
      } else if (off < 3.5 && conductor) bin.side++;
    }
    const state = bins.map((bin) => {
      if (bin.heights.length && bin.layers.size <= 5 && bin.side * 2 < bin.heights.length) return "wire";
      return bin.heights.length || bin.side >= 3 ? "canopy" : "empty";
    });
    const wire = state.flatMap((s, k) => (s === "wire" && state[k - 1] !== "canopy" && state[k + 1] !== "canopy" ? [k] : []));
    const heights = wire.flatMap((k) => bins[k]!.heights);
    return {
      returns: heights.length,
      coverage: wire.length / count,
      heightM: median(heights) ?? 0,
      lengthM: length,
      wireBins: wire.length,
      canopyBins: state.filter((s) => s === "canopy").length,
      bins: count,
    };
  };
  // Wired: wire in at least two stretches, and canopy along no more than half the span.
  const isWired = (wire: Wire) => wire.wireBins >= 2 && wire.returns >= 3 && wire.canopyBins <= 0.5 * wire.bins;
  const spanOf = (from: Point, to: Point, wire: Wire): Span => ({ from, to, returns: wire.returns, coverage: wire.coverage, heightM: wire.heightM, lengthM: wire.lengthM });

  const links: { a: number; b: number; span: Span }[] = [];
  for (let a = 0; a < distinct.length; a++) for (let b = a + 1; b < distinct.length; b++) {
    const A = distinct[a]!, B = distinct[b]!;
    const length = distance(A.at, B.at);
    if (length < 20 || length > 70) continue;
    const wire = wireBetween(A.at, A.top, B.at, B.top);
    if (isWired(wire)) links.push({ a, b, span: spanOf(A.at, B.at, wire) });
  }
  // A wire doesn't pass a pole it is strung to: where a wired pole stands on the line between two others, the long
  // link is the same conductor seen past it, and the span it hides is one canopy covered.
  const linked = (x: number, y: number) => links.some((l) => (l.a === x && l.b === y) || (l.a === y && l.b === x));
  const passes = (l: { a: number; b: number }) =>
    distinct.some((c, index) => {
      if (index === l.a || index === l.b) return false;
      const t = along(c.at, distinct[l.a]!.at, distinct[l.b]!.at);
      return t > 0.05 && t < 0.95 && offLine(c.at, distinct[l.a]!.at, distinct[l.b]!.at) < 2 && (linked(l.a, index) || linked(l.b, index));
    });
  const direct = links.filter((l) => !passes(l));
  // From each pole, only the nearest wired pole in each direction, so the line is a chain, not every pair.
  const chain = new Map<string, Span>();
  distinct.forEach((pole, index) => {
    const used: Point[] = [];
    for (const link of direct.filter((l) => l.a === index || l.b === index).sort((l, m) => l.span.lengthM - m.span.lengthM)) {
      const other = distinct[link.a === index ? link.b : link.a]!;
      const v: Point = [(other.at[0] - pole.at[0]) / link.span.lengthM, (other.at[1] - pole.at[1]) / link.span.lengthM];
      if (used.every((u) => u[0] * v[0] + u[1] * v[1] < 0.5)) {
        used.push(v);
        chain.set([link.a, link.b].sort().join("-"), link.span);
      }
    }
  });
  const wired = new Set([...chain.keys()].flatMap((key) => key.split("-").map(Number)));
  const roadOf = (c: Candidate) => streets[c.road.line];
  const measured = (c: Candidate): Pole => ({ at: c.at, heightM: c.top, roadFeet: Math.round(c.road.distance * FEET), road: roadOf(c)?.name ?? "a road", inCanopy: false, detection: "measured" });
  const poles: Pole[] = [...wired].map((index) => measured(distinct[index]!));
  const conductors: Span[] = [...chain.values()];

  // A pole hidden in a crown: between a wired pole and another pole on the same road, about twice the usual span
  // apart, a single column near the middle of the gap with wire running from it to both. The far pole is accepted
  // only through that tested wire.
  const spans = conductors.map((span) => span.lengthM).sort((a, b) => a - b);
  const usual = spans[Math.floor(spans.length / 2)] ?? 0;
  const wiredCandidates = [...wired].map((index) => distinct[index]!);
  for (let a = 0; a < wiredCandidates.length && usual; a++) for (const B of distinct) {
    const A = wiredCandidates[a]!;
    if (B === A || (wired.has(distinct.indexOf(B)) && distinct.indexOf(B) < distinct.indexOf(A))) continue;
    const length = distance(A.at, B.at);
    if (length < 1.6 * usual || length > 2.6 * usual) continue;
    const middle: Point = [(A.at[0] + B.at[0]) / 2, (A.at[1] + B.at[1]) / 2];
    const midRoad = nearestOnLines(middle, streetLines);
    const v: Point = [(B.at[0] - A.at[0]) / length, (B.at[1] - A.at[1]) / length];
    if (A.road.line !== B.road.line || midRoad.line !== A.road.line || Math.abs(v[0] * midRoad.direction[0] + v[1] * midRoad.direction[1]) < 0.94) continue;
    if (wiredCandidates.some((c) => c !== A && c !== B && along(c.at, A.at, B.at) > 0.1 && along(c.at, A.at, B.at) < 0.9 && offLine(c.at, A.at, B.at) < 8)) continue;
    // The highest return in each 1 m cell at pole height within 2 m of the line, near the middle; each is read as
    // the top of a column, and the most complete column, then the one nearest the middle, is the hidden pole.
    const tops = new Map<number, number>();
    for (const i of within(middle, length / 4, (h) => h >= POLE_TOP_MIN_M && h <= POLE_TOP_MAX_M)) {
      if (offLine(at(i), A.at, B.at) > 2) continue;
      const key = Grid.key(Math.floor(xs[i]!), Math.floor(ys[i]!));
      const held = tops.get(key);
      if (held === undefined || hs[i]! > hs[held]!) tops.set(key, i);
    }
    let best: Shape | null = null;
    for (const i of tops.values()) {
      const shape = describe(i);
      if (shape.span > 3 || shape.mid1 < 10 || shape.filled < 0.6 || byBuilding(shape.at)) continue;
      if (!best || shape.filled > best.filled || (shape.filled === best.filled && distance(shape.at, middle) < distance(best.at, middle))) best = shape;
    }
    if (!best) continue;
    const p = best.at;
    if (poles.some((pole) => distance(pole.at, p) < 4)) continue;
    const first = wireBetween(A.at, A.top, p, best.top), second = wireBetween(p, best.top, B.at, B.top);
    if (!isWired(first) || !isWired(second)) continue;
    const road = nearestOnLines(p, streetLines);
    poles.push({ at: p, heightM: best.top, roadFeet: Math.round(road.distance * FEET), road: streets[road.line]?.name ?? "a road", inCanopy: true, detection: poleShaped(best) ? "measured" : "inferred" });
    if (!poles.some((pole) => pole.at === B.at)) poles.push(measured(B));
    conductors.push(spanOf(A.at, p, first), spanOf(p, B.at, second));
  }


  // A service drop: a narrow, continuous run of returns from a wired pole to a wall point, below the roof.
  // Returns low to high up within width of the middle 70% of the line from a to b, in 2 m stretches.
  const corridor = (a: Point, b: Point, width: number, low: number, high: number) => {
    const length = distance(a, b);
    const bins = new Set<number>();
    const heights: number[] = [];
    let side = 0;
    for (const i of grid.near((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, length / 2 + 1)) {
      const h = hs[i]!;
      if (h < low || h > high) continue;
      const t = along(at(i), a, b);
      if (t <= 0.15 || t >= 0.85) continue;
      const off = offLine(at(i), a, b);
      if (off < width) { bins.add(Math.floor((t * length) / 2)); heights.push(h); }
      else if (off < 3) side++;
    }
    heights.sort((x, y) => x - y);
    return { returns: heights.length, side, coverage: bins.size / Math.max(1, Math.floor((length * 0.7) / 2)), heightM: heights[Math.floor(heights.length / 2)] ?? 0, lengthM: length };
  };
  const roofNear = (p: Point) => {
    const heights = roofs.filter((r) => Math.abs(r.x - p[0]) < 4 && Math.abs(r.y - p[1]) < 4).map((r) => r.z - ground(r.x, r.y)).sort((a, b) => a - b);
    return heights.length ? heights[Math.floor(heights.length / 2)]! : null;
  };
  const targets: Point[] = buildings.flatMap((ring) =>
    ring.slice(1).flatMap((end, index) => {
      const start = ring[index]!;
      const steps = Math.max(1, Math.floor(distance(start, end) / 2));
      return Array.from({ length: steps }, (_, step): Point => [start[0] + ((end[0] - start[0]) * step) / steps, start[1] + ((end[1] - start[1]) * step) / steps]);
    }),
  );
  let drop: Detection["drop"] = null;
  for (const pole of poles.filter((p) => !p.inCanopy && p.detection === "measured")) {
    for (const target of targets) {
      const length = distance(pole.at, target);
      if (length < 5 || length > 60) continue;
      const wire = corridor(pole.at, target, 0.6, 2.5, 14);
      if (wire.returns < 15 || wire.coverage < 0.5 || wire.side > 0.5 * wire.returns) continue;
      const roofM = roofNear(target);
      if (roofM !== null && wire.heightM > roofM + 0.5) continue;
      if (!drop || wire.coverage > drop.coverage) drop = { from: pole.at, to: target, ...wire, pole, wall: target, roofM };
    }
  }

  // Equipment boxes: a flat-topped block 0.8 to 2.5 m tall and 0.8 to 3.2 m across, filled out to a rectangle, with
  // nothing overhanging, not tall vegetation, mostly single returns, off the street, and not a parked car. 3DEP labels
  // most cabinets as low or medium vegetation, so the class doesn't reject a box. A car is the common look-alike: its roof is a flat block of the same height, so a box whose whole low
  // footprint is car-sized, or that sits well inside a paved lot, is dropped.
  const size = 0.5;
  const cellOf = (x: number, y: number) => Grid.key(Math.floor(x / size), Math.floor(y / size));
  const overhang = new Set<number>();
  type Cell = { i: number; j: number; tops: number; single: number; count: number; vegetation: number };
  const low = new Map<number, Cell>();
  kept.forEach((p, index) => {
    if (noise[index]) return;
    const h = hs[index]!;
    if (h > 2.8) overhang.add(cellOf(p.x, p.y));
    if (h < 0.4 || h > 2.6 || p.classification === 5) return;
    const key = cellOf(p.x, p.y);
    const cell = low.get(key) ?? { i: Math.floor(p.x / size), j: Math.floor(p.y / size), tops: 0, single: 0, count: 0, vegetation: 0 };
    cell.tops = Math.max(cell.tops, h);
    cell.count++;
    if (VEGETATION.has(p.classification)) cell.vegetation++;
    if ((p.returns ?? 1) === 1) cell.single++;
    low.set(key, cell);
  });
  // `joins` sees the group's mean top so far, so a block doesn't creep into a taller fence one step at a time.
  const flood = (start: Cell, joins: (meanTop: number, to: Cell) => boolean, seen: Set<number>) => {
    const group = [start];
    let sum = start.tops;
    seen.add(Grid.key(start.i, start.j));
    for (let k = 0; k < group.length; k++) {
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const next = Grid.key(group[k]!.i + di, group[k]!.j + dj);
        const cell = low.get(next);
        if (cell && !seen.has(next) && joins(sum / group.length, cell)) { seen.add(next); group.push(cell); sum += cell.tops; }
      }
    }
    return group;
  };
  // The extent of a group along its own long axis, so a car parked at an angle still measures 4.5 by 1.8 m.
  const extent = (group: Cell[]) => {
    const cx = group.reduce((s, c) => s + c.i, 0) / group.length, cy = group.reduce((s, c) => s + c.j, 0) / group.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const c of group) { sxx += (c.i - cx) ** 2; syy += (c.j - cy) ** 2; sxy += (c.i - cx) * (c.j - cy); }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const u: Point = [Math.cos(angle), Math.sin(angle)];
    const a = group.map((c) => (c.i - cx) * u[0] + (c.j - cy) * u[1]), b = group.map((c) => -(c.i - cx) * u[1] + (c.j - cy) * u[0]);
    return { long: (Math.max(...a) - Math.min(...a) + 1) * size, short: (Math.max(...b) - Math.min(...b) + 1) * size };
  };
  // Every low object, joined at any height, to measure its full footprint.
  const objectOf = new Map<number, { long: number; short: number }>();
  const anySeen = new Set<number>();
  for (const cell of low.values()) {
    if (anySeen.has(Grid.key(cell.i, cell.j))) continue;
    const object = flood(cell, () => true, anySeen);
    const shape = extent(object);
    for (const member of object) objectOf.set(Grid.key(member.i, member.j), shape);
  }
  const carSized = (shape: { long: number; short: number }) => shape.long >= 3.4 && shape.long <= 5.8 && shape.short >= 1.4 && shape.short <= 2.3;
  const deepInPaved = (p: Point) => paved.some((ring) => insideRing(p, ring) && nearestOnLines(p, [ring]).distance >= B.pavedDepthM);
  const seen = new Set<number>();
  const padMounts: PadMount[] = [];
  for (const [key, start] of low) {
    if (seen.has(key)) continue;
    // Only cells near the group's mean height join, so a cabinet stands apart from a taller generator or fence.
    const group = flood(start, (meanTop, to) => Math.abs(to.tops - meanTop) <= B.joinToleranceM, seen);
    if (group.length < 3) continue;
    const is = group.map((cell) => cell.i), js = group.map((cell) => cell.j);
    const widthM = (Math.max(...is) - Math.min(...is) + 1) * size;
    const depthM = (Math.max(...js) - Math.min(...js) + 1) * size;
    if (Math.min(widthM, depthM) < B.minSizeM || Math.max(widthM, depthM) > B.maxSizeM) continue;
    const tops = group.map((cell) => cell.tops).sort((a, b) => a - b);
    const heightM = tops[Math.floor(tops.length / 2)]!;
    const mean = tops.reduce((sum, t) => sum + t, 0) / tops.length;
    const spread = Math.sqrt(tops.reduce((sum, t) => sum + (t - mean) ** 2, 0) / tops.length);
    if (heightM < B.minHeightM || heightM > B.maxHeightM || spread > B.maxTopSpreadM) continue;
    const fill = group.length / ((Math.max(...is) - Math.min(...is) + 1) * (Math.max(...js) - Math.min(...js) + 1));
    if (fill < B.minFill) continue;
    const returns = group.reduce((sum, cell) => sum + cell.count, 0);
    const single = group.reduce((sum, cell) => sum + cell.single, 0) / returns;
    // A bush lets pulses through to the ground, so most of its returns are one of several; a cabinet's edges beside a
    // fence give some multiple returns too, so the bar is half.
    if (single < B.minSingleReturns) continue;
    const labelledVegetation = group.reduce((sum, cell) => sum + cell.vegetation, 0) / returns > 0.5;
    if (group.some((cell) => { for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) if (overhang.has(Grid.key(cell.i + di, cell.j + dj))) return true; return false; })) continue;
    if (group.some((cell) => carSized(objectOf.get(Grid.key(cell.i, cell.j))!))) continue;
    const middle: Point = [((Math.min(...is) + Math.max(...is) + 1) / 2) * size, ((Math.min(...js) + Math.max(...js) + 1) / 2) * size];
    if (deepInPaved(middle) || buildings.some((ring) => insideRing(middle, ring))) continue;
    const wall = buildings.length ? nearestOnLines(middle, buildings).distance : Infinity;
    if (wall < B.minWallM || wall > B.maxWallM) continue;
    if (streetLines.length && nearestOnLines(middle, streetLines).distance < B.streetClearanceM) continue;
    // Higher for a flatter, fuller, single-return block close to the building it feeds, and for one near 1.5 m tall,
    // the middle of the usual height of a three-phase pad-mounted cabinet.
    const score = fill + (1 - spread / B.maxTopSpreadM) + single + Math.max(0, 1 - wall / B.maxWallM) + Math.max(0, 1 - Math.abs(heightM - B.typicalHeightM) / 0.7);
    padMounts.push({ at: middle, widthM, depthM, heightM, wallM: wall, fill, singleReturns: single, topSpreadM: spread, labelledVegetation, score });
  }

  // Open ground: ground returns, for tests that need clear pavement or lawn around an object.
  const grounds = points.filter((p) => p.classification === 2);
  const groundGrid = new Grid(Float64Array.from(grounds, (p) => p.x), Float64Array.from(grounds, (p) => p.y));
  const open = (p: Point, radius: number) => groundGrid.near(p[0], p[1], radius).length;
  // Ground returns expected per square metre here, so the open-ground tests scale with the collection's density.
  // The median over the occupied 1 m cells, so wooded and built-over parts of the read don't dilute it.
  const groundCells = new Map<number, number>();
  for (const p of grounds) { const key = Grid.key(Math.floor(p.x), Math.floor(p.y)); groundCells.set(key, (groundCells.get(key) ?? 0) + 1); }
  const groundDensity = median([...groundCells.values()]) ?? 0;
  const nearWall = (p: Point, d: number) => buildings.length > 0 && nearestOnLines(p, buildings).distance < d;

  // Light standards: the head is the highest return within 2.5 m, 4 to 13 m up, no wider than a lamp on its arm;
  // what lies under it, from 2.5 m up (above a parked van), is a thin column (a pole) or nothing, where a crown fills
  // its depth and width; little stands from 2.5 m up to just over the head from 1.5 to 4 m around it (cars and people
  // are lower, and wires overhead are higher); and open ground is below.
  // A utility pole's top is reported as a pole. A flagpole passes too, so every result is a candidate.
  const lightPoles: LightPole[] = [];
  const extentOf = (indices: number[]) => {
    if (indices.length < 2) return 0;
    const ex = indices.map((j) => xs[j]!), ey = indices.map((j) => ys[j]!);
    return Math.max(Math.max(...ex) - Math.min(...ex), Math.max(...ey) - Math.min(...ey));
  };
  for (let i = 0; i < kept.length; i++) {
    const top = hs[i]!;
    if (noise[i] || top < L.minTopM || top > L.maxTopM) continue;
    const p = at(i);
    if (nearWall(p, 1.5) || byBuilding(p) || buildings.some((ring) => insideRing(p, ring))) continue;
    if (within(p, 2.5, (h) => h > top + 1e-6).length) continue;
    const head = within(p, 1.5, (h) => h >= top - L.headDepthM);
    if (head.length < L.minHeadReturns) continue;
    const headSpanM = extentOf(head);
    if (headSpanM > L.maxHeadSpanM) continue;
    if (extentOf(within(p, 1.5, (h) => h >= L.bodyFromM && h < top - L.headDepthM)) > L.maxBodyExtentM) continue;
    if (within(p, L.ringRadiusM, (h, j) => h >= 2.5 && h <= top + 1 && distance(at(j), p) > 1.5).length > L.maxRingReturns) continue;
    if (open(p, 2) < L.minOpenShare * groundDensity * Math.PI * 4) continue;
    const centre: Point = [median(head.map((j) => xs[j]!))!, median(head.map((j) => ys[j]!))!];
    if (poles.some((pole) => distance(pole.at, centre) < 3) || lightPoles.some((light) => distance(light.at, centre) < 4)) continue;
    lightPoles.push({ at: centre, heightM: top, headReturns: head.length, headSpanM });
  }

  // Hydrant candidates: the top of a return group 0.5 to 1.1 m up (a hydrant's bonnet is about 0.6 to 0.9 m up; at
  // 3DEP density it often gives a single return), at most one other return above 0.25 m from 0.5 to 1.5 m around, nothing above 1.3 m within 1.5 m (a sign or
  // light on its post, or a branch overhead), open ground around, off and outside the buildings, and within 12 m of
  // a road or drive or 4 m of a paved lot's edge. Posts, bollards, small shrubs, and stray returns pass too, so these are weak candidates.
  const hydrants: Hydrant[] = [];
  const insideBuilding = (p: Point) => buildings.some((ring) => insideRing(p, ring));
  for (let i = 0; i < kept.length; i++) {
    const h0 = hs[i]!;
    if (noise[i] || h0 < H.minTopM || h0 > H.maxTopM) continue;
    const p = at(i);
    const body = within(p, 0.35, (h) => h >= 0.3 && h <= 1.2);
    if (body.some((j) => hs[j]! > h0)) continue;
    if (within(p, 1.5, (h, j) => h > 0.25 && distance(at(j), p) > 0.5).length > H.maxRingReturns) continue;
    if (within(p, 1.5, (h) => h > H.clearAboveM).length) continue;
    if (nearWall(p, 1.5) || byBuilding(p) || insideBuilding(p)) continue;
    // Beside a street or drive centreline, or at the edge of a paved lot.
    const road = roadLines.length ? nearestOnLines(p, roadLines).distance : Infinity;
    const edge = paved.length ? nearestOnLines(p, paved).distance : Infinity;
    if (road > H.maxRoadM && edge > H.maxPavedEdgeM) continue;
    if (open(p, 1.5) < H.minOpenShare * groundDensity * Math.PI * 2.25) continue;
    const centre: Point = [median(body.map((j) => xs[j]!))!, median(body.map((j) => ys[j]!))!];
    if (hydrants.some((other) => distance(other.at, centre) < 3)) continue;
    hydrants.push({ at: centre, heightM: h0, returns: body.length, roadM: Math.min(road, edge) });
  }

  return { poles, conductors, drop, padMounts: padMounts.sort((a, b) => b.score - a.score).slice(0, 5), lightPoles, hydrants };
}
