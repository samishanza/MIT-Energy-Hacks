// Runs the lidar detector over every site with a traced drawing set and scores it, so a change to the detector or
// its thresholds can be measured instead of guessed.
//
// The manifest (private/eval/sites.json, untracked, since it names real sites) lists each site:
//   { "sites": [{ "siteId": "...", "truth": "<path to traced .geojson>", "drawn": ["light_pole", ...], "split": "train" }] }
// "drawn" names the kinds the drawing marks (utility_pole, light_pole, hydrant, transformer); "split" is train or
// holdout, so a tuning run can be checked on sites it didn't tune on.
//
// Each site's building, roads, and paved areas come from its latest record in the running API (SOURCE_API), and its
// lidar is read once and cached in private/eval/cache. Both are labelled real; nothing here is synthetic.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readLidarAround, type LidarPoint } from "../../packages/sources/src/ept.ts";
import { DEFAULT_PARAMS, detectEquipment, type DetectorParams, type Road } from "../../packages/sources/src/checks/lidar-equipment.ts";
import { estimateShift } from "../../packages/sources/src/checks/lidar-registration.ts";
import { scoreSite, type Kind, type Point, type SiteScore } from "../../packages/sources/src/eval/score.ts";

export const EVAL_DIR = process.env.EVAL_DIR ?? join(process.cwd(), "private", "eval");
const SOURCE_API = (process.env.SOURCE_API ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const BASES = ["MA_CentralEastern_1_2021", "MA_CentralEastern_2_2021", "MA_Western_1_B24"].map((name) => `https://usgs-lidar-public.s3.amazonaws.com/${name}`);
const KINDS: Kind[] = ["utility_pole", "light_pole", "hydrant", "transformer"];

export type SiteEntry = { siteId: string; truth?: string; drawn?: Kind[]; split?: "train" | "holdout" };
type Geo = { centre: Point; half: number; buildings: Point[][]; roads: Road[]; paved: Point[][]; base: string };
type Feature = { geometry: { type: string; coordinates: unknown }; properties?: Record<string, unknown>; kind?: string; field?: string; label?: string };

type Label = { siteId: string; kind: Kind; longitude: number; latitude: number };
const labels = (): Label[] => (existsSync(join(EVAL_DIR, "labels.json")) ? (JSON.parse(readFileSync(join(EVAL_DIR, "labels.json"), "utf8")) as Label[]) : []);

// The traced drawing sets, plus every site where a person confirmed a transformer (labels.json, written when a
// review agent's pin is accepted), so the detector is scored on more sites as people review more.
export function loadManifest(): SiteEntry[] {
  const path = join(EVAL_DIR, "sites.json");
  const sites = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as { sites: SiteEntry[] }).sites : [];
  for (const label of labels()) {
    if (!sites.some((s) => s.siteId === label.siteId)) sites.push({ siteId: label.siteId, drawn: [label.kind], split: "train" });
  }
  if (!sites.length) throw new Error(`No sites at ${path} or in labels.json. See the comment at the top of scripts/eval/harness.ts.`);
  return sites;
}

const ringsOf = (g: Feature["geometry"]): [number, number][][] =>
  g.type === "Polygon" ? [(g.coordinates as [number, number][][])[0]!] : g.type === "MultiPolygon" ? (g.coordinates as [number, number][][][]).map((p) => p[0]!) : [];
const linesOf = (g: Feature["geometry"]): [number, number][][] =>
  g.type === "LineString" ? [g.coordinates as [number, number][]] : g.type === "MultiLineString" ? (g.coordinates as [number, number][][]) : [];
const verticesOf = (g: Feature["geometry"]): [number, number][] =>
  g.type === "Point" ? [g.coordinates as [number, number]] : [...linesOf(g).flat(), ...ringsOf(g).flat(), ...(g.type === "MultiPolygon" ? [] : [])];

