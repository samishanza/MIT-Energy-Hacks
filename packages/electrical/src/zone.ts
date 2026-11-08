import type { MapFeature, RecordVersion } from "@eqore/contract";

// Where a battery pad can go on a site, by the siting rule table (fixtures/bess-siting-rules.json, each rule
// labeled confirmed, secondary, or inference) applied to the record's geometry. A 2 ft grid, turned to the main
// building's axis so pads line up with it, is marked cell by cell, with exact distance transforms giving each
// cell's distance to the lot line, buildings, roads, overhead lines, wetlands, and utility transformers. The zone
// is every cell some pad placement covers, and the best pad is the one with the shortest run. A concept, which the
// engineer sets; checks the record can't run are listed as not checked.

type Point = [number, number];

export const PAD = { widthFt: 11.5, depthFt: 14, workingFt: 3 };
// Search within 250 ft of the point of interconnection, and prefer 150 ft or less: a cost limit, not voltage drop.
export const MAX_RUN_FT = 250;
export const PREFERRED_RUN_FT = 150;
const CELL = 2;
const FEET_PER_DEGREE = (6371008.8 * Math.PI * 3.280839895) / 180;
const EXPOSURE_FT = 10;
const REMOTE_FT = 100;
const WETLAND_BUFFER_FT = 100;
const FIRE_ACCESS_FT = 150;
const LINE_FT = 10;
const LINE_PREFERRED_FT = 20;
const PADMOUNT_FT = 10;
const MAX_ENERGY_NEAR_EXPOSURES_KWH = 600;
// Distances run between 2 ft cell centers, so each clearance adds a cell to stay on the safe side.
const MARGIN = CELL;

export type RuleStatus = "confirmed" | "secondary" | "inference";
export type SitingRule = { id: string; status: RuleStatus; use: "excludes" | "flags" | "ranks" | "marks"; text: string; citation: string };

// The rules this function applies, by their id in the rule table. A test checks them against the table.
export const APPLIED_RULES: SitingRule[] = [
  { id: "fire.exposure_lot_lines_10ft", status: "confirmed", use: "excludes", text: "At least 10 ft from lot lines", citation: "NFPA 855 (2020) 4.4.3.3 via 527 CMR 1.00 ch. 52" },
  { id: "fire.exposure_buildings_10ft", status: "confirmed", use: "excludes", text: "At least 10 ft from buildings", citation: "NFPA 855 (2020) 4.4.3.3 via 527 CMR 1.00 ch. 52" },
  { id: "fire.exposure_public_ways_10ft", status: "confirmed", use: "excludes", text: "At least 10 ft from the edge of public ways", citation: "NFPA 855 (2020) 4.4.3.3 via 527 CMR 1.00 ch. 52" },
  { id: "util.overhead_line_10ft", status: "confirmed", use: "excludes", text: "At least 10 ft horizontally from overhead lines", citation: "29 CFR 1926.1408(a)(2)" },
  { id: "util.padmount_objects_10ft", status: "confirmed", use: "excludes", text: "At least 10 ft from a utility pad-mount transformer", citation: "National Grid ESB 759B sec. 9A; Eversource C3802" },
  { id: "env.wetland_resource_area", status: "secondary", use: "excludes", text: "Outside mapped wetlands", citation: "M.G.L. c.131 s.40; 310 CMR 10.02(1)" },
  { id: "env.flood_v_coastal_a", status: "inference", use: "excludes", text: "Outside FEMA V and VE zones, when the record names one", citation: "780 CMR 10th ed. flood provisions, ASCE 24" },
  { id: "elec.run_search_cap_250ft", status: "inference", use: "excludes", text: "Within 250 ft straight line of the point of interconnection", citation: "Project inference from NEC Ch. 9 Table 9" },
  { id: "site.pad_fit", status: "inference", use: "excludes", text: "Room for the 11.5 x 14 ft pad plus 3 ft of working space", citation: "Project algorithm; NEC 110.26" },
  { id: "elec.run_preferred_150ft", status: "inference", use: "ranks", text: "Shortest run first, preferring 150 ft or less", citation: "Project inference" },
  { id: "util.overhead_line_20ft", status: "confirmed", use: "flags", text: "Prefer 20 ft from overhead lines of unconfirmed voltage", citation: "29 CFR 1926.1408(a)(2) Option 2" },
  { id: "env.wetland_buffer_100ft", status: "secondary", use: "flags", text: "Within 100 ft of a wetland needs a Conservation Commission filing", citation: "310 CMR 10.02(2)(b)" },
  { id: "fire.access_road_150ft", status: "confirmed", use: "flags", text: "More than 150 ft from a mapped public road: fire access must come by site drives", citation: "NFPA 855 (2020) 4.4.3.8; NFPA 1 (2021) 18.2.3.2.2" },
  { id: "env.flood_a_zone", status: "secondary", use: "flags", text: "In an A zone, elevate to BFE + 2 ft", citation: "780 CMR 10th ed. ch. 16 via ASCE 24" },
  { id: "env.slope_exclusion_10pct", status: "inference", use: "flags", text: "Site slope over 10% (a heuristic; the record has only the site's average slope)", citation: "Project inference" },
  { id: "fire.remote_outdoor_100ft", status: "confirmed", use: "marks", text: "Remote: more than 100 ft from buildings, lot lines, and public ways", citation: "NFPA 855 (2020) 4.4.3.1 via 527 CMR 1.00 ch. 52" },
  { id: "fire.max_stored_energy_600kwh", status: "confirmed", use: "marks", text: "Over 600 kWh near exposures needs a hazard analysis and AHJ approval", citation: "NFPA 855 (2020) 4.8 via 527 CMR 1.00 ch. 52" },
];

