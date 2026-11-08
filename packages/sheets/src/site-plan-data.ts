// What the engineering site plan says, read from the record and nothing else.
//
// Pure functions, so the drawing can stay a drawing and these can be tested on their own.
// Every row names where its value came from. A value the record doesn't hold is printed as
// not found, never filled in.

import type { MapFeature, Observation, RecordVersion, Value } from '@eqore/contract';

export interface DataRow {
  label: string;
  value: string;
  /** Short source name, printed small beside the value. */
  source?: string;
}

const valueOf = (record: RecordVersion, field: string): Value | undefined => record.values.find((v) => v.field === field);

const UNIT_WORDS: Record<string, string> = {
  ft: "'",
  acre: ' AC',
  percent: '%',
  sqft: ' SF',
  'sq ft': ' SF',
  kV: ' KV',
  MW: ' MW',
  MVA: ' MVA',
  A: ' A',
};

export function formatQuantity(value: number, unit: string): string {
  if (/^(year|yr)s?$/i.test(unit)) return String(Math.round(value));
  const digits = unit === 'acre' ? 2 : Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  const n = value.toLocaleString('en-US', { maximumFractionDigits: digits });
  return `${n}${UNIT_WORDS[unit] ?? ` ${unit.toUpperCase()}`}`;
}

type Reading = NonNullable<Value['current']>;

export function formatReading(reading: Reading | null | undefined): string | null {
  if (!reading) return null;
  const r = reading as { type: string; value?: unknown; unit?: string };
  if (r.type === 'quantity' && typeof r.value === 'number') return formatQuantity(r.value, r.unit ?? '');
  if (typeof r.value === 'string') return r.value.toUpperCase();
  if (typeof r.value === 'number' || typeof r.value === 'boolean') return String(r.value).toUpperCase();
  return null;
}

/** The value as a sheet would print it, or null when the record has none. */
export function printed(record: RecordVersion, field: string): string | null {
  const value = valueOf(record, field);
  if (!value) return null;
  if (value.current) return formatReading(value.current);
  const candidates = (value as { candidates?: { value: Reading }[] }).candidates ?? [];
  if (candidates.length > 0) {
    const shown = candidates.map((c) => formatReading(c.value)).filter(Boolean);
    return `${shown.join(' / ')} (SOURCES DIFFER)`;
  }
  return null;
}

const observationsOf = (record: RecordVersion, value: Value | undefined): Observation[] =>
  value ? record.observations.filter((o) => value.observationIds.includes(o.id)) : [];

/** A short name for where a value came from, for the small print beside it. */
export function sourceOf(record: RecordVersion, field: string): string | undefined {
  const value = valueOf(record, field);
  const observation = observationsOf(record, value).find((o) => o.id === value?.currentObservationId) ?? observationsOf(record, value).at(-1);
  if (!observation) return undefined;
  const name = observation.source.name.replace(/\s*\(.*\)$/, '');
  const date = observation.sourceDate ? `, ${observation.sourceDate}` : '';
  return `${name}${date}`.toUpperCase();
}

const NOT_FOUND = 'NOT FOUND IN PUBLIC RECORDS';

function row(record: RecordVersion, label: string, field: string): DataRow {
  return { label, value: printed(record, field) ?? NOT_FOUND, source: sourceOf(record, field) };
}

/** The latest reading of each feeder detail, keyed by the feeder it describes. */
export function feederDetails(record: RecordVersion): Map<string, Map<string, Reading>> {
  const byFeeder = new Map<string, Map<string, Reading>>();
  const latest = [...record.observations].sort((a, b) => a.retrievedAt.localeCompare(b.retrievedAt));
  for (const o of latest) {
    if (!o.field.startsWith('feeder') || o.kind !== 'reading' || !o.value) continue;
    const id = o.locator?.objectId;
    if (typeof id !== 'string') continue;
    const details = byFeeder.get(id) ?? new Map<string, Reading>();
    details.set(o.field, o.value as Reading);
    byFeeder.set(id, details);
  }
  return byFeeder;
}

/** The feeder nearest the main building, from the record's own distance reading. */
export function nearestFeeder(record: RecordVersion): { id: string; distance: string | null } | null {
  const value = valueOf(record, 'distance_to_nearest_line_ft');
  const observation = observationsOf(record, value).at(-1);
  const id = observation?.locator?.objectId;
  if (typeof id !== 'string') return null;
  return { id, distance: formatReading(value?.current) };
}

