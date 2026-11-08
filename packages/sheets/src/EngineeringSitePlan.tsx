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
  const equipment = drawnEquipment(record.features)
    .filter((f) => f.kind === 'existing_equipment' && f.geometry.type === 'Point' && attributeText(f, 'basis') !== 'CONCEPT')
    .map((f) => ({ f, at: toSheet(toLocal(frame, f.geometry.coordinates as Pos)), type: attributeText(f, 'equipment_type') ?? '' }))
    .filter((e) => inside(e.at, view, 20));
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

  // Callouts: (E) existing, capitalized, on leaders.
  const callouts: Callout[] = [];
  callouts.push({
    anchor: lotSheet[Math.floor(lotSheet.length / 3)]!,
    lines: ['(E) PROPERTY LINE', `PARCEL ${printed(record, 'parcel_id') ?? ''}`.trim()],
  });
  const stories = printed(record, 'building_stories');
  const height = printed(record, 'building_height_ft');
  const built = printed(record, 'year_built');
  buildings.slice(0, 6).forEach((b, i) => {
    const sf = Number(b.area.toPrecision(b.area >= 1000 ? 3 : 2)).toLocaleString('en-US');
    const lines = [`(E) BUILDING ${i + 1}, ≈${sf} SF MAPPED FOOTPRINT`];
    if (i === 0) {
      const facts = [stories, height ? `EST. ${height} HT.` : null, built ? `BUILT ${built}` : null].filter(Boolean);
      if (facts.length) lines.push(`${facts.join(', ')} (ASSESSOR)`);
    }
    callouts.push({ anchor: centroid(b.sheet), lines });
  });
  for (const f of feeders) {
    const id = feederIdOf(f);
    const s = feederSummary(record, id);
    const at = firstInside(linesOf(f).flatMap(sheetLine), view);
    if (!at) continue;
    callouts.push({ anchor: at, lines: [`(E) ELECTRIC FEEDER ${s.line}`, ...(s.capacity ? [s.capacity] : [])], color: UTILITY });
  }
  const frontage = roads.find((r) => (r.attributes?.fronting?.type === 'boolean' && r.attributes.fronting.value) || /street in the address/i.test(r.label ?? ''));
  if (frontage) {
    const at = firstInside(linesOf(frontage).flatMap(sheetLine), view, 0.5);
    const side = printed(record, 'road_side');
    if (at) callouts.push({ anchor: at, lines: [`(E) ${roadName(frontage)}`, ...(side ? [`FRONTAGE, ${side} SIDE`] : [])] });
  }
  for (const w of wetlands) {
    const polys = polygonsOfFeature(w, frame);
    const pts = polys.flatMap((p) => p.outer.map(toSheet));
    const at = firstInside(pts, view);
    if (!at) continue;
    callouts.push({ anchor: at, lines: [`(E) WETLAND: ${(attributeText(w, 'wetland_type') ?? '').toUpperCase()}`.replace(/: $/, '')], color: WATER });
  }
  for (const p of paved) {
    const pts = polygonsOfFeature(p, frame).flatMap((poly) => poly.outer.map(toSheet));
    const at = firstInside(pts, view, 0.6);
    if (at) callouts.push({ anchor: at, lines: ['(E) PAVED PARKING AND DRIVES'] });
  }
  // One callout for the striping, on the longest row, as a drawing marks a typical condition.
  const longestRow = [...stallRows].sort((a, b) => Number((b.attributes?.['stall_count'] as { value?: number } | undefined)?.value ?? 0) - Number((a.attributes?.['stall_count'] as { value?: number } | undefined)?.value ?? 0))[0];
  if (longestRow) {
    const pts = polygonsOfFeature(longestRow, frame).flatMap((poly) => poly.outer.map(toSheet));
    const at = pts.length ? centroid(pts) : null;
    const total = stallRows.reduce((sum, f) => sum + Number((f.attributes?.['stall_count'] as { value?: number } | undefined)?.value ?? 0), 0);
    if (at && inside(at, view, 20)) callouts.push({ anchor: at, lines: ['(E) STRIPED PARKING, TYP.', `${total} STALLS SEEN IN IMAGERY`] });
  }
  for (const o of open) {
    const pts = polygonsOfFeature(o, frame).flatMap((p) => p.outer.map(toSheet));
    if (pts.length) callouts.push({ anchor: centroid(pts), lines: ['OPEN GROUND'] });
  }
  for (const z of feasible) {
    const pts = polygonsOfFeature(z, frame).flatMap((p) => p.outer.map(toSheet));
    const at = firstInside(pts, view, 0.2);
    const kind = zoneKind(z);
    const lines =
      kind === 'FEASIBLE_BESS_RECOMMENDED'
        ? ['(N) BESS ZONE']
        : kind === 'FEASIBLE_BESS_PREFERRED'
          ? ['(N) BESS ZONE', `WITHIN ${attributeText(z, 'preferred_run_ft') ?? "150'"} RUN OF THE SERVICE`]
          : ['(N) BESS ZONE', `WITHIN ${attributeText(z, 'max_run_ft') ?? "250'"} RUN OF THE SERVICE`];
    if (at) callouts.push({ anchor: at, lines, color: NEW });
  }

  const substations = record.features
    .filter((f) => f.kind === 'substation' && f.geometry.type === 'Point')
    .map((f) => ({ f, at: toSheet(toLocal(frame, f.geometry.coordinates as Pos)), proposed: f.field === 'proposed_substations_nearby' }))
    .filter((s) => inside(s.at, view, 40));
  for (const s of substations) {
    const type = attributeText(s.f, 'substation_type');
    callouts.push({
      anchor: s.at,
      lines: s.proposed
        ? [`(F) ${(s.f.label ?? 'PROPOSED SUBSTATION').toUpperCase()}`]
        : [`(E) SUBSTATION ${(s.f.label ?? '').toUpperCase()}`, ...(type ? [type] : [])],
      color: UTILITY,
    });
  }

  // The concept layout: new equipment at the nearest open ground, never a design.
  const concept = record.features
    .filter((f) => f.kind === 'existing_equipment' && f.geometry.type === 'Point' && attributeText(f, 'basis') === 'CONCEPT')
    .map((f) => ({ f, at: toSheet(toLocal(frame, f.geometry.coordinates as Pos)), type: attributeText(f, 'equipment_type') ?? '' }))
    .filter((e) => inside(e.at, view, 20));
  for (const c of concept) {
    callouts.push({ anchor: c.at, lines: [plainLabel(c.f.label).toUpperCase()], color: NEW });
  }
  // Where symbols are drawn, so dimension text stays off them.
  const symbolPoints = [...equipment.map((e) => e.at), ...concept.map((c) => c.at), ...substations.map((s) => s.at)];
  for (const t of trenches) {
    const at = firstInside(linesOf(t).flatMap(sheetLine), view, 0.5);
    if (at) callouts.push({ anchor: at, lines: ['(N) TRENCH ROUTE'], color: NEW });
  }

  // How the building likely connects: inferred from the nearest mapped line, never field verified.
  for (const e of equipment) {
    if (e.type === 'UTILITY_POLE') continue;
    callouts.push({ anchor: e.at, lines: [plainLabel(e.f.label).toUpperCase()], color: UTILITY });
  }
  for (const s of servicePaths) {
    const at = firstInside(linesOf(s).flatMap(sheetLine), view, 0.5);
    const drop = attributeText(s, 'line_class') === 'DETECTED SERVICE DROP';
    if (at)
      callouts.push({
        anchor: at,
        lines: drop
          ? ['(E) OVERHEAD SERVICE DROP']
          : ['(E) ELECTRIC SERVICE'],
        color: UTILITY,
      });
  }
  const poles = equipment.filter((e) => e.type === 'UTILITY_POLE');
  if (poles.length) {
    const first = poles[0]!;
    callouts.push({ anchor: first.at, lines: [poles.length > 1 ? `(E) UTILITY POLE, TYP. OF ${poles.length}` : '(E) UTILITY POLE'], color: UTILITY });
  }
  const shownTransmission = transmission
    .map((t) => ({ t, at: firstInside(linesOf(t).flatMap(sheetLine), view) }))
    .filter((x): x is { t: MapFeature; at: Pt } => x.at !== null);
  for (const { t, at } of shownTransmission.slice(0, 2)) {
    const kv = attributeText(t, 'line_voltage');
    callouts.push({ anchor: at, lines: [`(E) ${kv ? `${kv} ` : ''}TRANSMISSION LINE`, ...(attributeText(t, 'line_owner') ? [attributeText(t, 'line_owner')!] : [])], color: TRANSMISSION });
  }

  const placed = placeCallouts(callouts, view);
  const boxes = placed.map((c) => c.box);
  const clearOfBoxes = (p: Pt, pad = 30) => boxes.every((b) => p.x < b.x - pad || p.x > b.x + b.w + pad || p.y < b.y - pad || p.y > b.y + b.h + pad);

  // The main building's overall size, as dimension strings along its bottom and right sides on the sheet.
  const mainSheet = buildings[0]?.sheet ?? [];
  const buildingDims: { a: Pt; b: Pt; text: string }[] = [];
  if (mainSheet.length > 2) {
    const xs = mainSheet.map((p) => p.x), ys = mainSheet.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    buildingDims.push({ a: { x: x0, y: y1 + 70 }, b: { x: x1, y: y1 + 70 }, text: `${Math.round((x1 - x0) / k)}'` });
    buildingDims.push({ a: { x: x1 + 70, y: y0 }, b: { x: x1 + 70, y: y1 }, text: `${Math.round((y1 - y0) / k)}'` });
  }

  // Each lot line's bearing and length, as a survey writes it, along the line outside the lot.
  const lotRing = lotSheet;
  const lotLocal = lotRing.map((p) => drawing.toLocalPoint(p));
  const lotArea = lotRing.reduce((s, p, i) => s + p.x * lotRing[(i + 1) % lotRing.length]!.y - lotRing[(i + 1) % lotRing.length]!.x * p.y, 0);
  const bearings: { at: Pt; angle: number; text: string }[] = [];
  for (let i = 0; i < lotRing.length; i++) {
    const a = lotRing[i]!, b = lotRing[(i + 1) % lotRing.length]!;
    const la = lotLocal[i]!, lb = lotLocal[(i + 1) % lotLocal.length]!;
    const feet = Math.hypot(lb.x - la.x, lb.y - la.y);
    if (feet < 60) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Outward: to the right of the edge when the ring runs clockwise on the sheet.
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const out = lotArea > 0 ? { x: (a.y - b.y) / len, y: (b.x - a.x) / len } : { x: (b.y - a.y) / len, y: (a.x - b.x) / len };
    const at = { x: mid.x - out.x * 26, y: mid.y - out.y * 26 };
    if (!inside(at, view, 60) || !clearOfBoxes(at, 120)) continue;
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    bearings.push({ at, angle: deg > 90 || deg < -90 ? deg + 180 : deg, text: `${surveyBearing(la, lb)} ${feet.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}'` });
  }

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


  const fall = fallDirection(record);
  const slope = printed(record, 'site_slope_pct');
  const rows = siteDataRows(record);
  const notes = sheetNotes(record);
  const tiles = aerial && record.baseMap ? aerialTiles(record, drawing) : [];
  const offY = 70 + dataTableHeight(rows, RIGHT.w) + 24;
  const legendY = offY + (references.length ? 44 + references.length * 40 + 24 : 0);

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
          <marker id="leaderDot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9">
            <circle cx="5" cy="5" r="4" fill={INK} />
          </marker>
          <marker id="refArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="16" markerHeight="16" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill={INK} />
          </marker>
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

          {paved.flatMap((p) => polygonsOfFeature(p, frame)).map((p, i) => (
            <path key={`paved-${i}`} d={`${path(p.outer.map(toSheet))} ${(p.holes ?? []).map((h) => path(h.map(toSheet))).join(' ')}`} fillRule="evenodd" fill="#d9d9d6" stroke="#8c8c88" strokeWidth={1.5} opacity={0.85} />
          ))}

          {stripes.flatMap((f) => linesOf(f)).map((line, i) => (
            <path key={`stripe-${i}`} d={path(sheetLine(line), false)} fill="none" stroke={INK} strokeWidth={1.4} />
          ))}

          {open.flatMap((o) => polygonsOfFeature(o, frame)).map((p, i) => (
            <path key={`open-${i}`} d={path(p.outer.map(toSheet))} fill="url(#openGround)" stroke="#2e6b3f" strokeWidth={1.5} strokeDasharray="10 8" opacity={0.9} />
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
            linesOf(r).map((line, j) => {
              const pts = sheetLine(line);
              const ordered = pts[0]!.x <= pts.at(-1)!.x ? pts : [...pts].reverse();
              const id = `road-${i}-${j}`;
              return (
                <g key={id}>
                  <path id={id} d={path(ordered, false)} fill="none" stroke={INK} strokeWidth={2.2} strokeDasharray="60 12 12 12" />
                  {lengthOf(ordered) > 500 ? (
                    <text fontSize={24} letterSpacing={3} fill={INK} stroke="#fff" strokeWidth={6} paintOrder="stroke" dy={-10}>
                      <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                        {roadName(r)}
                      </textPath>
                    </text>
                  ) : null}
                </g>
              );
            }),
          )}

          {feeders.map((f, i) =>
            linesOf(f).map((line, j) => {
              const pts = sheetLine(line);
              const ordered = pts[0]!.x <= pts.at(-1)!.x ? pts : [...pts].reverse();
              const id = `feeder-${i}-${j}`;
              const letters = Array.from({ length: Math.ceil(lengthOf(ordered) / 140) }, () => 'E').join(' '.repeat(8));
              return (
                <g key={id}>
                  <path id={id} d={path(ordered, false)} fill="none" stroke={UTILITY} strokeWidth={2.6} />
                  <text fontSize={20} fontWeight={700} fill={UTILITY} stroke="#fff" strokeWidth={7} paintOrder="stroke" dy={7}>
                    <textPath href={`#${id}`}>{letters}</textPath>
                  </text>
                </g>
              );
            }),
          )}

          {transmission.map((t, i) =>
            linesOf(t).map((line, j) => {
              const pts = sheetLine(line);
              const ordered = pts[0]!.x <= pts.at(-1)!.x ? pts : [...pts].reverse();
              const id = `tx-${i}-${j}`;
              const kv = attributeText(t, 'line_voltage') ?? 'T';
              const marks = Array.from({ length: Math.max(1, Math.ceil(lengthOf(ordered) / 420)) }, () => kv).join('\u2003'.repeat(12));
              return (
                <g key={id}>
                  <path id={id} d={path(ordered, false)} fill="none" stroke={TRANSMISSION} strokeWidth={5} strokeDasharray="70 14 14 14" />
                  <text fontSize={19} fontWeight={700} fill={TRANSMISSION} stroke="#fff" strokeWidth={7} paintOrder="stroke" dy={-9}>
                    <textPath href={`#${id}`}>{marks}</textPath>
                  </text>
                </g>
              );
            }),
          )}

          {segments.map((sgm, i) =>
            linesOf(sgm).map((line, j) => {
              const pts = sheetLine(line);
              const ordered = pts[0]!.x <= pts.at(-1)!.x ? pts : [...pts].reverse();
              const id = `seg-${i}-${j}`;
              const underground = /UNDERGROUND/.test(attributeText(sgm, 'construction') ?? '');
              const token = underground ? 'UGE' : 'OHE';
              const marks = Array.from({ length: Math.max(1, Math.ceil(lengthOf(ordered) / 220)) }, () => token).join('\u2003'.repeat(9));
              return (
                <g key={id}>
                  <path id={id} d={path(ordered, false)} fill="none" stroke={UTILITY} strokeWidth={1.8} strokeDasharray={underground ? '30 10' : undefined} />
                  <text fontSize={15} fontWeight={700} fill={UTILITY} stroke="#fff" strokeWidth={6} paintOrder="stroke" dy={5}>
                    <textPath href={`#${id}`}>{marks}</textPath>
                  </text>
                </g>
              );
            }),
          )}

          {trenches.map((t, i) =>
            linesOf(t).map((line, j) => (
              <path key={`trench-${i}-${j}`} d={path(sheetLine(line), false)} fill="none" stroke={NEW} strokeWidth={4} strokeDasharray="22 8 4 8" />
            )),
          )}

          {concept.map((c, i) =>
            c.type === 'BESS_PAD' ? (
              <PadSymbol key={`pad-${i}`} at={c.at} k={k} />
            ) : c.type === 'AC_DISCONNECT' ? (
              <rect key={`disc-${i}`} x={c.at.x + 18} y={c.at.y - 10} width={20} height={20} fill="#fff" stroke={NEW} strokeWidth={3} />
            ) : (
              <circle key={`brk-${i}`} cx={c.at.x} cy={c.at.y} r={11} fill="#fff" stroke={NEW} strokeWidth={3} />
            ),
          )}

          {detectedLines.map((d, i) =>
            linesOf(d).map((line, j) => {
              const pts = sheetLine(line);
              const ordered = pts[0]!.x <= pts.at(-1)!.x ? pts : [...pts].reverse();
              const id = `det-${i}-${j}`;
              return (
                <g key={id}>
                  <path id={id} d={path(ordered, false)} fill="none" stroke={UTILITY} strokeWidth={1.8} />
                  <text fontSize={15} fontWeight={700} fill={UTILITY} stroke="#fff" strokeWidth={6} paintOrder="stroke" dy={5}>
                    <textPath href={`#${id}`} startOffset="40%">OHE</textPath>
                  </text>
                </g>
              );
            }),
          )}

          {servicePaths.map((sp, i) =>
            linesOf(sp).map((line, j) => (
              <path key={`svc-${i}-${j}`} d={path(sheetLine(line), false)} fill="none" stroke={UTILITY} strokeWidth={3.5} />
            )),
          )}

          {substations.map((s, i) => (
            <SubstationSymbol key={`sub-${i}`} at={s.at} proposed={s.proposed} />
          ))}

          {equipment.map((e, i) =>
            e.type === 'UTILITY_POLE' ? (
              <PoleSymbol key={`eq-${i}`} at={e.at} />
            ) : e.type === 'SERVICE_TAP' ? (
              <TransformerSymbol key={`eq-${i}`} at={e.at} />
            ) : e.type === 'PAD_MOUNT_TRANSFORMER_CANDIDATE' ? (
              <rect key={`eq-${i}`} x={e.at.x - 14} y={e.at.y - 12} width={28} height={24} fill="#fff" stroke={UTILITY} strokeWidth={2.5} />
            ) : (
              <SwitchgearSymbol key={`eq-${i}`} at={e.at} />
            ),
          )}

          {buildings.map((b, i) => (
            <path key={`bldg-${i}`} d={path(b.sheet)} fill="#fff" fillOpacity={0.35} stroke={INK} strokeWidth={3} />
          ))}

          <path d={path(lotSheet)} fill="none" stroke={INK} strokeWidth={5.5} strokeDasharray="80 14 14 14 14 14" />

          {buildingDims.map((d, i) => <Dimension key={`bdim-${i}`} a={d.a} b={d.b} text={d.text} avoid={symbolPoints} />)}
          {bearings.map((bg, i) => (
            <text key={`brg-${i}`} x={bg.at.x} y={bg.at.y} fontSize={20} textAnchor="middle" fill={INK} stroke="#fff" strokeWidth={6} paintOrder="stroke" transform={`rotate(${bg.angle} ${bg.at.x} ${bg.at.y})`}>
              {bg.text}
            </text>
          ))}

          {dims.map((d, i) => {
            const line = linesOf(d)[0];
            if (!line || line.length < 2) return null;
            const a = toSheet(toLocal(frame, line[0]!));
            const b = toSheet(toLocal(frame, line.at(-1)!));
            return <Dimension key={`dim-${i}`} a={a} b={b} text={dimensionText(d.label ?? '')} avoid={symbolPoints} />;
          })}

          {fall !== null && slope ? <FallArrow at={{ x: view.x + view.w - 230, y: view.y + 150 }} degrees={fall + drawing.rotationDeg} text={`${slope} AVG. FALL`} /> : null}

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
        <Legend x={RIGHT.x} y={legendY} w={RIGHT.w} inMassachusetts={inMassachusetts} />

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

function firstInside(pts: Pt[], v: typeof VIEW, at = 0.35): Pt | null {
  const shown = pts.filter((p) => inside(p, v, 40));
  return shown.length ? shown[Math.floor(shown.length * at)]! : null;
}

const lengthOf = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);

