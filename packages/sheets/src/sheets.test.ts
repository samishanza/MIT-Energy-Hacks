import { describe, expect, it } from 'vitest';
import type { MapFeature, RecordVersion } from '@eqore/contract';
import { polygonPath, sheetGeometry } from './geometry.ts';

const ring = (pts: [number, number][]): [number, number][] => [...pts, pts[0]!];

// A 0.002 x 0.002 degree lot near Worcester — roughly 540 x 730 ft.
const LOT: [number, number][] = [
  [-71.77, 42.278],
  [-71.768, 42.278],
  [-71.768, 42.276],
  [-71.77, 42.276],
];

const feature = (kind: MapFeature['kind'], coords: [number, number][], id: string): MapFeature => ({
  id,
  kind,
  field: kind,
  geometry: { type: 'Polygon', coordinates: [ring(coords)] },
});

const recordWith = (features: MapFeature[]): RecordVersion =>
  ({
    id: 'r1',
    contractVersion: '1',
    version: 1,
    createdAt: '2026-11-07T20:00:00.000Z',
    trigger: 'run',
    snapshot: false,
    synthetic: false,
    site: { id: 's1', address: '100 Research Dr, Worcester, MA', region: 'massachusetts', location: [-71.769, 42.277], locationMethod: 'source_read' },
    values: [],
    observations: [],
    features,
    baseMap: null,
    sourceRuns: [],
  }) as RecordVersion;

describe('sheet geometry', () => {
  it('says plainly when there is no lot to draw, instead of inventing one', () => {
    const geo = sheetGeometry(recordWith([]));
    expect(geo.lot).toBeNull();
    expect(geo.pads).toEqual([]);
    expect(geo.reason).toMatch(/no parcel polygon/i);
  });

  it('anchors the frame on the lot, so coordinates read as feet from its corner', () => {
    const geo = sheetGeometry(recordWith([feature('property_line', LOT, 'lot')]));
    expect(geo.lot).toBeTruthy();
    expect(geo.extent.x).toBeCloseTo(0, 1);
    expect(geo.extent.y).toBeCloseTo(0, 1);
    // ~0.002 deg lon at 42 N is about 540 ft; 0.002 deg lat is about 730 ft.
    expect(geo.extent.w).toBeGreaterThan(450);
    expect(geo.extent.w).toBeLessThan(650);
    expect(geo.extent.h).toBeGreaterThan(650);
    expect(geo.extent.h).toBeLessThan(800);
  });

  it('reports lot area from the polygon, not its bounding box', () => {
    const geo = sheetGeometry(recordWith([feature('property_line', LOT, 'lot')]));
    expect(geo.lotAreaSqft).toBeGreaterThan(300_000);
  });

  it('keeps every structure, because each one is a keep-out', () => {
    const b1: [number, number][] = [[-71.7695, 42.2775], [-71.7690, 42.2775], [-71.7690, 42.2770], [-71.7695, 42.2770]];
    const b2: [number, number][] = [[-71.7685, 42.2778], [-71.7683, 42.2778], [-71.7683, 42.2776], [-71.7685, 42.2776]];
    const geo = sheetGeometry(
      recordWith([feature('property_line', LOT, 'lot'), feature('building_outline', b1, 'b1'), feature('building_outline', b2, 'b2')]),
    );
    expect(geo.buildings).toHaveLength(2);
  });

  it('derives pad candidates that avoid the structures', () => {
    const b1: [number, number][] = [[-71.7695, 42.2775], [-71.7690, 42.2775], [-71.7690, 42.2770], [-71.7695, 42.2770]];
    const geo = sheetGeometry(
      recordWith([feature('property_line', LOT, 'lot'), feature('building_outline', b1, 'b1')]),
      { buildingBufferFt: 10, lotSetbackFt: 10, minAreaSqft: 400, stepFt: 10 },
    );
    expect(geo.pads.length).toBeGreaterThan(0);
    for (const p of geo.pads) {
      expect(p.rect.w).toBeGreaterThan(0);
      expect(p.rect.h).toBeGreaterThan(0);
      expect(p.areaSqft).toBeGreaterThanOrEqual(400);
    }
  });

  it('returns no candidate when the keep-outs consume the lot', () => {
    const geo = sheetGeometry(recordWith([feature('property_line', LOT, 'lot')]), {
      lotSetbackFt: 500, // wider than the lot
      buildingBufferFt: 10,
      minAreaSqft: 400,
    });
    expect(geo.pads).toEqual([]);
  });
});

describe('path building', () => {
  it('closes the ring', () => {
    const d = polygonPath({ outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] });
    expect(d).toBe('M 0 0 L 10 0 L 10 10 Z');
  });

  it('emits a sub-path per hole', () => {
    const d = polygonPath({
      outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      holes: [[{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }]],
    });
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it('is empty for an empty ring', () => {
    expect(polygonPath({ outer: [] })).toBe('');
  });
});

describe('overlays', () => {
  it('reads slope and its fall direction out of the record', async () => {
    const { aspectFromReason, quantity } = await import('./overlays.tsx');
    const record = {
      ...recordWith([]),
      values: [
        {
          field: 'site_slope_pct', label: 'Slope', state: 'inferred', grade: 'reference', owner: 'public_data',
          current: { type: 'quantity', value: 8.02, unit: 'percent' }, method: 'computed', candidates: [],
          observationIds: ['o1'], flags: [], synthetic: false,
          reason: 'From 35 samples across the parcel at about 5 ft resolution, not at a chosen pad. The ground falls toward 259 degrees from north.',
        },
      ],
    } as unknown as RecordVersion;

    expect(quantity(record, 'site_slope_pct')).toBeCloseTo(8.02, 2);
    expect(aspectFromReason(record)).toBe(259);
  });

  it('returns no aspect when the record does not state one', async () => {
    const { aspectFromReason } = await import('./overlays.tsx');
    expect(aspectFromReason(recordWith([]))).toBeNull();
  });

  it('draws certainty the way a draughtsman would', async () => {
    const { strokeForState } = await import('./overlays.tsx');
    // A confirmed line is solid; everything less certain breaks up, and the least
    // certain is faintest. A reader should not need the legend to rank them.
    expect(strokeForState('verified').dash).toBeUndefined();
    expect(strokeForState('inferred').dash).toBeTruthy();
    expect(strokeForState('missing').opacity).toBeLessThan(strokeForState('verified').opacity);
    expect(strokeForState(undefined).opacity).toBeLessThan(1);
  });

  it('scales line weight with the drawing, so it reads the same at any zoom', async () => {
    const { strokeForState } = await import('./overlays.tsx');
    expect(strokeForState('verified', 2).width).toBeCloseTo(strokeForState('verified', 1).width / 2, 6);
  });

  it('knows 2% is where grading starts', async () => {
    const { GRADING_THRESHOLD_PCT } = await import('./overlays.tsx');
    expect(GRADING_THRESHOLD_PCT).toBe(2);
  });
});
