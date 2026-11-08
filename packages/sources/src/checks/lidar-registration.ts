import type { LidarPoint } from "../ept.ts";

// A per-site horizontal shift between the lidar and the map's building outlines. The lidar and the outlines come from
// different flights, datums, and reprojections, and at 79 Lowland St the lidar sat about 1 m off the MassGIS roofprint,
// which moved every detected pole by as much. The shift is the offset that puts the most building returns (class 6)
// inside the outlines and the fewest in a 1.5 m band just outside them: a grid search over ±3 m in 0.25 m steps, then
// a 0.0625 m search around the best. It is applied only when the outlines hold enough returns near their edges, the
// fit is clearly better than no shift, and the best shift isn't at the edge of the search.

type Point = [number, number];
// The lidar sits (dx, dy) metres east and north of the map; subtracting it puts a lidar position in the map frame.
export type Registration = { dx: number; dy: number; applied: boolean; returns: number; gain: number; reason: string };

const BUILDING = 6;
const CELL = 0.125;
const SEARCH = 3;
const COARSE = 0.25;
const FINE = 0.0625;
const BAND = 1.5;
// Building returns within reach of an outline's edge, below which a fit says little.
const MIN_RETURNS = 300;
// The best shift must score this share of those returns above no shift: one return in twenty-five changed sides.
const MIN_GAIN = 0.04;
// A shift this small is within the lidar's own spacing and isn't worth moving everything for.
const MIN_SHIFT = 0.2;
// More than this across and the buildings are too far apart to fit together; the largest is used alone.
const MAX_EXTENT = 400;

const areaOf = (ring: Point[]) => Math.abs(ring.reduce((sum, [x, y], i) => { const [nx, ny] = ring[(i + 1) % ring.length]!; return sum + x * ny - nx * y; }, 0)) / 2;

const none = (reason: string, returns = 0, gain = 0): Registration => ({ dx: 0, dy: 0, applied: false, returns, gain, reason });

// Two-pass chamfer distance, in cells, from every cell to the nearest cell where `source` is set.
function distanceFrom(source: Uint8Array, width: number, height: number): Float32Array {
  const d = new Float32Array(width * height).fill(Infinity);
  for (let k = 0; k < d.length; k++) if (source[k]) d[k] = 0;
  const diagonal = Math.SQRT2;
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const k = j * width + i;
    if (i > 0) d[k] = Math.min(d[k]!, d[k - 1]! + 1);
    if (j > 0) {
      d[k] = Math.min(d[k]!, d[k - width]! + 1);
      if (i > 0) d[k] = Math.min(d[k]!, d[k - width - 1]! + diagonal);
      if (i < width - 1) d[k] = Math.min(d[k]!, d[k - width + 1]! + diagonal);
    }
  }
  for (let j = height - 1; j >= 0; j--) for (let i = width - 1; i >= 0; i--) {
    const k = j * width + i;
    if (i < width - 1) d[k] = Math.min(d[k]!, d[k + 1]! + 1);
    if (j < height - 1) {
      d[k] = Math.min(d[k]!, d[k + width]! + 1);
      if (i < width - 1) d[k] = Math.min(d[k]!, d[k + width + 1]! + diagonal);
      if (i > 0) d[k] = Math.min(d[k]!, d[k + width - 1]! + diagonal);
    }
  }
  return d;
}

