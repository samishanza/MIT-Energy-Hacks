import { describe, expect, it } from 'vitest';
import { validateProposal, crossFieldChecks } from "@eqore/gatekeeper";
import {
  METER_PHOTO_PROPOSALS,
  NOT_RESOLVED_BY_SITE_PHOTOS,
  SITE_PHOTO_FLAGS,
  TRANSFORMER_PHOTO_PROPOSALS,
} from './site-photos';

const ALL = [...METER_PHOTO_PROPOSALS, ...TRANSFORMER_PHOTO_PROPOSALS];

describe('the only two site photos that exist for this project', () => {
  it('every reading passes the gatekeeper', () => {
    for (const p of ALL) {
      const { rejection } = validateProposal(p);
      expect(rejection?.reasons ?? [], `${p.fieldKey}`).toEqual([]);
    }
  });

  it('is labelled as real evidence, not synthetic', () => {
    // The fixture site is synthetic and says so. These are not, and must not claim to be.
    expect(ALL.every((p) => p.evidence.synthetic === undefined)).toBe(true);
    expect(ALL.every((p) => p.evidence.tier === 2)).toBe(true);
  });

  it('carries a crop for every value, because a photo without one is not evidence', () => {
    for (const p of ALL) expect(p.evidence.crop, p.fieldKey).toBeTruthy();
  });

  it('resolves identifiers and not one rating', () => {
    const resolved = new Set(ALL.map((p) => p.fieldKey));

    // What two phone photos genuinely give you:
    expect(resolved).toContain('electrical.revenue_meter_serial');
    expect(resolved).toContain('electrical.meter_form');
    expect(resolved).toContain('electrical.ct_ratio');

    // What they do not, no matter how carefully you look:
    for (const key of NOT_RESOLVED_BY_SITE_PHOTOS) {
      expect(resolved.has(key), `${key} must NOT be claimed from a site photo`).toBe(false);
    }
  });

  it('records the meter voltage range as a bound, not as the service voltage', () => {
    // "CL20, 120 TO 480V" is what the meter accepts. Reading it as the service voltage
    // would be a plausible-looking error, so it is kept as an inference with a range.
    const v = METER_PHOTO_PROPOSALS.find((p) => p.fieldKey === 'electrical.service_voltage_v')!;
    expect(v.inferred).toBe(true);
    expect(v.range).toEqual([120, 480]);
    expect(v.confidence).toBeLessThan(0.5);
  });

  it('surfaces the discrepancies for a person instead of resolving them', () => {
    expect(SITE_PHOTO_FLAGS.length).toBeGreaterThanOrEqual(3);
    expect(SITE_PHOTO_FLAGS.some((f) => /2808583614/.test(f.issue))).toBe(true);
    expect(SITE_PHOTO_FLAGS.some((f) => /Mult\. by/.test(f.issue))).toBe(true);
  });
});

describe('the billing multiplier is arithmetic, not a reading', () => {
  const known = { 'electrical.ct_ratio': 5, 'electrical.vt_ratio': 1 };

  it('accepts a multiplier that equals CTR x VTR', () => {
    expect(crossFieldChecks('electrical.ct_multiplier', 5, known)).toEqual([]);
  });

  it('catches a bill whose multiplier contradicts the meter face', () => {
    // The synthetic fixture bill claims 40. Against a meter reading CTR 5, VTR 1 that is
    // an 8x error on every demand figure downstream.
    const out = crossFieldChecks('electrical.ct_multiplier', 40, known);
    expect(out.join(' ')).toMatch(/does not equal CTR 5 x VTR 1 = 5/);
  });

  it('stays quiet when only one ratio is known', () => {
    expect(crossFieldChecks('electrical.ct_multiplier', 40, { 'electrical.ct_ratio': 5 })).toEqual([]);
  });
});
