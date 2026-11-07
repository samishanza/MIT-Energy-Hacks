import type { Opening, Rect, Side, Site } from './types';

export const v = (p: { value: number }) => p.value;

export function buildingRect(s: Site): Rect {
  return { x: v(s.building.x), y: v(s.building.y), w: v(s.building.w), h: v(s.building.h) };
}

export function padRect(s: Site): Rect {
  return { x: v(s.padZone.x), y: v(s.padZone.y), w: v(s.padZone.w), h: v(s.padZone.h) };
}

/** Opening as a zero-thickness segment on the building wall. y grows southward. */
export function openingSegment(s: Site, o: Opening): Rect {
  const b = buildingRect(s);
  const at = v(o.at);
  switch (o.wall) {
    case 'north':
      return { x: b.x + at, y: b.y, w: o.width, h: 0 };
    case 'south':
      return { x: b.x + at, y: b.y + b.h, w: o.width, h: 0 };
    case 'west':
      return { x: b.x, y: b.y + at, w: 0, h: o.width };
    case 'east':
      return { x: b.x + b.w, y: b.y + at, w: 0, h: o.width };
  }
}

/** Minimum distance between two axis-aligned rectangles, with witness points. */
export function rectDistance(a: Rect, b: Rect) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h, bx2 = b.x + b.w, by2 = b.y + b.h;
  const dx = Math.max(b.x - ax2, a.x - bx2, 0);
  const dy = Math.max(b.y - ay2, a.y - by2, 0);
  // witness: closest points
  const px = (lo1: number, hi1: number, lo2: number, hi2: number): [number, number] => {
    if (hi1 < lo2) return [hi1, lo2];
    if (hi2 < lo1) return [lo1, hi2];
    const m = (Math.max(lo1, lo2) + Math.min(hi1, hi2)) / 2;
    return [m, m];
  };
  const [x1, x2] = px(a.x, ax2, b.x, bx2);
  const [y1, y2] = px(a.y, ay2, b.y, by2);
  return { d: Math.hypot(dx, dy), witness: { x1, y1, x2, y2 } };
}

/** Distance from a rect to one edge of the lot. */
export function distToLotSide(r: Rect, side: Side, lotW: number, lotH: number) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  switch (side) {
    case 'north':
      return { d: r.y, witness: { x1: cx, y1: r.y, x2: cx, y2: 0 } };
    case 'south':
      return { d: lotH - (r.y + r.h), witness: { x1: cx, y1: r.y + r.h, x2: cx, y2: lotH } };
    case 'west':
      return { d: r.x, witness: { x1: r.x, y1: cy, x2: 0, y2: cy } };
    case 'east':
      return { d: lotW - (r.x + r.w), witness: { x1: r.x + r.w, y1: cy, x2: lotW, y2: cy } };
  }
}

export const SIDES: Side[] = ['north', 'south', 'east', 'west'];

export function contains(outer: Rect, inner: Rect, eps = 1e-6) {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.w <= outer.x + outer.w + eps &&
    inner.y + inner.h <= outer.y + outer.h + eps
  );
}