// Estimates the shift from the lidar's building returns and the map's building outlines, both in local metres.
export function estimateShift(points: LidarPoint[], outlines: Point[][]): Registration {
  const rings = outlines.filter((ring) => ring.length >= 4).sort((a, b) => areaOf(b) - areaOf(a)).slice(0, 2);
  if (!rings.length) return none("no building outline to fit the lidar to");
  const bounds = (list: Point[][]) => {
    const all = list.flat();
    return [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))] as const;
  };
  let used = rings;
  let [minX, minY, maxX, maxY] = bounds(used);
  if (maxX - minX > MAX_EXTENT || maxY - minY > MAX_EXTENT) { used = rings.slice(0, 1); [minX, minY, maxX, maxY] = bounds(used); }
  const margin = SEARCH + BAND + 1;
  const x0 = minX - margin, y0 = minY - margin;
  const width = Math.ceil((maxX - minX + 2 * margin) / CELL), height = Math.ceil((maxY - minY + 2 * margin) / CELL);

  // The outlines filled into cells by scanline, even-odd across every ring.
  const inside = new Uint8Array(width * height);
  const edges = used.flatMap((ring) => ring.map((a, i) => [a, ring[(i + 1) % ring.length]!] as const));
  for (let j = 0; j < height; j++) {
    const y = y0 + (j + 0.5) * CELL;
    const crossings = edges.filter(([a, b]) => (a[1] > y) !== (b[1] > y)).map(([a, b]) => a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])).sort((a, b) => a - b);
    for (let c = 0; c + 1 < crossings.length; c += 2) {
      const from = Math.max(0, Math.ceil((crossings[c]! - x0) / CELL - 0.5)), to = Math.min(width - 1, Math.floor((crossings[c + 1]! - x0) / CELL - 0.5));
      for (let i = from; i <= to; i++) inside[j * width + i] = 1;
    }
  }
  const outside = inside.map((v) => 1 - v);
  const toInside = distanceFrom(inside, width, height), toOutside = distanceFrom(outside, width, height);
  // +1 inside an outline, -1 in the band just outside it, 0 elsewhere.
  const weight = new Int8Array(width * height);
  for (let k = 0; k < weight.length; k++) weight[k] = inside[k] ? 1 : toInside[k]! * CELL <= BAND ? -1 : 0;

  // Only returns that some shift in the search can carry across an edge matter; deep inside or far off, none can.
  const reach = (SEARCH + 0.5) / CELL, outerReach = (SEARCH + BAND + 0.5) / CELL;
  const cx: number[] = [], cy: number[] = [];
  for (const p of points) {
    if (p.classification !== BUILDING) continue;
    const i = Math.floor((p.x - x0) / CELL), j = Math.floor((p.y - y0) / CELL);
    if (i < 0 || j < 0 || i >= width || j >= height) continue;
    const k = j * width + i;
    if (inside[k] ? toOutside[k]! > reach : toInside[k]! > outerReach) continue;
    cx.push((p.x - x0) / CELL); cy.push((p.y - y0) / CELL);
  }
  const returns = cx.length;
  if (returns < MIN_RETURNS) return none(`only ${returns} building returns near the outline's edges, too few to fit`, returns);

  const score = (dx: number, dy: number) => {
    const si = dx / CELL, sj = dy / CELL;
    let total = 0;
    for (let n = 0; n < returns; n++) {
      const i = Math.floor(cx[n]! - si), j = Math.floor(cy[n]! - sj);
      if (i >= 0 && j >= 0 && i < width && j < height) total += weight[j * width + i]!;
    }
    return total;
  };
  const search = (centre: Point, half: number, step: number) => {
    const tried: { at: Point; value: number }[] = [];
    const steps = Math.round(half / step);
    for (let a = -steps; a <= steps; a++) for (let b = -steps; b <= steps; b++) tried.push({ at: [centre[0] + a * step, centre[1] + b * step], value: score(centre[0] + a * step, centre[1] + b * step) });
    const best = Math.max(...tried.map((t) => t.value));
    // A flat top, where a roof sits inside its outline with room to spare, is read at its middle.
    const top = tried.filter((t) => t.value >= best - 0.001 * returns);
    return { at: [top.reduce((s, t) => s + t.at[0], 0) / top.length, top.reduce((s, t) => s + t.at[1], 0) / top.length] as Point, value: best };
  };
  const coarse = search([0, 0], SEARCH, COARSE);
  const fine = search(coarse.at, COARSE, FINE);
  const [dx, dy] = fine.at;
  const gain = (score(dx, dy) - score(0, 0)) / returns;
  const shift = Math.hypot(dx, dy);
  if (Math.abs(dx) > SEARCH - COARSE || Math.abs(dy) > SEARCH - COARSE) return none(`the best fit lies at the ${SEARCH} m limit of the search, so it isn't trusted`, returns, gain);
  if (gain < MIN_GAIN) return none(`the best fit is no clear improvement on no shift (${(gain * 100).toFixed(1)}% of ${returns} edge returns)`, returns, gain);
  if (shift < MIN_SHIFT) return none(`the fit is within ${MIN_SHIFT} m of no shift`, returns, gain);
  return { dx, dy, applied: true, returns, gain, reason: `fit to ${used.length === 1 ? "the building outline" : `${used.length} building outlines`} from ${returns} building returns near their edges, ${(gain * 100).toFixed(1)}% better than no shift` };
}

// "1.1 m toward 340°": how far a lidar position was moved into the map frame, and which way (compass bearing).
export function describeShift(registration: Registration): string {
  if (!registration.applied) return "none";
  const distance = Math.hypot(registration.dx, registration.dy);
  const bearing = (Math.round((Math.atan2(-registration.dx, -registration.dy) * 180) / Math.PI) + 360) % 360;
  return `${distance.toFixed(1)} m toward ${bearing}°`;
}