export function feederSummary(record: RecordVersion, id: string): { line: string; capacity: string | null } {
  const d = feederDetails(record).get(id);
  const kv = formatReading(d?.get('feeder_voltage'));
  const phase = formatReading(d?.get('feeder_phase'));
  const hosting = formatReading(d?.get('feeder_hosting_capacity'));
  const loading = formatReading(d?.get('feeder_peak_loading_pct'));
  const rating = formatReading(d?.get('feeder_rating_mva'));
  const line = [id, kv, phase ? `${phase.replace(/ PHASE$/, '')}Ø` : null].filter(Boolean).join(', ');
  const parts = [hosting ? `${hosting} HOSTING CAP.` : null, loading ? `${loading} PEAK LOADING` : null, rating ? `${rating} RATING` : null];
  const capacity = parts.filter(Boolean).join(', ');
  return { line, capacity: capacity || null };
}

/** The nearest feature of a kind, by the distance the record measured. */
export function nearest(record: RecordVersion, kind: MapFeature['kind'], field?: string): MapFeature | null {
  const distanceOf = (f: MapFeature) => {
    const d = f.attributes?.['distance_ft'] as { value?: number } | undefined;
    return typeof d?.value === 'number' ? d.value : Number.POSITIVE_INFINITY;
  };
  const candidates = record.features.filter((f) => f.kind === kind && (!field || f.field === field));
  return candidates.sort((a, b) => distanceOf(a) - distanceOf(b))[0] ?? null;
}

export function attributeText(feature: MapFeature | null, key: string): string | null {
  const a = feature?.attributes?.[key] as Reading | undefined;
  return formatReading(a ?? null);
}

export type LineClass = 'feeder' | 'segment' | 'transmission' | 'service' | 'detected' | 'other';

/** What kind of electric line a utility_line feature is. */
export function lineClassOf(f: MapFeature): LineClass {
  const cls = attributeText(f, 'line_class');
  if (f.field === 'transmission_nearby') return 'transmission';
  if (cls === 'FEEDER CANDIDATE') return 'feeder';
  if (cls === 'DISTRIBUTION SEGMENT') return 'segment';
  if (cls === 'INFERRED SERVICE PATH' || cls === 'DETECTED SERVICE DROP') return 'service';
  if (cls === 'DETECTED OVERHEAD CONDUCTOR') return 'detected';
  if (/^Nearby line:/i.test(f.label ?? '')) return 'feeder';
  return 'other';
}

/** The feeder a feeder-candidate line belongs to. */
export const feederIdOf = (f: MapFeature): string =>
  (f.attributes?.['feeder_id'] as { value?: string } | undefined)?.value ?? (f.label ?? '').replace(/^Nearby line:\s*/i, '');

/**
 * A feature's name as a drawing writes it: what it is, nothing about how it was found.
 * How it was collected and why it could be off live in the record and open on selection.
 */
export function plainLabel(label: string | undefined): string {
  return (label ?? '')
    .replace(/,?\s*(INFERRED|DETECTED IN (PUBLIC )?LIDAR|CONCEPT LOCATION|CONCEPT)(,\s*NOT (FIELD VERIFIED|A DESIGN))?\s*$/i, '')
    .replace(/,?\s*NOT (FIELD VERIFIED|SURVEYED|A DESIGN)\s*$/i, '')
    .replace(/\s*\((mapped centerline, )?not surveyed\)/i, '')
    .replace(/\bLIKELY\s+/i, '')
    .replace(/,?\s*±\s*[\d,]+\s*FT/i, '')
    .trim();
}

