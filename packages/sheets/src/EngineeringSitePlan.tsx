// G-100 overall site plan, drawn the way an issued plan set draws one.
//
// Modeled on the supplied BESS IFC samples (Sample 1 G-100, Sample 2 E-110): a faded
// aerial underlay, drafting line types, capitalized callouts on leaders marked (E) for
// existing, a data table, a legend, sheet notes, a north arrow with the drawing title
// and scale, and a title strip. Line types follow common CAD convention: phantom for the
// property line, center line for road centerlines, a lettered line for electric
// utilities, and a dashed line for buffers.
//
// It draws only what the record holds. No equipment location is proposed.

import buffer from '@turf/buffer';
import { useMemo, type ReactNode } from 'react';
import type { MapFeature, RecordVersion } from '@eqore/contract';
import { frameFor, polygonAreaSqft, toLocal, toLocalPolygon, toLonLat, type LocalFrame, type LocalPolygon } from '@eqore/geom';
import {
  along,
  CALLOUT_FONT,
  CALLOUT_LINE_H,
  CALLOUT_PAD_X,
  Occupancy,
  placeCallouts,
  polylineLength,
  quadOfRect,
  textQuad,
  textWidth,
  upright,
  wrapCallout,
  type CalloutSpec,
  type PlacedCallout,
  type Quad,
} from './sheet-layout.ts';
import {
  chooseScale,
  dimensionText,
  fallDirection,
  feederSummary,
  printed,
  roadName,
  sheetNotes,
  siteDataRows,
  attributeText,
  nearest,
  lineClassOf,
  feederIdOf,
  plainLabel,
  drawnEquipment,
  workArea,
  workPoints,
} from './site-plan-data.ts';

// Sheet units: 100 per inch on a 36 x 24 in sheet.
const W = 3600;
const H = 2400;
const VIEW = { x: 70, y: 70, w: 2330, h: 1930 };
const RIGHT = { x: 2440, w: 790 };
const STRIP = { x: 3260, w: 300 };
const FONT = 'Arial, Helvetica, sans-serif';
const INK = '#111';
const UTILITY = '#b5121b';
const TRANSMISSION = '#6b0f1a';
const NEW = '#0b5cad';
const WATER = '#1f5f86';

type Pt = { x: number; y: number };
type Pos = [number, number];

export interface EngineeringSitePlanProps {
  record: RecordVersion;
  /** Draw the aerial underlay. Off in tests, which have no network. */
  aerial?: boolean;
}

// ------------------------------------------------------------------ geometry