// Rules the record has no data to check. They stay for a person or a site visit.
export const NOT_CHECKED: { id: string; text: string }[] = [
  { id: "fire.egress_10ft", text: "10 ft from doors and other means of egress" },
  { id: "fire.exposure_other_hazards_10ft", text: "10 ft from stored combustibles and hazardous materials" },
  { id: "fire.vegetation_10ft", text: "Clear vegetation within 10 ft" },
  { id: "fire.access_road_keep_clear", text: "The pad can't narrow a fire lane below 20 ft" },
  { id: "site.drive_aisles_loading", text: "Out of drive aisles, loading docks, and dumpster enclosures" },
  { id: "site.parking_stalls", text: "Parking stalls taken" },
  { id: "site.underground_utilities", text: "Buried water, gas, storm, and electric lines" },
  { id: "zoning.setbacks", text: "Town zoning setbacks and height limits" },
  { id: "env.riverfront_200ft", text: "Riverfront Area, 200 ft (25 ft in listed cities), which needs a river layer" },
  { id: "util.padmount_front_10ft", text: "10 ft in front of a utility transformer's doors, which needs its orientation" },
  { id: "env.noise_massdep", text: "Sound at the property line" },
  { id: "fire.water_supply", text: "Water supply for fire protection" },
  { id: "fire.vehicle_impact", text: "Bollards where a vehicle could hit the pad" },
  { id: "site.same_side_as_service", text: "Same side of the building as the electrical room" },
];

export type BessPad = {
  center: Point;
  corners: Point[];
  rotationDeg: number;
  widthFt: number;
  depthFt: number;
  run: { from: Point; to: Point; feet: number };
  exposure: "remote" | "needs_hazard_analysis" | "near_exposures";
  flags: string[];
};

export type BessZone = {
  zone: MapFeature | null;
  // The part of the zone more than 100 ft from every exposure.
  remote: MapFeature | null;
  pad: BessPad | null;
  target: "service entrance" | "building wall";
  // When nothing qualifies, the rule that removed the last cells.
  reason: string | null;
};

