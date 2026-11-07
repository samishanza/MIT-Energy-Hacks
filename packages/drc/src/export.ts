// Record -> Setback Site. This is the handoff: Option 1's output is Option 2's input.
//
// Provenance survives the crossing. Every Param that lands in the Setback model carries
// the source it came from, so a dimension on a drawn sheet can still be traced back to
// the crop it was read from.
//
// Where the record has no value, we do NOT invent one quietly. We substitute an openly
// labelled placeholder with the widest defensible range and record the gap, so the
// uncertainty machinery can tell us whether that gap actually changes the design.

import { STANDARD_BUS_RATINGS_A, specFor } from "@eqore/catalog";
import type { Field, SourceKind as RecordSourceKind } from "@eqore/catalog";
import type { SiteRecord } from './reconcile';
import type { Opening, Param, Side, Site, Source, SourceKind as SetbackSourceKind } from './types';

/** Our source vocabulary is finer than Setback's; collapse it without losing the label. */
const SOURCE_MAP: Record<RecordSourceKind, SetbackSourceKind> = {
  engineer: 'survey',
  site_visit: 'survey',
  staff_laser: 'survey',
  staff_lidar: 'survey',
  staff_photo_charuco: 'nameplate',
  staff_photo: 'site-photo',
  meter_reader: 'interval-data',
  survey: 'survey',
  old_plan_set: 'nameplate',
  permit_record: 'nameplate',
  green_button: 'interval-data',
  bill: 'bill',
  intake_form: 'bill',
  assessor: 'aerial',
  parcel: 'aerial',
  code_table: 'assumed',
  tariff_db: 'bill',
  hosting_map: 'assumed',
  flood_map: 'aerial',
  lidar_3dep: 'aerial',
  hydrant_gis: 'aerial',
  street_level: 'site-photo',
  aerial: 'aerial',
};

export interface PlaceholderGap {
  fieldKey: string;
  label: string;
  /** Why we could still draw something: the band we assumed, and on what grounds. */
  assumedRange: [number, number];
  basis: string;
}

export interface ExportResult {
  site: Site;
  gaps: PlaceholderGap[];
}

function toSource(f: Field): Source {
  const best = f.evidence[0];
  if (!best) return { kind: 'assumed', label: 'No source — placeholder', extractedBy: 'default' };
  return {
    kind: SOURCE_MAP[best.sourceKind] ?? 'assumed',
    label: best.label,
    asset: best.ref,
    crop: best.crop,
    extractedBy:
      best.extractedBy === 'agent' ? 'vision-model' : best.extractedBy === 'parser' ? 'parser' : best.extractedBy === 'human' ? 'human' : 'default',
  };
}

function num(record: SiteRecord, key: string): Field | undefined {
  const f = record.fields.get(key);
  return f && typeof f.value === 'number' ? f : undefined;
}

/**
 * What a missing number could plausibly be. Stated openly rather than guessed, because
 * the whole point is to find out whether the gap matters before anyone chases it.
 */
export function plausibleRange(record: SiteRecord, key: string): { range: [number, number]; basis: string } | null {
  const spec = specFor(key);
  if (!spec || spec.bounds.kind !== 'number') return null;

  if (key === 'electrical.bus_rating_a') {
    const main = num(record, 'electrical.main_breaker_a')?.value as number | undefined;
    if (main) {
      const atLeast = STANDARD_BUS_RATINGS_A.filter((r) => r >= main);
      const lo = atLeast[0] ?? main;
      const hi = atLeast[1] ?? lo;
      return {
        range: [lo, hi],
        basis:
          `The bus cannot be smaller than the ${main} A main it carries, and gear is rarely specified ` +
          `more than one standard size above its main. So it is ${lo} A or ${hi} A — and those two ` +
          `answers do not lead to the same design.`,
      };
    }
  }

  // Default: the catalog's physical bounds. Wide, honest, and usually decision-flipping,
  // which is exactly the signal we want.
  return {
    range: [spec.bounds.min, spec.bounds.max],
    basis: 'No source for this field; using the full physically plausible range from the catalog.',
  };
}

