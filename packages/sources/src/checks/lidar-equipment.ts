import type { LidarPoint } from "../ept.ts";

// Detection from 3DEP lidar, which classifies ground, vegetation, buildings, and water but not wires or poles.
// Poles are found by shape: a tall, thin column with open air around it. Conductors are elevated returns strung
// between two poles. Every result is a detection to confirm, never a surveyed location.

type Point = [number, number];
export type Road = { name: string; line: Point[]; onAddress: boolean };
export type Pole = { at: Point; low: number; high: number; returns: number; roadFeet: number; road: string };
export type Span = { from: Point; to: Point; returns: number; coverage: number; heightM: number; lengthM: number };
export type PadMount = { at: Point; widthM: number; depthM: number; heightM: number; wallM: number };
export type Detection = { poles: Pole[]; conductors: Span[]; drop: (Span & { pole: Pole; wall: Point }) | null; padMounts: PadMount[] };

const NOT_ABOVE_GROUND = new Set([2, 6, 7, 9, 18]);
const FEET = 3.280839895;

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
  for (let pass = 0; pass < 40; pass++) {
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

function toSegment(p: Point, a: Point, b: Point): { distance: number; at: Point } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  const at: Point = [a[0] + t * dx, a[1] + t * dy];
  return { distance: Math.hypot(p[0] - at[0], p[1] - at[1]), at };
}

function nearestOnLines(p: Point, lines: Point[][]): { distance: number; at: Point } {
  let best = { distance: Infinity, at: p };
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const hit = toSegment(p, line[i - 1]!, line[i]!);
    if (hit.distance < best.distance) best = hit;
  }
  return best;
}

type Elevated = { x: number; y: number; h: number };

// Returns in a narrow corridor between two points, away from both ends, and how much of its length they cover.
function corridor(elevated: Elevated[], from: Point, to: Point, width: number): Omit<Span, "from" | "to"> {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const bins = new Set<number>();
  const heights: number[] = [];
  for (const p of elevated) {
    const t = ((p.x - from[0]) * dx + (p.y - from[1]) * dy) / (length * length);
    if (t <= 0.1 || t >= 0.9) continue;
    if (Math.abs((p.x - from[0]) * dy - (p.y - from[1]) * dx) / length >= width) continue;
    bins.add(Math.floor((t * length) / 2));
    heights.push(p.h);
  }
  heights.sort((a, b) => a - b);
  return { returns: heights.length, coverage: bins.size / Math.max(1, Math.floor((length * 0.8) / 2)), heightM: heights[Math.floor(heights.length / 2)] ?? 0, lengthM: length };
}

