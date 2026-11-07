// Per-sheet readiness and value-of-information gap ranking.
//
// This is where "we found 69 fields" becomes something an engineer can act on:
//
//    Site plan: ready
//    Single-line: BLOCKED on switchgear bus rating
//      -> at 1600 A the array needs a supply-side tap; at 2000 A it ties in load-side
//      -> cheapest way to settle it: a nameplate photo, 5 minutes of staff time
//
// A gap only matters if it changes a decision. We establish that by actually rerunning
// the Setback compile at both ends of the gap and comparing outcomes — not by scoring
// "completeness", which would rank a missing owner name alongside a missing bus rating.

import { ALL_SHEETS, specFor, type SheetId } from "@eqore/catalog";
import { compile } from './compile';
import { exportToSetback, plausibleRange } from './export';
import type { SiteRecord } from './reconcile';
import { requiredFor } from './reconcile';
import { EQORE_EDGE760 } from './rules';
import type { CompileResult, PackSpec, Site } from './types';
import { withValue } from './uncertainty';

/** Record field key -> dotted path in the Setback Site model. */
const SETBACK_PATH: Record<string, string> = {
  'lot.width_ft': 'lot.w',
  'lot.depth_ft': 'lot.h',
  'building.offset_x_ft': 'building.x',
  'building.offset_y_ft': 'building.y',
  'building.width_ft': 'building.w',
  'building.depth_ft': 'building.h',
  'pad_zone.x_ft': 'padZone.x',
  'pad_zone.y_ft': 'padZone.y',
  'pad_zone.width_ft': 'padZone.w',
  'pad_zone.depth_ft': 'padZone.h',
  'electrical.service_voltage_v': 'service.voltage',
  'electrical.main_breaker_a': 'service.mainBreakerA',
  'electrical.bus_rating_a': 'service.busRatingA',
  'load.peak_kw': 'peakKW',
};

export interface Consequence {
  at: number;
  status: CompileResult['status'];
  /** What this value would mean in plain words, e.g. "supply-side tap". */
  outcome: string;
  newlyBad: string[];
}

export interface Gap {
  fieldKey: string;
  label: string;
  /** 'missing' — no source at all. 'uncertain' — we have a value but a range that spans. */
  kind: 'missing' | 'uncertain' | 'conflict';
  /** Does some plausible value change what we would build or whether it passes review? */
  blocksDecision: boolean;
  consequences: Consequence[];
  sheetsBlocked: SheetId[];
  /** Cheapest route to settle it, straight from the catalog. */
  resolver: { kind: string; tier: number; description: string } | null;
  /** Why this sits where it does in the list. */
  score: number;
  basis?: string;
}

export interface SheetReadiness {
  sheet: SheetId;
  ready: boolean;
  requiredCount: number;
  presentCount: number;
  /** Fields that keep this sheet from being drawable, worst first. */
  blockedBy: string[];
}

export interface ReadinessReport {
  sheets: SheetReadiness[];
  gaps: Gap[];
  site: Site;
  result: CompileResult;
  /** One line, suitable for the top of a screen. */
  headline: string;
}

const outcomeOf = (r: CompileResult) =>
  r.electrical.method === 'supply-side'
    ? 'supply-side tap (utility approval, longer lead time)'
    : 'load-side tap into existing gear';

const key = (r: CompileResult) =>
  `${r.status}|${r.electrical.method}|${r.checks
    .filter((c) => c.severity === 'fail' || c.severity === 'warn')
    .map((c) => c.ruleId)
    .sort()
    .join(',')}`;

const RESOLVER_WORDS: Record<string, string> = {
  staff_photo_charuco: 'nameplate photo with the scale card, on closed gear (~5 min)',
  staff_photo: 'phone photo of the equipment label (~2 min)',
  staff_laser: 'laser measurement with a photo of the dot (~2 min)',
  staff_lidar: 'phone LiDAR scan of the room (~6 min)',
  survey: 'ask the owner for the recorded plot plan (no staff time)',
  old_plan_set: 'ask the owner for the existing drawings (no staff time)',
  bill: 'ask for a recent bill (no staff time)',
  green_button: 'ask for an interval-data export (no staff time)',
  intake_form: 'ask the facility contact (no staff time)',
  site_visit: 'a qualified person on site — the last resort',
};