/** The site data table, in the order a reviewer reads it. */
export function siteDataRows(record: RecordVersion): DataRow[] {
  const rows: DataRow[] = [
    { label: 'SITE ADDRESS', value: record.site.address.toUpperCase() },
    row(record, 'ASSESSOR PARCEL ID', 'parcel_id'),
    row(record, 'ZONING DISTRICT', 'zoning_district'),
    row(record, 'USE', 'use_description'),
    row(record, 'LOT AREA', 'lot_size_acres'),
    row(record, 'MAPPED BUILDING FOOTPRINT', 'building_footprint_sqft'),
    row(record, 'LOT COVERAGE (ROOFPRINTS)', 'roofprint_coverage_pct'),
    row(record, 'FLOOR AREA (ASSESSOR)', 'building_area_sqft'),
    row(record, 'STORIES / EST. HEIGHT', 'building_stories'),
    row(record, 'YEAR BUILT', 'year_built'),
    row(record, 'PAVED PARKING AND DRIVES', 'paved_area_sqft'),
    row(record, 'PARKING STALLS (IMAGERY)', 'parking_stall_count'),
    row(record, 'LAND COVER', 'land_cover'),
    row(record, 'GROUND ELEVATION', 'ground_elevation_ft'),
    row(record, 'AVG. SLOPE ACROSS PARCEL', 'site_slope_pct'),
    row(record, 'SERVING UTILITY', 'serving_utility'),
  ];

  const stories = rows.find((r) => r.label === 'STORIES / EST. HEIGHT')!;
  const height = printed(record, 'building_height_ft');
  if (height && stories.value !== NOT_FOUND) stories.value = `${stories.value} / ${height}`;

  const feeder = nearestFeeder(record);
  if (feeder) {
    const summary = feederSummary(record, feeder.id);
    rows.push({
      label: 'NEAREST MAPPED FEEDER',
      value: `${summary.line}${feeder.distance ? `, ${feeder.distance} FROM MAIN BLDG.` : ''}`,
      source: sourceOf(record, 'distance_to_nearest_line_ft'),
    });
    if (summary.capacity) rows.push({ label: 'FEEDER CAPACITY (UTILITY MAP)', value: summary.capacity });
  } else {
    rows.push({ label: 'NEAREST MAPPED FEEDER', value: 'NONE PUBLISHED NEAR THE SITE' });
  }

  const path = valueOf(record, 'grid_service_path');
  rows.push({
    label: 'ELECTRIC SERVICE',
    value: path?.current ? (formatReading(path.current) ?? '').replace(/^LIKELY /, '') : NOT_FOUND,
    source: sourceOf(record, 'grid_service_path'),
  });
  const transmission = nearest(record, 'utility_line', 'transmission_nearby');
  rows.push({
    label: 'NEAREST TRANSMISSION LINE',
    value: transmission
      ? [attributeText(transmission, 'line_voltage'), attributeText(transmission, 'line_owner'), `${attributeText(transmission, 'distance_ft') ?? '?'}`].filter(Boolean).join(', ')
      : 'NONE MAPPED NEARBY',
  });

  const substation = nearest(record, 'substation', 'substations_nearby') ?? nearest(record, 'substation');
  rows.push({
    label: 'NEAREST SUBSTATION',
    value: substation ? `${(substation.label ?? '').toUpperCase()}, ${attributeText(substation, 'distance_ft') ?? '?'}` : NOT_FOUND,
  });
  const fire = nearest(record, 'constraint', 'fire_stations_nearby');
  rows.push({
    label: 'NEAREST FIRE STATION',
    value: fire ? `${(fire.label ?? '').toUpperCase()}, ${attributeText(fire, 'distance_ft') ?? '?'}` : NOT_FOUND,
  });
  const wetland = nearest(record, 'constraint', 'wetlands_nearby');
  rows.push({
    label: 'NEAREST MAPPED WETLAND',
    value: wetland ? `${(attributeText(wetland, 'wetland_type') ?? wetland.label ?? 'WETLAND').toUpperCase()}, ${attributeText(wetland, 'distance_ft') ?? '?'}` : 'NONE MAPPED NEARBY',
  });
  rows.push({ label: 'FLOOD ZONE', value: 'SEE FEMA FIRM' });
  rows.push({ label: 'BESS CONFIGURATION', value: 'BY ENGINEER' });
  return rows;
}

/** The slope's fall direction, which the source states in its observation's reason. */
export function fallDirection(record: RecordVersion): number | null {
  const value = valueOf(record, 'site_slope_pct');
  for (const o of observationsOf(record, value).reverse()) {
    const m = /falls toward (\d+(?:\.\d+)?) degrees/i.exec(o.reason ?? '');
    if (m) return Number(m[1]);
  }
  return null;
}

export function sheetNotes(record: RecordVersion): string[] {
  const utility = printed(record, 'serving_utility');
  const imagery = record.baseMap ? `${record.baseMap.attribution.toUpperCase()}${record.baseMap.sourceDate ? ` (${record.baseMap.sourceDate})` : ''}` : 'NONE';
  return [
    'DIMENSIONS SHOWN ARE BASED ON AERIAL IMAGERY AND PUBLICLY AVAILABLE PROPERTY BOUNDARY DATA ONLY. FOR REFERENCE ONLY. NOT SURVEYED.',
    `EXISTING ELECTRIC LINES PER ${utility ?? 'THE UTILITY'} SYSTEM DATA. CALL 811 BEFORE ANY EXCAVATION.`,
    `AERIAL UNDERLAY: ${imagery}.`,
    `SOURCE AND BASIS OF EACH ITEM: RECORD ${record.id.toUpperCase()}.`,
  ];
}

