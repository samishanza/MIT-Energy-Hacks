// Run the design-rule check against a contract record.
//
// Readiness today answers "does this field have evidence", measured against the utility's
// form rows. That is useful and it is not the same question as "can we build it". The
// brief's own test is that the record is judged by whether the next stage can use it, not
// by how complete it looks — so this takes the record as it stands, lays a standard
// configuration on it, and reports what the answer depends on.
//
// Where a value is absent it substitutes an openly labelled placeholder with the widest
// defensible band, then reruns the compile at both ends of that band. A gap earns its
// place in the ranking by changing the answer, not by being empty.

import type { RecordVersion } from '@eqore/contract';
import { boundingRect, largestInscribedRect, toLocalPolygon, frameFor, type LocalPolygon } from '@eqore/geom';
import { STANDARD_BUS_RATINGS_A } from '@eqore/catalog';
import { compile } from './compile.ts';
import { EQORE_EDGE760 } from './rules.ts';
import type { CompileResult, PackSpec, Param, Site, Source } from './types.ts';
import { withValue } from './uncertainty.ts';

const DERIVED: Source = { kind: 'aerial', label: 'Derived from the site record', extractedBy: 'parser' };
const ASSUMED = (what: string): Source => ({ kind: 'assumed', label: `PLACEHOLDER — no value for ${what}`, extractedBy: 'default' });

function num(record: RecordVersion, field: string): number | null {
  const v = record.values.find((x) => x.field === field);
  return v?.current?.type === 'quantity' ? v.current.value : null;
}

function text(record: RecordVersion, field: string, fallback: string): string {
  const v = record.values.find((x) => x.field === field);
  return v?.current?.type === 'text' ? v.current.value : fallback;
}

export interface RecordGap {
  field: string;
  label: string;
  /** The band used in place of a value. */
  band: [number, number];
  /** Why that band and not another. */
  basis: string;
  /** What each end of the band would mean, when they differ. */
  outcomes: { at: number; method: CompileResult['electrical']['method']; status: CompileResult['status'] }[];
  blocksDecision: boolean;
}

export interface RecordAssessment {
  site: Site;
  result: CompileResult;
  gaps: RecordGap[];
  /** The gap worth chasing first, or null when nothing outstanding changes the answer. */
  topGap: RecordGap | null;
  /** True when the pad came from a candidate area the record carries. */
  padFromRecord: boolean;
}

/** What a missing bus rating could plausibly be, given the main it carries. */
function busBand(main: number | null): { band: [number, number]; basis: string } {
  if (!main) {
    return {
      band: [STANDARD_BUS_RATINGS_A[0]!, STANDARD_BUS_RATINGS_A[STANDARD_BUS_RATINGS_A.length - 1]!],
      basis: 'No main breaker rating either, so the band is every size switchgear ships in.',
    };
  }
  const atLeast = STANDARD_BUS_RATINGS_A.filter((r) => r >= main);
  const lo = atLeast[0] ?? main;
  const hi = atLeast[1] ?? lo;
  return {
    band: [lo, hi],
    basis:
      `The bus cannot be smaller than the ${main} A main it carries, and gear is rarely specified ` +
      `more than one standard size above its main — so it is ${lo} A or ${hi} A.`,
  };
}

function padRectFrom(record: RecordVersion): { rect: { x: number; y: number; w: number; h: number }; fromRecord: boolean } {
  const area = record.features.find((f) => f.kind === 'candidate_area');
  const lot = record.features.find((f) => f.kind === 'property_line');

  if (area && (area.geometry.type === 'Polygon' || area.geometry.type === 'MultiPolygon') && lot) {
    const ring = lot.geometry.type === 'Polygon' ? lot.geometry.coordinates.flat() : [];
    const frame = frameFor(ring.length ? ring : [[0, 0]]);
    const poly: LocalPolygon | undefined = toLocalPolygon(area.geometry, frame)[0];
    if (poly) return { rect: largestInscribedRect(poly, 5), fromRecord: true };
  }
  // No candidate area: fall back to a strip inside the lot, clearly a placeholder.
  return { rect: { x: 20, y: 20, w: 40, h: 120 }, fromRecord: false };
}

const P = (value: number, unit: string, source: Source, range?: [number, number]): Param => ({ value, unit, source, range });

/**
 * Build a Setback site from the record and compile it.
 *
 * Everything substituted is labelled `assumed` in its own provenance, so a reader of the
 * resulting sheets can see which dimensions came from the record and which are standing
 * in for a gap.
 */
