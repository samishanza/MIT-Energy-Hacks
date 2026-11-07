// Rule packs are DATA. A jurisdiction amendment is a new overlay object, not new code.
// Values are NFPA 855 / NEC defaults as commonly applied to outdoor C&I systems.
// TODO(rule-pack owner): confirm section numbers against the edition each AHJ has adopted.

export interface RulePack {
  id: string;
  name: string;
  /** clearance from any battery unit to... (ft) */
  toBuilding: number;
  toOpening: number;
  toLotLine: number;
  toPublicWay: number;
  /** spacing between units: small arrays vs arrays above the energy threshold */
  unitSpacingSmall: number;
  unitSpacingLarge: number;
  largeArrayKWh: number;
  /** NEC 705.12 busbar allowance multiplier for load-side connections */
  busbarFactor: number;
  /** Keyed explicitly rather than Record<string,string>, so a typo is a compile error
   *  and a lookup is not silently `string | undefined`. */
  cites: {
    toBuilding: string;
    toOpening: string;
    toLotLine: string;
    toPublicWay: string;
    unitSpacing: string;
    busbar: string;
    ul9540a: string;
    access: string;
    hma: string;
  };
}

export const BASE_PACK: RulePack = {
  id: 'nfpa855-default',
  name: 'NFPA 855 outdoor defaults + NEC 705.12',
  toBuilding: 10,
  toOpening: 10,
  toLotLine: 10,
  toPublicWay: 10,
  unitSpacingSmall: 3,
  unitSpacingLarge: 10,
  largeArrayKWh: 600,
  busbarFactor: 1.2,
  cites: {
    toBuilding: 'NFPA 855 · outdoor separation to exposures (10 ft default)',
    toOpening: 'NFPA 855 · separation to doors, windows, air intakes (10 ft default)',
    toLotLine: 'NFPA 855 · separation to lot lines (10 ft default)',
    toPublicWay: 'NFPA 855 · separation to public ways',
    unitSpacing: 'NFPA 855 · unit spacing (3 ft; arrays > 600 kWh: 10 ft or 2-hr barrier)',
    busbar: 'NEC 705.12(B) · 120% busbar rule for load-side interconnection',
    ul9540a: 'UL 9540 listing + UL 9540A test level must match installation',
    access: 'Fire apparatus access (20 ft clear) · confirm with fire marshal',
    hma: 'NFPA 855 (2026) · hazard mitigation analysis now default',
  },
};

/** Overlays model local amendments or new code editions. */
export const OVERLAYS: Record<string, { name: string; patch: Partial<RulePack> }> = {
  'ahj-lotline-25': {
    name: 'Local amendment: 25 ft to lot lines and public ways',
    patch: { toLotLine: 25, toPublicWay: 25 },
  },
  'ahj-opening-15': {
    name: 'Local amendment: 15 ft to openings and air intakes',
    patch: { toOpening: 15 },
  },
};

export function resolvePack(overlayIds: string[]): RulePack {
  let p: RulePack = { ...BASE_PACK, cites: { ...BASE_PACK.cites } };
  for (const id of overlayIds) {
    const o = OVERLAYS[id];
    if (o) p = { ...p, ...o.patch, cites: p.cites };
  }
  return p;
}

/**
 * Illustrative only. These numbers were invented before we had a datasheet and are kept
 * solely so the 120-site synthetic portfolio keeps its existing baseline.
 * For anything that represents a real EQORE install, use EQORE_EDGE760 below.
 */
export const QOREPACK_V1 = {
  version: 'QorePack v1 (illustrative)',
  // ASSUMED footprint. Superseded by EQORE_EDGE760 for real work.
  w: 7.5,
  d: 4.0,
  h: 7.5,
  kW: 200,
  kWh: 400,
  assumed: true,
};

export const QOREPACK_V2 = {
  ...QOREPACK_V1,
  version: 'QorePack v2 (+8 in width)',
  w: QOREPACK_V1.w + 8 / 12,
};

/**
 * The real configuration, from the Century Tywood stamped plan set (ESS-13.0 equipment
 * schedule, rev B, 2026-01-11). Not assumed.
 *
 *   BESS      Gotion Edge760, ESD1267-05P760-G, 760 kWh, 1267.2 V nominal
 *             55.1 in W x 94.5 in D x 98.4 in H, ~8 tons, IP55
 *   Inverters 2 x Dynapower MPS125EHV, 125 kW each -> 250 kW AC, 480 VAC
 *
 * What this changes versus the assumed QorePack, on the same site:
 *  - 250 kW instead of 200 kW raises the per-unit backfeed by 25% (376 A vs 301 A at
 *    480 V with the NEC 1.25 factor). On a 1600 A bus with a 1600 A main — a 320 A
 *    allowance under 705.12 — the assumed pack tied in load-side and the real one does
 *    not. The assumed datasheet was hiding a design-changing fact, which is the whole
 *    argument for keeping product facts out of the site record and sourced.
 *  - The unit is deeper than it is wide (4.6 ft x 7.9 ft), the opposite of the assumed
 *    pack, so the solver prefers a different orientation in a narrow side yard.
 *  - 760 kWh crosses the 600 kWh array threshold with a single unit, so any second unit
 *    is in large-spacing territory from the start.
 *
 * Note: the equipment pad at Century Tywood is ~11.5 ft x 14 ft, because it also carries
 * the 500 kVA isolation transformer, both inverters, the precharge units and three
 * disconnects. The footprint below is the battery enclosure alone — balance-of-system
 * area is a design output, not a site fact, so it is Option 2's to compute.
 */
export const EQORE_EDGE760 = {
  version: 'Gotion Edge760 + 2 x Dynapower MPS125',
  w: 55.1 / 12, // 4.59 ft
  d: 94.5 / 12, // 7.88 ft
  h: 98.4 / 12, // 8.20 ft
  kW: 250,
  kWh: 760,
  assumed: false,
};
