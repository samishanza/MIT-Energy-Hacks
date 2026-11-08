import type { LidarPoint } from "../ept.ts";

// Grid equipment found by shape in airborne lidar. USGS 3DEP labels ground, vegetation, and buildings but not
// poles or wires, and it often labels a pole beside a tree as vegetation. So each rule below is a geometric test,
// strict enough that a tree, a bush, a car, or a rooftop unit fails it:
//
// - A pole is a compact top 8.5 m or more above ground, within 10 m of a road centerline, with its returns at
//   mid-height packed into a single column, as a pole body is and a tree crown isn't, and wired to another pole.
// - A wire is a run of returns along the straight line between two poles 20 to 70 m apart.
// - A pole hidden in a tree's crown is found only between two wired poles on the same road, where the gap is
//   about twice the usual span, as the tallest compact top on the line near the middle.
// - A service drop is a narrow, continuous run of returns from a pole to a wall, below the roof.
// - An equipment box is a solid, flat-topped object 1 to 2.4 m tall and 1 to 3 m across, not vegetation, mostly
//   single returns, with nothing overhanging, away from walls and roads.
//
// Tuned against one supplied engineered plan set and the 2025 orthophoto, where it finds every pole on the
// frontage and reports nothing false. It can still miss equipment, and every result is a detection to confirm.

type Point = [number, number];
export type Road = { name: string; line: Point[]; onAddress: boolean };
export type Pole = { at: Point; heightM: number; roadFeet: number; road: string; inCanopy: boolean };
export type Span = { from: Point; to: Point; returns: number; coverage: number; heightM: number; lengthM: number };
export type PadMount = { at: Point; widthM: number; depthM: number; heightM: number; wallM: number };
export type Detection = { poles: Pole[]; conductors: Span[]; drop: (Span & { pole: Pole; wall: Point; roofM: number | null }) | null; padMounts: PadMount[] };

const NOT_ABOVE_GROUND = new Set([2, 6, 7, 9, 18]);
const VEGETATION = new Set([3, 4, 5]);
const FEET = 3.280839895;

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