export function analyse(record: SiteRecord, spec: PackSpec = EQORE_EDGE760, packs = 1): ReadinessReport {
  const { site } = exportToSetback(record, { name: record.siteId, packs });
  const base = compile(site, spec);
  const baseKey = key(base);
  const baseBad = new Set(
    base.checks.filter((c) => c.severity === 'fail' || c.severity === 'warn').map((c) => c.title),
  );

  // --- which gaps actually change the answer
  const gaps: Gap[] = [];
  const candidates = new Set<string>([
    ...record.missing.filter((k) => SETBACK_PATH[k]),
    ...[...record.fields.values()].filter((f) => f.range || f.status === 'conflict').map((f) => f.key),
  ]);

  for (const fieldKey of candidates) {
    const path = SETBACK_PATH[fieldKey];
    const fspec = specFor(fieldKey);
    if (!fspec) continue;

    const field = record.fields.get(fieldKey);
    const kind: Gap['kind'] = !field ? 'missing' : field.status === 'conflict' ? 'conflict' : 'uncertain';

    let range = field?.range;
    let basis: string | undefined;
    if (!field) {
      const p = plausibleRange(record, fieldKey);
      range = p?.range;
      basis = p?.basis;
    }

    const consequences: Consequence[] = [];
    if (path && range && range[0] !== range[1]) {
      for (const at of [range[0], range[1]]) {
        const probe = compile(withValue(site, path, at), spec);
        if (key(probe) !== baseKey) {
          consequences.push({
            at,
            status: probe.status,
            outcome: outcomeOf(probe),
            newlyBad: probe.checks
              .filter((c) => (c.severity === 'fail' || c.severity === 'warn') && !baseBad.has(c.title))
              .map((c) => c.title),
          });
        }
      }
    }

    const blocksDecision = consequences.length > 0;
    if (field) field.blocksDecision = blocksDecision;

    const sheetsBlocked = blocksDecision || kind !== 'uncertain' ? fspec.neededBy : [];
    const resolver = fspec.fallback
      ? {
          kind: fspec.fallback.kind,
          tier: fspec.fallback.tier,
          description: RESOLVER_WORDS[fspec.fallback.kind] ?? fspec.fallback.kind,
        }
      : null;

    gaps.push({
      fieldKey,
      label: fspec.label,
      kind,
      blocksDecision,
      consequences,
      sheetsBlocked,
      resolver,
      basis,
      // Decision-flipping first; then conflicts, which an engineer must adjudicate;
      // then by how many sheets the gap holds up. Cheapness breaks ties, so of two
      // equally important gaps we chase the one that costs least to settle.
      score:
        (blocksDecision ? 1000 : 0) +
        (kind === 'conflict' ? 200 : 0) +
        (kind === 'missing' ? 100 : 0) +
        sheetsBlocked.length * 10 -
        (resolver?.tier ?? 3),
    });
  }

  gaps.sort((a, b) => b.score - a.score);

  // --- per-sheet readiness
  const blocking = new Set(gaps.filter((g) => g.blocksDecision || g.kind !== 'uncertain').map((g) => g.fieldKey));
  const sheets: SheetReadiness[] = ALL_SHEETS.map((sheet) => {
    const required = requiredFor(sheet).filter((k) => !k.includes('[]'));
    const present = required.filter((k) => record.fields.has(k));
    const blockedBy = required.filter((k) => blocking.has(k) || !record.fields.has(k));
    return {
      sheet,
      ready: blockedBy.length === 0,
      requiredCount: required.length,
      presentCount: present.length,
      blockedBy,
    };
  });

  const topGap = gaps.find((g) => g.blocksDecision);
  const readyCount = sheets.filter((s) => s.ready).length;
  const headline = topGap
    ? `${readyCount}/${sheets.length} sheets ready · blocked on ${topGap.label}, which decides ${
        topGap.consequences[0]?.outcome ?? 'the design'
      }`
    : `${readyCount}/${sheets.length} sheets ready · nothing decision-critical outstanding`;

  return { sheets, gaps, site, result: base, headline };
}
