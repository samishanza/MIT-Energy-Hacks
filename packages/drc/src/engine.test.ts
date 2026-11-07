import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { EQORE_EDGE760, QOREPACK_V1, QOREPACK_V2 } from './rules';
import { DEMO_SITE, makePortfolio } from './sites';
import { rankUnknowns } from './uncertainty';
import { compilePortfolio, diffPortfolio } from './portfolio';

describe('demo site', () => {
  it('1 pack passes cleanly', () => {
    const r = compile(DEMO_SITE, QOREPACK_V1);
    expect(r.status).toBe('pass');
    expect(r.placement.solved).toBe(true);
  });
  it('2 packs trigger large-array spacing and the busbar limit', () => {
    const r = compile({ ...DEMO_SITE, packs: 2 }, QOREPACK_V1);
    const spacing = r.checks.find((c) => c.ruleId === 'unitSpacing');
    expect(spacing?.required).toBe(10);
    expect(r.electrical.method).toBe('supply-side');
  });
  it('ranks the east lot line and the bus rating as decision-critical', () => {
    const ranked = rankUnknowns({ ...DEMO_SITE, packs: 2 }, QOREPACK_V1);
    const top = ranked.filter((x) => x.flips).map((x) => x.ref.path);
    expect(top).toContain('lot.w');
    expect(top).toContain('service.busRatingA');
  });
});

describe('real product spec vs the assumed one', () => {
  // The Century Tywood set gave us the actual equipment. Swapping the assumed footprint
  // for it flips the interconnection method on the same site, with nothing else changed.
  it('the real 250 kW unit exceeds the 705.12 allowance where the assumed 200 kW one did not', () => {
    const assumed = compile(DEMO_SITE, QOREPACK_V1);
    const real = compile(DEMO_SITE, EQORE_EDGE760);

    // Same service, same 320 A allowance (1.2 x 1600 A bus - 1600 A main).
    expect(assumed.electrical.allowanceA).toBe(real.electrical.allowanceA);
    expect(real.electrical.allowanceA).toBe(320);

    expect(assumed.electrical.method).toBe('load-side');
    expect(real.electrical.method).toBe('supply-side');

    expect(real.electrical.totalBackfeedA).toBeGreaterThan(assumed.electrical.totalBackfeedA);
  });

  it('is not labelled assumed, unlike the illustrative pack', () => {
    expect(EQORE_EDGE760.assumed).toBe(false);
    expect(QOREPACK_V1.assumed).toBe(true);
  });
});

describe('portfolio', () => {
  it('recompiles 120 sites and reports v2 impact', () => {
    const sites = makePortfolio();
    const t0 = performance.now();
    const before = compilePortfolio(sites, { spec: QOREPACK_V1, overlays: [], extraPacks: 0 });
    const after = compilePortfolio(sites, { spec: QOREPACK_V2, overlays: [], extraPacks: 0 });
    const ms = performance.now() - t0;
    const d = diffPortfolio(before, after);
    const counts = { pass: before.filter((r) => r.status === 'pass').length, warn: before.filter((r) => r.status === 'warn').length, fail: before.filter((r) => r.status === 'fail').length };
    console.log('baseline', counts, 'v2 newly failing', d.filter((x) => x.change === 'newly-fails').length, `${ms.toFixed(0)} ms`);
    const amend = compilePortfolio(sites, { spec: QOREPACK_V1, overlays: ['ahj-lotline-25'], extraPacks: 0 });
    console.log('lot-line 25ft newly failing', diffPortfolio(before, amend).filter((x) => x.change === 'newly-fails').length);
    expect(before.length).toBe(120);
  });
});
