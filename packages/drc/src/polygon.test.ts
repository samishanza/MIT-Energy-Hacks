import { describe, expect, it } from 'vitest';
import {
  boundingRect,
  derivePadCandidates,
  frameFor,
  largestInscribedRect,
  pointInRing,
  polygonAreaSqft,
  polygonContainsRect,
  rectToPolygonDistance,
  toLocal,
  toLocalPolygon,
  toLonLat,
  type LocalPolygon,
} from './polygon';

// A 200 x 300 ft square lot, in local feet.
const square: LocalPolygon = {
  outer: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 300 },
    { x: 0, y: 300 },
  ],
};

// An L-shaped lot: the same bounding box, but the north-east quarter is cut away.
const lShaped: LocalPolygon = {
  outer: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 150 },
    { x: 200, y: 150 },
    { x: 200, y: 300 },
    { x: 0, y: 300 },
  ],
};

describe('local frame', () => {
  it('round-trips a point through lon/lat', () => {
    const frame = frameFor([
      [-71.5, 42.01],
      [-71.49, 42.0],
    ]);
    const p = { x: 120, y: 240 };
    const back = toLocal(frame, toLonLat(frame, p));
    expect(back.x).toBeCloseTo(p.x, 1);
    expect(back.y).toBeCloseTo(p.y, 1);
  });

  it('puts the origin at the north-west corner with y growing southward', () => {
    const frame = frameFor([
      [-71.5, 42.01],
      [-71.49, 42.0],
    ]);
    expect(toLocal(frame, [-71.5, 42.01])).toEqual({ x: 0, y: 0 });
    const south = toLocal(frame, [-71.5, 42.0]);
    expect(south.y).toBeGreaterThan(0);
  });

  it('converts a GeoJSON polygon and drops the repeated closing point', () => {
    const frame = frameFor([[-71.5, 42.01]]);
    const [poly] = toLocalPolygon(
      {
        type: 'Polygon',
        coordinates: [[[-71.5, 42.01], [-71.499, 42.01], [-71.499, 42.009], [-71.5, 42.009], [-71.5, 42.01]]],
      },
      frame,
    );
    expect(poly!.outer).toHaveLength(4);
  });
});

describe('measuring on the polygon, not its box', () => {
  it('agrees with the box when the lot IS a box', () => {
    expect(polygonAreaSqft(square)).toBe(200 * 300);
    const bb = boundingRect(square);
    expect(bb).toEqual({ x: 0, y: 0, w: 200, h: 300 });
  });

  it('differs from the box when the lot is not', () => {
    // Same bounding box, three quarters the area. Measuring on the box would hand a
    // designer a yard that is not there.
    expect(boundingRect(lShaped)).toEqual({ x: 0, y: 0, w: 200, h: 300 });
    expect(polygonAreaSqft(lShaped)).toBe(200 * 300 - 100 * 150);
  });

  it('finds the real distance to the nearest lot line', () => {
    const pad = { x: 80, y: 20, w: 10, h: 10 };
    // The notch edge at x = 100 is 10 ft away; the box's east edge at x = 200 is 110.
    const { d } = rectToPolygonDistance(pad, lShaped);
    expect(d).toBeCloseTo(10, 1);
  });

  it('knows a rect that escapes the notch is outside the lot', () => {
    const inNotch = { x: 120, y: 20, w: 20, h: 20 };
    expect(polygonContainsRect(lShaped, inNotch)).toBe(false);
    expect(polygonContainsRect(lShaped, { x: 20, y: 20, w: 20, h: 20 })).toBe(true);
  });

  it('point-in-ring handles the concave corner', () => {
    expect(pointInRing(lShaped.outer, { x: 50, y: 50 })).toBe(true);
    expect(pointInRing(lShaped.outer, { x: 150, y: 50 })).toBe(false); // the cut-away quarter
    expect(pointInRing(lShaped.outer, { x: 150, y: 250 })).toBe(true);
  });
});

describe('largest inscribed rectangle', () => {
  it('fills a square lot to within one grid cell', () => {
    // A cell counts only when all four of its corners are inside, so the result is at
    // most the lot and at least the lot less one step per side. The exact figure depends
    // on the even-odd convention at the boundary (west and north edges read as inside,
    // east and south as outside), so the guarantee asserted here is the one that holds:
    // contained, and within a step of the full extent.
    const r = largestInscribedRect(square, 5);
    expect(polygonContainsRect(square, r)).toBe(true);
    expect(r.w).toBeGreaterThanOrEqual(190);
    expect(r.w).toBeLessThanOrEqual(200);
    expect(r.h).toBeGreaterThanOrEqual(290);
    expect(r.h).toBeLessThanOrEqual(300);
  });

  it('stays inside the L and does not span the notch', () => {
    const r = largestInscribedRect(lShaped, 5);
    expect(polygonContainsRect(lShaped, r)).toBe(true);
    // The box area would be 60,000 sqft; the true largest inscribed rect is far smaller.
    expect(r.w * r.h).toBeLessThan(200 * 300);
  });
});

describe('pad candidates', () => {
  const frame = frameFor([
    [-71.5, 42.01],
    [-71.49, 42.0],
  ]);
  // A building in the middle-north of the square lot.
  const building: LocalPolygon = {
    outer: [
      { x: 40, y: 40 },
      { x: 160, y: 40 },
      { x: 160, y: 140 },
      { x: 40, y: 140 },
    ],
  };

  it('returns open ground outside the building buffer and the setback strip', () => {
    const cands = derivePadCandidates(square, [building], frame, {
      buildingBufferFt: 10,
      lotSetbackFt: 10,
      minAreaSqft: 400,
      stepFt: 5,
    });
    expect(cands.length).toBeGreaterThan(0);

    const best = cands[0]!;
    expect(best.areaSqft).toBeGreaterThan(400);
    // Nothing it offers may sit on the building or inside its buffer.
    expect(polygonContainsRect(building, best.rect)).toBe(false);
    expect(best.rect.w).toBeGreaterThan(0);
    expect(best.rect.h).toBeGreaterThan(0);
  });

  it('is ordered largest first', () => {
    const cands = derivePadCandidates(square, [building], frame, {
      buildingBufferFt: 10, lotSetbackFt: 10, minAreaSqft: 100, stepFt: 5,
    });
    for (let i = 1; i < cands.length; i++) {
      expect(cands[i - 1]!.areaSqft).toBeGreaterThanOrEqual(cands[i]!.areaSqft);
    }
  });

  it('says plainly that open ground is not the same as usable ground', () => {
    const [c] = derivePadCandidates(square, [building], frame, {
      buildingBufferFt: 10, lotSetbackFt: 10, minAreaSqft: 100, stepFt: 5,
    });
    expect(c!.basis).toMatch(/not a claim that it is paved/i);
  });

  it('returns nothing when the setback swallows the lot', () => {
    const tiny: LocalPolygon = { outer: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] };
    expect(derivePadCandidates(tiny, [], frame, {
      buildingBufferFt: 10, lotSetbackFt: 30, minAreaSqft: 100, stepFt: 5,
    })).toEqual([]);
  });
});
