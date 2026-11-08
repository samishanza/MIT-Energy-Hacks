import type { MapFeature, RecordVersion } from "@eqore/contract";

// Where a battery pad can go on a site, by fixed rules applied to the record's geometry. A 2 ft grid, turned to
// the main building's axis so pads line up with it, is marked cell by cell. Exact distance transforms give each
// cell's distance to the lot line, buildings, roads, overhead lines, and wetlands. The zone is every cell some
// pad placement covers, and the best pad is the one with the shortest run. A concept, which the engineer sets.

type Point = [number, number];

export const PAD = { widthFt: 11.5, depthFt: 14, workingFt: 3 };
export const MAX_RUN_FT = 150;
const CELL = 2;
const FEET_PER_DEGREE = (6371008.8 * Math.PI * 3.280839895) / 180;
const WETLAND_BUFFER_FT = 100;
const FIRE_ACCESS_FT = 150;
const CLEAR_FT = 10;
// Distances run between 2 ft cell centers, so each clearance adds a cell to stay on the safe side.
const MARGIN = CELL;

export type ZoneRule = { rule: string; citation: string; effect: "excludes" | "flags" };
export const ZONE_RULES: ZoneRule[] = [
  { rule: "Inside the lot, at least 10 ft from the lot line", citation: "IFC 1207.8 / NFPA 855, adopted through 527 CMR 1.00", effect: "excludes" },
  { rule: "At least 10 ft from every building wall", citation: "IFC 1207.8 / NFPA 855, adopted through 527 CMR 1.00", effect: "excludes" },
  { rule: "At least 10 ft from the edge of a public way", citation: "IFC 1207.8 / NFPA 855, adopted through 527 CMR 1.00", effect: "excludes" },
  { rule: "At least 10 ft from overhead conductors", citation: "Clearance from overhead lines", effect: "excludes" },
  { rule: "Outside mapped wetlands", citation: "310 CMR 10.02", effect: "excludes" },
  { rule: `Within ${MAX_RUN_FT} ft straight line of the service entrance, or the building when it isn't known`, citation: "Run length for a 400 A, 480 V connection", effect: "excludes" },
  { rule: `Room for the ${PAD.widthFt} × ${PAD.depthFt} ft pad plus ${PAD.workingFt} ft of working space`, citation: "NEC 110.26", effect: "excludes" },
  { rule: `Within ${WETLAND_BUFFER_FT} ft of a mapped wetland needs a Conservation Commission filing`, citation: "310 CMR 10.02(2)(b)", effect: "flags" },
  { rule: `More than ${FIRE_ACCESS_FT} ft from a mapped public road needs fire access on site drives`, citation: "IFC 503.1.1", effect: "flags" },
];

export type BessPad = {
  center: Point;
  corners: Point[];
  rotationDeg: number;
  widthFt: number;
  depthFt: number;
  run: { from: Point; to: Point; feet: number };
  inWetlandBuffer: boolean;
  beyondRoadAccess: boolean;
};

export type BessZone = {
  zone: MapFeature | null;
  pad: BessPad | null;
  target: "service entrance" | "building wall";
  // When nothing qualifies, the rule that removed the last cells.
  reason: string | null;
};

const isEntrance = (feature: MapFeature) => feature.attributes?.equipment_type?.type === "text" && feature.attributes.equipment_type.value === "service_entrance";
const isOverhead = (feature: MapFeature) => {
  const lineClass = feature.attributes?.line_class?.type === "text" ? feature.attributes.line_class.value : "";
  const construction = feature.attributes?.construction?.type === "text" ? feature.attributes.construction.value : "";
  return feature.kind === "utility_line" && (/overhead conductor|service drop/i.test(lineClass) || (/distribution segment/i.test(lineClass) && /overhead/i.test(construction)));
};

function polygonsOf(feature: MapFeature): Point[][][] {
  const g = feature.geometry;
  if (g.type === "Polygon") return [g.coordinates as Point[][]];
  if (g.type === "MultiPolygon") return g.coordinates as Point[][][];
  return [];
}
function linesOf(feature: MapFeature): Point[][] {
  const g = feature.geometry;
  if (g.type === "LineString") return [g.coordinates as Point[]];
  if (g.type === "MultiLineString") return g.coordinates as Point[][];
  if (g.type === "Point") return [[g.coordinates as Point]];
  return [];
}

