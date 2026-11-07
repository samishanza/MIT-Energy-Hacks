import type { Param, Site, Source } from './types.ts';

const AERIAL: Source = { kind: 'aerial', label: 'Aerial imagery + parcel lines', extractedBy: 'vision-model' };
const PHOTO: Source = { kind: 'site-photo', label: 'Site photo, east yard', extractedBy: 'vision-model' };
const NAMEPLATE: Source = { kind: 'nameplate', label: 'Main switchgear nameplate photo', extractedBy: 'vision-model' };
const BILL: Source = { kind: 'bill', label: 'Utility bill, July', extractedBy: 'parser' };
const INTERVAL: Source = { kind: 'interval-data', label: '15-min interval data, 12 months', extractedBy: 'parser' };
const OWNER: Source = { kind: 'survey', label: 'Owner walk-through markup', extractedBy: 'human' };

const P = (value: number, unit: string, source: Source, extra: Partial<Param> = {}): Param => ({ value, unit, source, ...extra });

/**
 * Hand-built demo site (illustrative, not a real customer). Tuned so that:
 *  - 1 QorePack passes cleanly, 2 trigger the >600 kWh spacing rule and the busbar limit
 *  - the east lot line from aerial parcels is uncertain enough to flip feasibility
 *  - the bus rating is half-obscured by glare on the nameplate photo (1600 vs 2000 A)
 */
export const DEMO_SITE: Site = {
  id: 'demo-a',
  name: 'Demo Site A · heat-treat plant',
  city: 'Lowell',
  state: 'MA',
  utility: 'National Grid',
  tariff: 'G-3',
  ahjOverlays: [],
  ahjName: 'Lowell Fire Dept / Building Dept',
  lot: {
    w: P(186, 'ft', AERIAL, { range: [181, 192], howToResolve: 'Tape-measure from building east wall to the east fence/lot pin, or pull the recorded plot plan' }),
    h: P(160, 'ft', AERIAL, { range: [156, 164], howToResolve: 'Check recorded plot plan' }),
  },
  roadSide: 'south',
  building: {
    x: P(20, 'ft', AERIAL, { range: [18, 22] }),
    y: P(20, 'ft', AERIAL, { range: [18, 22] }),
    w: P(140, 'ft', AERIAL, {
      range: [138, 142],
      alternates: [{ value: 139, source: { ...PHOTO, label: 'Site photo with reference scale (loading dock door)' } }],
      howToResolve: 'Laser-measure the east facade on the site visit',
    }),
    h: P(90, 'ft', AERIAL, { range: [88, 92] }),
  },
  openings: [
    { id: 'door-e1', kind: 'door', wall: 'east', at: P(40, 'ft', PHOTO, { range: [37, 43], howToResolve: 'Mark door position on the site walk' }), width: 4 },
    { id: 'intake-e2', kind: 'air-intake', wall: 'east', at: P(70, 'ft', PHOTO, { range: [66, 74], howToResolve: 'Photograph the HVAC intake with a tape in frame' }), width: 3 },
  ],
  padZone: {
    x: P(164, 'ft', OWNER),
    y: P(28, 'ft', OWNER),
    w: P(22, 'ft', OWNER),
    h: P(112, 'ft', OWNER),
  },
  service: {
    voltage: P(480, 'V', NAMEPLATE),
    mainBreakerA: P(1600, 'A', NAMEPLATE, { alternates: [{ value: 1600, source: BILL }] }),
    busRatingA: P(1600, 'A', NAMEPLATE, {
      range: [1600, 2000],
      howToResolve: 'Re-shoot the switchgear nameplate without glare (bus rating line)',
    }),
  },
  peakKW: P(472, 'kW', INTERVAL, { alternates: [{ value: 455, source: BILL }], howToResolve: 'Bill demand is a billed (possibly ratcheted) value; trust the interval max' }),
  packs: 1,
  synthetic: true,
};