function param(record: SiteRecord, key: string, fallback: number, gaps: PlaceholderGap[]): Param {
  const f = record.fields.get(key);
  const spec = specFor(key);
  if (f && typeof f.value === 'number') {
    return {
      value: f.value,
      unit: f.unit ?? spec?.unit ?? '',
      source: toSource(f),
      range: f.range,
      howToResolve: spec?.fallback ? `Resolve via ${spec.fallback.kind} (tier ${spec.fallback.tier})` : undefined,
    };
  }
  const p = plausibleRange(record, key);
  const range = p?.range ?? [fallback, fallback];
  gaps.push({
    fieldKey: key,
    label: spec?.label ?? key,
    assumedRange: range,
    basis: p?.basis ?? 'No source and no catalog bounds.',
  });
  return {
    value: range[0],
    unit: spec?.unit ?? '',
    source: { kind: 'assumed', label: `PLACEHOLDER — no source for ${spec?.label ?? key}`, extractedBy: 'default' },
    range,
    howToResolve: spec?.fallback ? `Resolve via ${spec.fallback.kind} (tier ${spec.fallback.tier})` : undefined,
  };
}

function str(record: SiteRecord, key: string, fallback: string): string {
  const f = record.fields.get(key);
  return typeof f?.value === 'string' ? f.value : fallback;
}

/** Openings are indexed in the record (`openings.0.at_ft`); collect them back into a list. */
function openings(record: SiteRecord): Opening[] {
  const indices = new Set<number>();
  for (const key of record.fields.keys()) {
    const m = /^openings\.(\d+)\./.exec(key);
    if (m) indices.add(Number(m[1]));
  }
  const out: Opening[] = [];
  for (const i of [...indices].sort((a, b) => a - b)) {
    const at = record.fields.get(`openings.${i}.at_ft`);
    const wall = record.fields.get(`openings.${i}.wall`);
    const kind = record.fields.get(`openings.${i}.kind`);
    const width = record.fields.get(`openings.${i}.width_ft`);
    if (!at || typeof at.value !== 'number') continue;
    out.push({
      id: `opening-${i}`,
      kind: (typeof kind?.value === 'string' ? kind.value : 'door') as Opening['kind'],
      wall: (typeof wall?.value === 'string' ? wall.value : 'east') as Side,
      at: { value: at.value, unit: 'ft', source: toSource(at), range: at.range },
      width: typeof width?.value === 'number' ? width.value : 3,
    });
  }
  return out;
}

export function exportToSetback(record: SiteRecord, opts: { name: string; packs?: number } = { name: 'Site' }): ExportResult {
  const gaps: PlaceholderGap[] = [];
  const P = (key: string, fallback: number) => param(record, key, fallback, gaps);

  const site: Site = {
    id: record.siteId,
    name: opts.name,
    city: str(record, 'site.address', '').split(',')[1]?.trim() || 'Unknown',
    state: 'MA',
    utility: str(record, 'utility.name', 'Unknown utility'),
    tariff: str(record, 'utility.rate_schedule', '—'),
    ahjOverlays: [],
    ahjName: str(record, 'ahj.building', 'Unknown AHJ'),
    lot: { w: P('lot.width_ft', 200), h: P('lot.depth_ft', 200) },
    roadSide: (str(record, 'site.road_side', 'south') as Side),
    building: {
      x: P('building.offset_x_ft', 20),
      y: P('building.offset_y_ft', 20),
      w: P('building.width_ft', 100),
      h: P('building.depth_ft', 80),
    },
    openings: openings(record),
    padZone: {
      x: P('pad_zone.x_ft', 150),
      y: P('pad_zone.y_ft', 30),
      w: P('pad_zone.width_ft', 20),
      h: P('pad_zone.depth_ft', 100),
    },
    service: {
      voltage: P('electrical.service_voltage_v', 480),
      mainBreakerA: P('electrical.main_breaker_a', 1600),
      busRatingA: P('electrical.bus_rating_a', 1600),
    },
    peakKW: P('load.peak_kw', 400),
    packs: opts.packs ?? 1,
    // The record is only as synthetic as its sources. If anything real went in, say so.
    synthetic: [...record.fields.values()].every((f) => f.evidence.every((e) => e.synthetic)),
  };

  return { site, gaps };
}