export function detectEquipment(points: LidarPoint[], buildings: Point[][], roads: Road[]): Detection {
  if (points.length === 0) return { poles: [], conductors: [], drop: null, padMounts: [] };
  const ground = groundModel(points);
  const above: Elevated[] = [];
  for (const p of points) {
    if (NOT_ABOVE_GROUND.has(p.classification)) continue;
    const h = p.z - ground(p.x, p.y);
    if (h > 0.5 && h < 25) above.push({ x: p.x, y: p.y, h });
  }

  // Half-metre columns: count, lowest and highest return.
  const size = 0.5;
  const cells = new Map<string, { n: number; low: number; high: number; i: number; j: number }>();
  for (const p of above) {
    if (p.h < 1) continue;
    const i = Math.floor(p.x / size), j = Math.floor(p.y / size);
    const key = `${i},${j}`;
    const cell = cells.get(key);
    if (cell) { cell.n++; cell.low = Math.min(cell.low, p.h); cell.high = Math.max(cell.high, p.h); }
    else cells.set(key, { n: 1, low: p.h, high: p.h, i, j });
  }
  const columns: { at: Point; low: number; high: number; n: number }[] = [];
  for (const cell of cells.values()) {
    if (cell.high - cell.low < 4 || cell.high < 6 || cell.n < 4) continue;
    // A pole has open air 1.5 to 3 m around it. A tree has canopy there.
    let ring = 0;
    for (let di = -6; di <= 6; di++) for (let dj = -6; dj <= 6; dj++) {
      const r = Math.hypot(di, dj) * size;
      if (r < 1.5 || r > 3) continue;
      const near = cells.get(`${cell.i + di},${cell.j + dj}`);
      if (near && near.high > 3) ring += near.n;
    }
    if (ring <= cell.n * 0.6) columns.push({ at: [(cell.i + 0.5) * size, (cell.j + 0.5) * size], low: cell.low, high: cell.high, n: cell.n });
  }
  // One pole per 1.5 m, and only along a road, where utility poles stand.
  const roadLines = roads.map((road) => road.line);
  const poles: Pole[] = [];
  for (const column of columns.sort((a, b) => b.n - a.n)) {
    if (poles.some((pole) => Math.hypot(pole.at[0] - column.at[0], pole.at[1] - column.at[1]) < 1.5)) continue;
    let best = { distance: Infinity, road: "" };
    for (const road of roads) {
      const hit = nearestOnLines(column.at, [road.line]);
      if (hit.distance < best.distance) best = { distance: hit.distance, road: road.name };
    }
    if (best.distance > 20) continue;
    poles.push({ at: column.at, low: column.low, high: column.high, returns: column.n, roadFeet: Math.round(best.distance * FEET), road: best.road });
  }

  // Conductors: elevated returns 4 to 13 m up, strung between two poles 20 to 100 m apart.
  const wires = above.filter((p) => p.h > 4 && p.h < 13);
  const conductors: Span[] = [];
  for (let a = 0; a < poles.length; a++) for (let b = a + 1; b < poles.length; b++) {
    const length = Math.hypot(poles[a]!.at[0] - poles[b]!.at[0], poles[a]!.at[1] - poles[b]!.at[1]);
    if (length < 20 || length > 100) continue;
    const span = corridor(wires, poles[a]!.at, poles[b]!.at, 0.6);
    if (span.coverage >= 0.3 && span.returns >= 20) conductors.push({ from: poles[a]!.at, to: poles[b]!.at, ...span });
  }

  // A service drop: returns strung from a pole to some point on a wall within 80 m. Points every 2 m along
  // each wall are tried, since a drop lands where the service enters, not at the nearest corner.
  const low = wires.concat(above.filter((p) => p.h >= 3 && p.h <= 4));
  const targets: Point[] = buildings.flatMap((ring) =>
    ring.slice(1).flatMap((end, index) => {
      const start = ring[index]!;
      const steps = Math.max(1, Math.floor(Math.hypot(end[0] - start[0], end[1] - start[1]) / 2));
      return Array.from({ length: steps }, (_, step): Point => [start[0] + ((end[0] - start[0]) * step) / steps, start[1] + ((end[1] - start[1]) * step) / steps]);
    }),
  );
  let drop: Detection["drop"] = null;
  for (const pole of poles) {
    const nearby = low.filter((p) => Math.hypot(p.x - pole.at[0], p.y - pole.at[1]) <= 82);
    for (const target of targets) {
      const length = Math.hypot(target[0] - pole.at[0], target[1] - pole.at[1]);
      if (length < 3 || length > 80) continue;
      const span = corridor(nearby, pole.at, target, 0.8);
      const better = !drop || span.coverage > drop.coverage || (span.coverage === drop.coverage && span.returns > drop.returns);
      if (span.coverage >= 0.25 && span.returns >= 20 && better) drop = { from: pole.at, to: target, ...span, pole, wall: target };
    }
  }

  // Pad-mount transformers: a box about 1 to 2.4 m tall and 1 to 3.5 m across, open above, within 25 m of a wall.
  const box = new Map<string, { i: number; j: number; top: number }>();
  const covered = new Set<string>();
  for (const p of above) {
    const key = `${Math.floor(p.x / size)},${Math.floor(p.y / size)}`;
    if (p.h > 2.8) covered.add(key);
    else if (p.h >= 0.6) {
      const cell = box.get(key);
      if (cell) cell.top = Math.max(cell.top, p.h);
      else box.set(key, { i: Math.floor(p.x / size), j: Math.floor(p.y / size), top: p.h });
    }
  }
  for (const key of covered) box.delete(key);
  const seen = new Set<string>();
  const padMounts: PadMount[] = [];
  for (const [key, start] of box) {
    if (seen.has(key)) continue;
    const group = [start];
    seen.add(key);
    for (let k = 0; k < group.length; k++) {
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const next = `${group[k]!.i + di},${group[k]!.j + dj}`;
        const cell = box.get(next);
        if (cell && !seen.has(next)) { seen.add(next); group.push(cell); }
      }
    }
    const is = group.map((cell) => cell.i), js = group.map((cell) => cell.j);
    const widthM = (Math.max(...is) - Math.min(...is) + 1) * size;
    const depthM = (Math.max(...js) - Math.min(...js) + 1) * size;
    const tops = group.map((cell) => cell.top).sort((a, b) => a - b);
    const heightM = tops[Math.floor(tops.length / 2)]!;
    if (widthM < 1 || depthM < 1 || widthM > 3.5 || depthM > 3.5 || heightM < 1 || heightM > 2.4 || group.length < 4) continue;
    const at: Point = [((Math.min(...is) + Math.max(...is) + 1) / 2) * size, ((Math.min(...js) + Math.max(...js) + 1) / 2) * size];
    const wall = nearestOnLines(at, buildings);
    if (wall.distance > 25) continue;
    // Not on a road, where a box this size is usually a vehicle.
    if (nearestOnLines(at, roadLines).distance < 5) continue;
    padMounts.push({ at, widthM, depthM, heightM, wallM: wall.distance });
  }
  return { poles, conductors, drop, padMounts: padMounts.sort((a, b) => a.wallM - b.wallM).slice(0, 5) };
}