/** Standard engineering scales, in feet per inch. */
export const ENGINEERING_SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000];

export function chooseScale(widthFt: number, heightFt: number, viewWidthIn: number, viewHeightIn: number): number {
  const need = Math.max(widthFt / viewWidthIn, heightFt / viewHeightIn);
  return ENGINEERING_SCALES.find((s) => s >= need) ?? ENGINEERING_SCALES.at(-1)!;
}

/** "1,571 ft (fitted)" as a drawing writes it: 1,571' ±. */
export function dimensionText(label: string): string {
  const m = /([\d,.]+)\s*ft/i.exec(label);
  return m ? `${m[1]}'` : label.toUpperCase();
}

/** The street name from a road feature's label. */
export function roadName(feature: MapFeature): string {
  return (feature.label ?? '').split(/,|\(/)[0]!.trim().toUpperCase();
}

/**
 * One short drafting-style callout per drawn feature, keyed by feature id, so the map
 * labels what the sheet labels. Features with nothing to say are left out.
 */
export function featureLabels(record: RecordVersion): Record<string, string> {
  const labels: Record<string, string> = {};
  const stories = printed(record, 'building_stories');
  const lot = printed(record, 'lot_size_acres');
  const buildings = record.features.filter((f) => f.kind === 'building_outline');
  for (const f of record.features) {
    switch (f.kind) {
      case 'property_line':
        labels[f.id] = `(E) PROPERTY LINE${lot ? `, ${lot}` : ''}`;
        break;
      case 'building_outline':
        labels[f.id] = `(E) BUILDING${buildings.length > 1 ? ` ${buildings.indexOf(f) + 1}` : ''}${buildings.indexOf(f) === 0 && stories ? `, ${stories}` : ''}`;
        break;
      case 'utility_line': {
        const cls = lineClassOf(f);
        if (cls === 'feeder') {
          const id = feederIdOf(f);
          const s = feederSummary(record, id);
          const hosting = feederDetails(record).get(id)?.get('feeder_hosting_capacity');
          labels[f.id] = `(E) FEEDER ${s.line}${hosting ? `, ${formatReading(hosting)} HC` : ''}`;
        } else if (cls === 'transmission') {
          labels[f.id] = `(E) ${attributeText(f, 'line_voltage') ?? ''} TRANSMISSION`.replace('  ', ' ');
        } else if (cls === 'service') {
          labels[f.id] = attributeText(f, 'line_class') === 'DETECTED SERVICE DROP' ? '(E) OVERHEAD SERVICE DROP' : '(E) ELECTRIC SERVICE';
        } else if (cls === 'detected') {
          labels[f.id] = '(E) OVERHEAD LINE';
        } else if (attributeText(f, 'basis') === 'CONCEPT') {
          labels[f.id] = '(N) TRENCH ROUTE';
        }
        break;
      }
      case 'road':
        labels[f.id] = roadName(f);
        break;
      case 'constraint':
        if (f.field === 'wetlands_nearby') labels[f.id] = `(E) WETLAND: ${attributeText(f, 'wetland_type') ?? 'MAPPED'}`;
        break;
      case 'candidate_area':
        {
          const kind = (f.attributes?.['zone_kind'] as { value?: unknown } | undefined)?.value;
          labels[f.id] =
            kind === 'feasible_bess_preferred'
              ? '(N) BESS ZONE'
              : kind === 'feasible_bess'
                ? '(N) BESS ZONE, LONGER RUN'
                : kind === 'feasible_bess_remote'
                  ? '(N) BESS ZONE, OVER 100 FT FROM EXPOSURES'
                  : 'OPEN GROUND';
        }
        break;
      default:
        break;
    }
  }
  return labels;
}

const equipmentTypeOf = (f: MapFeature) => String((f.attributes?.['equipment_type'] as { value?: unknown } | undefined)?.value ?? '');

/**
 * The equipment both the map and the site plan draw, so they always show the same items.
 * Lidar finds many boxes beside a building, most of them HVAC units, so only the one nearest
 * the service entrance is kept, named for what can be said of it: an equipment box.
 */
export function drawnEquipment(features: MapFeature[]): MapFeature[] {
  const entrance = features.find((f) => equipmentTypeOf(f) === 'service_entrance' && f.geometry.type === 'Point');
  const boxes = features.filter((f) => equipmentTypeOf(f) === 'pad_mount_transformer_candidate' && f.geometry.type === 'Point');
  let keep: MapFeature | null = null;
  if (entrance && boxes.length) {
    const [ex, ey] = entrance.geometry.coordinates as [number, number];
    const dist = (f: MapFeature) => {
      const [x, y] = f.geometry.coordinates as [number, number];
      return Math.hypot((x - ex) * 82_000, (y - ey) * 111_320);
    };
    const best = [...boxes].sort((a, b) => dist(a) - dist(b))[0]!;
    if (dist(best) <= 40) keep = best;
  }
  return features.filter((f) => equipmentTypeOf(f) !== 'pad_mount_transformer_candidate' || f === keep);
}

/**
 * The part of the site the electrical work happens in: the main building, the equipment and
 * service near it, the concept battery layout, and the feasible deployment zone when there is
 * one. Both the map and the site plan frame this rather than the whole parcel.
 * Returns [west, south, east, north] in lon/lat, padded, or null without a building.
 */
export function workArea(features: MapFeature[], padM = 12): [number, number, number, number] | null {
  const ringArea = (ring: number[][]) => Math.abs(ring.reduce((s, p, i) => s + p[0]! * ring[(i + 1) % ring.length]![1]! - ring[(i + 1) % ring.length]![0]! * p[1]!, 0)) / 2;
  const outer = (f: MapFeature): number[][] => (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0]! : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0]![0]! : []) as number[][];
  const main = features.filter((f) => f.kind === 'building_outline').sort((a, b) => ringArea(outer(b)) - ringArea(outer(a)))[0];
  if (!main) return null;
  const pts: number[][] = [...outer(main)];
  const cx = pts.reduce((sum, p) => sum + p[0]! / pts.length, 0);
  const cy = pts.reduce((sum, p) => sum + p[1]! / pts.length, 0);
  const near = (p: number[]) => Math.hypot((p[0]! - cx) * 82_000, (p[1]! - cy) * 111_320) <= 160;
  const coords = (f: MapFeature): number[][] =>
    f.geometry.type === 'Point'
      ? [f.geometry.coordinates as number[]]
      : f.geometry.type === 'LineString'
        ? (f.geometry.coordinates as number[][])
        : f.geometry.type === 'MultiLineString'
          ? (f.geometry.coordinates as number[][][]).flat()
          : outer(f);
  const hasPreferred = features.some((f) => (f.attributes?.['zone_kind'] as { value?: unknown } | undefined)?.value === 'feasible_bess_preferred');
  // The frame is the building and the preferred zone, where the pad should go; the wider areas are shown but
  // don't widen it.
  for (const f of drawnEquipment(features)) {
    const kind = f.kind === 'candidate_area' ? (f.attributes?.['zone_kind'] as { value?: unknown } | undefined)?.value : null;
    if (kind === 'feasible_bess_preferred' || (kind === 'feasible_bess' && !hasPreferred)) pts.push(...coords(f).filter(near));
  }
  // Equipment widens it only beside that area, so poles and lines down the street don't pull the frame out.
  const reach = 20 / 111_320;
  const [x0, x1] = [Math.min(...pts.map((p) => p[0]!)) - reach * 1.4, Math.max(...pts.map((p) => p[0]!)) + reach * 1.4];
  const [y0, y1] = [Math.min(...pts.map((p) => p[1]!)) - reach, Math.max(...pts.map((p) => p[1]!)) + reach];
  for (const f of drawnEquipment(features)) {
    const electrical = f.kind === 'existing_equipment' || /service|drop|trench|conductor/i.test(String((f.attributes?.['line_class'] as { value?: unknown } | undefined)?.value ?? ''));
    if (electrical) pts.push(...coords(f).filter((p) => p[0]! >= x0 && p[0]! <= x1 && p[1]! >= y0 && p[1]! <= y1));
  }
  const xs = pts.map((p) => p[0]!);
  const ys = pts.map((p) => p[1]!);
  const dx = padM / (111_320 * Math.cos((cy * Math.PI) / 180));
  const dy = padM / 111_320;
  return [Math.min(...xs) - dx, Math.min(...ys) - dy, Math.max(...xs) + dx, Math.max(...ys) + dy];
}