// ------------------------------------------------------------------ callouts

interface Callout {
  anchor: Pt;
  lines: string[];
  color?: string;
}

interface PlacedCallout extends Callout {
  box: { x: number; y: number; w: number; h: number };
  side: 'left' | 'right';
  gutter: number;
}

const CALLOUT_FONT = 22;
const LINE_H = 27;
const textWidth = (s: string, size = CALLOUT_FONT) => s.length * size * 0.64;

/**
 * Stack callouts in two columns at the plan's edges, each on a leader to its feature. Boxes never overlap: each
 * column stacks down from its anchors, then pushes up from the bottom, and when a column can't hold every box the
 * last-added ones, which matter least, are left off. Features off the plan get no callout.
 */
function placeCallouts(callouts: Callout[], v: typeof VIEW): PlacedCallout[] {
  const GAP = 14;
  const mid = v.x + v.w / 2;
  const top = v.y + 24, bottom = v.y + v.h - 20;
  const shown = callouts.map((c, order) => ({ ...c, order })).filter((c) => inside(c.anchor, v, -4));
  const placed: PlacedCallout[] = [];
  for (const side of ['left', 'right'] as const) {
    let column = shown.filter((c) => (side === 'left' ? c.anchor.x < mid : c.anchor.x >= mid));
    const size = (c: Callout) => ({ w: Math.max(...c.lines.map((l) => textWidth(l))) + 24, h: c.lines.length * LINE_H + 14 });
    while (column.length && column.reduce((sum, c) => sum + size(c).h + GAP, 0) > bottom - top) {
      column = column.filter((c) => c.order !== Math.max(...column.map((d) => d.order)));
    }
    column.sort((a, b) => a.anchor.y - b.anchor.y);
    const ys: number[] = [];
    column.forEach((c, i) => {
      const h = size(c).h;
      ys[i] = Math.max(c.anchor.y - h / 2, i === 0 ? top : ys[i - 1]! + size(column[i - 1]!).h + GAP);
    });
    for (let i = column.length - 1; i >= 0; i--) {
      const limit = i === column.length - 1 ? bottom : ys[i + 1]! - GAP;
      ys[i] = Math.min(ys[i]!, limit - size(column[i]!).h);
    }
    const boxes = column.map((c, i) => {
      const { w, h } = size(c);
      return { c, box: { x: side === 'left' ? v.x + 24 : v.x + v.w - 24 - w, y: ys[i]!, w, h } };
    });
    const gutter = side === 'left' ? Math.max(...boxes.map((b) => b.box.x + b.box.w)) + 26 : Math.min(...boxes.map((b) => b.box.x)) - 26;
    for (const { c, box } of boxes) placed.push({ anchor: c.anchor, lines: c.lines, color: c.color, box, side, gutter });
  }
  return placed;
}