// The site's frame: metres east and north of the main building's bounding-box centre, as the collector uses.
function frame(centre: [number, number]) {
  const perLon = 111320 * Math.cos((centre[1] * Math.PI) / 180);
  return ([lon, lat]: [number, number]): Point => [(lon - centre[0]) * perLon, (lat - centre[1]) * 111320];
}

async function siteGeometry(siteId: string): Promise<{ geo: Geo; lonLatCentre: [number, number] }> {
  const response = await fetch(`${SOURCE_API}/api/sites/${encodeURIComponent(siteId)}/versions/latest`);
  if (!response.ok) throw new Error(`The API has no record for ${siteId} (HTTP ${response.status}).`);
  const body = (await response.json()) as { features: Feature[] } | { record: { features: Feature[] } };
  const features = "record" in body ? body.record.features : body.features;
  const outlines = features.filter((f) => f.kind === "building_outline").flatMap((f) => ringsOf(f.geometry));
  if (!outlines.length) throw new Error(`${siteId} has no building outline.`);
  const vertices = outlines.flat();
  const lons = vertices.map((p) => p[0]), lats = vertices.map((p) => p[1]);
  const centre: [number, number] = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
  const local = frame(centre);
  const half = Math.min(220, Math.max(...vertices.map(local).map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) + 60);
  // The record keeps road names but not TIGER classes, so an unnamed road (usually a drive or lot aisle) is taken as
  // not a street; the collector reads the class itself.
  const roads: Road[] = features
    .filter((f) => f.kind === "road")
    .flatMap((f) => linesOf(f.geometry).map((line) => ({ name: f.label ?? "road", line: line.map(local), onAddress: false, street: !/^unnamed/i.test(f.label ?? "") })));
  const paved = features.filter((f) => f.field === "paved_area_sqft").flatMap((f) => ringsOf(f.geometry)).map((ring) => ring.map(local));
  return { geo: { centre: [0, 0], half, buildings: outlines.map((ring) => ring.map(local)), roads, paved, base: "" }, lonLatCentre: centre };
}

// Points cached as float32 x, y, z, classification, returns.
function savePoints(path: string, points: LidarPoint[]) {
  const array = new Float32Array(points.length * 5);
  points.forEach((p, i) => array.set([p.x, p.y, p.z, p.classification, p.returns ?? 1], i * 5));
  writeFileSync(path, Buffer.from(array.buffer));
}
function loadPoints(path: string): LidarPoint[] {
  const bytes = readFileSync(path);
  const array = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const points: LidarPoint[] = [];
  for (let i = 0; i < array.length; i += 5) points.push({ x: array[i]!, y: array[i + 1]!, z: array[i + 2]!, classification: array[i + 3]!, returns: array[i + 4]! });
  return points;
}

export type Prepared = { entry: SiteEntry; points: LidarPoint[]; geo: Geo; truth: Partial<Record<Kind, Point[]>>; coverage: Point[]; drawn: Kind[] };