const ruleText = (id: string) => APPLIED_RULES.find((rule) => rule.id === id)!.text;
const isPadMount = (feature: MapFeature) => feature.attributes?.equipment_type?.type === "text" && /pad_mount_transformer/.test(feature.attributes.equipment_type.value);

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

export function feasibleBessZone(record: RecordVersion, options: { energyKwh?: number } = {}): BessZone {
  const energyKwh = options.energyKwh ?? 760;
  const parcels = record.features.filter((f) => f.kind === "property_line").flatMap(polygonsOf);
  const buildings = record.features.filter((f) => f.kind === "building_outline").flatMap(polygonsOf);
  const entrance = record.features.find(isEntrance);
  const target = entrance ? "service entrance" : "building wall";
  const none = (reason: string): BessZone => ({ zone: null, remote: null, pad: null, target, reason });
  if (!parcels.length || !buildings.length) return none("The record has no lot or no building outline to place a pad against.");
  const value = (field: string) => record.values.find((v) => v.field === field)?.current ?? null;
  const flood = value("flood_zone");
  const floodZone = flood?.type === "text" ? flood.value.toUpperCase() : "";
  if (/\bV/.test(floodZone)) return none(`No spot qualifies after this rule: ${ruleText("env.flood_v_coastal_a")}.`);

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
  const width = value("road_width_ft");
  const halfRoad = width?.type === "quantity" && width.value > 0 ? width.value / 2 : 15;
  const toLine = distanceField(draw(record.features.filter(isOverhead).flatMap(linesOf).map((line) => line.map(turn))), w, h);
  const toPadMount = distanceField(draw(record.features.filter(isPadMount).flatMap(linesOf).map((line) => line.map(turn))), w, h);
  const wetlands = record.features.filter((f) => f.kind === "constraint" && f.field === "wetlands_nearby").flatMap(polygonsOf).map(turnRings);
  const inWetland = fill(wetlands);
  const toWetland = distanceField(inWetland, w, h);
  const run = (x: number, y: number) => (entrancePoint ? Math.hypot(center(x, y)[0] - entrancePoint[0], center(x, y)[1] - entrancePoint[1]) : toBuilding[y * w + x]!);
  const toExposure = (i: number) => Math.min(toLotLine[i]!, toBuilding[i]!, toRoad[i]! - halfRoad);

  // The exclusions in order, counting what survives each, to name the one that removed everything.
  const allowed = new Uint8Array(w * h).fill(1);
  const steps: [string, (i: number, x: number, y: number) => boolean][] = [
    ["fire.exposure_lot_lines_10ft", (i) => inLot[i] === 1 && toLotLine[i]! >= EXPOSURE_FT + MARGIN],
    ["fire.exposure_buildings_10ft", (i) => inBuilding[i] === 0 && toBuilding[i]! >= EXPOSURE_FT + MARGIN],
    ["fire.exposure_public_ways_10ft", (i) => toRoad[i]! >= halfRoad + EXPOSURE_FT + MARGIN],
    ["util.overhead_line_10ft", (i) => toLine[i]! >= LINE_FT + MARGIN],
    // A detected box's half-width added, since the box is drawn as a point.
    ["util.padmount_objects_10ft", (i) => toPadMount[i]! >= PADMOUNT_FT + MARGIN + 3],
    ["env.wetland_resource_area", (i) => inWetland[i] === 0],
    ["elec.run_search_cap_250ft", (_, x, y) => run(x, y) <= MAX_RUN_FT],
  ];
  for (const [id, keep] of steps) {
    let left = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (allowed[i] && !keep(i, x, y)) allowed[i] = 0;
      left += allowed[i]!;
    }
    if (left === 0) return none(`No spot qualifies after this rule: ${ruleText(id)}.`);
  }

  // Pad placements, both ways round, where every cell of the pad and its working space is allowed.
  const sums = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sums[(y + 1) * (w + 1) + x + 1] = allowed[y * w + x]! + sums[y * (w + 1) + x + 1]! + sums[(y + 1) * (w + 1) + x]! - sums[y * (w + 1) + x]!;
  const block = (x: number, y: number, bw: number, bh: number) => sums[(y + bh) * (w + 1) + x + bw]! - sums[y * (w + 1) + x + bw]! - sums[(y + bh) * (w + 1) + x]! + sums[y * (w + 1) + x]!;
  const long = Math.ceil((PAD.depthFt + PAD.workingFt) / CELL), short = Math.ceil(PAD.widthFt / CELL);
  const marks = new Int32Array((w + 1) * (h + 1));
  type Placement = { x: number; y: number; bw: number; bh: number; run: number; flags: string[]; remote: boolean };
  // Shortest run first in 10 ft steps, with the preferred 150 ft ahead of beyond it; then fewer flags; then run.
  const rank = (p: Placement) => [p.run > PREFERRED_RUN_FT ? 1 : 0, Math.round(p.run / 10), p.flags.length, p.run];
  const before = (a: Placement, b: Placement) => {
    const ra = rank(a), rb = rank(b);
    const k = ra.findIndex((v, index) => v !== rb[index]);
    return k >= 0 && ra[k]! < rb[k]!;
  };
  let best: Placement | null = null;
  for (const [bw, bh] of [[long, short], [short, long]] as const) {
    for (let y = 0; y + bh <= h; y++) for (let x = 0; x + bw <= w; x++) {
      if (block(x, y, bw, bh) !== bw * bh) continue;
      marks[y * (w + 1) + x]! += 1; marks[y * (w + 1) + x + bw]! -= 1; marks[(y + bh) * (w + 1) + x]! -= 1; marks[(y + bh) * (w + 1) + x + bw]! += 1;
      let nearest = Infinity, buffer = false, access = false, line = false, exposure = Infinity;
      for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) {
        const i = yy * w + xx;
        if (yy === y || yy === y + bh - 1 || xx === x || xx === x + bw - 1) nearest = Math.min(nearest, run(xx, yy));
        if (toWetland[i]! < WETLAND_BUFFER_FT) buffer = true;
        if (toRoad[i]! > FIRE_ACCESS_FT + halfRoad) access = true;
        if (toLine[i]! < LINE_PREFERRED_FT) line = true;
        exposure = Math.min(exposure, toExposure(i));
      }
      const flags = [buffer && "env.wetland_buffer_100ft", access && "fire.access_road_150ft", line && "util.overhead_line_20ft"].filter((f): f is string => Boolean(f));
      const placement = { x, y, bw, bh, run: nearest, flags, remote: exposure > REMOTE_FT };
      if (!best || before(placement, best)) best = placement;
    }
  }
  if (!best) return none(`No spot qualifies after this rule: ${ruleText("site.pad_fit")}.`);

  // Two-dimensional prefix sum of the placement marks gives how many placements cover each cell.
  const cover = new Int32Array(w * h);
  const covered = new Uint8Array(w * h), remoteCells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    cover[i] = marks[y * (w + 1) + x]! + (x > 0 ? cover[i - 1]! : 0) + (y > 0 ? cover[i - w]! : 0) - (x > 0 && y > 0 ? cover[i - w - 1]! : 0);
    covered[i] = cover[i]! > 0 ? 1 : 0;
    remoteCells[i] = covered[i] && toExposure(i) > REMOTE_FT + MARGIN ? 1 : 0;
  }
  const geometryOf = (mask: Uint8Array): MapFeature["geometry"] | null => {
    const rings = outline(mask, w, h).map((ring) => ring.map(([x, y]) => back([minU + x * CELL, minV + y * CELL])));
    const outer = rings.filter((ring) => signedArea(ring) > 0), holes = rings.filter((ring) => signedArea(ring) <= 0);
    const polygons = outer.map((ring) => [ring, ...holes.filter((hole) => inside(hole[0]!, ring))]);
    if (!polygons.length) return null;
    return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0]! } : { type: "MultiPolygon", coordinates: polygons };
  };
  const area = (mask: Uint8Array) => mask.reduce((sum, v) => sum + v, 0) * CELL * CELL;

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
  const flags = [...b.flags];
  if (/\bA/.test(floodZone)) flags.push("env.flood_a_zone");
  const slope = value("site_slope_pct");
  if (slope?.type === "quantity" && slope.value > 10) flags.push("env.slope_exclusion_10pct");
  const exposure: BessPad["exposure"] = b.remote ? "remote" : energyKwh > MAX_ENERGY_NEAR_EXPOSURES_KWH ? "needs_hazard_analysis" : "near_exposures";
  const pad: BessPad = {
    center: back(middle),
    corners,
    rotationDeg: Math.round((((angle * 180) / Math.PI + (b.bw >= b.bh ? 0 : 90)) % 180 + 180) % 180),
    widthFt: PAD.widthFt,
    depthFt: PAD.depthFt,
    run: { from: back(from), to: back(to), feet: Math.round(Math.hypot(from[0] - to[0], from[1] - to[1])) },
    exposure,
    flags,
  };

  const text = (v: string) => ({ type: "text" as const, value: v });
  const remoteGeometry = geometryOf(remoteCells);
  const zone: MapFeature = {
    id: "concept-feasible-bess-zone",
    kind: "candidate_area",
    field: "candidate_areas",
    geometry: geometryOf(covered)!,
    label: "(N) FEASIBLE BESS ZONE",
    attributes: {
      zone_kind: text("feasible_bess"),
      area_sqft: { type: "quantity", value: area(covered), unit: "sqft" },
      remote_area_sqft: { type: "quantity", value: area(remoteCells), unit: "sqft" },
      max_run_ft: { type: "quantity", value: MAX_RUN_FT, unit: "ft" },
      preferred_run_ft: { type: "quantity", value: PREFERRED_RUN_FT, unit: "ft" },
      run_target: text(target),
      stored_energy_kwh: { type: "quantity", value: energyKwh, unit: "kWh" },
      near_exposures: text(
        energyKwh > MAX_ENERGY_NEAR_EXPOSURES_KWH
          ? `needs_hazard_analysis: ${energyKwh} kWh is over NFPA 855's 600 kWh near exposures, so spots within 100 ft of buildings, lot lines, or public ways need a hazard analysis and AHJ approval`
          : "allowed: within NFPA 855's 600 kWh near exposures",
      ),
      exposure_exception: text("Option, not in the zone: the 10 ft exposure distance can drop to 3 ft with a barrier or UL 9540A results the AHJ accepts (NFPA 855 (2020) 4.4.3.3 exceptions)"),
      rules_applied: text(APPLIED_RULES.map((rule) => `${rule.use}: ${rule.text} [${rule.status}${rule.status === "inference" ? ", heuristic" : ""}] (${rule.citation}) {${rule.id}}`).join("; ")),
      not_checked: text(NOT_CHECKED.map((rule) => `${rule.text} {${rule.id}}`).join("; ")),
      basis: text("concept"),
      confidence_reason: text(`Every spot where an ${PAD.widthFt} x ${PAD.depthFt} ft pad with ${PAD.workingFt} ft of working space fits under the rules, within ${MAX_RUN_FT} ft of the ${target}, from the mapped lot, buildings, road centerlines, detected overhead lines and equipment, and mapped wetlands.`),
    },
  };
  const remote: MapFeature | null = remoteGeometry
    ? {
        id: "concept-feasible-bess-remote",
        kind: "candidate_area",
        field: "candidate_areas",
        geometry: remoteGeometry,
        label: "(N) REMOTE BESS ZONE",
        attributes: {
          zone_kind: text("feasible_bess_remote"),
          area_sqft: { type: "quantity", value: area(remoteCells), unit: "sqft" },
          basis: text("concept"),
          confidence_reason: text("The part of the feasible zone more than 100 ft from buildings, lot lines, and public ways, where NFPA 855 treats an outdoor ESS as remote."),
        },
      }
    : null;
  return { zone, remote, pad, target, reason: null };
}