// Squared Euclidean distance transform in one dimension (Felzenszwalb and Huttenlocher).
function edt1d(f: Float64Array, n: number, out: Float64Array) {
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) { k--; s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    out[q] = (q - v[k]!) ** 2 + f[v[k]!]!;
  }
}

// Distance in feet from each cell to the nearest marked cell.
function distanceField(marked: Uint8Array, w: number, h: number): Float64Array {
  const BIG = 1e12;
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = marked[i] ? 0 : BIG;
  const column = new Float64Array(h), columnOut = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) column[y] = grid[y * w + x]!;
    edt1d(column, h, columnOut);
    for (let y = 0; y < h; y++) grid[y * w + x] = columnOut[y]!;
  }
  const row = new Float64Array(w), rowOut = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x] = grid[y * w + x]!;
    edt1d(row, w, rowOut);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(rowOut[x]!) * CELL;
  }
  return grid;
}

// The main building's long axis, from its minimum-area bounding rectangle.
function mainAxis(rings: Point[][]): number {
  let best = { area: Infinity, angle: 0 };
  for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    const angle = Math.atan2(ring[i]![1] - ring[i - 1]![1], ring[i]![0] - ring[i - 1]![0]);
    const c = Math.cos(-angle), s = Math.sin(-angle);
    const us = ring.map(([x, y]) => x * c - y * s), vs = ring.map(([x, y]) => x * s + y * c);
    const area = (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
    if (area < best.area) best = { area, angle };
  }
  return best.angle;
}

// Traces a cell mask's outline into rings of cell-corner points.
function outline(mask: Uint8Array, w: number, h: number): Point[][] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const next = new Map<string, Point[]>();
  const edge = (a: Point, b: Point) => {
    const key = `${a[0]},${a[1]}`;
    const list = next.get(key) ?? [];
    list.push(b);
    next.set(key, list);
  };
  // Each boundary edge runs with the inside on its left.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) edge([x, y], [x + 1, y]);
    if (!at(x + 1, y)) edge([x + 1, y], [x + 1, y + 1]);
    if (!at(x, y + 1)) edge([x + 1, y + 1], [x, y + 1]);
    if (!at(x - 1, y)) edge([x, y + 1], [x, y]);
  }
  const rings: Point[][] = [];
  for (const [startKey] of next) {
    while ((next.get(startKey)?.length ?? 0) > 0) {
      const start = startKey.split(",").map(Number) as Point;
      const ring: Point[] = [start];
      let current = start;
      for (;;) {
        const key = `${current[0]},${current[1]}`;
        const list = next.get(key);
        if (!list?.length) break;
        const to = list.pop()!;
        ring.push(to);
        current = to;
        if (to[0] === start[0] && to[1] === start[1]) break;
      }
      // Drop points in the middle of straight runs.
      const simple = ring.filter((p, i) => {
        if (i === 0 || i === ring.length - 1) return true;
        const a = ring[i - 1]!, b = ring[i + 1]!;
        return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
      });
      if (simple.length >= 4) rings.push(simple);
    }
  }
  return rings;
}

const signedArea = (ring: Point[]) => ring.reduce((sum, p, i) => (i === 0 ? 0 : sum + (ring[i - 1]![0] * p[1] - p[0] * ring[i - 1]![1])), 0) / 2;
const inside = (p: Point, ring: Point[]) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};