// ---------- synthetic portfolio ----------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOWNS: { city: string; state: Site['state']; utility: string; tariff: string; strict?: boolean }[] = [
  { city: 'Lowell', state: 'MA', utility: 'National Grid', tariff: 'G-3' },
  { city: 'Worcester', state: 'MA', utility: 'National Grid', tariff: 'G-3' },
  { city: 'Somerville', state: 'MA', utility: 'Eversource', tariff: 'B3/G-3', strict: true },
  { city: 'Woburn', state: 'MA', utility: 'Eversource', tariff: 'B3/G-3' },
  { city: 'Nashua', state: 'NH', utility: 'Eversource NH', tariff: 'G' },
  { city: 'Manchester', state: 'NH', utility: 'Eversource NH', tariff: 'GV' },
  { city: 'Hayward', state: 'CA', utility: 'PG&E', tariff: 'B-19' },
  { city: 'Fremont', state: 'CA', utility: 'PG&E', tariff: 'B-19', strict: true },
  { city: 'San Leandro', state: 'CA', utility: 'PG&E', tariff: 'B-19' },
];
const KINDS = ['heat-treat plant', 'die caster', 'lumber mill', 'cold storage', 'machine shop', 'plating line', 'aggregate yard', 'injection molder'];

export function makePortfolio(n = 120, seed = 7): Site[] {
  const r = mulberry32(seed);
  const rr = (a: number, b: number) => a + (b - a) * r();
  const ri = (a: number, b: number) => Math.round(rr(a, b));
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!; // callers pass non-empty literals
  const sites: Site[] = [];
  for (let i = 0; i < n; i++) {
    const t = pick(TOWNS);
    const bw = ri(80, 220), bh = ri(60, 140);
    const bx = ri(15, 40), by = ri(15, 40);
    const side = r() < 0.6 ? 'east' : 'south';
    const peak = ri(250, 900);
    const packs = peak > 650 ? 3 : peak > 380 ? 2 : 1;
    // pad zone sized with a deliberately wide spread so some sites are tight
    // array length the site was originally sized for (v1 footprint, NFPA spacing)
    const spacing = packs * 400 > 600 ? 10 : 3;
    const need = packs * 7.5 + (packs - 1) * spacing;
    const runLen = Math.round(need + rr(-0.5, 7)); // some sites were laid out with almost no slack
    let lotW: number, lotH: number, pad: { x: number; y: number; w: number; h: number };
    if (side === 'east') {
      const zoneW = ri(14, 30);
      lotW = bx + bw + zoneW + ri(8, 14);
      lotH = by + Math.max(bh, runLen + 10) + ri(30, 60);
      pad = { x: bx + bw + ri(6, 10), y: by + ri(0, 10), w: zoneW, h: runLen };
    } else {
      const zoneH = ri(14, 30);
      lotW = bx + Math.max(bw, runLen + 10) + ri(20, 40);
      lotH = by + bh + zoneH + ri(12, 30);
      pad = { x: bx + ri(0, 10), y: by + bh + ri(6, 10), w: runLen, h: zoneH };
    }
    const bus = pick([1200, 1600, 2000, 2000, 3000, 4000]);
    const main = r() < 0.5 ? bus : Math.round((bus * 0.8) / 100) * 100;
    const tol = ri(2, 5);
    const doorAt = ri(10, Math.max(12, (side === 'east' ? bh : bw) - 10));
    sites.push({
      id: `s${String(i + 1).padStart(3, '0')}`,
      name: `${t.city} ${pick(KINDS)} #${i + 1}`,
      city: t.city,
      state: t.state,
      utility: t.utility,
      tariff: t.tariff,
      ahjOverlays: t.strict ? ['ahj-opening-15'] : [],
      ahjName: `${t.city} AHJ`,
      lot: { w: P(lotW, 'ft', AERIAL, { range: [lotW - tol, lotW + tol] }), h: P(lotH, 'ft', AERIAL, { range: [lotH - tol, lotH + tol] }) },
      roadSide: side === 'east' ? 'south' : 'west',
      building: { x: P(bx, 'ft', AERIAL), y: P(by, 'ft', AERIAL), w: P(bw, 'ft', AERIAL), h: P(bh, 'ft', AERIAL) },
      openings: [{ id: 'd1', kind: 'door', wall: side, at: P(doorAt, 'ft', PHOTO, { range: [doorAt - 3, doorAt + 3] }), width: 4 }],
      padZone: { x: P(pad.x, 'ft', OWNER), y: P(pad.y, 'ft', OWNER), w: P(pad.w, 'ft', OWNER), h: P(pad.h, 'ft', OWNER) },
      service: { voltage: P(480, 'V', NAMEPLATE), mainBreakerA: P(main, 'A', NAMEPLATE), busRatingA: P(bus, 'A', NAMEPLATE) },
      peakKW: P(peak, 'kW', INTERVAL),
      packs,
      synthetic: true,
    });
  }
  return sites;
}
