// Scores detections against features traced from an engineered drawing set.
//
// A drawing shows only part of a site and only some kinds of object, so a detection counts as false only inside the
// area the drawing covers (the hull of its traced features, plus a margin) and only for a kind the drawing marks.
// Detections are matched to drawn features one to one, nearest pair first, within a radius per kind. Everything is
// in local metres.

export type Point = [number, number];
export type Kind = "utility_pole" | "light_pole" | "hydrant" | "transformer";

// A pole within 2.5 m allows about 0.2 m lidar error plus drawing and fit error; a pad-mount within 3 m of its centre.
export const MATCH_RADIUS_M: Record<Kind, number> = { utility_pole: 2.5, light_pole: 3, hydrant: 3, transformer: 3 };
export const COVERAGE_MARGIN_M = 10;

export type ClassScore = { kind: Kind; truth: number; found: number; matched: number; falsePositives: number; precision: number | null; recall: number | null; f1: number | null; offsetsM: number[] };
export type SiteScore = { classes: ClassScore[]; transformerRank: number | null; objective: number };

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function inside(p: Point, ring: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

function toRing(p: Point, ring: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, dist(p, [a[0] + t * dx, a[1] + t * dy]));
  }
  return best;
}

export function covers(hull: Point[], p: Point, margin = COVERAGE_MARGIN_M): boolean {
  if (hull.length === 0) return false;
  if (hull.length < 3) return hull.some((q) => dist(p, q) <= margin);
  return inside(p, hull) || toRing(p, hull) <= margin;
}

// One-to-one matches, nearest pair first, within the radius. Returns the distance of each match.
export function match(truth: Point[], found: Point[], radius: number): number[] {
  const pairs: [number, number, number][] = [];
  truth.forEach((t, i) => found.forEach((f, j) => { const d = dist(t, f); if (d <= radius) pairs.push([d, i, j]); }));
  pairs.sort((a, b) => a[0] - b[0]);
  const usedT = new Set<number>(), usedF = new Set<number>(), offsets: number[] = [];
  for (const [d, i, j] of pairs) {
    if (usedT.has(i) || usedF.has(j)) continue;
    usedT.add(i); usedF.add(j); offsets.push(d);
  }
  return offsets;
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

// `drawn` lists the kinds the drawing marks; `coverage` is every traced vertex, for the hull.
export function scoreSite(input: {
  truth: Partial<Record<Kind, Point[]>>;
  found: Partial<Record<Kind, Point[]>>;
  drawn: Kind[];
  coverage: Point[];
  // Ranked box candidates, best first, for the transformer.
  boxes?: Point[];
}): SiteScore {
  const hull = convexHull(input.coverage);
  const classes: ClassScore[] = input.drawn.filter((kind) => kind !== "transformer").map((kind) => {
    const truth = input.truth[kind] ?? [];
    const found = (input.found[kind] ?? []).filter((p) => covers(hull, p));
    const offsets = match(truth, found, MATCH_RADIUS_M[kind]);
    const precision = ratio(offsets.length, found.length), recall = ratio(offsets.length, truth.length);
    const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : precision === null && recall === null ? null : 0;
    return { kind, truth: truth.length, found: found.length, matched: offsets.length, falsePositives: found.length - offsets.length, precision, recall, f1, offsetsM: offsets.map((d) => Math.round(d * 10) / 10) };
  });
  let transformerRank: number | null = null;
  if (input.drawn.includes("transformer")) {
    const truth = input.truth.transformer ?? [];
    const rank = (input.boxes ?? []).findIndex((box) => truth.some((t) => dist(t, box) <= MATCH_RADIUS_M.transformer));
    transformerRank = rank >= 0 ? rank + 1 : null;
  }
  // Mean F1 over the scored kinds, with the transformer counted as 1 / rank (0 when not found).
  const parts = classes.flatMap((c) => (c.f1 === null ? [] : [c.f1]));
  if (input.drawn.includes("transformer") && (input.truth.transformer ?? []).length) parts.push(transformerRank ? 1 / transformerRank : 0);
  const objective = parts.length ? parts.reduce((s, v) => s + v, 0) / parts.length : 0;
  return { classes, transformerRank, objective };
}
