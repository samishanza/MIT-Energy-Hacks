import { describe, expect, it } from 'vitest';
import { runDiscovery } from "@eqore/agents";
import { DEMO_SITE_INPUT, makeFixtureSources } from "@eqore/agents";
import { reconcile } from './reconcile';
import { analyse } from './readiness';
import { exportToSetback } from './export';

async function buildRecord() {
  const { runs } = await runDiscovery(DEMO_SITE_INPUT, makeFixtureSources());
  return reconcile(DEMO_SITE_INPUT.siteId, runs.flatMap((r) => r.gate.accepted));
}

describe('reconciliation', () => {
  it('prefers interval data over billed demand for peak', async () => {
    const record = await buildRecord();
    const peak = record.fields.get('load.peak_kw')!;
    // 472 is the interval maximum; 455 is the ratcheted bill figure.
    expect(peak.value).toBe(472);
    expect(peak.evidence[0]!.sourceKind).toBe('green_button');
  });

  it('keeps the losing source rather than discarding it', async () => {
    const record = await buildRecord();
    const peak = record.fields.get('load.peak_kw')!;
    expect(peak.evidence.map((e) => e.sourceKind)).toContain('bill');
    expect(peak.status).toBe('conflict');
  });

  it('shows both sides of a conflict for review', async () => {
    const record = await buildRecord();
    const c = record.conflicts.find((x) => x.fieldKey === 'load.peak_kw')!;
    expect(c.competing.map((x) => x.value).sort()).toEqual([455, 472]);
    expect(c.resolution).toMatch(/green_button/);
  });

  it('is order-independent', async () => {
    const { runs } = await runDiscovery(DEMO_SITE_INPUT, makeFixtureSources());
    const all = runs.flatMap((r) => r.gate.accepted);
    const forward = reconcile('s', all);
    const backward = reconcile('s', [...all].reverse());
    for (const [k, f] of forward.fields) {
      expect(backward.fields.get(k)!.value, k).toEqual(f.value);
    }
  });
});

describe('readiness', () => {
  it('names the blocking field and what it decides', async () => {
    const report = analyse(await buildRecord());

    const oneLine = report.sheets.find((s) => s.sheet.startsWith('E-101'))!;
    expect(oneLine.ready).toBe(false);
    expect(oneLine.blockedBy).toContain('electrical.bus_rating_a');

    const bus = report.gaps.find((g) => g.fieldKey === 'electrical.bus_rating_a')!;
    expect(bus.kind).toBe('missing');
    expect(bus.blocksDecision).toBe(true);
    // The whole argument: the two plausible values lead to different projects.
    expect(bus.consequences.length).toBeGreaterThan(0);
    expect(bus.consequences.map((c) => c.outcome).join(' ')).toMatch(/load-side|supply-side/);
  });

  it('puts the decision-critical gap first, not the biggest one', async () => {
    const report = analyse(await buildRecord());
    expect(report.gaps[0]!.blocksDecision).toBe(true);
  });

  it('routes the top gap to the cheapest thing that can settle it', async () => {
    const report = analyse(await buildRecord());
    const bus = report.gaps.find((g) => g.fieldKey === 'electrical.bus_rating_a')!;
    expect(bus.resolver?.tier).toBe(2);
    expect(bus.resolver?.description).toMatch(/nameplate photo/);
  });

  it('produces a headline a person can read off a screen', async () => {
    const report = analyse(await buildRecord());
    expect(report.headline).toMatch(/sheets ready/);
    expect(report.headline).toMatch(/bus rating/i);
  });

  it('a sheet whose inputs are all present is ready', async () => {
    const report = analyse(await buildRecord());
    // The cover sheet is entirely Tier 0: codes, AHJs, parcel, flood zone, design criteria.
    const cover = report.sheets.find((s) => s.sheet.startsWith('G-001'))!;
    expect(cover.ready).toBe(true);
    expect(cover.presentCount).toBe(cover.requiredCount);
  });

  it('reports readiness per sheet rather than one completeness percentage', async () => {
    const report = analyse(await buildRecord());
    const ready = report.sheets.filter((s) => s.ready).map((s) => s.sheet);
    const blocked = report.sheets.filter((s) => !s.ready).map((s) => s.sheet);
    // The point of per-sheet readiness: some drawings can proceed while others cannot.
    expect(ready.length).toBeGreaterThan(0);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.some((s) => s.startsWith('E-101'))).toBe(true);
  });
});

describe('export to Setback', () => {
  it('carries provenance across the handoff', async () => {
    const { site } = exportToSetback(await buildRecord(), { name: 'Demo' });
    expect(site.lot.w.source.label).toMatch(/parcel/i);
    expect(site.peakKW.source.kind).toBe('interval-data');
  });

  it('labels a placeholder as a placeholder instead of inventing a value', async () => {
    const { site, gaps } = exportToSetback(await buildRecord(), { name: 'Demo' });
    expect(site.service.busRatingA.source.kind).toBe('assumed');
    expect(site.service.busRatingA.source.label).toMatch(/PLACEHOLDER/);
    const gap = gaps.find((g) => g.fieldKey === 'electrical.bus_rating_a')!;
    expect(gap.assumedRange).toEqual([1600, 2000]);
    expect(gap.basis).toMatch(/cannot be smaller than the 1600 A main/);
  });

  it('reassembles the indexed openings into a list', async () => {
    const { site } = exportToSetback(await buildRecord(), { name: 'Demo' });
    expect(site.openings.length).toBe(2);
    expect(site.openings.map((o) => o.kind).sort()).toEqual(['air-intake', 'door']);
  });

  it('compiles into a real plan set', async () => {
    const report = analyse(await buildRecord());
    expect(report.result.checks.length).toBeGreaterThan(5);
    expect(['pass', 'warn', 'fail']).toContain(report.result.status);
  });
});

describe('the two real site photos arriving', () => {
  it('resolve meter identity and the ratios, and still do not unblock the single-line', async () => {
    const { buildRecord: build } = await import("./build");
    const { makeFixtureSources: mk, DEMO_SITE_INPUT: site } = await import("@eqore/agents");

    const before = await build(site, mk());
    const after = await build(site, mk(), { withSitePhotos: true });

    // The photos add real, sourced facts...
    expect(before.record.fields.has('electrical.ct_ratio')).toBe(false);
    expect(after.record.fields.get('electrical.ct_ratio')!.value).toBe(5);
    expect(after.record.fields.get('electrical.revenue_meter_serial')!.value).toBe('08105653');

    // ...and still leave the one field that decides the project unresolved.
    expect(after.record.fields.has('electrical.bus_rating_a')).toBe(false);
    const oneLine = after.report.sheets.find((s) => s.sheet.startsWith('E-101'))!;
    expect(oneLine.ready).toBe(false);
    expect(oneLine.blockedBy).toContain('electrical.bus_rating_a');
  });

  it('catches the bill multiplier contradicting the meter face', async () => {
    const { buildRecord: build } = await import("./build");
    const { makeFixtureSources: mk, DEMO_SITE_INPUT: site } = await import("@eqore/agents");
    const after = await build(site, mk(), { withSitePhotos: true });

    // The fixture bill claims a multiplier of 40; the meter reads CTR 5 x VTR 1 = 5.
    const bad = after.inconsistencies.find((r) => r.fieldKey === "electrical.ct_multiplier");
    expect(bad?.reasons.join(" ") ?? "").toMatch(/does not equal CTR 5 x VTR 1 = 5/);
  });
});