export function feasibleBessZone(record: RecordVersion): BessZone {
  const parcels = record.features.filter((f) => f.kind === "property_line").flatMap(polygonsOf);
  const buildings = record.features.filter((f) => f.kind === "building_outline").flatMap(polygonsOf);
  const entrance = record.features.find(isEntrance);
  const target = entrance ? "service entrance" : "building wall";
  if (!parcels.length || !buildings.length) return { zone: null, pad: null, target, reason: "The record has no lot or no building outline to place a pad against." };

  // Local feet, then turned so the main building's long axis runs along the grid.
  const origin = (record.site.location ?? parcels[0]![0]![0]!) as Point;
  const perLon = FEET_PER_DEGREE * Math.cos((origin[1] * Math.PI) / 180);
  const feet = ([lon, lat]: Point): Point => [(lon - origin[0]) * perLon, (lat - origin[1]) * FEET_PER_DEGREE];
  const largest = buildings.map((polygon) => polygon[0]!.map(feet)).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0]!;
  const angle = mainAxis([largest]);
  const c = Math.cos(-angle), s = Math.sin(-angle);
  const turn = (p: Point): Point => { const [x, y] = feet(p); return [x * c - y * s, x * s + y * c]; };
  const back = ([u, v]: Point): Point => {
    const x = u * Math.cos(angle) - v * Math.sin(angle), y = u * Math.sin(angle) + v * Math.cos(angle);
    return [origin[0] + x / perLon, origin[1] + y / FEET_PER_DEGREE];
  };
  const turnRings = (polygon: Point[][]) => polygon.map((ring) => ring.map(turn));

  const lots = parcels.map(turnRings);
  const houses = buildings.map(turnRings);
  const entrancePoint = entrance && entrance.geometry.type === "Point" ? turn(entrance.geometry.coordinates as Point) : null;

  // The grid: everything within the run limit of the target, plus a margin for the wetland buffer.
  const targetPoints = entrancePoint ? [entrancePoint] : houses.flatMap((polygon) => polygon[0]!);
  const margin = MAX_RUN_FT + WETLAND_BUFFER_FT + 20;
  const minU = Math.min(...targetPoints.map((p) => p[0])) - margin, maxU = Math.max(...targetPoints.map((p) => p[0])) + margin;
  const minV = Math.min(...targetPoints.map((p) => p[1])) - margin, maxV = Math.max(...targetPoints.map((p) => p[1])) + margin;
  const w = Math.ceil((maxU - minU) / CELL), h = Math.ceil((maxV - minV) / CELL);
  const center = (x: number, y: number): Point => [minU + (x + 0.5) * CELL, minV + (y + 0.5) * CELL];
  const cellOf = (p: Point): [number, number] => [Math.floor((p[0] - minU) / CELL), Math.floor((p[1] - minV) / CELL)];

  const fill = (polygons: Point[][][]) => {
    const mask = new Uint8Array(w * h);
    for (const polygon of polygons) {
      const us = polygon[0]!.map((p) => p[0]), vs = polygon[0]!.map((p) => p[1]);
      const [x0, y0] = cellOf([Math.min(...us), Math.min(...vs)]), [x1, y1] = cellOf([Math.max(...us), Math.max(...vs)]);
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
        const p = center(x, y);
        if (inside(p, polygon[0]!) && !polygon.slice(1).some((hole) => inside(p, hole))) mask[y * w + x] = 1;
      }
    }
    return mask;
  };
  const draw = (lines: Point[][]) => {
    const mask = new Uint8Array(w * h);
    for (const line of lines) for (let i = 0; i < line.length; i++) {
      const a = line[i]!, b = line[Math.min(i + 1, line.length - 1)]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL / 2)));
      for (let k = 0; k <= steps; k++) {
        const [x, y] = cellOf([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
        if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1;
      }
    }
    return mask;
  };
  const invert = (mask: Uint8Array) => mask.map((v) => (v ? 0 : 1));

  const inLot = fill(lots);
  const toLotLine = distanceField(invert(inLot), w, h);
  const inBuilding = fill(houses);
  const toBuilding = distanceField(inBuilding, w, h);
  const roadLines = record.features.filter((f) => f.kind === "road").flatMap(linesOf).map((line) => line.map(turn));
  const toRoad = distanceField(draw(roadLines), w, h);
  const width = record.values.find((v) => v.field === "road_width_ft")?.current;
  const halfRoad = width?.type === "quantity" && width.value > 0 ? width.value / 2 : 15;
  const toLine = distanceField(draw(record.features.filter(isOverhead).flatMap(linesOf).map((line) => line.map(turn))), w, h);
  const wetlands = record.features.filter((f) => f.kind === "constraint" && f.field === "wetlands_nearby").flatMap(polygonsOf).map(turnRings);
  const inWetland = fill(wetlands);
  const toWetland = distanceField(inWetland, w, h);
  const toTarget = entrancePoint ? null : toBuilding;
  const run = (x: number, y: number) => (entrancePoint ? Math.hypot(center(x, y)[0] - entrancePoint[0], center(x, y)[1] - entrancePoint[1]) : toTarget![y * w + x]!);

  // The exclusions in order, counting what survives each, to name the one that removed everything.
  const allowed = new Uint8Array(w * h).fill(1);
  const steps: [string, (i: number, x: number, y: number) => boolean][] = [
    [ZONE_RULES[0]!.rule, (i) => inLot[i] === 1 && toLotLine[i]! >= CLEAR_FT + MARGIN],
    [ZONE_RULES[1]!.rule, (i) => inBuilding[i] === 0 && toBuilding[i]! >= CLEAR_FT + MARGIN],
    [ZONE_RULES[2]!.rule, (i) => toRoad[i]! >= halfRoad + CLEAR_FT + MARGIN],
    [ZONE_RULES[3]!.rule, (i) => toLine[i]! >= CLEAR_FT + MARGIN],
    [ZONE_RULES[4]!.rule, (i) => inWetland[i] === 0],
    [ZONE_RULES[5]!.rule, (_, x, y) => run(x, y) <= MAX_RUN_FT],
  ];
  for (const [rule, keep] of steps) {
    let left = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (allowed[i] && !keep(i, x, y)) allowed[i] = 0;
      left += allowed[i]!;
    }
    if (left === 0) return { zone: null, pad: null, target, reason: `No spot qualifies after this rule: ${rule}.` };
  }

  // Pad placements, both ways round, where every cell of the pad and its working space is allowed.
  const sums = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sums[(y + 1) * (w + 1) + x + 1] = allowed[y * w + x]! + sums[y * (w + 1) + x + 1]! + sums[(y + 1) * (w + 1) + x]! - sums[y * (w + 1) + x]!;
  const block = (x: number, y: number, bw: number, bh: number) => sums[(y + bh) * (w + 1) + x + bw]! - sums[y * (w + 1) + x + bw]! - sums[(y + bh) * (w + 1) + x]! + sums[y * (w + 1) + x]!;
  const long = Math.ceil((PAD.depthFt + PAD.workingFt) / CELL), short = Math.ceil(PAD.widthFt / CELL);
  const zone = new Int32Array((w + 1) * (h + 1));
  type Placement = { x: number; y: number; bw: number; bh: number; run: number; buffer: boolean; access: boolean };
  // Shortest run first, in 10 ft steps; then outside the wetland buffer; then within reach of a road; then run.
  const rank = (p: Placement) => [Math.round(p.run / 10), p.buffer ? 1 : 0, p.access ? 1 : 0, p.run];
  const before = (a: Placement, b: Placement) => {
    const ra = rank(a), rb = rank(b);
    const k = ra.findIndex((value, index) => value !== rb[index]);
    return k >= 0 && ra[k]! < rb[k]!;
  };
  let best: Placement | null = null;
  for (const [bw, bh] of [[long, short], [short, long]] as const) {
    for (let y = 0; y + bh <= h; y++) for (let x = 0; x + bw <= w; x++) {
      if (block(x, y, bw, bh) !== bw * bh) continue;
      zone[y * (w + 1) + x]! += 1; zone[y * (w + 1) + x + bw]! -= 1; zone[(y + bh) * (w + 1) + x]! -= 1; zone[(y + bh) * (w + 1) + x + bw]! += 1;
      let nearest = Infinity, buffer = false, access = false;
      for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) {
        const i = yy * w + xx;
        if (yy === y || yy === y + bh - 1 || xx === x || xx === x + bw - 1) nearest = Math.min(nearest, run(xx, yy));
        if (toWetland[i]! < WETLAND_BUFFER_FT) buffer = true;
        if (toRoad[i]! > FIRE_ACCESS_FT + halfRoad) access = true;
      }
      const placement = { x, y, bw, bh, run: nearest, buffer, access };
      if (!best || before(placement, best)) best = placement;
    }
  }
  if (!best) return { zone: null, pad: null, target, reason: `No spot qualifies after this rule: ${ZONE_RULES[6]!.rule}.` };

  const covered = new Uint8Array(w * h);
  // Two-dimensional prefix sum of the placement marks gives how many placements cover each cell.
  const cover = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    cover[y * w + x] = zone[y * (w + 1) + x]! + (x > 0 ? cover[y * w + x - 1]! : 0) + (y > 0 ? cover[(y - 1) * w + x]! : 0) - (x > 0 && y > 0 ? cover[(y - 1) * w + x - 1]! : 0);
    covered[y * w + x] = cover[y * w + x]! > 0 ? 1 : 0;
  }
  const cells = covered.reduce((sum, v) => sum + v, 0);
  const rings = outline(covered, w, h).map((ring) => ring.map(([x, y]) => back([minU + x * CELL, minV + y * CELL])));
  const outer = rings.filter((ring) => signedArea(ring) > 0), holes = rings.filter((ring) => signedArea(ring) <= 0);
  const polygons = outer.map((ring) => [ring, ...holes.filter((hole) => inside(hole[0]!, ring))]);

  const b = best;
  const corners: Point[] = [[b.x, b.y], [b.x + b.bw, b.y], [b.x + b.bw, b.y + b.bh], [b.x, b.y + b.bh], [b.x, b.y]].map(([x, y]) => back([minU + x! * CELL, minV + y! * CELL]));
  const middle: Point = [minU + (b.x + b.bw / 2) * CELL, minV + (b.y + b.bh / 2) * CELL];
  // The run: from the pad's nearest edge cell to the entrance, or to the nearest wall.
  let from: Point = middle, to: Point = middle, shortest = Infinity;
  for (let yy = b.y; yy < b.y + b.bh; yy++) for (let xx = b.x; xx < b.x + b.bw; xx++) {
    if (!(yy === b.y || yy === b.y + b.bh - 1 || xx === b.x || xx === b.x + b.bw - 1)) continue;
    const p = center(xx, yy);
    if (entrancePoint) {
      const d = Math.hypot(p[0] - entrancePoint[0], p[1] - entrancePoint[1]);
      if (d < shortest) { shortest = d; from = p; to = entrancePoint; }
    } else if (toBuilding[yy * w + xx]! < shortest) {
      shortest = toBuilding[yy * w + xx]!;
      from = p;
      let wall: Point = p, gap = Infinity;
      for (const polygon of houses) for (let i = 1; i < polygon[0]!.length; i++) {
        const a = polygon[0]![i - 1]!, e = polygon[0]![i]!;
        const dx = e[0] - a[0], dy = e[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        const q: Point = [a[0] + t * dx, a[1] + t * dy];
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < gap) { gap = d; wall = q; }
      }
      to = wall;
    }
  }
  const longAlongAxis = b.bw >= b.bh;
  const pad: BessPad = {
    center: back(middle),
    corners,
    rotationDeg: Math.round((((angle * 180) / Math.PI + (longAlongAxis ? 0 : 90)) % 180 + 180) % 180),
    widthFt: PAD.widthFt,
    depthFt: PAD.depthFt,
    run: { from: back(from), to: back(to), feet: Math.round(Math.hypot(from[0] - to[0], from[1] - to[1])) },
    inWetlandBuffer: b.buffer,
    beyondRoadAccess: b.access,
  };
  const feature: MapFeature = {
    id: "concept-feasible-bess-zone",
    kind: "candidate_area",
    field: "candidate_areas",
    geometry: polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0]! } : { type: "MultiPolygon", coordinates: polygons },
    label: "(N) FEASIBLE BESS ZONE",
    attributes: {
      zone_kind: { type: "text", value: "feasible_bess" },
      area_sqft: { type: "quantity", value: cells * CELL * CELL, unit: "sqft" },
      max_run_ft: { type: "quantity", value: MAX_RUN_FT, unit: "ft" },
      run_target: { type: "text", value: target },
      rules: { type: "text", value: ZONE_RULES.map((r) => `${r.effect === "excludes" ? "Excludes" : "Flags"}: ${r.rule} (${r.citation})`).join("; ") },
      basis: { type: "text", value: "concept" },
      confidence_reason: {
        type: "text",
        value: `Every spot where an ${PAD.widthFt} × ${PAD.depthFt} ft pad with ${PAD.workingFt} ft of working space fits under the rules, within ${MAX_RUN_FT} ft of the ${target}. Built from mapped geometry: the lot, buildings, road centerlines, detected overhead lines, and mapped wetlands.`,
      },
    },
  };
  return { zone: feature, pad, target, reason: null };
}