// Reads (or loads from the cache) everything a site needs, registered as the collector registers it.
export async function prepare(entry: SiteEntry): Promise<Prepared> {
  const dir = join(EVAL_DIR, "cache", entry.siteId);
  mkdirSync(dir, { recursive: true });
  const geoPath = join(dir, "geo.json"), pointsPath = join(dir, "points.f32");
  let geo: Geo, lonLatCentre: [number, number];
  if (existsSync(geoPath) && existsSync(pointsPath)) {
    ({ geo, lonLatCentre } = JSON.parse(readFileSync(geoPath, "utf8")) as { geo: Geo; lonLatCentre: [number, number] });
  } else {
    ({ geo, lonLatCentre } = await siteGeometry(entry.siteId));
    const found = await readLidarAround(BASES, lonLatCentre, geo.half, fetch as never);
    if (!found) throw new Error(`No lidar collection covers ${entry.siteId}.`);
    geo.base = found.base;
    savePoints(pointsPath, found.points);
    writeFileSync(geoPath, JSON.stringify({ geo, lonLatCentre }));
  }
  let points = loadPoints(pointsPath);
  const shift = estimateShift(points, geo.buildings);
  if (shift.applied) points = points.map((p) => ({ ...p, x: p.x - shift.dx, y: p.y - shift.dy }));

  const local = frame(lonLatCentre);
  const features = entry.truth ? (JSON.parse(readFileSync(entry.truth, "utf8")) as { features: Feature[] }).features : [];
  const truth: Partial<Record<Kind, Point[]>> = {};
  for (const f of features) {
    const kind = f.properties?.type as Kind;
    if (KINDS.includes(kind) && f.geometry.type === "Point") (truth[kind] ??= []).push(local(f.geometry.coordinates as [number, number]));
  }
  // A confirmed label stands in where the drawing shows none of its kind.
  for (const label of labels().filter((l) => l.siteId === entry.siteId)) {
    if (!(truth[label.kind] ?? []).length) truth[label.kind] = [local([label.longitude, label.latitude])];
  }
  const coverage = [...features.flatMap((f) => verticesOf(f.geometry)).map(local), ...Object.values(truth).flat()];
  const drawn = entry.drawn ?? KINDS.filter((kind) => (truth[kind] ?? []).length);
  return { entry, points, geo, truth, coverage, drawn };
}

export type SiteResult = { siteId: string; split: string; score: SiteScore; misses: { kind: Kind; at: Point; nearestM: number | null }[]; extras: { kind: Kind; at: Point }[] };

export function evaluate(site: Prepared, params: DetectorParams = DEFAULT_PARAMS): SiteResult {
  const d = detectEquipment(site.points, site.geo.buildings, site.geo.roads, site.geo.paved, params);
  const found: Partial<Record<Kind, Point[]>> = { utility_pole: d.poles.map((p) => p.at), light_pole: d.lightPoles.map((p) => p.at), hydrant: d.hydrants.map((p) => p.at) };
  const boxes = d.padMounts.map((p) => p.at);
  const score = scoreSite({ truth: site.truth, found, drawn: site.drawn, coverage: site.coverage, boxes });
  // What the tuner sees: each drawn object nobody found, with the nearest detection of its kind, and each extra.
  const near = (p: Point, list: Point[]) => (list.length ? Math.min(...list.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))) : null);
  const misses = site.drawn.flatMap((kind) => (site.truth[kind] ?? []).flatMap((t) => {
    const list = kind === "transformer" ? boxes : found[kind] ?? [];
    const n = near(t, list);
    return n === null || n > 3 ? [{ kind, at: t.map((v) => Math.round(v * 10) / 10) as Point, nearestM: n === null ? null : Math.round(n * 10) / 10 }] : [];
  }));
  const extras = site.drawn.filter((k) => k !== "transformer").flatMap((kind) => (found[kind] ?? []).flatMap((f) => {
    const n = near(f, site.truth[kind] ?? []);
    return n === null || n > 3 ? [{ kind, at: f.map((v) => Math.round(v * 10) / 10) as Point }] : [];
  }));
  return { siteId: site.entry.siteId, split: site.entry.split ?? "train", score, misses, extras };
}

export const meanObjective = (results: SiteResult[]) => (results.length ? results.reduce((s, r) => s + r.score.objective, 0) / results.length : 0);

export function table(results: SiteResult[]): string {
  const lines = results.map((r) => {
    const parts = r.score.classes.map((c) => `${c.kind} ${c.matched}/${c.truth} (+${c.falsePositives})`);
    if (r.score.transformerRank !== undefined && r.misses.some((m) => m.kind === "transformer") !== undefined) parts.push(`transformer rank ${r.score.transformerRank ?? "-"}`);
    return `${r.siteId.padEnd(36)} ${r.split.padEnd(8)} ${r.score.objective.toFixed(3)}  ${parts.join(", ")}`;
  });
  return [...lines, `mean objective ${meanObjective(results).toFixed(3)}`].join("\n");
}
