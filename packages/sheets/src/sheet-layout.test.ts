import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RecordVersionSchema, type MapFeature, type RecordVersion } from '@eqore/contract';
import sample from '../../contract/samples/record.sample.json' with { type: 'json' };
import { EngineeringSitePlan } from './EngineeringSitePlan.tsx';
import { Occupancy, placeCallouts, quadOfRect, quadsOverlap, textQuad, wrapCallout, type Pt, type Quad } from './sheet-layout.ts';

const text = (value: string) => ({ type: 'text' as const, value });

// A deterministic scatter, so the test lays out the same sheet every run.
function scatter(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** The synthetic sample with a building and far more on and around it than a real site holds. */
function crowdedRecord(): RecordVersion {
  const r = RecordVersionSchema.parse(structuredClone(sample));
  const [cx, cy] = [-71.8, 42.26];
  const dx = 0.0005, dy = 0.00022;
  type P = [number, number];
  const box = (x0: number, y0: number, x1: number, y1: number): P[][] => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  const rand = scatter(7);
  const extra: MapFeature[] = [
    { id: 'bldg', kind: 'building_outline', field: 'building_outline', geometry: { type: 'Polygon', coordinates: box(cx - dx, cy - dy, cx + dx, cy + dy) }, label: 'Building (SYNTHETIC)' },
    { id: 'pave', kind: 'constraint', field: 'paved_area_sqft', geometry: { type: 'Polygon', coordinates: box(cx - dx * 1.6, cy - dy * 2.4, cx + dx * 1.6, cy + dy * 2.4) }, label: 'Pavement (SYNTHETIC)', attributes: { basis: text('plan set') } },
    { id: 'pave2', kind: 'constraint', field: 'paved_area_sqft', geometry: { type: 'Polygon', coordinates: box(cx + dx * 1.2, cy - dy, cx + dx * 1.9, cy + dy) }, label: 'Pavement (SYNTHETIC)' },
    {
      id: 'stripes',
      kind: 'constraint',
      field: 'parking_stalls',
      geometry: { type: 'MultiLineString', coordinates: Array.from({ length: 30 }, (_, i): P[] => [[cx - dx + i * 0.00003, cy + dy * 1.3], [cx - dx + i * 0.00003, cy + dy * 2]]) },
      label: 'Stripes (SYNTHETIC)',
      attributes: { basis: text('plan set') },
    },
    { id: 'road', kind: 'road', field: 'road_name', geometry: { type: 'LineString', coordinates: [[-71.803, 42.2588], [-71.797, 42.2588]] }, label: 'Sample Way, the street in the address' },
    { id: 'dim', kind: 'dimension_line', field: 'lot_width_ft', geometry: { type: 'LineString', coordinates: [[cx - dx, cy + dy * 2.2], [cx + dx, cy + dy * 2.2]] }, label: '270 ft' },
    { id: 'zone', kind: 'candidate_area', field: 'candidate_areas', geometry: { type: 'Polygon', coordinates: box(cx - dx * 1.5, cy - dy * 0.5, cx - dx * 1.15, cy + dy * 0.5) }, label: 'Zone', attributes: { zone_kind: text('feasible_bess_recommended') } },
    { id: 'pad', kind: 'existing_equipment', field: 'pad_zone_x_ft', geometry: { type: 'Point', coordinates: [cx - dx * 1.3, cy] }, label: '(N) BESS PAD', attributes: { equipment_type: text('bess_pad'), basis: text('concept') } },
    { id: 'disc', kind: 'existing_equipment', field: 'electrical_poi', geometry: { type: 'Point', coordinates: [cx - dx * 1.22, cy] }, label: '(N) AC DISCONNECT', attributes: { equipment_type: text('ac_disconnect'), basis: text('concept') } },
    { id: 'brk', kind: 'existing_equipment', field: 'electrical_poi', geometry: { type: 'Point', coordinates: [cx - dx * 0.95, cy] }, label: '(N) NEW BREAKER IN THE MAIN DISTRIBUTION PANEL', attributes: { equipment_type: text('new_breaker'), basis: text('concept') } },
    { id: 'trench', kind: 'utility_line', field: 'electrical_poi', geometry: { type: 'LineString', coordinates: [[cx - dx * 1.22, cy], [cx - dx * 0.95, cy]] }, label: '(N) TRENCH ROUTE', attributes: { basis: text('concept') } },
    { id: 'svc', kind: 'existing_equipment', field: 'switchboard_location', geometry: { type: 'Point', coordinates: [cx - dx * 0.95, cy + 0.00001] }, label: '(E) MAIN SWITCHBOARD', attributes: { equipment_type: text('service_entrance') } },
  ];
  const types = ['light_pole', 'hydrant', 'catch_basin', 'manhole', 'pad_mount_transformer', 'meter', 'utility_pole'];
  for (let i = 0; i < 42; i++) {
    const type = types[i % types.length]!;
    const at: P = [cx + (rand() * 2 - 1) * dx * 1.8, cy + (rand() * 2 - 1) * dy * 2.6];
    extra.push({ id: `eq-${i}`, kind: 'existing_equipment', field: 'plan_set_equipment', geometry: { type: 'Point', coordinates: at }, label: type, attributes: { equipment_type: text(type), basis: text('plan set') } });
  }
  r.features = [...r.features, ...extra];
  return r;
}

const nums = (s: string) => s.split(/[ ,]/).map(Number);
const rectOf = (s: string) => {
  const [x, y, w, h] = nums(s) as [number, number, number, number];
  return { x, y, w, h };
};
const strictlyInside = (p: Pt, b: { x: number; y: number; w: number; h: number }) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

describe('sheet layout', () => {
  it('measures text along its angle and wraps long callout lines at word breaks', () => {
    const flat = textQuad({ x: 0, y: 0 }, 'ABCDEFGHIJ', 20, 0);
    const steep = textQuad({ x: 0, y: 0 }, 'ABCDEFGHIJ', 20, 90);
    expect(quadsOverlap(flat, quadOfRect({ x: 60, y: -5, w: 10, h: 10 }))).toBe(true);
    expect(quadsOverlap(steep, quadOfRect({ x: 60, y: -5, w: 10, h: 10 }))).toBe(false);
    expect(wrapCallout('(N) NEW BREAKER IN THE MAIN DISTRIBUTION PANEL')).toEqual(['(N) NEW BREAKER IN THE MAIN', 'DISTRIBUTION PANEL']);
  });

  it('places crowded callouts without overlap and leaves off the lowest priority first', () => {
    const occ = new Occupancy({ x: 0, y: 0, w: 900, h: 600 });
    const anchors = Array.from({ length: 40 }, (_, i) => ({ x: 300 + (i % 8) * 40, y: 200 + Math.floor(i / 8) * 40 }));
    // Each anchor is a drawn symbol, as on the sheet, which no box may cover.
    for (const at of anchors) occ.marks.push({ at, r: 10 });
    const specs = anchors.map((a, i) => ({ anchors: [a], lines: [`(E) ITEM ${i}`], color: '#111', priority: i < 6 ? 1 : 5 }));
    const placed = placeCallouts(specs, occ);
    const boxes = placed.map((p) => p.box);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(quadsOverlap(quadOfRect(boxes[i]!), quadOfRect(boxes[j]!))).toBe(false);
    for (const b of boxes) for (const a of anchors) expect(strictlyInside(a, b)).toBe(false);
    // Every high-priority callout found a spot.
    for (let i = 0; i < 6; i++) expect(placed.some((p) => p.lines[0] === `(E) ITEM ${i}`)).toBe(true);
  });
});

describe('the G-100 sheet on a crowded record', () => {
  const html = renderToStaticMarkup(createElement(EngineeringSitePlan, { record: crowdedRecord(), aerial: false }));
  const callouts = [...html.matchAll(/data-callout="([^"]+)" data-anchor="([^"]+)" data-leader="([^"]+)"/g)].map((m) => ({
    box: rectOf(m[1]!),
    anchor: { x: nums(m[2]!)[0]!, y: nums(m[2]!)[1]! },
    leader: nums(m[3]!),
  }));
  const labels = [...html.matchAll(/data-label="([^"]+)"/g)].map((m) => m[1]!.split(' ').map((p) => ({ x: Number(p.split(',')[0]), y: Number(p.split(',')[1]) })) as Quad);

  it('places a callout for each kind of traced item, marked typical, not one per object', () => {
    expect(callouts.length).toBeGreaterThanOrEqual(10);
    expect(html).toMatch(/\(E\) LIGHT POLE, TYP\.\s+OF\s+\d+/);
    expect(html).toMatch(/\(E\) MANHOLE, TYP\.\s+OF\s+\d+/);
    expect(html.match(/\(E\) CATCH BASIN/g)?.length ?? 0).toBeLessThanOrEqual(2); // the callout and the legend row
    expect(html).toContain('TRACED FROM THE SUPPLIED PLAN SET');
  });

  it('never lets two callout boxes touch', () => {
    for (let i = 0; i < callouts.length; i++) {
      for (let j = i + 1; j < callouts.length; j++) expect(quadsOverlap(quadOfRect(callouts[i]!.box), quadOfRect(callouts[j]!.box))).toBe(false);
    }
  });

  it('never puts an anchor dot under a box', () => {
    for (const c of callouts) for (const other of callouts) expect(strictlyInside(c.anchor, other.box)).toBe(false);
  });

  it('runs no leader through another callout box', () => {
    for (const c of callouts) {
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < c.leader.length; i += 2) pts.push({ x: c.leader[i]!, y: c.leader[i + 1]! });
      for (const other of callouts) {
        if (other === c) continue;
        for (let s = 0; s + 1 < pts.length; s++) {
          for (let t = 0; t <= 40; t++) {
            const p = { x: pts[s]!.x + ((pts[s + 1]!.x - pts[s]!.x) * t) / 40, y: pts[s]!.y + ((pts[s + 1]!.y - pts[s]!.y) * t) / 40 };
            expect(strictlyInside(p, other.box)).toBe(false);
          }
        }
      }
    }
  });

  it('keeps every plan label off the callout boxes and off every other label', () => {
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) for (const c of callouts) expect(quadsOverlap(l, quadOfRect(c.box))).toBe(false);
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(quadsOverlap(labels[i]!, labels[j]!)).toBe(false);
  });

  it('keeps every callout inside the plan view, clear of the tables and title block', () => {
    for (const c of callouts) {
      expect(c.box.x).toBeGreaterThanOrEqual(70);
      expect(c.box.y).toBeGreaterThanOrEqual(70);
      expect(c.box.x + c.box.w).toBeLessThanOrEqual(70 + 2330);
      expect(c.box.y + c.box.h).toBeLessThanOrEqual(70 + 1930);
    }
  });
});