export function assessRecord(record: RecordVersion, spec: PackSpec = EQORE_EDGE760, packs = 1): RecordAssessment {
  const lotW = num(record, 'lot_width_ft');
  const lotH = num(record, 'lot_depth_ft');
  const bx = num(record, 'building_x_ft');
  const by = num(record, 'building_y_ft');
  const bw = num(record, 'building_width_ft');
  const bh = num(record, 'building_depth_ft');
  const volts = num(record, 'service_voltage');
  const main = num(record, 'main_device_rating');
  const bus = num(record, 'bus_rating');
  const peak = num(record, 'peak_demand_kw');

  const { rect: pad, fromRecord: padFromRecord } = padRectFrom(record);
  const { band: bandBus, basis: basisBus } = busBand(main);

  const site: Site = {
    id: record.site.id,
    name: record.site.address,
    city: record.site.region,
    state: 'MA',
    utility: text(record, 'serving_utility', 'Unknown utility'),
    tariff: text(record, 'rate_schedule', '—'),
    ahjOverlays: [],
    ahjName: text(record, 'ahj_building', 'Unknown AHJ'),
    lot: {
      w: lotW ? P(lotW, 'ft', DERIVED) : P(200, 'ft', ASSUMED('lot width'), [100, 600]),
      h: lotH ? P(lotH, 'ft', DERIVED) : P(200, 'ft', ASSUMED('lot depth'), [100, 600]),
    },
    roadSide: (text(record, 'road_side', 'south') as Site['roadSide']),
    building: {
      x: P(bx ?? 20, 'ft', bx ? DERIVED : ASSUMED('building offset')),
      y: P(by ?? 20, 'ft', by ? DERIVED : ASSUMED('building offset')),
      w: P(bw ?? 100, 'ft', bw ? DERIVED : ASSUMED('building width')),
      h: P(bh ?? 80, 'ft', bh ? DERIVED : ASSUMED('building depth')),
    },
    openings: [],
    padZone: {
      x: P(pad.x, 'ft', padFromRecord ? DERIVED : ASSUMED('pad zone')),
      y: P(pad.y, 'ft', padFromRecord ? DERIVED : ASSUMED('pad zone')),
      w: P(pad.w, 'ft', padFromRecord ? DERIVED : ASSUMED('pad zone')),
      h: P(pad.h, 'ft', padFromRecord ? DERIVED : ASSUMED('pad zone')),
    },
    service: {
      voltage: P(volts ?? 480, 'V', volts ? DERIVED : ASSUMED('service voltage')),
      mainBreakerA: P(main ?? 1600, 'A', main ? DERIVED : ASSUMED('main breaker')),
      busRatingA: bus ? P(bus, 'A', DERIVED) : P(bandBus[0], 'A', ASSUMED('switchgear bus rating'), bandBus),
    },
    peakKW: P(peak ?? 400, 'kW', peak ? DERIVED : ASSUMED('peak demand')),
    packs,
    synthetic: record.synthetic,
  };

  const base = compile(site, spec);
  const gaps: RecordGap[] = [];

  // Only the bus rating gets the full treatment for now: it is the one whose band
  // routinely changes the interconnection method, which is the costliest thing to get
  // wrong. The machinery generalises to any banded value.
  if (!bus) {
    const outcomes = bandBus.map((at) => {
      const probe = compile(withValue(site, 'service.busRatingA', at), spec);
      return { at, method: probe.electrical.method, status: probe.status };
    });
    const flips = new Set(outcomes.map((o) => o.method)).size > 1 || new Set(outcomes.map((o) => o.status)).size > 1;
    gaps.push({
      field: 'bus_rating',
      label: 'Switchgear bus rating',
      band: bandBus,
      basis: basisBus,
      outcomes,
      blocksDecision: flips,
    });
  }

  gaps.sort((a, b) => Number(b.blocksDecision) - Number(a.blocksDecision));

  return { site, result: base, gaps, topGap: gaps.find((g) => g.blocksDecision) ?? null, padFromRecord };
}

/** The top gap, shaped for the sheet's stamp. */
export function blockingFactOf(assessment: RecordAssessment) {
  const gap = assessment.topGap;
  if (!gap) return null;
  return {
    label: gap.label,
    outcomes: gap.outcomes.map(
      (o) => `At ${o.at} A: ${o.method === 'supply-side' ? 'supply-side tap' : 'load-side tap'}`,
    ),
    resolver: 'a nameplate photo on closed gear, about five minutes of staff time',
  };
}

export { boundingRect };