export function detectEquipment(points: LidarPoint[], buildings: Point[][], roads: Road[]): Detection {
  if (points.length === 0) return { poles: [], conductors: [], drop: null, padMounts: [] };
  const ground = groundModel(points);
  const roadLines = roads.map((road) => road.line);

  // Everything above the ground that isn't ground, building, noise, or water.
  const kept = points.filter((p) => !NOT_ABOVE_GROUND.has(p.classification));
  const xs = new Float64Array(kept.length), ys = new Float64Array(kept.length), hs = new Float64Array(kept.length);
  kept.forEach((p, i) => { xs[i] = p.x; ys[i] = p.y; hs[i] = p.z - ground(p.x, p.y); });
  const grid = new Grid(xs, ys);
  const at = (i: number): Point => [xs[i]!, ys[i]!];
  const within = (p: Point, radius: number, test: (h: number, i: number) => boolean) => grid.near(p[0], p[1], radius).filter((i) => test(hs[i]!, i));

  const describe = (i: number) => {
    const top = hs[i]!, p = at(i);
    const ring = within(p, 4, (h, j) => h >= top - 2.5 && distance(at(j), p) >= 1.5).length;
    const head = within(p, 1.5, (h) => h >= top - 2);
    const hx = head.map((j) => xs[j]!), hy = head.map((j) => ys[j]!);
    const span = head.length > 1 ? Math.max(Math.max(...hx) - Math.min(...hx), Math.max(...hy) - Math.min(...hy)) : 0;
    const mid1 = within(p, 1, (h) => h >= 3 && h <= top - 2.5).length;
    const mid2 = within(p, 2, (h) => h >= 3 && h <= top - 2.5).length;
    return { top, ring, span, mid1, mid2 };
  };

  // Pole candidates: the local top within 3 m, near a road, off the buildings, with a single-column body.
  type Candidate = { index: number; at: Point; top: number; mid1: number; road: { distance: number; line: number; direction: Point } };
  const candidates: Candidate[] = [];
  for (let i = 0; i < kept.length; i++) {
    if (hs[i]! < 8.5 || hs[i]! > 25) continue;
    const p = at(i);
    // The cheap tests first: near a road and off the buildings, then the local top.
    const road = nearestOnLines(p, roadLines);
    if (road.distance > 10) continue;
    if (buildings.length && nearestOnLines(p, buildings).distance < 2) continue;
    if (within(p, 3, (h) => h > hs[i]! + 1e-6).length) continue;
    const shape = describe(i);
    if (shape.ring > 20 || shape.span > 3 || shape.mid1 < 10 || shape.mid2 > 1.6 * shape.mid1) continue;
    candidates.push({ index: i, at: p, top: shape.top, mid1: shape.mid1, road });
  }
  candidates.sort((a, b) => b.mid1 - a.mid1);
  const distinct: Candidate[] = [];
  for (const candidate of candidates) if (distinct.every((other) => distance(other.at, candidate.at) >= 4)) distinct.push(candidate);

  // Wires: returns 4 to 15 m up along the middle of the line between two poles.
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
  const links: { a: number; b: number; span: Span }[] = [];
  for (let a = 0; a < distinct.length; a++) for (let b = a + 1; b < distinct.length; b++) {
    const length = distance(distinct[a]!.at, distinct[b]!.at);
    if (length < 20 || length > 70) continue;
    const wire = corridor(distinct[a]!.at, distinct[b]!.at, 0.8, 4, Math.max(distinct[a]!.top, distinct[b]!.top) + 1);
    if (wire.coverage >= 0.25 && wire.returns >= 10) links.push({ a, b, span: { from: distinct[a]!.at, to: distinct[b]!.at, ...wire } });
  }
  // From each pole, only the nearest wired pole in each direction, so the line is a chain, not every pair.
  const chain = new Map<string, Span>();
  distinct.forEach((pole, index) => {
    const used: Point[] = [];
    for (const link of links.filter((l) => l.a === index || l.b === index).sort((l, m) => l.span.lengthM - m.span.lengthM)) {
      const other = distinct[link.a === index ? link.b : link.a]!;
      const v: Point = [(other.at[0] - pole.at[0]) / link.span.lengthM, (other.at[1] - pole.at[1]) / link.span.lengthM];
      if (used.every((u) => u[0] * v[0] + u[1] * v[1] < 0.5)) {
        used.push(v);
        chain.set([link.a, link.b].sort().join("-"), link.span);
      }
    }
  });
  const wired = new Set([...chain.keys()].flatMap((key) => key.split("-").map(Number)));
  const roadOf = (c: Candidate) => roads[c.road.line];
  const poles: Pole[] = [...wired].map((index) => {
    const c = distinct[index]!;
    return { at: c.at, heightM: c.top, roadFeet: Math.round(c.road.distance * FEET), road: roadOf(c)?.name ?? "a road", inCanopy: false };
  });
  const conductors: Span[] = [...chain.values()];

  // A pole hidden in a crown: between a wired pole and another pole on the same road, about twice the usual span
  // apart, with wire returns across the gap. The far pole is accepted with it.
  const spans = conductors.map((span) => span.lengthM).sort((a, b) => a - b);
  const usual = spans[Math.floor(spans.length / 2)] ?? 0;
  const wiredCandidates = [...wired].map((index) => distinct[index]!);
  for (let a = 0; a < wiredCandidates.length && usual; a++) for (const B of distinct) {
    const A = wiredCandidates[a]!;
    if (B === A || (wired.has(distinct.indexOf(B)) && distinct.indexOf(B) < distinct.indexOf(A))) continue;
    const length = distance(A.at, B.at);
    if (length < 1.6 * usual || length > 2.6 * usual) continue;
    const across = corridor(A.at, B.at, 0.8, 4, Math.max(A.top, B.top) + 1);
    if (across.coverage < 0.25) continue;
    const middle: Point = [(A.at[0] + B.at[0]) / 2, (A.at[1] + B.at[1]) / 2];
    const midRoad = nearestOnLines(middle, roadLines);
    const v: Point = [(B.at[0] - A.at[0]) / length, (B.at[1] - A.at[1]) / length];
    if (A.road.line !== B.road.line || midRoad.line !== A.road.line || Math.abs(v[0] * midRoad.direction[0] + v[1] * midRoad.direction[1]) < 0.94) continue;
    if (wiredCandidates.some((c) => c !== A && c !== B && along(c.at, A.at, B.at) > 0.1 && along(c.at, A.at, B.at) < 0.9 && offLine(c.at, A.at, B.at) < 8)) continue;
    let best = -1;
    for (const i of grid.near(middle[0], middle[1], length / 4)) {
      if (hs[i]! < 9 || offLine(at(i), A.at, B.at) > 2) continue;
      if (best < 0 || hs[i]! > hs[best]!) best = i;
    }
    if (best < 0 || describe(best).span > 3) continue;
    const p = at(best);
    if (poles.some((pole) => distance(pole.at, p) < 4)) continue;
    poles.push({ at: p, heightM: hs[best]!, roadFeet: Math.round(midRoad.distance * FEET), road: roads[midRoad.line]?.name ?? "a road", inCanopy: true });
    if (!poles.some((pole) => pole.at === B.at)) poles.push({ at: B.at, heightM: B.top, roadFeet: Math.round(B.road.distance * FEET), road: roadOf(B)?.name ?? "a road", inCanopy: false });
    const first = corridor(A.at, p, 0.8, 4, hs[best]! + 1), second = corridor(p, B.at, 0.8, 4, hs[best]! + 1);
    conductors.push({ from: A.at, to: p, ...first }, { from: p, to: B.at, ...second });
  }

  // A service drop: a narrow, continuous run of returns from a wired pole to a wall point, below the roof.
  const roofs = points.filter((p) => p.classification === 6);
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
  for (const pole of poles.filter((p) => !p.inCanopy)) {
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

  // Equipment boxes: solid and flat-topped, not vegetation, nothing overhanging, away from walls and roads.
  const size = 0.5;
  const cellOf = (x: number, y: number) => Grid.key(Math.floor(x / size), Math.floor(y / size));
  const overhang = new Set<number>();
  const low = new Map<number, { i: number; j: number; tops: number; single: number; count: number }>();
  kept.forEach((p, index) => {
    const h = hs[index]!;
    if (h > 2.8) overhang.add(cellOf(p.x, p.y));
    if (h < 0.6 || h > 2.6 || VEGETATION.has(p.classification)) return;
    const key = cellOf(p.x, p.y);
    const cell = low.get(key) ?? { i: Math.floor(p.x / size), j: Math.floor(p.y / size), tops: 0, single: 0, count: 0 };
    cell.tops = Math.max(cell.tops, h);
    cell.count++;
    if ((p.returns ?? 1) === 1) cell.single++;
    low.set(key, cell);
  });
  const seen = new Set<number>();
  const padMounts: PadMount[] = [];
  for (const [key, start] of low) {
    if (seen.has(key)) continue;
    const group = [start];
    seen.add(key);
    for (let k = 0; k < group.length; k++) {
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const next = Grid.key(group[k]!.i + di, group[k]!.j + dj);
        const cell = low.get(next);
        if (cell && !seen.has(next)) { seen.add(next); group.push(cell); }
      }
    }
    if (group.length < 4) continue;
    const is = group.map((cell) => cell.i), js = group.map((cell) => cell.j);
    const widthM = (Math.max(...is) - Math.min(...is) + 1) * size;
    const depthM = (Math.max(...js) - Math.min(...js) + 1) * size;
    if (widthM < 1 || depthM < 1 || widthM > 3 || depthM > 3) continue;
    const tops = group.map((cell) => cell.tops).sort((a, b) => a - b);
    const heightM = tops[Math.floor(tops.length / 2)]!;
    const mean = tops.reduce((sum, t) => sum + t, 0) / tops.length;
    const spread = Math.sqrt(tops.reduce((sum, t) => sum + (t - mean) ** 2, 0) / tops.length);
    if (heightM < 1 || heightM > 2.4 || spread > 0.3) continue;
    const single = group.reduce((sum, cell) => sum + cell.single, 0) / group.reduce((sum, cell) => sum + cell.count, 0);
    if (single < 0.8) continue;
    if (group.some((cell) => { for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) if (overhang.has(Grid.key(cell.i + di, cell.j + dj))) return true; return false; })) continue;
    const middle: Point = [((Math.min(...is) + Math.max(...is) + 1) / 2) * size, ((Math.min(...js) + Math.max(...js) + 1) / 2) * size];
    const wall = buildings.length ? nearestOnLines(middle, buildings).distance : Infinity;
    if (wall < 3 || wall > 40) continue;
    if (roadLines.length && nearestOnLines(middle, roadLines).distance < 5) continue;
    padMounts.push({ at: middle, widthM, depthM, heightM, wallM: wall });
  }
  return { poles, conductors, drop, padMounts: padMounts.sort((a, b) => a.wallM - b.wallM).slice(0, 5) };
}
