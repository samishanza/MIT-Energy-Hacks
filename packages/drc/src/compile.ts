import {
  buildingRect,
  contains,
  distToLotSide,
  openingSegment,
  padRect,
  rectDistance,
  SIDES,
  v,
} from './geometry';
import { resolvePack, type RulePack } from './rules';
import type { Check, CompileResult, PackSpec, Placement, Rect, Site } from './types';

const LARGEST_OCPD = 1200;
const STD_OCPD = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200];

export function arraySpacing(n: number, spec: PackSpec, pack: RulePack) {
  return n * spec.kWh > pack.largeArrayKWh ? pack.unitSpacingLarge : pack.unitSpacingSmall;
}

export function arrayRects(x: number, y: number, orient: 'row-x' | 'row-y', n: number, spec: PackSpec, spacing: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < n; i++) {
    if (orient === 'row-x') out.push({ x: x + i * (spec.w + spacing), y, w: spec.w, h: spec.d });
    else out.push({ x, y: y + i * (spec.w + spacing), w: spec.d, h: spec.w });
  }
  return out;
}

function bbox(rs: Rect[]): Rect {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.w));
  const y2 = Math.max(...rs.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Clearance checks for a given set of unit rectangles. Pure + fast: the solver calls this thousands of times. */
export function clearanceChecks(site: Site, pack: RulePack, units: Rect[], spec: PackSpec): Check[] {
  const checks: Check[] = [];
  const lotW = v(site.lot.w), lotH = v(site.lot.h);
  const b = buildingRect(site);

  const worst = (pairs: { d: number; witness: Check['witness'] }[]) =>
    pairs.reduce((m, p) => (p.d < m.d ? p : m), { d: Infinity, witness: undefined as Check['witness'] });

  const mk = (ruleId: string, title: string, cite: string, req: number, w: { d: number; witness: Check['witness'] }, extra = ''): Check => ({
    ruleId,
    title,
    cite,
    severity: w.d + 1e-6 >= req ? 'pass' : 'fail',
    measured: round1(w.d),
    required: req,
    unit: 'ft',
    detail: `${round1(w.d)} ft measured vs ${req} ft required${extra}`,
    witness: w.witness,
  });

  const wb = worst(units.map((u) => rectDistance(u, b)));
  checks.push(mk('toBuilding', 'Separation to building', pack.cites.toBuilding, pack.toBuilding, wb));

  if (site.openings.length) {
    const ow = worst(
      site.openings.flatMap((o) => units.map((u) => ({ ...rectDistance(u, openingSegment(site, o)), id: o.id })))
    );
    checks.push(mk('toOpening', 'Separation to doors/windows/intakes', pack.cites.toOpening, pack.toOpening, ow));
  }

  const lotSides = SIDES.filter((s) => s !== site.roadSide);
  const lw = worst(lotSides.flatMap((s) => units.map((u) => distToLotSide(u, s, lotW, lotH))));
  checks.push(mk('toLotLine', 'Separation to lot lines', pack.cites.toLotLine, pack.toLotLine, lw));

  const pw = worst(units.map((u) => distToLotSide(u, site.roadSide, lotW, lotH)));
  checks.push(mk('toPublicWay', `Separation to public way (${site.roadSide} frontage)`, pack.cites.toPublicWay, pack.toPublicWay, pw));

  if (units.length > 1) {
    const req = arraySpacing(units.length, spec, pack);
    const gaps = units.slice(1).map((u, i) => rectDistance(units[i]!, u)); // units[i] precedes u
    const g = worst(gaps);
    const kwh = units.length * spec.kWh;
    checks.push(
      mk('unitSpacing', 'Spacing between units', pack.cites.unitSpacing, req, g,
        kwh > pack.largeArrayKWh ? ` (array ${kwh} kWh > ${pack.largeArrayKWh} kWh)` : '')
    );
  }

  const zone = padRect(site);
  const fits = contains(zone, bbox(units));
  checks.push({
    ruleId: 'padZone',
    title: 'Inside owner-approved pad zone',
    cite: 'Site agreement · owner-approved area',
    severity: fits ? 'pass' : 'fail',
    detail: fits ? 'Array fits the approved area' : 'Array extends outside the approved area',
  });
  return checks;
}

function minSlack(checks: Check[]) {
  let s = Infinity;
  for (const c of checks) {
    if (c.ruleId === 'padZone') {
      if (c.severity === 'fail') return -1e9;
      continue;
    }
    if (c.measured !== undefined && c.required !== undefined) s = Math.min(s, c.measured - c.required);
  }
  return s;
}

/**
 * Constraint solver: search placements of an N-unit array inside the pad zone and
 * keep the one with the largest worst-case slack (most robust to measurement error).
 */
export function solve(site: Site, spec: PackSpec, pack: RulePack, step = 1): Placement {
  const n = site.packs;
  const spacing = arraySpacing(n, spec, pack);
  if (site.manualOrigin) {
    const { x, y, orient } = site.manualOrigin;
    const units = arrayRects(x, y, orient, n, spec, spacing);
    const ok = minSlack(clearanceChecks(site, pack, units, spec)) >= 0;
    return { units, orient, spacing, solved: ok };
  }
  const zone = padRect(site);
  let best: { units: Rect[]; orient: 'row-x' | 'row-y'; score: number } | null = null;
  for (const orient of ['row-x', 'row-y'] as const) {
    const probe = arrayRects(0, 0, orient, n, spec, spacing);
    const bb = bbox(probe);
    const xMax = zone.x + zone.w - bb.w, yMax = zone.y + zone.h - bb.h;
    if (xMax < zone.x || yMax < zone.y) continue;
    for (let x = zone.x; x <= xMax + 1e-9; x += step) {
      for (let y = zone.y; y <= yMax + 1e-9; y += step) {
        const units = arrayRects(x, y, orient, n, spec, spacing);
        const score = minSlack(clearanceChecks(site, pack, units, spec));
        if (!best || score > best.score) best = { units, orient, score };
      }
    }
  }
  if (!best) {
    // does not even fit the zone: place at zone origin so the drawing shows the overflow
    const units = arrayRects(zone.x, zone.y, 'row-x', n, spec, spacing);
    return { units, orient: 'row-x', spacing, solved: false };
  }
  return { units: best.units, orient: best.orient, spacing, solved: best.score >= 0 };
}

export function electrical(site: Site, spec: PackSpec, pack: RulePack) {
  const V = v(site.service.voltage);
  const iPack = (spec.kW * 1000) / (Math.sqrt(3) * V);
  const backfeedPerPackA = 1.25 * iPack;
  const ocpdA = STD_OCPD.find((s) => s >= backfeedPerPackA) ?? LARGEST_OCPD;
  const totalBackfeedA = backfeedPerPackA * site.packs;
  const allowanceA = pack.busbarFactor * v(site.service.busRatingA) - v(site.service.mainBreakerA);
  const method: 'load-side' | 'supply-side' = totalBackfeedA <= allowanceA ? 'load-side' : 'supply-side';
  return { backfeedPerPackA: round1(backfeedPerPackA), totalBackfeedA: round1(totalBackfeedA), allowanceA: round1(allowanceA), method, ocpdA };
}

export function compile(site: Site, spec: PackSpec, extraOverlays: string[] = [], step = 1): CompileResult {
  const pack = resolvePack([...site.ahjOverlays, ...extraOverlays]);
  const placement = solve(site, spec, pack, step);
  const checks = clearanceChecks(site, pack, placement.units, spec);
  const el = electrical(site, spec, pack);

  checks.push({
    ruleId: 'busbar',
    title: 'Interconnection: load-side busbar allowance',
    cite: pack.cites.busbar,
    severity: el.method === 'load-side' ? 'pass' : 'warn',
    measured: el.totalBackfeedA,
    required: el.allowanceA,
    unit: 'A',
    detail:
      el.method === 'load-side'
        ? `${el.totalBackfeedA} A backfeed within ${el.allowanceA} A allowance`
        : `${el.totalBackfeedA} A backfeed exceeds ${el.allowanceA} A allowance → supply-side tap or switchgear change (MV switchgear lead time 52–80 wk)`,
  });
  checks.push({ ruleId: 'ul9540a', title: 'UL 9540 / 9540A test level matches install', cite: pack.cites.ul9540a, severity: 'manual', detail: 'Attach manufacturer summary letter at installation level' });
  checks.push({ ruleId: 'access', title: 'Fire apparatus access', cite: pack.cites.access, severity: 'manual', detail: 'Confirm 20 ft clear engine access on site plan with fire marshal' });

  const auto = checks.filter((c) => c.severity !== 'manual');
  const status = auto.some((c) => c.severity === 'fail') ? 'fail' : auto.some((c) => c.severity === 'warn') ? 'warn' : 'pass';
  return { site, spec, placement, checks, status, electrical: el, arrayKWh: site.packs * spec.kWh };
}

export const round1 = (x: number) => Math.round(x * 10) / 10;