function lotOf(record: RecordVersion) {
  const lot = record.features.find((f) => f.kind === 'property_line' && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
  if (!lot) return null;
  const coords = (lot.geometry.type === 'Polygon' ? lot.geometry.coordinates : lot.geometry.coordinates.flat()).flat() as Pos[];
  return { feature: lot, frame: frameFor(coords) };
}

const linesOf = (f: MapFeature): Pos[][] =>
  f.geometry.type === 'LineString'
    ? [f.geometry.coordinates as Pos[]]
    : f.geometry.type === 'MultiLineString'
      ? (f.geometry.coordinates as Pos[][])
      : [];

const polygonsOfFeature = (f: MapFeature, frame: LocalFrame): LocalPolygon[] =>
  f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon' ? toLocalPolygon(f.geometry as Parameters<typeof toLocalPolygon>[0], frame) : [];

function bounds(points: Pt[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const centroid = (pts: Pt[]): Pt => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

// ------------------------------------------------------------------ aerial tiles

function tileXY(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

function tileCorner(x: number, y: number, z: number): Pos {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lon, lat];
}

// ------------------------------------------------------------------ the sheet

export function EngineeringSitePlan({ record, aerial = true }: EngineeringSitePlanProps) {
  const drawing = useMemo(() => layout(record), [record]);
  if (!drawing) {
    return (
      <figure className="sheet sheet--empty">
        <p>This record has no parcel polygon, so there is no lot to draw.</p>
      </figure>
    );
  }
  const { toSheet, scale, k, lotSheet, frame, view } = drawing;
  const path = (pts: Pt[], close = true) => `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}${close ? ' Z' : ''}`;
  const sheetLine = (line: Pos[]) => line.map((p) => toSheet(toLocal(frame, p)));

  const buildings = record.features
    .filter((f) => f.kind === 'building_outline')
    .flatMap((f) => polygonsOfFeature(f, frame))
    .map((poly) => ({ poly, area: polygonAreaSqft(poly), sheet: poly.outer.map(toSheet) }))
    .sort((a, b) => b.area - a.area);
  const roads = record.features.filter((f) => f.kind === 'road');
  const utilityLines = record.features.filter((f) => f.kind === 'utility_line');
  const feeders = utilityLines.filter((f) => lineClassOf(f) === 'feeder');
  const segments = utilityLines.filter((f) => lineClassOf(f) === 'segment');
  const transmission = utilityLines.filter((f) => lineClassOf(f) === 'transmission');
  const servicePaths = utilityLines.filter((f) => lineClassOf(f) === 'service');
  const detectedLines = utilityLines.filter((f) => lineClassOf(f) === 'detected');
  const trenches = utilityLines.filter((f) => attributeText(f, 'basis') === 'CONCEPT');
  // Two sources often mark the same pole or manhole a few feet apart: the sheet draws one symbol for a kind of item
  // that close to another (15 ft for utility poles, which stand far apart; 5 ft for anything else), the plan set's
  // first. The record keeps both.
  const equipment = drawnEquipment(record.features)
    .filter((f) => f.kind === 'existing_equipment' && f.geometry.type === 'Point' && attributeText(f, 'basis') !== 'CONCEPT')
    .map((f) => ({ f, at: toSheet(toLocal(frame, f.geometry.coordinates as Pos)), type: equipmentKind(attributeText(f, 'equipment_type')) }))
    .filter((e) => inside(e.at, view, 20))
    .sort((a, b) => Number(attributeText(b.f, 'basis') === 'PLAN SET') - Number(attributeText(a.f, 'basis') === 'PLAN SET'))
    .filter((e, i, all) => !all.slice(0, i).some((o) => o.type === e.type && Math.hypot(o.at.x - e.at.x, o.at.y - e.at.y) < (e.type === 'UTILITY_POLE' ? 15 : 5) * k));
  const wetlands = record.features.filter((f) => f.kind === 'constraint' && f.field === 'wetlands_nearby' && f.geometry.type !== 'Point');
  const paved = record.features.filter((f) => f.kind === 'constraint' && f.field === 'paved_area_sqft' && f.geometry.type !== 'Point');
  const stallRows = record.features.filter((f) => f.field === 'parking_stalls' && f.geometry.type === 'Polygon');
  const stripes = record.features.filter((f) => f.field === 'parking_stalls' && f.geometry.type === 'MultiLineString');
  const isFeasible = (f: MapFeature) => (attributeText(f, 'zone_kind') ?? '').startsWith('FEASIBLE_BESS');
  const zoneKind = (f: MapFeature) => attributeText(f, 'zone_kind') ?? '';
  // The preferred zone is hatched; the wider feasible area, with longer runs, is a dashed outline.
  // The recommended area (where the pad would realistically go) is hatched; the area within a 150 ft run is
  // a dashed outline around it. Older records without them fall back to the wider zones.
  const order = ['FEASIBLE_BESS_RECOMMENDED', 'FEASIBLE_BESS_PREFERRED', 'FEASIBLE_BESS'];
  const present = order.filter((k) => record.features.some((f) => f.kind === 'candidate_area' && zoneKind(f) === k));
  const feasible = record.features.filter((f) => f.kind === 'candidate_area' && zoneKind(f) === present[0]);
  const feasibleOuter = present[1] ? record.features.filter((f) => f.kind === 'candidate_area' && zoneKind(f) === present[1]) : [];
  const open = record.features.filter((f) => f.kind === 'candidate_area' && !isFeasible(f));
  const dims = record.features.filter((f) => f.kind === 'dimension_line');
  const inMassachusetts = /massachusetts/i.test(record.site.region);

  const pavedPaths = paved
    .flatMap((p) => polygonsOfFeature(p, frame))
    .map((p) => [p.outer, ...(p.holes ?? [])].map((ring) => path(ring.map(toSheet))).join(' '));

  // Everything on the plan view registers here, so no text, box, or leader lands on another.
  const occ = new Occupancy(view);
  const substations = record.features
    .filter((f) => f.kind === 'substation' && f.geometry.type === 'Point')
    .map((f) => ({ f, at: toSheet(toLocal(frame, f.geometry.coordinates as Pos)), proposed: f.field === 'proposed_substations_nearby' }))
    .filter((s) => inside(s.at, view, 40));
  // The concept layout: new equipment at the nearest open ground, never a design.
  const concept = record.features
    .filter((f) => f.kind === 'existing_equipment' && f.geometry.type === 'Point' && attributeText(f, 'basis') === 'CONCEPT')
    .map((f) => ({ f, at: toSheet(toLocal(frame, f.geometry.coordinates as Pos)), type: attributeText(f, 'equipment_type') ?? '' }))
    .filter((e) => inside(e.at, view, 20));
  for (const e of equipment) occ.marks.push({ at: e.at, r: SYMBOL_REACH[e.type] ?? 28 });
  for (const s of substations) occ.marks.push({ at: s.at, r: 26 });
  for (const c of concept) {
    if (c.type === 'BESS_PAD') occ.marks.push({ at: c.at, r: Math.max(14 * k, 18, 11.5 * k) / 2 + 4 });
    else if (c.type === 'AC_DISCONNECT') occ.marks.push({ at: { x: c.at.x + 28, y: c.at.y }, r: 14 });
    else occ.marks.push({ at: c.at, r: 13 });
  }
  for (const b of buildings) b.sheet.forEach((p, i) => occ.lines.push([p, b.sheet[(i + 1) % b.sheet.length]!]));
  const segmentsOf = (pts: Pt[], close = false): [Pt, Pt][] => (close ? pts.map((p, i) => [p, pts[(i + 1) % pts.length]!] as [Pt, Pt]) : pts.slice(1).map((p, i) => [pts[i]!, p] as [Pt, Pt]));
  occ.softLines.push(...segmentsOf(lotSheet, true));
  for (const f of [...roads, ...utilityLines]) for (const line of linesOf(f)) occ.softLines.push(...segmentsOf(sheetLine(line)));
  for (const z of feasible) for (const p of polygonsOfFeature(z, frame)) occ.keepClear.push(boundsQuad(p.outer.map(toSheet)));

  // The fall arrow takes the first corner of the plan with nothing under it.
  const fall = fallDirection(record);
  const slope = printed(record, 'site_slope_pct');
  const fallAt =
    fall !== null && slope
      ? occ.placeText(
          [
            { x: view.x + view.w - 190, y: view.y + 130 },
            { x: view.x + 190, y: view.y + 130 },
            { x: view.x + view.w - 190, y: view.y + view.h - 190 },
            { x: view.x + 190, y: view.y + view.h - 190 },
          ].map((at) => ({ at, quad: quadOfRect({ x: at.x - 140, y: at.y - 100, w: 280, h: 262 }) })),
        )
      : null;

  // The main building's overall size, as dimension strings along its bottom and right sides on the sheet.
  const mainSheet = buildings[0]?.sheet ?? [];
  const dimensions: { a: Pt; b: Pt; text: string }[] = [];
  if (mainSheet.length > 2) {
    const xs = mainSheet.map((p) => p.x), ys = mainSheet.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    dimensions.push({ a: { x: x0, y: y1 + 70 }, b: { x: x1, y: y1 + 70 }, text: `${Math.round((x1 - x0) / k)}'` });
    dimensions.push({ a: { x: x1 + 70, y: y0 }, b: { x: x1 + 70, y: y1 }, text: `${Math.round((y1 - y0) / k)}'` });
  }
  for (const d of dims) {
    const line = linesOf(d)[0];
    if (!line || line.length < 2) continue;
    dimensions.push({ a: toSheet(toLocal(frame, line[0]!)), b: toSheet(toLocal(frame, line.at(-1)!)), text: dimensionText(d.label ?? '') });
  }
  const placedDims = dimensions.map((d) => ({ ...d, label: dimensionLabel(d.a, d.b, d.text, occ) }));

  // One name per street, along its centerline where the lettering has room.
  const roadLabels: { at: Pt; angle: number; text: string }[] = [];
  const byName = new Map<string, Pt[]>();
  for (const r of roads) {
    for (const line of linesOf(r)) {
      const pts = sheetLine(line);
      const name = roadName(r);
      if (name && polylineLength(pts) > polylineLength(byName.get(name) ?? [])) byName.set(name, pts);
    }
  }
  for (const [name, pts] of byName) {
    const total = polylineLength(pts);
    const half = textWidth(name, ROAD_FONT) / 2;
    if (total < half * 2.4) continue;
    const ts = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9];
    const hit = occ.placeText(
      ts.flatMap((t) => {
        const p = along(pts, t), p0 = along(pts, Math.max(0, t - half / total)), p1 = along(pts, Math.min(1, t + half / total));
        if (!p || !p0 || !p1) return [];
        const angle = upright((Math.atan2(p1.at.y - p0.at.y, p1.at.x - p0.at.x) * 180) / Math.PI);
        return [{ at: p.at, angle, text: name, quad: textQuad(p.at, name, ROAD_FONT, angle, { dy: -10, halo: 5 }) }];
      }),
    );
    if (hit) roadLabels.push(hit);
  }

  // Callouts: (E) existing, capitalized, on leaders. Lower priority places first and is left off last.
  const specs: CalloutSpec[] = [];
  const callout = (anchors: (Pt | null | undefined)[], lines: string[], color: string, priority: number, extent?: { hw: number; hh: number }) => {
    const shown = anchors.filter((a): a is Pt => !!a);
    if (shown.length) specs.push({ anchors: shown, lines: lines.flatMap((l) => wrapCallout(l)), color, priority, extent });
  };
  const ringPoints = (pts: Pt[]) => pts.flatMap((p, i) => [p, mid(p, pts[(i + 1) % pts.length]!)]).filter((p) => inside(p, view, 50));

  for (const z of feasible) {
    const pts = polygonsOfFeature(z, frame).flatMap((p) => p.outer.map(toSheet));
    const kind = zoneKind(z);
    const lines =
      kind === 'FEASIBLE_BESS_RECOMMENDED'
        ? ['(N) BESS ZONE']
        : kind === 'FEASIBLE_BESS_PREFERRED'
          ? ['(N) BESS ZONE', `WITHIN ${attributeText(z, 'preferred_run_ft') ?? "150'"} RUN OF THE SERVICE`]
          : ['(N) BESS ZONE', `WITHIN ${attributeText(z, 'max_run_ft') ?? "250'"} RUN OF THE SERVICE`];
    callout(pts.filter((p) => inside(p, view, 40)), lines, NEW, 0);
  }
  for (const c of concept) {
    const label = [plainLabel(c.f.label).toUpperCase()];
    if (c.type === 'BESS_PAD') callout([c.at], label, NEW, 0, { hw: Math.max(14 * k, 18) / 2, hh: Math.max(11.5 * k, 15) / 2 });
    else if (c.type === 'AC_DISCONNECT') callout([{ x: c.at.x + 28, y: c.at.y }], label, NEW, 0, { hw: 10, hh: 10 });
    else callout([c.at], label, NEW, 0, { hw: 11, hh: 11 });
  }
  for (const t of trenches) {
    const pts = linesOf(t).flatMap(sheetLine);
    callout([along(pts, 0.5)?.at, along(pts, 0.3)?.at, along(pts, 0.7)?.at], ['(N) TRENCH ROUTE'], NEW, 0);
  }

  // How the building likely connects: inferred from the nearest mapped line, never field verified.
  const kinds = new Map<string, typeof equipment>();
  for (const e of equipment) {
    if (e.type in TYPICAL) kinds.set(e.type, [...(kinds.get(e.type) ?? []), e]);
    // A drawing's new items, "(N) …", are blue like the concept layout; existing electrical is red.
    else callout([e.at], [plainLabel(e.f.label).toUpperCase()], /^\(N\)/i.test(e.f.label ?? '') ? NEW : UTILITY, 1, EXTENT[e.type] ?? EXTENT.SERVICE_ENTRANCE);
  }
  // One callout per kind of item, marked typical, as a drawing marks a repeated condition.
  for (const [type, items] of kinds) {
    const t = TYPICAL[type]!;
    callout(
      items.map((e) => e.at),
      [items.length > 1 ? `${t.label}, TYP. OF ${items.length}` : t.label],
      t.electrical ? UTILITY : INK,
      t.electrical ? 1 : 4,
      EXTENT[type],
    );
  }
  for (const s of servicePaths) {
    const pts = linesOf(s).flatMap(sheetLine);
    const drop = attributeText(s, 'line_class') === 'DETECTED SERVICE DROP';
    callout([along(pts, 0.5)?.at, along(pts, 0.3)?.at, along(pts, 0.7)?.at], [drop ? '(E) OVERHEAD SERVICE DROP' : '(E) ELECTRIC SERVICE'], UTILITY, 1);
  }
  for (const f of feeders) {
    const s = feederSummary(record, feederIdOf(f));
    callout(linesOf(f).flatMap(sheetLine).filter((p) => inside(p, view, 40)).slice(0, 12), [`(E) ELECTRIC FEEDER ${s.line}`, ...(s.capacity ? [s.capacity] : [])], UTILITY, 1);
  }
  for (const s of substations) {
    const type = attributeText(s.f, 'substation_type');
    callout(
      [s.at],
      s.proposed ? [`(F) ${(s.f.label ?? 'PROPOSED SUBSTATION').toUpperCase()}`] : [`(E) SUBSTATION ${(s.f.label ?? '').toUpperCase()}`, ...(type ? [type] : [])],
      UTILITY,
      1,
      { hw: 22, hh: 22 },
    );
  }
  const shownTransmission = transmission
    .map((t) => ({ t, pts: linesOf(t).flatMap(sheetLine).filter((p) => inside(p, view, 40)) }))
    .filter((x) => x.pts.length > 0);
  for (const { t, pts } of shownTransmission.slice(0, 2)) {
    const kv = attributeText(t, 'line_voltage');
    const owner = attributeText(t, 'line_owner');
    callout(pts.slice(0, 12), [`(E) ${kv ? `${kv} ` : ''}TRANSMISSION LINE`, ...(owner ? [owner] : [])], UTILITY, 1);
  }

  const stories = printed(record, 'building_stories');
  const height = printed(record, 'building_height_ft');
  const built = printed(record, 'year_built');
  buildings.slice(0, 6).forEach((b, i) => {
    const sf = Number(b.area.toPrecision(b.area >= 1000 ? 3 : 2)).toLocaleString('en-US');
    const lines = [`(E) BUILDING ${i + 1}, ≈${sf} SF`];
    if (i === 0) {
      const facts = [stories, height ? `EST. ${height} HT.` : null, built ? `BUILT ${built}` : null].filter(Boolean);
      if (facts.length) lines.push(`${facts.join(', ')} (ASSESSOR)`);
    }
    // Anchored inside the outline, on a point set in from its walls.
    const c = centroid(b.sheet);
    callout([c, ...b.sheet.map((p) => ({ x: p.x + (c.x - p.x) * 0.15, y: p.y + (c.y - p.y) * 0.15 }))], lines, INK, 2);
  });
  callout(ringPoints(lotSheet), ['(E) PROPERTY LINE', `PARCEL ${printed(record, 'parcel_id') ?? ''}`.trim()], INK, 3);
  const frontage = roads.find((r) => (r.attributes?.fronting?.type === 'boolean' && r.attributes.fronting.value) || /street in the address/i.test(r.label ?? ''));
  if (frontage) {
    const pts = linesOf(frontage).flatMap(sheetLine);
    const side = printed(record, 'road_side');
    callout([0.5, 0.4, 0.6, 0.3, 0.7].map((t) => along(pts, t)?.at), [`(E) ${roadName(frontage)}`, ...(side ? [`FRONTAGE, ${side} SIDE`] : [])], INK, 3);
  }
  // One callout for the striping, as a drawing marks a typical condition.
  const stalls = stallRows.reduce((sum, f) => sum + Number((f.attributes?.['stall_count'] as { value?: number } | undefined)?.value ?? 0), 0);
  const stripeLines = stripes.flatMap((f) => linesOf(f)).map(sheetLine);
  if (stripeLines.length) {
    callout(stripeLines.map((l) => l[0]!), ['(E) STRIPED PARKING, TYP.', ...(stalls ? [`${stalls} STALLS`] : [])], INK, 4);
  }
  for (const w of wetlands) {
    callout(polygonsOfFeature(w, frame).flatMap((p) => p.outer.map(toSheet)).filter((p) => inside(p, view, 40)).slice(0, 12), [`(E) WETLAND: ${(attributeText(w, 'wetland_type') ?? '').toUpperCase()}`.replace(/: $/, '')], INK, 5);
  }
  if (paved.length) {
    // One callout for every paved area: the largest is labelled.
    const polys = paved.flatMap((p) => polygonsOfFeature(p, frame)).sort((a, b) => polygonAreaSqft(b) - polygonAreaSqft(a));
    callout(polys.slice(0, 1).flatMap((p) => p.outer.map(toSheet)).filter((p) => inside(p, view, 40)).filter((_, i, all) => i % Math.max(1, Math.floor(all.length / 12)) === 0), ['(E) PAVED PARKING AND DRIVES'], INK, 5);
  }
  for (const o of open) {
    const pts = polygonsOfFeature(o, frame).flatMap((p) => p.outer.map(toSheet));
    if (pts.length) callout([centroid(pts)], ['OPEN GROUND'], INK, 5);
  }

  const placed = placeCallouts(specs, occ);

  // Each lot line's bearing and length, as a survey writes it, along the line outside the lot, where it is clear.
  const lotRing = lotSheet;
  const lotLocal = lotRing.map((p) => drawing.toLocalPoint(p));
  const lotArea = lotRing.reduce((s, p, i) => s + p.x * lotRing[(i + 1) % lotRing.length]!.y - lotRing[(i + 1) % lotRing.length]!.x * p.y, 0);
  const bearings: { at: Pt; angle: number; text: string }[] = [];
  for (let i = 0; i < lotRing.length; i++) {
    const a = lotRing[i]!, b = lotRing[(i + 1) % lotRing.length]!;
    const la = lotLocal[i]!, lb = lotLocal[(i + 1) % lotLocal.length]!;
    const feet = Math.hypot(lb.x - la.x, lb.y - la.y);
    if (feet < 60) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // Outward: to the right of the edge when the ring runs clockwise on the sheet.
    const out = lotArea > 0 ? { x: (a.y - b.y) / len, y: (b.x - a.x) / len } : { x: (b.y - a.y) / len, y: (a.x - b.x) / len };
    const angle = upright((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    const text = `${surveyBearing(la, lb)} ${feet.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}'`;
    const hit = occ.placeText(
      [0.5, 0.35, 0.65, 0.2, 0.8].map((t) => {
        const at = { x: a.x + (b.x - a.x) * t - out.x * 26, y: a.y + (b.y - a.y) * t - out.y * 26 };
        return { at, angle, text, quad: textQuad(at, text, BEARING_FONT, angle, { dy: 7 }) };
      }),
    );
    if (hit) bearings.push(hit);
  }

  // Tags beside each light pole, where there is room.
  const poleTags = equipment
    .filter((e) => e.type === 'LIGHT_POLE')
    .flatMap((e) => {
      const hit = occ.placeText(
        [
          { x: e.at.x + 24, y: e.at.y - 12, anchor: 'start' as const },
          { x: e.at.x - 16, y: e.at.y - 14, anchor: 'end' as const },
          { x: e.at.x + 16, y: e.at.y + 26, anchor: 'start' as const },
          { x: e.at.x - 16, y: e.at.y + 26, anchor: 'end' as const },
        ].map((p) => ({ ...p, quad: textQuad(p, 'LP', TAG_FONT, 0, { anchor: p.anchor, bold: true, halo: 3 }) })),
        { owner: e.at },
      );
      return hit ? [hit] : [];
    });

  // The letters along electric lines, last, wherever they fall clear of everything else.
  const lineMarks: { at: Pt; angle: number; text: string; size: number; color: string }[] = [];
  const markLine = (pts: Pt[], text: string, size: number, spacing: number, color: string) => {
    const total = polylineLength(pts);
    for (let s = spacing / 2; s < total; s += spacing) {
      const p = along(pts, s / total);
      if (!p) continue;
      const angle = upright(p.angleDeg);
      const hit = occ.placeText([{ at: p.at, angle, text, size, color, quad: textQuad(p.at, text, size, angle, { dy: size * 0.35, bold: true, halo: 3 }) }], { avoidLines: false });
      if (hit) lineMarks.push(hit);
    }
  };
  for (const f of feeders) for (const line of linesOf(f)) markLine(sheetLine(line), 'E', 20, 200, UTILITY);
  for (const t of transmission) for (const line of linesOf(t)) markLine(sheetLine(line), attributeText(t, 'line_voltage') ?? 'T', 19, 420, TRANSMISSION);
  for (const sgm of segments) for (const line of linesOf(sgm)) markLine(sheetLine(line), /UNDERGROUND/.test(attributeText(sgm, 'construction') ?? '') ? 'UGE' : 'OHE', 15, 240, UTILITY);
  for (const d of detectedLines) for (const line of linesOf(d)) markLine(sheetLine(line), 'OHE', 15, 300, UTILITY);

  // Off-sheet references: things the reviewer needs that fall outside the plan.
  const references: Reference[] = [];
  const substation = nearest(record, 'substation', 'substations_nearby');
  const fire = nearest(record, 'constraint', 'fire_stations_nearby');
  const wetlandNear = nearest(record, 'constraint', 'wetlands_nearby');
  const refFor = (f: MapFeature | null, text: string, color = INK) => {
    if (!f) return;
    const p =
      f.geometry.type === 'Point'
        ? toSheet(toLocal(frame, f.geometry.coordinates as Pos))
        : f.kind === 'utility_line'
          ? centroid(linesOf(f).flatMap(sheetLine))
          : centroid(polygonsOfFeature(f, frame).flatMap((q) => q.outer.map(toSheet)));
    if (inside(p, view)) return;
    references.push({ target: p, text, color });
  };
  if (substation && substation.field !== 'proposed_substations_nearby' && !substations.some((s) => s.f === substation)) refFor(substation, `(E) SUBSTATION ${(substation?.label ?? '').toUpperCase()}, ${attributeText(substation, 'distance_ft') ?? '?'}`, UTILITY);
  const nearestTransmission = nearest(record, 'utility_line', 'transmission_nearby');
  if (nearestTransmission && shownTransmission.length === 0)
    refFor(nearestTransmission, `(E) ${attributeText(nearestTransmission, 'line_voltage') ?? ''} TRANSMISSION LINE, ${attributeText(nearestTransmission, 'distance_ft') ?? '?'}`.replace('  ', ' '), TRANSMISSION);
  const proposed = nearest(record, 'substation', 'proposed_substations_nearby');
  if (proposed && !substations.some((s) => s.f === proposed))
    refFor(proposed, `(F) ${(proposed.label ?? 'PROPOSED SUBSTATION').toUpperCase()}, NOT BUILT, ${attributeText(proposed, 'distance_ft') ?? '?'}`, UTILITY);
  refFor(fire, `NEAREST FIRE STATION: ${(fire?.label ?? '').toUpperCase()}, ${attributeText(fire, 'distance_ft') ?? '?'}`);
  refFor(wetlandNear, `NEAREST MAPPED WETLAND, ${attributeText(wetlandNear, 'distance_ft') ?? '?'}`, WATER);


  const rows = siteDataRows(record);
  const notes = sheetNotes(record);
  const tiles = aerial && record.baseMap ? aerialTiles(record, drawing) : [];
  const offY = 70 + dataTableHeight(rows, RIGHT.w) + 24;
  const legendY = offY + (references.length ? 44 + references.length * 40 + 24 : 0);
  const shownTypes = new Set(equipment.map((e) => e.type));
  const legendKeys = new Set<string>([
    ...(roads.length ? ['road'] : []),
    ...(feeders.length ? ['feeder'] : []),
    ...(segments.some((s) => !/UNDERGROUND/.test(attributeText(s, 'construction') ?? '')) || detectedLines.length ? ['ohe'] : []),
    ...(segments.some((s) => /UNDERGROUND/.test(attributeText(s, 'construction') ?? '')) ? ['uge'] : []),
    ...(transmission.length ? ['transmission'] : []),
    ...(servicePaths.length ? ['service'] : []),
    ...(feasibleOuter.length ? ['zoneOuter'] : []),
    ...(feasible.length ? ['zone'] : []),
    ...(concept.some((c) => c.type === 'BESS_PAD') ? ['pad'] : []),
    ...(concept.some((c) => c.type === 'AC_DISCONNECT') ? ['disconnect'] : []),
    ...(concept.some((c) => c.type !== 'BESS_PAD' && c.type !== 'AC_DISCONNECT') ? ['breaker'] : []),
    ...(trenches.length ? ['trench'] : []),
    ...(shownTypes.has('UTILITY_POLE') ? ['pole'] : []),
    ...(shownTypes.has('SERVICE_TAP') ? ['serviceTap'] : []),
    ...(shownTypes.has('PAD_MOUNT_TRANSFORMER') ? ['transformer'] : []),
    ...(shownTypes.has('PAD_MOUNT_TRANSFORMER_CANDIDATE') ? ['equipmentBox'] : []),
    ...(shownTypes.has('METER') ? ['meter'] : []),
    ...([...shownTypes].some((t) => !(t in SYMBOL_REACH)) || shownTypes.has('SERVICE_ENTRANCE') ? ['switchgear'] : []),
    ...(shownTypes.has('LIGHT_POLE') ? ['lightPole'] : []),
    ...(shownTypes.has('HYDRANT') ? ['hydrant'] : []),
    ...(shownTypes.has('CATCH_BASIN') ? ['catchBasin'] : []),
    ...(shownTypes.has('MANHOLE') ? ['manhole'] : []),
    ...(shownTypes.has('SIGN') ? ['sign'] : []),
    ...(substations.some((s) => s.proposed) ? ['proposedSubstation'] : []),
    ...(substations.some((s) => !s.proposed) ? ['substation'] : []),
    ...(wetlands.length ? ['wetland'] : []),
    ...(wetlands.length && inMassachusetts ? ['buffer'] : []),
    ...(paved.length ? ['paved'] : []),
    ...(stripes.length ? ['striping'] : []),
    ...(open.length ? ['open'] : []),
    ...(references.length ? ['reference'] : []),
  ]);

  return (
    <figure className="sheet sheet--engineering">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Overall site plan, engineering sheet" fontFamily={FONT}>
        <defs>
          <clipPath id="planView">
            <rect x={view.x} y={view.y} width={view.w} height={view.h} />
          </clipPath>
          <pattern id="marsh" width="70" height="46" patternUnits="userSpaceOnUse">
            <g stroke={WATER} strokeWidth="2.2" fill="none">
              <line x1="14" y1="30" x2="40" y2="30" />
              <line x1="27" y1="30" x2="27" y2="14" />
              <line x1="27" y1="30" x2="18" y2="17" />
              <line x1="27" y1="30" x2="36" y2="17" />
            </g>
          </pattern>
          <pattern id="feasibleHatch" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="22" height="22" fill="#0b5cad" opacity="0.08" />
            <line x1="0" y1="0" x2="0" y2="22" stroke="#0b5cad" strokeWidth="2" opacity="0.45" />
          </pattern>
          <pattern id="openGround" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="13" cy="13" r="2.2" fill="#2e6b3f" opacity="0.55" />
          </pattern>
        </defs>

        <rect width={W} height={H} fill="#fff" />
        <rect x={40} y={40} width={W - 80} height={H - 80} fill="none" stroke={INK} strokeWidth={5} />

        {/* plan view */}
        <g clipPath="url(#planView)">
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="#f4f4f1" />
          <g opacity={0.5} transform={`rotate(${drawing.rotationDeg} ${view.x + view.w / 2} ${view.y + view.h / 2})`}>
            {tiles.map((t) => (
              <image key={t.key} href={t.href} x={t.x} y={t.y} width={t.w} height={t.h} preserveAspectRatio="none" />
            ))}
          </g>

          {open.flatMap((o) => polygonsOfFeature(o, frame)).map((p, i) => (
            <path key={`open-${i}`} d={path(p.outer.map(toSheet))} fill="url(#openGround)" stroke="#2e6b3f" strokeWidth={1.5} strokeDasharray="10 8" opacity={0.9} />
          ))}

          {/* Paving: every edge stroked, then every fill laid over it, so overlapping areas read as one surface with
              one clean outer edge. */}
          <g>
            {pavedPaths.map((d, i) => (
              <path key={`paved-edge-${i}`} d={d} fillRule="evenodd" fill="none" stroke={PAVING_EDGE} strokeWidth={4} strokeLinejoin="round" />
            ))}
            {pavedPaths.map((d, i) => (
              <path key={`paved-${i}`} d={d} fillRule="evenodd" fill={PAVING} stroke="none" />
            ))}
          </g>

          {stripeLines.map((line, i) => (
            <path key={`stripe-${i}`} d={path(line, false)} fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="butt" />
          ))}

          {feasibleOuter.flatMap((z) => polygonsOfFeature(z, frame)).map((p, i) => (
            <path key={`feasible-outer-${i}`} d={[p.outer, ...(p.holes ?? [])].map((ring) => path(ring.map(toSheet))).join(' ')} fill="none" stroke={NEW} strokeWidth={1.5} strokeDasharray="14 8" opacity={0.7} />
          ))}
          {feasible.flatMap((z) => polygonsOfFeature(z, frame)).map((p, i) => (
            <path
              key={`feasible-${i}`}
              d={[p.outer, ...(p.holes ?? [])].map((ring) => path(ring.map(toSheet))).join(' ')}
              fillRule="evenodd"
              fill="url(#feasibleHatch)"
              stroke={NEW}
              strokeWidth={3}
            />
          ))}

          {wetlands.map((w, i) => {
            const polys = polygonsOfFeature(w, frame);
            const zone = inMassachusetts ? bufferPolygon(w, frame) : [];
            return (
              <g key={`wet-${i}`}>
                {zone.map((z, j) => (
                  <path key={j} d={path(z.outer.map(toSheet))} fill="none" stroke={WATER} strokeWidth={2.5} strokeDasharray="28 14" />
                ))}
                {polys.map((p, j) => (
                  <path key={j} d={path(p.outer.map(toSheet))} fill="url(#marsh)" stroke={WATER} strokeWidth={2.5} />
                ))}
              </g>
            );
          })}

          {roads.map((r, i) =>
            linesOf(r).map((line, j) => <path key={`road-${i}-${j}`} d={path(sheetLine(line), false)} fill="none" stroke={INK} strokeWidth={2.2} strokeDasharray="60 12 12 12" />),
          )}

          {feeders.map((f, i) =>
            linesOf(f).map((line, j) => <path key={`feeder-${i}-${j}`} d={path(sheetLine(line), false)} fill="none" stroke={UTILITY} strokeWidth={2.6} />),
          )}

          {transmission.map((t, i) =>
            linesOf(t).map((line, j) => <path key={`tx-${i}-${j}`} d={path(sheetLine(line), false)} fill="none" stroke={TRANSMISSION} strokeWidth={5} strokeDasharray="70 14 14 14" />),
          )}

          {segments.map((sgm, i) =>
            linesOf(sgm).map((line, j) => (
              <path key={`seg-${i}-${j}`} d={path(sheetLine(line), false)} fill="none" stroke={UTILITY} strokeWidth={1.8} strokeDasharray={/UNDERGROUND/.test(attributeText(sgm, 'construction') ?? '') ? '30 10' : undefined} />
            )),
          )}

          {trenches.map((t, i) =>
            linesOf(t).map((line, j) => (
              <path key={`trench-${i}-${j}`} d={path(sheetLine(line), false)} fill="none" stroke={NEW} strokeWidth={4} strokeDasharray="22 8 4 8" />
            )),
          )}

          {detectedLines.map((d, i) =>
            linesOf(d).map((line, j) => <path key={`det-${i}-${j}`} d={path(sheetLine(line), false)} fill="none" stroke={UTILITY} strokeWidth={1.8} />),
          )}

          {servicePaths.map((sp, i) =>
            linesOf(sp).map((line, j) => (
              <path key={`svc-${i}-${j}`} d={path(sheetLine(line), false)} fill="none" stroke={UTILITY} strokeWidth={3.5} />
            )),
          )}

          {buildings.map((b, i) => (
            <path key={`bldg-${i}`} d={path(b.sheet)} fill="#fff" fillOpacity={0.35} stroke={INK} strokeWidth={3} />
          ))}

          <path d={path(lotSheet)} fill="none" stroke={INK} strokeWidth={5.5} strokeDasharray="80 14 14 14 14 14" />

          {substations.map((s, i) => (
            <SubstationSymbol key={`sub-${i}`} at={s.at} proposed={s.proposed} />
          ))}

          {equipment.map((e, i) => (
            <EquipmentSymbol key={`eq-${i}`} type={e.type} at={e.at} isNew={/^\(N\)/i.test(e.f.label ?? '')} k={k} />
          ))}

          {concept.map((c, i) =>
            c.type === 'BESS_PAD' ? (
              <PadSymbol key={`pad-${i}`} at={c.at} k={k} />
            ) : c.type === 'AC_DISCONNECT' ? (
              <DisconnectSymbol key={`disc-${i}`} at={{ x: c.at.x + 28, y: c.at.y }} />
            ) : (
              <BreakerSymbol key={`brk-${i}`} at={c.at} />
            ),
          )}

          {placedDims.map((d, i) => (
            <Dimension key={`dim-${i}`} a={d.a} b={d.b} text={d.text} label={d.label} />
          ))}
          {roadLabels.map((r, i) => (
            <Label key={`road-name-${i}`} at={r.at} angle={r.angle} dy={-10} size={ROAD_FONT} text={r.text} />
          ))}
          {bearings.map((bg, i) => (
            <Label key={`brg-${i}`} at={bg.at} angle={bg.angle} dy={7} size={BEARING_FONT} text={bg.text} />
          ))}
          {lineMarks.map((m, i) => (
            <Label key={`mark-${i}`} at={m.at} angle={m.angle} dy={m.size * 0.35} size={m.size} text={m.text} color={m.color} bold halo={3} />
          ))}
          {poleTags.map((t, i) => (
            <Label key={`lp-${i}`} at={t} size={TAG_FONT} text="LP" anchor={t.anchor} bold halo={3} />
          ))}

          {fallAt && fall !== null && slope ? <FallArrow at={fallAt.at} degrees={fall + drawing.rotationDeg} text={`${slope} AVG. FALL`} /> : null}
        </g>

        {placed.map((c, i) => (
          <CalloutBox key={`callout-${i}`} callout={c} />
        ))}
        <OffSheetTable x={RIGHT.x} y={offY} w={RIGHT.w} view={view} references={references} />
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="none" stroke={INK} strokeWidth={2} />

        {/* below the plan: notes, north arrow, drawing title and scale */}
        <SheetNotes x={view.x} y={2040} w={1180} notes={notes} />
        <NorthArrow x={1420} y={2160} rotation={drawing.rotationDeg} />
        <DrawingTitle x={1520} y={2160} scale={scale} k={k} />

        {/* right column: data table and legend */}
        <DataTable x={RIGHT.x} y={70} w={RIGHT.w} rows={rows} />
        <Legend x={RIGHT.x} y={legendY} w={RIGHT.w} bottom={H - 70} keys={legendKeys} inMassachusetts={inMassachusetts} />

        <TitleStrip record={record} />
      </svg>
      <figcaption className="sheet__controls">
        <span>Drawn from record v{record.version}. Concept-grade, not surveyed.</span>
        <span className="sheet__warn">Not for construction.</span>
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ layout

interface Drawing {
  frame: LocalFrame;
  toSheet: (p: Pt) => Pt;
  /** Sheet placement before the drawing's turn, for content drawn inside a rotated group. */
  toSheetFlat: (p: Pt) => Pt;
  /** The drawing's turn, clockwise on the sheet. */
  rotationDeg: number;
  toLocalPoint: (p: Pt) => Pt;
  scale: number;
  /** Sheet units per foot. */
  k: number;
  lotSheet: Pt[];
  view: typeof VIEW;
}

function layout(record: RecordVersion): Drawing | null {
  const lot = lotOf(record);
  if (!lot) return null;
  const polygons = polygonsOfFeature(lot.feature, lot.frame);
  const outer = polygons.sort((a, b) => polygonAreaSqft(b) - polygonAreaSqft(a))[0];
  if (!outer) return null;
  // Turn the drawing so the main building sits square to the sheet, as a plan set draws it, choosing the quarter
  // turn that keeps north within 45 degrees of up. The north arrow turns with it.
  const work = workPoints(record.features);
  const buildingLocal = work ? work.building.map((p) => toLocal(lot.frame, p as Pos)) : [];
  const rotation = buildingLocal.length > 2 ? squareTurn(buildingLocal) : 0;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const turn = (p: Pt): Pt => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const unturn = (p: Pt): Pt => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  // Frame the electrical work area when there is one, so the sheet isn't mostly open land.
  const padFt = 12 * 3.280839895;
  const framed = work ? work.pts.map((p) => turn(toLocal(lot.frame, p as Pos))) : outer.outer.map(turn);
  const raw = bounds(framed);
  const b = work ? { minX: raw.minX - padFt, maxX: raw.maxX + padFt, minY: raw.minY - padFt, maxY: raw.maxY + padFt } : raw;
  const margin = work ? 1.05 : 1.3;
  const scale = chooseScale((b.maxX - b.minX) * margin, (b.maxY - b.minY) * margin, VIEW.w / 100, VIEW.h / 100);
  const k = 100 / scale;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const vx = VIEW.x + VIEW.w / 2;
  const vy = VIEW.y + VIEW.h / 2;
  const toSheet = (p: Pt): Pt => { const q = turn(p); return { x: vx + (q.x - cx) * k, y: vy + (q.y - cy) * k }; };
  const toLocalPoint = (p: Pt): Pt => unturn({ x: cx + (p.x - vx) / k, y: cy + (p.y - vy) / k });
  // The same placement without the turn, for the aerial tiles, which a rotated group then turns.
  const centre = unturn({ x: cx, y: cy });
  const toSheetFlat = (p: Pt): Pt => ({ x: vx + (p.x - centre.x) * k, y: vy + (p.y - centre.y) * k });
  return { frame: lot.frame, toSheet, toSheetFlat, toLocalPoint, scale, k, rotationDeg: (rotation * 180) / Math.PI, lotSheet: outer.outer.map(toSheet), view: VIEW };
}

// A lot line's bearing as a survey writes it, from local feet with y south: N 71°59'08" E.
function surveyBearing(a: Pt, b: Pt): string {
  const east = b.x - a.x, north = a.y - b.y;
  const azimuth = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  const [ns, ew, angle] = azimuth <= 90 ? ['N', 'E', azimuth] : azimuth <= 180 ? ['S', 'E', 180 - azimuth] : azimuth <= 270 ? ['S', 'W', azimuth - 180] : ['N', 'W', 360 - azimuth];
  const d = Math.floor(angle), m = Math.floor((angle - d) * 60), s = Math.round(((angle - d) * 60 - m) * 60);
  const [mm, ss] = s === 60 ? [m + 1, 0] : [m, s];
  return `${ns} ${d}°${String(mm).padStart(2, '0')}'${String(ss).padStart(2, '0')}" ${ew}`;
}

// The turn that brings the building's long axis square to the sheet: its minimum-area rectangle's angle, taken
// to the nearest quarter turn so north stays within 45 degrees of up.
function squareTurn(ring: Pt[]): number {
  let best = { area: Infinity, angle: 0 };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(-angle), s = Math.sin(-angle);
    const us = ring.map((p) => p.x * c - p.y * s), vs = ring.map((p) => p.x * s + p.y * c);
    const area = (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
    if (area < best.area) best = { area, angle };
  }
  let turn = -best.angle;
  while (turn > Math.PI / 4) turn -= Math.PI / 2;
  while (turn <= -Math.PI / 4) turn += Math.PI / 2;
  return turn;
}

function aerialTiles(record: RecordVersion, d: Drawing) {
  const base = record.baseMap!;
  const corners = [
    { x: VIEW.x, y: VIEW.y },
    { x: VIEW.x + VIEW.w, y: VIEW.y },
    { x: VIEW.x, y: VIEW.y + VIEW.h },
    { x: VIEW.x + VIEW.w, y: VIEW.y + VIEW.h },
  ].map((p) => toLonLat(d.frame, d.toLocalPoint(p)));
  const nw = [Math.min(...corners.map((c) => c[0]!)), Math.max(...corners.map((c) => c[1]!))];
  const se = [Math.max(...corners.map((c) => c[0]!)), Math.min(...corners.map((c) => c[1]!))];
  const lat = (nw[1]! + se[1]!) / 2;
  const widthM = ((VIEW.w / 100) * d.scale) * 0.3048;
  let z = Math.min(base.maxZoom ?? 19, 19);
  const mpp = (zz: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zz;
  while (z > 10 && widthM / (256 * mpp(z)) > 9) z -= 1;
  const a = tileXY(nw[0]!, nw[1]!, z);
  const b = tileXY(se[0]!, se[1]!, z);
  const tiles: { key: string; href: string; x: number; y: number; w: number; h: number }[] = [];
  for (let tx = Math.floor(a.x); tx <= Math.floor(b.x); tx++) {
    for (let ty = Math.floor(a.y); ty <= Math.floor(b.y); ty++) {
      const p0 = d.toSheetFlat(toLocal(d.frame, tileCorner(tx, ty, z)));
      const p1 = d.toSheetFlat(toLocal(d.frame, tileCorner(tx + 1, ty + 1, z)));
      const href = (base.tileUrlTemplate ?? '').replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty));
      tiles.push({ key: `${z}/${tx}/${ty}`, href, x: p0.x, y: p0.y, w: p1.x - p0.x + 0.6, h: p1.y - p0.y + 0.6 });
    }
  }
  return tiles;
}

function bufferPolygon(f: MapFeature, frame: LocalFrame): LocalPolygon[] {
  try {
    const zone = buffer({ type: 'Feature', properties: {}, geometry: f.geometry as never }, 100, { units: 'feet' });
    return zone ? toLocalPolygon(zone.geometry as Parameters<typeof toLocalPolygon>[0], frame) : [];
  } catch {
    return [];
  }
}

const inside = (p: Pt, v: typeof VIEW, pad = 0) => p.x >= v.x + pad && p.x <= v.x + v.w - pad && p.y >= v.y + pad && p.y <= v.y + v.h - pad;

// ------------------------------------------------------------------ callouts and labels

const ROAD_FONT = 24;
const BEARING_FONT = 20;
const TAG_FONT = 15;
const DIM_FONT = 24;
const LEADER_W = 2;
const PAVING = '#d6d6d2';
const PAVING_EDGE = '#55554f';

/** How far each symbol reaches from its point, by equipment type; anything else draws as switchgear. */
const SYMBOL_REACH: Record<string, number> = {
  UTILITY_POLE: 15,
  SERVICE_TAP: 28,
  PAD_MOUNT_TRANSFORMER_CANDIDATE: 18,
  SERVICE_ENTRANCE: 30,
  LIGHT_POLE: 22,
  HYDRANT: 14,
  CATCH_BASIN: 12,
  MANHOLE: 14,
  PAD_MOUNT_TRANSFORMER: 19,
  METER: 14,
  SIGN: 12,
};

/** Half the width and height of each symbol, where a leader to it stops. */
const EXTENT: Record<string, { hw: number; hh: number }> = {
  UTILITY_POLE: { hw: 13, hh: 13 },
  SERVICE_TAP: { hw: 20, hh: 20 },
  PAD_MOUNT_TRANSFORMER_CANDIDATE: { hw: 14, hh: 12 },
  SERVICE_ENTRANCE: { hw: 26, hh: 12 },
  LIGHT_POLE: { hw: 7, hh: 7 },
  HYDRANT: { hw: 8, hh: 8 },
  CATCH_BASIN: { hw: 9, hh: 9 },
  MANHOLE: { hw: 11, hh: 11 },
  PAD_MOUNT_TRANSFORMER: { hw: 16, hh: 12 },
  METER: { hw: 11, hh: 11 },
  SIGN: { hw: 8, hh: 8 },
};

/** Items that repeat across a site, called out once per kind as typical. */
const TYPICAL: Record<string, { label: string; electrical: boolean }> = {
  UTILITY_POLE: { label: '(E) UTILITY POLE', electrical: true },
  PAD_MOUNT_TRANSFORMER: { label: '(E) PAD-MOUNT TRANSFORMER', electrical: true },
  METER: { label: '(E) ELECTRIC METER', electrical: true },
  LIGHT_POLE: { label: '(E) LIGHT POLE', electrical: false },
  HYDRANT: { label: '(E) FIRE HYDRANT', electrical: false },
  CATCH_BASIN: { label: '(E) CATCH BASIN', electrical: false },
  MANHOLE: { label: '(E) MANHOLE', electrical: false },
  SIGN: { label: '(E) SIGN', electrical: false },
};

/** The symbol an equipment type draws as, with the plan set's names for the same things. */
const equipmentKind = (type: string | null): string => {
  const t = type ?? '';
  return t === 'TRANSFORMER' ? 'PAD_MOUNT_TRANSFORMER' : t === 'MAIN_SWITCHBOARD' ? 'SERVICE_ENTRANCE' : t;
};

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function boundsQuad(pts: Pt[]): Quad {
  const b = bounds(pts);
  return quadOfRect({ x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY });
}

/** One callout style for every class: a white box, a thin rule in the class colour, left-set text, a leader with a dot. */
function CalloutBox({ callout }: { callout: PlacedCallout }) {
  const { box, anchor, elbow, attach, lines, color } = callout;
  return (
    <g data-callout={`${box.x.toFixed(1)},${box.y.toFixed(1)},${box.w.toFixed(1)},${box.h.toFixed(1)}`} data-anchor={`${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}`} data-leader={`${anchor.x.toFixed(1)},${anchor.y.toFixed(1)},${elbow.x.toFixed(1)},${elbow.y.toFixed(1)},${attach.x.toFixed(1)},${attach.y.toFixed(1)}`}>
      <polyline points={`${anchor.x},${anchor.y} ${elbow.x},${elbow.y} ${attach.x},${attach.y}`} fill="none" stroke={color} strokeWidth={LEADER_W} strokeLinejoin="round" />
      <circle cx={anchor.x} cy={anchor.y} r={5.5} fill={color} stroke="#fff" strokeWidth={1.5} />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#fff" stroke={color} strokeWidth={1.6} />
      {lines.map((line, i) => (
        <text key={i} x={box.x + CALLOUT_PAD_X} y={box.y + 30 + i * CALLOUT_LINE_H} fontSize={CALLOUT_FONT} fill={color}>
          {line}
        </text>
      ))}
    </g>
  );
}

/** A label on the plan, with a white halo, at the spot the layout found clear for it. */
function Label({ at, angle = 0, dy = 0, size, text, color = INK, bold = false, halo = 6, anchor = 'middle' }: { at: Pt; angle?: number; dy?: number; size: number; text: string; color?: string; bold?: boolean; halo?: number; anchor?: 'start' | 'middle' | 'end' }) {
  const q = textQuad(at, text, size, angle, { anchor, dy, halo: halo / 2 + 1, bold });
  return (
    <text
      data-label={q.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
      x={at.x}
      y={at.y}
      dy={dy}
      fontSize={size}
      fontWeight={bold ? 700 : undefined}
      textAnchor={anchor}
      fill={color}
      stroke="#fff"
      strokeWidth={halo}
      paintOrder="stroke"
      transform={angle ? `rotate(${angle.toFixed(2)} ${at.x.toFixed(1)} ${at.y.toFixed(1)})` : undefined}
    >
      {text}
    </text>
  );
}

interface Reference {
  target: Pt;
  text: string;
  color: string;
}

/** An arrow drawn as one line and a sized head, so its size doesn't follow the stroke width. */
function Arrow({ from, to, color = INK, width = 2.5, head = 14 }: { from: Pt; to: Pt; color?: string; width?: number; head?: number }) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const back = { x: to.x - Math.cos(ang) * head, y: to.y - Math.sin(ang) * head };
  const side = (s: number) => ({ x: back.x + Math.cos(ang + Math.PI / 2) * head * 0.45 * s, y: back.y + Math.sin(ang + Math.PI / 2) * head * 0.45 * s });
  const [l, r] = [side(1), side(-1)];
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={back.x} y2={back.y} stroke={color} strokeWidth={width} />
      <path d={`M${to.x} ${to.y} L${l.x} ${l.y} L${r.x} ${r.y} Z`} fill={color} />
    </g>
  );
}

/** Features outside the plan, each with an arrow toward it and its distance. */
function OffSheetTable({ x, y, w, view, references }: { x: number; y: number; w: number; view: typeof VIEW; references: Reference[] }) {
  if (references.length === 0) return null;
  const rowH = 40;
  const c = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
  return (
    <g>
      <rect x={x} y={y} width={w} height={44 + references.length * rowH} fill="#fff" stroke={INK} strokeWidth={2} />
      <text x={x + w / 2} y={y + 30} fontSize={22} fontWeight={700} textAnchor="middle" fill={INK}>
        OFF-SHEET REFERENCES (DIRECTION FROM SITE)
      </text>
      {references.map((r, i) => {
        const top = y + 44 + i * rowH;
        const ang = Math.atan2(r.target.y - c.y, r.target.x - c.x);
        const o = { x: x + 38, y: top + rowH / 2 };
        const lines = wrap(r.text, w - 90, 17);
        return (
          <g key={i}>
            <line x1={x} y1={top} x2={x + w} y2={top} stroke={INK} strokeWidth={1} />
            <Arrow from={{ x: o.x - Math.cos(ang) * 15, y: o.y - Math.sin(ang) * 15 }} to={{ x: o.x + Math.cos(ang) * 15, y: o.y + Math.sin(ang) * 15 }} color={r.color} width={2.5} head={11} />
            {lines.slice(0, 2).map((l, j) => (
              <text key={j} x={x + 76} y={top + (lines.length > 1 ? 17 : 26) + j * 18} fontSize={17} fill={r.color}>
                {l}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ drafting parts

interface DimensionLabel {
  at: Pt;
  angle: number;
  dy: number;
  quad: Quad;
}

/**
 * Where a dimension's text goes: the middle of the line, else further along it or on its other side, wherever it
 * covers nothing. With no clear spot the line is drawn without its text rather than over something.
 */
function dimensionLabel(a: Pt, b: Pt, text: string, occ: Occupancy): DimensionLabel | null {
  const angle = upright((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
  const candidates: DimensionLabel[] = [];
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    for (const dy of [-10, 32]) {
      const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      candidates.push({ at, angle, dy, quad: textQuad(at, text, DIM_FONT, angle, { dy, bold: true, halo: 5 }) });
    }
  }
  return occ.placeText(candidates);
}

function Dimension({ a, b, text, label }: { a: Pt; b: Pt; text: string; label: DimensionLabel | null }) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const tick = (p: Pt) => {
    const t = ang + Math.PI / 4;
    return <line x1={p.x - Math.cos(t) * 16} y1={p.y - Math.sin(t) * 16} x2={p.x + Math.cos(t) * 16} y2={p.y + Math.sin(t) * 16} stroke={INK} strokeWidth={3} />;
  };
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={1.6} />
      {tick(a)}
      {tick(b)}
      {label ? <Label at={label.at} angle={label.angle} dy={label.dy} size={DIM_FONT} text={text} bold halo={7} /> : null}
    </g>
  );
}

function FallArrow({ at, degrees, text }: { at: Pt; degrees: number; text: string }) {
  const r = (degrees * Math.PI) / 180;
  const dx = Math.sin(r) * 70;
  const dy = -Math.cos(r) * 70;
  return (
    <g>
      <Arrow from={{ x: at.x - dx, y: at.y - dy }} to={{ x: at.x + dx, y: at.y + dy }} width={4} head={26} />
      <Label at={{ x: at.x, y: at.y + 112 }} size={21} bold text={text} halo={7} />
      <Label at={{ x: at.x, y: at.y + 138 }} size={18} text="AVERAGE ACROSS PARCEL" />
    </g>
  );
}

/** Utility pole, as the samples' legend draws it: a circle within a circle. */
function PoleSymbol({ at }: { at: Pt }) {
  return (
    <g>
      <circle cx={at.x} cy={at.y} r={13} fill="#fff" stroke={UTILITY} strokeWidth={2.5} />
      <circle cx={at.x} cy={at.y} r={5} fill={UTILITY} />
    </g>
  );
}

/** Light pole: a small circle with a short arm and its fixture. */
function LightPoleSymbol({ at }: { at: Pt }) {
  return (
    <g stroke={INK} strokeWidth={2.2}>
      <circle cx={at.x} cy={at.y} r={7} fill="#fff" />
      <line x1={at.x + 7} y1={at.y} x2={at.x + 19} y2={at.y} />
      <line x1={at.x + 19} y1={at.y - 6} x2={at.x + 19} y2={at.y + 6} strokeWidth={3} />
    </g>
  );
}

/** Fire hydrant: a filled barrel with its two hose nozzles and the pumper outlet. */
function HydrantSymbol({ at }: { at: Pt }) {
  return (
    <g stroke={INK} strokeWidth={3}>
      <line x1={at.x - 13} y1={at.y} x2={at.x + 13} y2={at.y} />
      <line x1={at.x} y1={at.y} x2={at.x} y2={at.y + 13} />
      <circle cx={at.x} cy={at.y} r={7.5} fill={INK} strokeWidth={1} />
    </g>
  );
}

/** Sign: a post with its panel. */
function SignSymbol({ at }: { at: Pt }) {
  return (
    <g stroke={INK}>
      <line x1={at.x} y1={at.y - 2} x2={at.x} y2={at.y + 8} strokeWidth={2.4} />
      <rect x={at.x - 8} y={at.y - 8} width={16} height={6} fill={INK} strokeWidth={1} />
    </g>
  );
}

/** Catch basin: a small square grate. */
function CatchBasinSymbol({ at }: { at: Pt }) {
  return (
    <g stroke={INK}>
      <rect x={at.x - 9} y={at.y - 9} width={18} height={18} fill="#fff" strokeWidth={2.4} />
      <line x1={at.x - 9} y1={at.y - 3} x2={at.x + 9} y2={at.y - 3} strokeWidth={1.2} />
      <line x1={at.x - 9} y1={at.y + 3} x2={at.x + 9} y2={at.y + 3} strokeWidth={1.2} />
    </g>
  );
}

/** A circle or box with a letter in it: M for manhole or meter, T for transformer. */
function LetteredSymbol({ at, letter, color, box = false }: { at: Pt; letter: string; color: string; box?: boolean }) {
  return (
    <g>
      {box ? <rect x={at.x - 16} y={at.y - 12} width={32} height={24} fill="#fff" stroke={color} strokeWidth={2.5} /> : <circle cx={at.x} cy={at.y} r={11} fill="#fff" stroke={color} strokeWidth={2.4} />}
      <text x={at.x} y={at.y + 5.5} fontSize={15} fontWeight={700} textAnchor="middle" fill={color}>
        {letter}
      </text>
    </g>
  );
}

function EquipmentSymbol({ type, at, isNew = false, k = 1.6 }: { type: string; at: Pt; isNew?: boolean; k?: number }) {
  switch (type) {
    case 'BESS_PAD':
      return <PadSymbol at={at} k={k} />;
    case 'UTILITY_POLE':
      return <PoleSymbol at={at} />;
    case 'SERVICE_TAP':
      return <TransformerSymbol at={at} />;
    case 'PAD_MOUNT_TRANSFORMER_CANDIDATE':
      return <rect x={at.x - 14} y={at.y - 12} width={28} height={24} fill="#fff" stroke={UTILITY} strokeWidth={2.5} />;
    case 'LIGHT_POLE':
      return <LightPoleSymbol at={at} />;
    case 'HYDRANT':
      return <HydrantSymbol at={at} />;
    case 'CATCH_BASIN':
      return <CatchBasinSymbol at={at} />;
    case 'MANHOLE':
      return <LetteredSymbol at={at} letter="M" color={INK} />;
    case 'PAD_MOUNT_TRANSFORMER':
      return <LetteredSymbol at={at} letter="T" color={UTILITY} box />;
    case 'METER':
      return <LetteredSymbol at={at} letter="M" color={UTILITY} />;
    case 'SIGN':
      return <SignSymbol at={at} />;
    default:
      return <SwitchgearSymbol at={at} color={isNew ? NEW : UTILITY} />;
  }
}

/** The concept BESS pad at true size: about 11.5 x 14 ft, the plan set's pad. */
function PadSymbol({ at, k }: { at: Pt; k: number }) {
  const w = Math.max(14 * k, 18);
  const h = Math.max(11.5 * k, 15);
  return (
    <g>
      <rect x={at.x - w / 2} y={at.y - h / 2} width={w} height={h} fill={NEW} fillOpacity={0.18} stroke={NEW} strokeWidth={3} strokeDasharray="10 6" />
      <line x1={at.x - w / 2} y1={at.y - h / 2} x2={at.x + w / 2} y2={at.y + h / 2} stroke={NEW} strokeWidth={1.5} />
      <line x1={at.x + w / 2} y1={at.y - h / 2} x2={at.x - w / 2} y2={at.y + h / 2} stroke={NEW} strokeWidth={1.5} />
    </g>
  );
}

function DisconnectSymbol({ at }: { at: Pt }) {
  return <rect x={at.x - 10} y={at.y - 10} width={20} height={20} fill="#fff" stroke={NEW} strokeWidth={3} />;
}

function BreakerSymbol({ at }: { at: Pt }) {
  return <circle cx={at.x} cy={at.y} r={11} fill="#fff" stroke={NEW} strokeWidth={3} />;
}

function TransformerSymbol({ at, inferred = false }: { at: Pt; inferred?: boolean }) {
  // Pole-top service transformer: a box with a smaller box on top.
  return (
    <g strokeDasharray={inferred ? '7 5' : undefined}>
      <rect x={at.x - 20} y={at.y - 14} width={40} height={32} fill="#fff" stroke={UTILITY} strokeWidth={3} />
      <rect x={at.x - 9} y={at.y - 26} width={18} height={12} fill="#fff" stroke={UTILITY} strokeWidth={2.5} />
    </g>
  );
}

function SwitchgearSymbol({ at, inferred = false, color = UTILITY }: { at: Pt; inferred?: boolean; color?: string }) {
  return (
    <g strokeDasharray={inferred ? '7 5' : undefined}>
      <rect x={at.x - 26} y={at.y - 12} width={52} height={24} fill="#fff" stroke={color} strokeWidth={3} />
      <line x1={at.x - 26} y1={at.y + 12} x2={at.x + 26} y2={at.y - 12} stroke={color} strokeWidth={2} />
    </g>
  );
}

function SubstationSymbol({ at, proposed = false }: { at: Pt; proposed?: boolean }) {
  return (
    <g strokeDasharray={proposed ? '8 6' : undefined}>
      <rect x={at.x - 22} y={at.y - 22} width={44} height={44} fill="#fff" stroke={UTILITY} strokeWidth={3} />
      <rect x={at.x - 12} y={at.y - 12} width={24} height={24} fill="none" stroke={UTILITY} strokeWidth={3} />
      <path d={`M${at.x + 3} ${at.y - 10} L${at.x - 5} ${at.y + 2} L${at.x + 3} ${at.y + 2} L${at.x - 3} ${at.y + 12}`} fill="none" stroke={UTILITY} strokeWidth={2.5} />
    </g>
  );
}

function NorthArrow({ x, y, rotation = 0 }: { x: number; y: number; rotation?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <circle r={62} fill="#fff" stroke={INK} strokeWidth={5} />
      <path d="M0 -58 A58 58 0 0 1 0 58 Z" fill={INK} />
      <path d="M0 -78 L26 -18 L0 -30 L-26 -18 Z" fill={INK} />
      <text y={14} fontSize={30} fontWeight={700} textAnchor="middle" fill="#fff" stroke={INK} strokeWidth={2} paintOrder="stroke">
        N
      </text>
    </g>
  );
}

function DrawingTitle({ x, y, scale, k }: { x: number; y: number; scale: number; k: number }) {
  const seg = scale * 1;
  return (
    <g>
      <circle cx={x + 50} cy={y} r={46} fill="#fff" stroke={INK} strokeWidth={3} />
      <text x={x + 50} y={y + 14} fontSize={40} textAnchor="middle" fill={INK}>
        1
      </text>
      <text x={x + 120} y={y - 10} fontSize={36} fill={INK}>
        OVERALL SITE PLAN
      </text>
      <line x1={x + 120} y1={y + 2} x2={x + 520} y2={y + 2} stroke={INK} strokeWidth={3} />
      <text x={x + 520} y={y + 40} fontSize={26} textAnchor="end" fill={INK}>
        {`SCALE: 1" = ${scale}'`}
      </text>
      <g transform={`translate(${x + 120} ${y + 70})`}>
        <rect width={seg * k} height={12} fill={INK} />
        <rect x={seg * k} width={seg * k} height={12} fill="#fff" stroke={INK} strokeWidth={2} />
        <text y={40} fontSize={20} fill={INK}>
          0
        </text>
        <text x={seg * k} y={40} fontSize={20} textAnchor="middle" fill={INK}>
          {seg}
        </text>
        <text x={seg * k * 2} y={40} fontSize={20} textAnchor="middle" fill={INK}>
          {`${seg * 2} FT`}
        </text>
      </g>
      <text x={x + 120} y={y + 150} fontSize={18} fill={INK}>
        SCALE APPLIES WHEN PRINTED AT 36" x 24"
      </text>
    </g>
  );
}

function wrap(text: string, width: number, size: number): string[] {
  const max = Math.max(10, Math.floor(width / (size * 0.64)));
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > max) {
      out.push(line.trim());
      line = word;
    } else line += ` ${word}`;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

function SheetNotes({ x, y, w, notes }: { x: number; y: number; w: number; notes: string[] }) {
  const size = 18;
  const wrapped = notes.map((n) => wrap(n, w - 70, size));
  const h = 40 + wrapped.reduce((s, l) => s + l.length * 23 + 4, 0) + 10;
  let cy = y + 62;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fff" stroke={INK} strokeWidth={2} />
      <line x1={x} y1={y + 34} x2={x + w} y2={y + 34} stroke={INK} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 25} fontSize={22} fontWeight={700} textAnchor="middle" fill={INK}>
        SHEET NOTES
      </text>
      {wrapped.map((lines, i) => {
        const block = (
          <g key={i}>
            <text x={x + 14} y={cy} fontSize={size} fill={INK}>
              {i + 1}
            </text>
            {lines.map((l, j) => (
              <text key={j} x={x + 44} y={cy + j * 23} fontSize={size} fill={INK}>
                {l}
              </text>
            ))}
          </g>
        );
        cy += lines.length * 23 + 4;
        return block;
      })}
    </g>
  );
}

function dataTableHeight(rows: ReturnType<typeof siteDataRows>, w: number): number {
  const labelW = 300;
  return (
    44 +
    rows.reduce((sum, r) => {
      const v = wrap(r.value, w - labelW - 24, 17).length;
      const s = 0;
      return sum + Math.max(30, v * 21 + s * 16 + 12);
    }, 0)
  );
}

function DataTable({ x, y, w, rows }: { x: number; y: number; w: number; rows: ReturnType<typeof siteDataRows> }) {
  const labelW = 300;
  const size = 17;
  let cy = y + 44;
  const body = rows.map((r, i) => {
    const valueLines = wrap(r.value, w - labelW - 24, size);
    const sourceLines: string[] = [];
    const h = Math.max(30, valueLines.length * 21 + sourceLines.length * 16 + 12);
    const top = cy;
    cy += h;
    return (
      <g key={i}>
        <line x1={x} y1={top} x2={x + w} y2={top} stroke={INK} strokeWidth={1} />
        <text x={x + labelW - 10} y={top + 21} fontSize={size} textAnchor="end" fill={INK}>
          {`${r.label}:`}
        </text>
        {valueLines.map((l, j) => (
          <text key={j} x={x + labelW + 10} y={top + 21 + j * 21} fontSize={size} fill={INK}>
            {l}
          </text>
        ))}
        {sourceLines.map((l, j) => (
          <text key={`s${j}`} x={x + labelW + 10} y={top + 21 + valueLines.length * 21 + j * 16 - 4} fontSize={13} fill="#555">
            {l}
          </text>
        ))}
      </g>
    );
  });
  return (
    <g>
      <rect x={x} y={y} width={w} height={cy - y} fill="#fff" stroke={INK} strokeWidth={2} />
      <text x={x + w / 2} y={y + 30} fontSize={22} fontWeight={700} textAnchor="middle" fill={INK}>
        SITE DATA (PUBLIC RECORDS)
      </text>
      {body}
      <line x1={x + labelW} y1={y + 44} x2={x + labelW} y2={cy} stroke={INK} strokeWidth={1} />
    </g>
  );
}

/** The legend lists what this sheet draws, and nothing it doesn't. */
function Legend({ x, y, w, bottom, keys, inMassachusetts }: { x: number; y: number; w: number; bottom: number; keys: Set<string>; inMassachusetts: boolean }) {
  const symW = 220;
  // A symbol drawn at its plan size, shrunk to sit inside its row.
  const fit = (s: number, node: (cx: number, cy: number) => ReactNode) => (sx: number, sy: number) => (
    <g transform={`translate(${sx + 90} ${sy}) scale(${s})`}>{node(0, 0)}</g>
  );
  const all: { key: string; label: string; symbol: (sx: number, sy: number) => ReactNode }[] = [
    { key: 'property', label: 'PROPERTY LINE', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={INK} strokeWidth={5} strokeDasharray="60 10 10 10 10 10" /> },
    { key: 'building', label: '(E) BUILDING (MAPPED ROOFPRINT)', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 11} width={100} height={22} fill="#fff" stroke={INK} strokeWidth={3} /> },
    { key: 'road', label: 'ROAD CENTERLINE (MAPPED)', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={INK} strokeWidth={2.2} strokeDasharray="40 10 10 10" /> },
    {
      key: 'feeder',
      label: '(E) ELECTRIC FEEDER',
      symbol: (sx, sy) => (
        <g>
          <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={UTILITY} strokeWidth={2.6} />
          <text x={sx + 90} y={sy + 7} fontSize={20} fontWeight={700} textAnchor="middle" fill={UTILITY} stroke="#fff" strokeWidth={6} paintOrder="stroke">
            E
          </text>
        </g>
      ),
    },
    {
      key: 'ohe',
      label: '(E) OVERHEAD ELECTRIC LINE (OHE), AS MAPPED',
      symbol: (sx, sy) => (
        <g>
          <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={UTILITY} strokeWidth={1.8} />
          <text x={sx + 90} y={sy + 5} fontSize={15} fontWeight={700} textAnchor="middle" fill={UTILITY} stroke="#fff" strokeWidth={6} paintOrder="stroke">OHE</text>
        </g>
      ),
    },
    {
      key: 'uge',
      label: '(E) UNDERGROUND ELECTRIC LINE (UGE), AS MAPPED',
      symbol: (sx, sy) => (
        <g>
          <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={UTILITY} strokeWidth={1.8} strokeDasharray="30 10" />
          <text x={sx + 90} y={sy + 5} fontSize={15} fontWeight={700} textAnchor="middle" fill={UTILITY} stroke="#fff" strokeWidth={6} paintOrder="stroke">UGE</text>
        </g>
      ),
    },
    { key: 'transmission', label: '(E) TRANSMISSION LINE, KV', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={TRANSMISSION} strokeWidth={5} strokeDasharray="70 14 14 14" /> },
    { key: 'service', label: '(E) ELECTRIC SERVICE', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={UTILITY} strokeWidth={3.5} /> },
    { key: 'pole', label: '(E) UTILITY POLE', symbol: fit(0.85, (cx, cy) => <PoleSymbol at={{ x: cx, y: cy }} />) },
    { key: 'serviceTap', label: '(E) SERVICE TRANSFORMER', symbol: fit(0.6, (cx, cy) => <TransformerSymbol at={{ x: cx, y: cy + 4 }} />) },
    { key: 'transformer', label: '(E) PAD-MOUNT TRANSFORMER', symbol: fit(0.9, (cx, cy) => <LetteredSymbol at={{ x: cx, y: cy }} letter="T" color={UTILITY} box />) },
    { key: 'equipmentBox', label: '(E) EQUIPMENT BOX', symbol: (sx, sy) => <rect x={sx + 76} y={sy - 10} width={28} height={20} fill="#fff" stroke={UTILITY} strokeWidth={2.5} /> },
    { key: 'meter', label: '(E) ELECTRIC METER', symbol: fit(0.9, (cx, cy) => <LetteredSymbol at={{ x: cx, y: cy }} letter="M" color={UTILITY} />) },
    { key: 'switchgear', label: '(E) SERVICE ENTRANCE / SWITCHGEAR', symbol: fit(0.85, (cx, cy) => <SwitchgearSymbol at={{ x: cx, y: cy }} />) },
    { key: 'proposedSubstation', label: '(F) PROPOSED SUBSTATION', symbol: fit(0.55, (cx, cy) => <SubstationSymbol at={{ x: cx, y: cy }} proposed />) },
    { key: 'substation', label: '(E) SUBSTATION', symbol: fit(0.55, (cx, cy) => <SubstationSymbol at={{ x: cx, y: cy }} />) },
    { key: 'lightPole', label: '(E) LIGHT POLE (LP)', symbol: fit(0.9, (cx, cy) => <LightPoleSymbol at={{ x: cx - 6, y: cy }} />) },
    { key: 'hydrant', label: '(E) FIRE HYDRANT', symbol: fit(0.9, (cx, cy) => <HydrantSymbol at={{ x: cx, y: cy - 3 }} />) },
    { key: 'catchBasin', label: '(E) CATCH BASIN', symbol: fit(0.9, (cx, cy) => <CatchBasinSymbol at={{ x: cx, y: cy }} />) },
    { key: 'manhole', label: '(E) MANHOLE', symbol: fit(0.9, (cx, cy) => <LetteredSymbol at={{ x: cx, y: cy }} letter="M" color={INK} />) },
    { key: 'sign', label: '(E) SIGN', symbol: fit(1, (cx, cy) => <SignSymbol at={{ x: cx, y: cy }} />) },
    { key: 'zoneOuter', label: '(N) BESS ZONE, UP TO 150 FT RUN', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 11} width={100} height={22} fill="none" stroke={NEW} strokeWidth={1.5} strokeDasharray="14 8" /> },
    { key: 'zone', label: '(N) BESS ZONE', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 11} width={100} height={22} fill="url(#feasibleHatch)" stroke={NEW} strokeWidth={3} /> },
    { key: 'pad', label: '(N) BESS PAD', symbol: (sx, sy) => <PadSymbol at={{ x: sx + 90, y: sy }} k={1.6} /> },
    { key: 'disconnect', label: '(N) AC DISCONNECT', symbol: (sx, sy) => <DisconnectSymbol at={{ x: sx + 90, y: sy }} /> },
    { key: 'breaker', label: '(N) NEW BREAKER', symbol: (sx, sy) => <BreakerSymbol at={{ x: sx + 90, y: sy }} /> },
    { key: 'trench', label: '(N) TRENCH ROUTE', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={NEW} strokeWidth={4} strokeDasharray="22 8 4 8" /> },
    { key: 'wetland', label: 'WETLAND', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 12} width={100} height={24} fill="url(#marsh)" stroke={WATER} strokeWidth={2.5} /> },
    ...(inMassachusetts
      ? [{ key: 'buffer', label: "100' WETLAND BUFFER ZONE (310 CMR 10.02)", symbol: (sx: number, sy: number) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={WATER} strokeWidth={2.5} strokeDasharray="28 14" /> }]
      : []),
    {
      key: 'paved',
      label: '(E) PAVED PARKING AND DRIVES',
      symbol: (sx, sy) => <rect x={sx + 40} y={sy - 11} width={100} height={22} fill={PAVING} stroke={PAVING_EDGE} strokeWidth={2} />,
    },
    {
      key: 'striping',
      label: '(E) PARKING STRIPING',
      symbol: (sx, sy) => (
        <g>
          <rect x={sx + 40} y={sy - 11} width={100} height={22} fill={PAVING} stroke={PAVING_EDGE} strokeWidth={2} />
          {[0, 1, 2, 3].map((k) => <line key={k} x1={sx + 60 + k * 20} y1={sy - 11} x2={sx + 60 + k * 20} y2={sy + 11} stroke={INK} strokeWidth={1.5} />)}
        </g>
      ),
    },
    { key: 'open', label: 'OPEN GROUND', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 11} width={100} height={22} fill="url(#openGround)" stroke="#2e6b3f" strokeWidth={1.5} strokeDasharray="10 8" /> },
    {
      key: 'dimension',
      label: 'DIMENSION',
      symbol: (sx, sy) => (
        <g stroke={INK} strokeWidth={3}>
          <line x1={sx + 10} y1={sy} x2={sx + 170} y2={sy} strokeWidth={1.6} />
          <line x1={sx} y1={sy + 10} x2={sx + 20} y2={sy - 10} />
          <line x1={sx + 160} y1={sy + 10} x2={sx + 180} y2={sy - 10} />
        </g>
      ),
    },
    {
      key: 'leader',
      label: 'CALLOUT: (E) EXISTING, (N) NEW',
      symbol: (sx, sy) => (
        <g>
          <circle cx={sx + 30} cy={sy} r={5.5} fill={INK} />
          <line x1={sx + 30} y1={sy} x2={sx + 100} y2={sy} stroke={INK} strokeWidth={LEADER_W} />
          <rect x={sx + 100} y={sy - 11} width={70} height={22} fill="#fff" stroke={INK} strokeWidth={1.6} />
        </g>
      ),
    },
    { key: 'reference', label: 'REFERENCE TO FEATURE OFF THIS SHEET', symbol: (sx, sy) => <Arrow from={{ x: sx + 40, y: sy }} to={{ x: sx + 140, y: sy }} width={3} head={16} /> },
  ];
  const always = new Set(['property', 'building', 'dimension', 'leader']);
  const items = all.filter((item) => always.has(item.key) || keys.has(item.key));
  const rowH = Math.min(33, Math.floor((bottom - y - 44) / items.length));
  return (
    <g>
      <rect x={x} y={y} width={w} height={44 + items.length * rowH} fill="#fff" stroke={INK} strokeWidth={2} />
      <text x={x + w / 2} y={y + 30} fontSize={22} fontWeight={700} textAnchor="middle" fill={INK}>
        LEGEND
      </text>
      <line x1={x + symW} y1={y + 44} x2={x + symW} y2={y + 44 + items.length * rowH} stroke={INK} strokeWidth={1} />
      {items.map((item, i) => {
        const top = y + 44 + i * rowH;
        return (
          <g key={item.key}>
            <line x1={x} y1={top} x2={x + w} y2={top} stroke={INK} strokeWidth={1} />
            {item.symbol(x + 20, top + rowH / 2)}
            <text x={x + symW + 12} y={top + rowH / 2 + 6} fontSize={15} fill={INK}>
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function TitleStrip({ record }: { record: RecordVersion }) {
  const x = STRIP.x;
  const w = STRIP.w;
  const issued = record.createdAt.slice(0, 10);
  const [street, ...rest] = record.site.address.toUpperCase().split(',');
  return (
    <g>
      <rect x={x} y={40} width={w} height={H - 80} fill="#fff" stroke={INK} strokeWidth={3} />
      <text x={x + w / 2} y={110} fontSize={20} fontWeight={700} textAnchor="middle" fill={INK}>
        CONCEPT SITE PLAN
      </text>
      <text x={x + w / 2} y={138} fontSize={16} textAnchor="middle" fill={INK}>
        FROM PUBLIC RECORDS
      </text>
      {record.synthetic ? (
        <text x={x + w / 2} y={170} fontSize={18} fontWeight={700} textAnchor="middle" fill="#8a5a12">
          SYNTHETIC DATA
        </text>
      ) : null}

      {/* revisions */}
      <g transform={`translate(${x} 900)`}>
        {['REV.', 'DATE', 'DESC.', 'BY'].map((h, i) => (
          <text key={h} x={14 + [0, 50, 160, 250][i]!} y={24} fontSize={14} fontWeight={700} fill={INK}>
            {h}
          </text>
        ))}
        <line x1={0} y1={34} x2={w} y2={34} stroke={INK} strokeWidth={1} />
        <text x={14} y={58} fontSize={14} fill={INK}>
          {`V${record.version}`}
        </text>
        <text x={64} y={58} fontSize={14} fill={INK}>
          {issued}
        </text>
        <text x={174} y={58} fontSize={14} fill={INK}>
          PUBLIC REC.
        </text>
        <text x={264} y={58} fontSize={14} fill={INK}>
          TOOL
        </text>
        <line x1={0} y1={0} x2={w} y2={0} stroke={INK} strokeWidth={1.5} />
        <line x1={0} y1={72} x2={w} y2={72} stroke={INK} strokeWidth={1.5} />
      </g>

      <g transform={`translate(${x + 150} 1700) rotate(-90)`}>
        <text fontSize={52} textAnchor="middle" fill={INK}>
          {street}
        </text>
        <text y={50} fontSize={32} textAnchor="middle" fill={INK}>
          {rest.join(',').trim()}
        </text>
      </g>

      <line x1={x} y1={2000} x2={x + w} y2={2000} stroke={INK} strokeWidth={2} />
      <text x={x + 14} y={2026} fontSize={14} fill={INK}>
        SHEET SIZE:
      </text>
      <text x={x + w / 2} y={2050} fontSize={20} textAnchor="middle" fill={INK}>
        {`24" x 36"`}
      </text>
      <text x={x + 14} y={2080} fontSize={14} fill={INK}>
        SHEET TITLE:
      </text>
      <text x={x + w / 2} y={2106} fontSize={22} textAnchor="middle" fill={INK}>
        SITE PLAN
      </text>
      <text x={x + w / 2} y={2140} fontSize={15} fontWeight={700} textAnchor="middle" fill="#b5121b">
        NOT FOR CONSTRUCTION
      </text>
      <line x1={x} y1={2160} x2={x + w} y2={2160} stroke={INK} strokeWidth={2} />
      <text x={x + 14} y={2186} fontSize={14} fill={INK}>
        DRAWING NO.
      </text>
      <text x={x + w / 2} y={2290} fontSize={84} textAnchor="middle" fill={INK}>
        G-100
      </text>
    </g>
  );
}
