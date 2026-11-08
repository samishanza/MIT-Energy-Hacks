// Where the words go on a drawing, so that nothing covers anything else.
//
// Every label, callout box, leader, and symbol on the plan view is registered with one Occupancy. Each new
// item is placed only where it overlaps nothing already there; an item with no free spot is left off rather
// than drawn over something. Text is measured as an oriented box, so lettering along an angled line is
// checked as it is drawn, not as its bounding rectangle.

export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** Four corners in order, a convex box at any angle. */
export type Quad = [Pt, Pt, Pt, Pt];
export type Segment = [Pt, Pt];

export const quadOfRect = (r: Rect, pad = 0): Quad => [
  { x: r.x - pad, y: r.y - pad },
  { x: r.x + r.w + pad, y: r.y - pad },
  { x: r.x + r.w + pad, y: r.y + r.h + pad },
  { x: r.x - pad, y: r.y + r.h + pad },
];

/** Average advance of capitals and digits in Arial, as a share of the font size. */
export const CHAR_W = 0.66;
export const textWidth = (s: string, size: number, bold = false) => s.length * size * (bold ? CHAR_W + 0.04 : CHAR_W);

/**
 * The box a line of text covers, with its halo: drawn at `at`, turned `angleDeg` about it, shifted `dy` across
 * its own baseline, anchored at its middle or its start.
 */
