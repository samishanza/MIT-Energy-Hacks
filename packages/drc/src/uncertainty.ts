import { compile } from './compile';
import type { CompileResult, PackSpec, Param, Site } from './types';

export interface ParamRef {
  path: string; // e.g. "lot.w" or "openings.0.at"
  label: string;
  param: Param;
}

/** Walk the site and list every Param, with a readable label. */
export function listParams(site: Site): ParamRef[] {
  const out: ParamRef[] = [];
  const add = (path: string, label: string, p: Param) => out.push({ path, label, param: p });
  add('lot.w', 'Lot width (E–W)', site.lot.w);
  add('lot.h', 'Lot depth (N–S)', site.lot.h);
  add('building.x', 'Building west wall offset', site.building.x);
  add('building.y', 'Building north wall offset', site.building.y);
  add('building.w', 'Building width', site.building.w);
  add('building.h', 'Building depth', site.building.h);
  add('padZone.x', 'Pad zone west edge', site.padZone.x);
  add('padZone.y', 'Pad zone north edge', site.padZone.y);
  add('padZone.w', 'Pad zone width', site.padZone.w);
  add('padZone.h', 'Pad zone depth', site.padZone.h);
  site.openings.forEach((o, i) => add(`openings.${i}.at`, `${cap(o.kind)} on ${o.wall} wall: position`, o.at));
  add('service.voltage', 'Service voltage', site.service.voltage);
  add('service.mainBreakerA', 'Main breaker rating', site.service.mainBreakerA);
  add('service.busRatingA', 'Switchgear bus rating', site.service.busRatingA);
  add('peakKW', 'Peak demand (15-min)', site.peakKW);
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function withValue(site: Site, path: string, value: number): Site {
  const copy: Site = structuredClone(site);
  const keys = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = copy;
  for (const k of keys) node = node[k];
  (node as Param).value = value;
  return copy;
}

function outcomeKey(r: CompileResult) {
  const bad = r.checks.filter((c) => c.severity === 'fail' || c.severity === 'warn').map((c) => `${c.ruleId}:${c.severity}`);
  return `${r.status}|${bad.sort().join(',')}`;
}

export interface Ranked {
  ref: ParamRef;
  flips: boolean;
  /** which end of the range changes the outcome, and what happens there */
  consequences: { at: number; status: string; newlyBad: string[] }[];
  conflict: boolean;
  score: number;
}

/**
 * Value of information, decision-style: an unknown is worth measuring only if some
 * plausible value of it changes what we would build or whether it passes review.
 */
export function rankUnknowns(site: Site, spec: PackSpec, overlays: string[] = []): Ranked[] {
  const base = compile(site, spec, overlays);
  const baseKey = outcomeKey(base);
  const baseBad = new Set(base.checks.filter((c) => c.severity === 'fail' || c.severity === 'warn').map((c) => c.title));
  const ranked: Ranked[] = [];
  for (const ref of listParams(site)) {
    const p = ref.param;
    const conflict = !!p.alternates?.some((a) => Math.abs(a.value - p.value) > 1e-6);
    const ends = new Set<number>(p.range ? [p.range[0], p.range[1]] : []);
    p.alternates?.forEach((a) => ends.add(a.value));
    ends.delete(p.value);
    const consequences: Ranked['consequences'] = [];
    for (const val of ends) {
      const r = compile(withValue(site, ref.path, val), spec, overlays);
      if (outcomeKey(r) !== baseKey) {
        const newlyBad = r.checks
          .filter((c) => (c.severity === 'fail' || c.severity === 'warn') && !baseBad.has(c.title))
          .map((c) => c.title);
        const cleared = [...baseBad].filter((t) => !r.checks.some((c) => c.title === t && (c.severity === 'fail' || c.severity === 'warn')));
        consequences.push({
          at: val,
          status: r.status,
          newlyBad: newlyBad.length ? newlyBad : cleared.map((t) => `clears: ${t}`),
        });
      }
    }
    if (!p.range && !conflict) continue;
    const flips = consequences.length > 0;
    const width = p.range ? Math.abs(p.range[1] - p.range[0]) : 0;
    ranked.push({ ref, flips, consequences, conflict, score: (flips ? 1000 : 0) + (conflict ? 100 : 0) + width });
  }
  return ranked.sort((a, b) => b.score - a.score);
}