function CalloutBox({ callout }: { callout: PlacedCallout }) {
  const { box, side, anchor, lines, color = INK } = callout;
  const from = { x: side === 'left' ? box.x + box.w : box.x, y: box.y + box.h / 2 };
  // Out to the column's gutter first, clear of every box in the column, then to the feature.
  return (
    <g>
      <polyline
        points={`${from.x},${from.y} ${callout.gutter},${from.y} ${anchor.x},${anchor.y}`}
        fill="none"
        stroke={color}
        strokeWidth={2}
        markerEnd="url(#leaderDot)"
      />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#fff" stroke={color} strokeWidth={1.4} />
      {lines.map((line, i) => (
        <text key={i} x={side === 'left' ? box.x + box.w - 12 : box.x + 12} y={box.y + 30 + i * LINE_H} fontSize={CALLOUT_FONT} fill={color} textAnchor={side === 'left' ? 'end' : 'start'}>
          {line}
        </text>
      ))}
    </g>
  );
}

interface Reference {
  target: Pt;
  text: string;
  color: string;
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
        const deg = (Math.atan2(r.target.y - c.y, r.target.x - c.x) * 180) / Math.PI;
        const lines = wrap(r.text, w - 90, 17);
        return (
          <g key={i}>
            <line x1={x} y1={top} x2={x + w} y2={top} stroke={INK} strokeWidth={1} />
            <g transform={`translate(${x + 38} ${top + rowH / 2}) rotate(${deg})`}>
              <line x1={-22} y1={0} x2={18} y2={0} stroke={r.color} strokeWidth={2.5} markerEnd="url(#refArrow)" />
            </g>
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

// The label sits at the middle of the line, or slides along it to clear the drawn equipment; with no clear spot,
// the line is drawn without its text rather than over a symbol.
function Dimension({ a, b, text, avoid = [] }: { a: Pt; b: Pt; text: string; avoid?: Pt[] }) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const deg = (ang * 180) / Math.PI;
  const upright = deg > 90 || deg < -90 ? deg + 180 : deg;
  const tick = (p: Pt) => {
    const t = ang + Math.PI / 4;
    return <line x1={p.x - Math.cos(t) * 16} y1={p.y - Math.sin(t) * 16} x2={p.x + Math.cos(t) * 16} y2={p.y + Math.sin(t) * 16} stroke={INK} strokeWidth={3} />;
  };
  const half = (text.length * 24 * 0.62) / 2 + 30;
  const clear = (p: Pt) => avoid.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > half);
  const m = [0.5, 0.35, 0.65, 0.2, 0.8].map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })).find(clear);
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={1.6} />
      {tick(a)}
      {tick(b)}
      {m ? <text x={m.x} y={m.y} dy={-10} fontSize={24} fontWeight={700} textAnchor="middle" fill={INK} stroke="#fff" strokeWidth={7} paintOrder="stroke" transform={`rotate(${upright} ${m.x} ${m.y})`}>
        {text}
      </text> : null}
    </g>
  );
}