export function textQuad(at: Pt, text: string, size: number, angleDeg = 0, opts: { anchor?: 'middle' | 'start' | 'end'; dy?: number; halo?: number; bold?: boolean } = {}): Quad {
  const { anchor = 'middle', dy = 0, halo = 4, bold = false } = opts;
  const w = textWidth(text, size, bold);
  const x0 = (anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0) - halo;
  const x1 = x0 + w + 2 * halo;
  const y0 = dy - size * 0.78 - halo;
  const y1 = dy + size * 0.24 + halo;
  const r = (angleDeg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const turn = (x: number, y: number): Pt => ({ x: at.x + x * c - y * s, y: at.y + x * s + y * c });
  return [turn(x0, y0), turn(x1, y0), turn(x1, y1), turn(x0, y1)];
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function pointInQuad(p: Pt, q: Quad, pad = 0): boolean {
  if (pad > 0) return pointInQuad(p, grow(q, pad));
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i]!, q[(i + 1) % 4]!, p);
    if (c === 0) continue;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The quad pushed out by `pad` on every side. */
export function grow(q: Quad, pad: number): Quad {
  const c = { x: (q[0].x + q[2].x) / 2, y: (q[0].y + q[2].y) / 2 };
  const ux = { x: q[1].x - q[0].x, y: q[1].y - q[0].y };
  const uy = { x: q[3].x - q[0].x, y: q[3].y - q[0].y };
  const lx = Math.hypot(ux.x, ux.y) || 1, ly = Math.hypot(uy.x, uy.y) || 1;
  const ex = { x: (ux.x / lx) * pad, y: (ux.y / lx) * pad };
  const ey = { x: (uy.x / ly) * pad, y: (uy.y / ly) * pad };
  return q.map((p) => {
    const sx = Math.sign((p.x - c.x) * ux.x + (p.y - c.y) * ux.y) || 1;
    const sy = Math.sign((p.x - c.x) * uy.x + (p.y - c.y) * uy.y) || 1;
    return { x: p.x + sx * ex.x + sy * ey.x, y: p.y + sx * ex.y + sy * ey.y };
  }) as Quad;
}

/** Separating-axis test for two convex quads. */
export function quadsOverlap(a: Quad, b: Quad): boolean {
  for (const q of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p0 = q[i]!, p1 = q[(i + 1) % 4]!;
      const n = { x: p1.y - p0.y, y: p0.x - p1.x };
      const proj = (r: Quad) => r.map((p) => p.x * n.x + p.y * n.y);
      const pa = proj(a), pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function segmentHitsQuad(a: Pt, b: Pt, q: Quad): boolean {
  if (pointInQuad(a, q) || pointInQuad(b, q)) return true;
  for (let i = 0; i < 4; i++) if (segmentsCross(a, b, q[i]!, q[(i + 1) % 4]!)) return true;
  return false;
}

const quadBounds = (q: Quad) => {
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

export interface TextOptions {
  /** Keep off building lines too (the default). */
  avoidLines?: boolean;
  inset?: number;
  /** The symbol this text tags, which it may sit beside. */
  owner?: Pt;
}

export interface Mark {
  at: Pt;
  /** How far round the point the symbol reaches. */
  r: number;
}

/** Everything already on the plan view, for the next item to keep clear of. */
export class Occupancy {
  /** Text and boxes: nothing may overlap them. */
  readonly labels: Quad[] = [];
  /** Leaders: no text or box may sit on them. */
  readonly leaders: Segment[] = [];
  /** Symbols and anchor dots: no text or box may cover them. */
  readonly marks: Mark[] = [];
  /** Linework text should not sit on: building outlines. Leaders and boxes may cross it. */
  readonly lines: Segment[] = [];
  /** Linework a callout box should rather not cover: lot lines, roads, utility lines. */
  readonly softLines: Segment[] = [];
  /** Areas a callout box should rather not cover, such as the battery zone. */
  readonly keepClear: Quad[] = [];

  readonly view: Rect;

  constructor(view: Rect) {
    this.view = view;
  }

  inView(q: Quad, inset = 0): boolean {
    const b = quadBounds(q);
    return b.x0 >= this.view.x + inset && b.x1 <= this.view.x + this.view.w - inset && b.y0 >= this.view.y + inset && b.y1 <= this.view.y + this.view.h - inset;
  }

  /** Whether a label can go here: in the view, over no other label, leader, symbol, or (by default) building line. */
  freeForText(q: Quad, opts: TextOptions = {}): boolean {
    const { avoidLines = true, inset = 8, owner } = opts;
    if (!this.inView(q, inset)) return false;
    if (this.labels.some((l) => quadsOverlap(q, l))) return false;
    if (this.leaders.some(([a, b]) => segmentHitsQuad(a, b, q))) return false;
    // A symbol's own tag may sit beside it, never on it.
    if (this.marks.some((m) => (owner && m.at.x === owner.x && m.at.y === owner.y ? pointInQuad(m.at, q, 2) : pointInQuad(m.at, q, m.r)))) return false;
    if (avoidLines && this.lines.some(([a, b]) => segmentHitsQuad(a, b, q))) return false;
    return true;
  }

  /** Place a label at the first free spot of its candidates, and register it. */
  placeText<T extends { quad: Quad }>(candidates: T[], opts?: TextOptions): T | null {
    const hit = candidates.find((c) => this.freeForText(c.quad, opts)) ?? null;
    if (hit) this.labels.push(hit.quad);
    return hit;
  }
}

// ------------------------------------------------------------------ callouts

export const CALLOUT_FONT = 22;
export const CALLOUT_LINE_H = 27;
export const CALLOUT_PAD_X = 12;
const SHOULDER = 22;
const BOX_GAP = 10;

export interface CalloutSpec {
  /** Where the leader may end; a typical callout offers every instance and takes the one with the best spot. */
  anchors: Pt[];
  lines: string[];
  color: string;
  /** Lower places first; when space runs out, the highest are left off. */
  priority: number;
  /** Half the width and height of the symbol at the anchor: the leader stops at its edge. */
  extent?: { hw: number; hh: number };
}

export interface PlacedCallout {
  anchor: Pt;
  /** Leader: anchor, elbow, then a short level shoulder into the box. */
  elbow: Pt;
  attach: Pt;
  box: Rect;
  lines: string[];
  color: string;
}

export const calloutSize = (lines: string[]) => ({
  w: Math.max(...lines.map((l) => l.length * CALLOUT_FONT * 0.65)) + 2 * CALLOUT_PAD_X,
  h: lines.length * CALLOUT_LINE_H + 14,
});

const RADII = [36, 64, 100, 145, 200, 265, 340, 430, 540, 660];
const DIRECTIONS = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8);

interface Candidate {
  anchor: Pt;
  elbow: Pt;
  attach: Pt;
  box: Rect;
  cost: number;
}

function candidatesFor(spec: CalloutSpec, anchor: Pt, occ: Occupancy): Candidate[] {
  const { w, h } = calloutSize(spec.lines);
  const out: Candidate[] = [];
  const boxAt = (elbow: Pt, side: 'left' | 'right'): Candidate => {
    const attach = { x: elbow.x + (side === 'right' ? SHOULDER : -SHOULDER), y: elbow.y };
    const box = { x: side === 'right' ? attach.x : attach.x - w, y: attach.y - h / 2, w, h };
    return { anchor, elbow, attach, box, cost: Math.hypot(elbow.x - anchor.x, elbow.y - anchor.y) + SHOULDER };
  };
  for (const r of RADII) {
    for (const t of DIRECTIONS) {
      const elbow = { x: anchor.x + Math.cos(t) * r, y: anchor.y + Math.sin(t) * r };
      const dx = elbow.x - anchor.x;
      if (Math.abs(dx) < 1e-6) out.push(boxAt(elbow, 'right'), boxAt(elbow, 'left'));
      else out.push(boxAt(elbow, dx > 0 ? 'right' : 'left'));
    }
  }
  // The margin columns, the fallback when nothing near the feature is free.
  const v = occ.view;
  for (const side of ['left', 'right'] as const) {
    const x = side === 'left' ? v.x + 20 : v.x + v.w - 20 - w;
    for (let y = v.y + 20; y + h <= v.y + v.h - 20; y += 12) {
      const attach = { x: side === 'left' ? x + w : x, y: y + h / 2 };
      const elbow = { x: attach.x + (side === 'left' ? SHOULDER : -SHOULDER), y: attach.y };
      out.push({ anchor, elbow, attach, box: { x, y, w, h }, cost: Math.hypot(elbow.x - anchor.x, elbow.y - anchor.y) + SHOULDER + 250 });
    }
  }
  return out;
}

function feasible(c: Candidate, occ: Occupancy): number | null {
  const q = quadOfRect(c.box);
  const spaced = quadOfRect(c.box, BOX_GAP);
  if (!occ.inView(q, 14)) return null;
  // Over no label or box, no symbol, no anchor dot (its own included), and no leader.
  if (occ.labels.some((l) => quadsOverlap(spaced, l))) return null;
  if (occ.marks.some((m) => pointInQuad(m.at, q, m.r + 4))) return null;
  if (pointInQuad(c.anchor, q, 14)) return null;
  if (occ.leaders.some(([a, b]) => segmentHitsQuad(a, b, quadOfRect(c.box, 4)))) return null;
  // The leader passes through no box or label, except where its own anchor already sits inside one.
  const legs: Segment[] = [[c.anchor, c.elbow], [c.elbow, c.attach]];
  for (const l of occ.labels) {
    if (pointInQuad(c.anchor, l)) continue;
    if (legs.some(([a, b]) => segmentHitsQuad(a, b, l))) return null;
  }
  let cost = c.cost;
  // Leaders crossing leaders read badly; symbols under a leader slightly less so.
  for (const [a, b] of occ.leaders) for (const [p, r] of legs) if (segmentsCross(a, b, p, r)) cost += 300;
  for (const m of occ.marks) {
    if (Math.hypot(m.at.x - c.anchor.x, m.at.y - c.anchor.y) < 2) continue;
    if (segmentHitsQuad(c.anchor, c.elbow, quadOfRect({ x: m.at.x, y: m.at.y, w: 0, h: 0 }, m.r))) cost += 80;
  }
  for (const k of occ.keepClear) if (quadsOverlap(q, k)) cost += 220;
  for (const [a, b] of occ.lines) if (segmentHitsQuad(a, b, q)) cost += 25;
  for (const [a, b] of occ.softLines) if (segmentHitsQuad(a, b, q)) cost += 20;
  return cost;
}

/**
 * Place each callout in the free spot nearest its feature: a search over spots around each anchor, scored by
 * leader length and crossings, with the plan's margin columns as the fallback. Callouts place in priority
 * order, and one with no free spot is left off.
 */
export function placeCallouts(specs: CalloutSpec[], occ: Occupancy): PlacedCallout[] {
  const order = specs.map((spec, i) => ({ spec, i })).sort((a, b) => a.spec.priority - b.spec.priority || a.i - b.i);
  const base = { labels: occ.labels.length, leaders: occ.leaders.length, marks: occ.marks.length };
  const chosen: { spec: CalloutSpec; c: Candidate }[] = [];
  const register = (c: Candidate) => {
    occ.labels.push(quadOfRect(c.box));
    occ.leaders.push([c.anchor, c.elbow], [c.elbow, c.attach]);
    occ.marks.push({ at: c.anchor, r: 7 });
  };
  const search = (spec: CalloutSpec) => {
    const anchors = spec.anchors.filter((a) => a.x > occ.view.x + 4 && a.x < occ.view.x + occ.view.w - 4 && a.y > occ.view.y + 4 && a.y < occ.view.y + occ.view.h - 4);
    let best: { c: Candidate; cost: number } | null = null;
    for (const anchor of anchors.slice(0, 12)) {
      for (const c of candidatesFor(spec, anchor, occ)) {
        if (best && c.cost >= best.cost) continue;
        const cost = feasible(c, occ);
        if (cost !== null && (!best || cost < best.cost)) best = { c, cost };
      }
    }
    return best;
  };
  for (const { spec } of order) {
    const best = search(spec);
    if (!best) continue;
    chosen.push({ spec, c: best.c });
    register(best.c);
  }
  // Then each callout looks again with all the others in place, and moves if it finds a better spot: an early
  // callout no longer blocks a later one's short, uncrossed leader.
  const rebuild = (skip: number) => {
    occ.labels.length = base.labels;
    occ.leaders.length = base.leaders;
    occ.marks.length = base.marks;
    chosen.forEach((ch, j) => j !== skip && register(ch.c));
  };
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (let i = 0; i < chosen.length; i++) {
      rebuild(i);
      const now = feasible(chosen[i]!.c, occ);
      const best = search(chosen[i]!.spec);
      if (best && (now === null || best.cost < now - 1)) {
        chosen[i]!.c = best.c;
        moved = true;
      }
    }
    rebuild(-1);
    if (!moved) break;
  }
  return chosen.map(({ spec, c }) => {
    // The leader stops at the edge of the symbol it points to, so the dot doesn't cover it.
    let anchor = c.anchor;
    if (spec.extent) {
      const dx = c.elbow.x - c.anchor.x, dy = c.elbow.y - c.anchor.y;
      const t = Math.min(dx ? spec.extent.hw / Math.abs(dx) : Infinity, dy ? spec.extent.hh / Math.abs(dy) : Infinity);
      if (Number.isFinite(t) && t < 1) anchor = { x: c.anchor.x + dx * t, y: c.anchor.y + dy * t };
    }
    return { anchor, elbow: c.elbow, attach: c.attach, box: c.box, lines: spec.lines, color: spec.color };
  });
}

// ------------------------------------------------------------------ along a line

/** The point a share of the way along a polyline, and the line's direction there. */
export function along(pts: Pt[], t: number): { at: Pt; angleDeg: number } | null {
  if (pts.length < 2) return null;
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
  const total = lengths.reduce((s, l) => s + l, 0);
  if (total === 0) return null;
  let target = total * t;
  for (let i = 0; i < lengths.length; i++) {
    const l = lengths[i]!;
    if (target <= l || i === lengths.length - 1) {
      const a = pts[i]!, b = pts[i + 1]!;
      const u = l === 0 ? 0 : Math.min(1, target / l);
      return { at: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
    }
    target -= l;
  }
  return null;
}

/** An angle turned so text along it reads left to right. */
export const upright = (deg: number) => (deg > 90 ? deg - 180 : deg < -90 ? deg + 180 : deg);

export const polylineLength = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);

/** Split a callout line longer than `max` characters at word breaks. */
export function wrapCallout(line: string, max = 30): string[] {
  if (line.length <= max) return [line];
  const out: string[] = [];
  let cur = '';
  // "TYP. OF 11" stays on one line.
  for (const word of line.replace(/TYP\. OF (\d+)/g, 'TYP.\u00a0OF\u00a0$1').split(' ')) {
    if (cur && (cur + ' ' + word).length > max) {
      out.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) out.push(cur);
  return out;
}