function FallArrow({ at, degrees, text }: { at: Pt; degrees: number; text: string }) {
  const r = (degrees * Math.PI) / 180;
  const dx = Math.sin(r) * 80;
  const dy = -Math.cos(r) * 80;
  return (
    <g>
      <line x1={at.x - dx} y1={at.y - dy} x2={at.x + dx} y2={at.y + dy} stroke={INK} strokeWidth={4} markerEnd="url(#refArrow)" />
      <text x={at.x} y={at.y + 120} fontSize={21} fontWeight={700} textAnchor="middle" fill={INK} stroke="#fff" strokeWidth={7} paintOrder="stroke">
        {text}
      </text>
      <text x={at.x} y={at.y + 146} fontSize={18} textAnchor="middle" fill={INK} stroke="#fff" strokeWidth={6} paintOrder="stroke">
        AVERAGE ACROSS PARCEL
      </text>
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

function TransformerSymbol({ at, inferred = false }: { at: Pt; inferred?: boolean }) {
  // Pad-mounted transformer, as the samples' legend draws it: a box with a smaller box on top.
  return (
    <g strokeDasharray={inferred ? '7 5' : undefined}>
      <rect x={at.x - 20} y={at.y - 14} width={40} height={32} fill="#fff" stroke={UTILITY} strokeWidth={3} />
      <rect x={at.x - 9} y={at.y - 26} width={18} height={12} fill="#fff" stroke={UTILITY} strokeWidth={2.5} />
    </g>
  );
}

function SwitchgearSymbol({ at, inferred = false }: { at: Pt; inferred?: boolean }) {
  return (
    <g strokeDasharray={inferred ? '7 5' : undefined}>
      <rect x={at.x - 26} y={at.y - 12} width={52} height={24} fill="#fff" stroke={UTILITY} strokeWidth={3} />
      <line x1={at.x - 26} y1={at.y + 12} x2={at.x + 26} y2={at.y - 12} stroke={UTILITY} strokeWidth={2} />
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

function Legend({ x, y, w, inMassachusetts }: { x: number; y: number; w: number; inMassachusetts: boolean }) {
  const rowH = 33;
  const symW = 220;
  const items: { label: string; symbol: (sx: number, sy: number) => ReactNode }[] = [
    { label: 'PROPERTY LINE', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={INK} strokeWidth={5} strokeDasharray="60 10 10 10 10 10" /> },
    { label: '(E) BUILDING (MAPPED ROOFPRINT)', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 12} width={100} height={24} fill="#fff" stroke={INK} strokeWidth={3} /> },
    { label: 'ROAD CENTERLINE (MAPPED)', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={INK} strokeWidth={2.2} strokeDasharray="40 10 10 10" /> },
    {
      label: '(E) ELECTRIC FEEDER',
      symbol: (sx, sy) => (
        <g>
          <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={UTILITY} strokeWidth={2.6} />
          <text x={sx + 90} y={sy + 7} fontSize={20} fontWeight={700} textAnchor="middle" fill={UTILITY} stroke="#fff" strokeWidth={8} paintOrder="stroke">
            E
          </text>
        </g>
      ),
    },
    {
      label: '(E) OVERHEAD ELECTRIC LINE (OHE), AS MAPPED',
      symbol: (sx, sy) => (
        <g>
          <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={UTILITY} strokeWidth={1.8} />
          <text x={sx + 90} y={sy + 5} fontSize={15} fontWeight={700} textAnchor="middle" fill={UTILITY} stroke="#fff" strokeWidth={6} paintOrder="stroke">OHE</text>
        </g>
      ),
    },
    {
      label: '(E) UNDERGROUND ELECTRIC LINE (UGE), AS MAPPED',
      symbol: (sx, sy) => (
        <g>
          <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={UTILITY} strokeWidth={1.8} strokeDasharray="30 10" />
          <text x={sx + 90} y={sy + 5} fontSize={15} fontWeight={700} textAnchor="middle" fill={UTILITY} stroke="#fff" strokeWidth={6} paintOrder="stroke">UGE</text>
        </g>
      ),
    },
    { label: '(E) TRANSMISSION LINE, KV', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={TRANSMISSION} strokeWidth={5} strokeDasharray="70 14 14 14" /> },
    { label: '(E) ELECTRIC SERVICE', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={UTILITY} strokeWidth={3.5} /> },
    { label: '(N) BESS ZONE, UP TO 150 FT RUN', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 14} width={100} height={28} fill="none" stroke={NEW} strokeWidth={1.5} strokeDasharray="14 8" /> },
    { label: '(N) BESS ZONE', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 14} width={100} height={28} fill="url(#feasibleHatch)" stroke={NEW} strokeWidth={3} /> },
    { label: '(N) BESS PAD', symbol: (sx, sy) => <PadSymbol at={{ x: sx + 90, y: sy }} k={1.6} /> },
    { label: '(N) TRENCH ROUTE', symbol: (sx, sy) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={NEW} strokeWidth={4} strokeDasharray="22 8 4 8" /> },
    { label: '(E) UTILITY POLE', symbol: (sx, sy) => <PoleSymbol at={{ x: sx + 90, y: sy }} /> },
    { label: '(E) PAD-MOUNT TRANSFORMER', symbol: (sx, sy) => <TransformerSymbol at={{ x: sx + 90, y: sy + 2 }} /> },
    { label: '(E) SERVICE ENTRANCE / SWITCHGEAR', symbol: (sx, sy) => <SwitchgearSymbol at={{ x: sx + 90, y: sy }} /> },
    {
      label: '(F) PROPOSED SUBSTATION',
      symbol: (sx, sy) => <SubstationSymbol at={{ x: sx + 90, y: sy }} proposed />,
    },
    {
      label: '(E) SUBSTATION',
      symbol: (sx, sy) => (
        <g>
          <rect x={sx + 72} y={sy - 15} width={30} height={30} fill="#fff" stroke={UTILITY} strokeWidth={3} />
          <rect x={sx + 79} y={sy - 8} width={16} height={16} fill="none" stroke={UTILITY} strokeWidth={2.5} />
        </g>
      ),
    },
    { label: 'WETLAND', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 16} width={100} height={32} fill="url(#marsh)" stroke={WATER} strokeWidth={2.5} /> },
    ...(inMassachusetts
      ? [{ label: "100' WETLAND BUFFER ZONE (310 CMR 10.02)", symbol: (sx: number, sy: number) => <line x1={sx} y1={sy} x2={sx + 180} y2={sy} stroke={WATER} strokeWidth={2.5} strokeDasharray="28 14" /> }]
      : []),
    { label: '(E) PAVED PARKING AND DRIVES (MAPPED)', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 14} width={100} height={28} fill="#d9d9d6" stroke="#8c8c88" strokeWidth={1.5} /> },
    {
      label: '(E) PARKING STRIPING (FROM IMAGERY)',
      symbol: (sx, sy) => (
        <g stroke={INK} strokeWidth={1.4}>
          {[0, 1, 2, 3, 4].map((k) => <line key={k} x1={sx + 50 + k * 20} y1={sy - 14} x2={sx + 50 + k * 20} y2={sy + 14} />)}
        </g>
      ),
    },
    { label: 'OPEN GROUND', symbol: (sx, sy) => <rect x={sx + 40} y={sy - 14} width={100} height={28} fill="url(#openGround)" stroke="#2e6b3f" strokeWidth={1.5} strokeDasharray="10 8" /> },
    {
      label: 'DIMENSION',
      symbol: (sx, sy) => (
        <g stroke={INK} strokeWidth={3}>
          <line x1={sx + 10} y1={sy} x2={sx + 170} y2={sy} strokeWidth={1.6} />
          <line x1={sx} y1={sy + 10} x2={sx + 20} y2={sy - 10} />
          <line x1={sx + 160} y1={sy + 10} x2={sx + 180} y2={sy - 10} />
        </g>
      ),
    },
    { label: 'REFERENCE TO FEATURE OFF THIS SHEET', symbol: (sx, sy) => <line x1={sx + 20} y1={sy} x2={sx + 160} y2={sy} stroke={INK} strokeWidth={4} markerEnd="url(#refArrow)" /> },
  ];
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
          <g key={item.label}>
            <line x1={x} y1={top} x2={x + w} y2={top} stroke={INK} strokeWidth={1} />
            {item.symbol(x + 20, top + rowH / 2)}
            <text x={x + symW + 12} y={top + 22} fontSize={15} fill={INK}>
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
