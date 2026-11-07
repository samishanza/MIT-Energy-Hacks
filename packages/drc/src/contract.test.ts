import { describe, expect, it } from 'vitest';
import { RecordVersionSchema } from '@eqore/contract';
import { DEMO_SITE_INPUT, makeFixtureSources, runDiscovery } from '@eqore/agents';
import { reconcile, verifyRecord } from './reconcile';
import { analyse } from './readiness';
import { VALUE_STATE, methodOf, refHash, toContractFieldKey, toRecordVersion } from './contract';

async function record(withPhotos = false) {
  const { runs } = await runDiscovery(DEMO_SITE_INPUT, makeFixtureSources({ includeDoctoredBill: withPhotos }));
  const rec = reconcile(DEMO_SITE_INPUT.siteId, runs.flatMap((r) => r.gate.accepted));
  verifyRecord(rec);
  const report = analyse(rec);
  return { rec, report };
}

const convert = async (withPhotos = false) => {
  const { rec, report } = await record(withPhotos);
  return toRecordVersion(rec, {
    siteId: DEMO_SITE_INPUT.siteId,
    address: DEMO_SITE_INPUT.address,
    region: 'massachusetts',
    location: [-71.4273, 42.2295],
    blockingFields: report.gaps.filter((g) => g.blocksDecision).map((g) => g.fieldKey),
  });
};

describe('the record validates against the team contract', () => {
  it('passes RecordVersionSchema, superRefine rules and all', async () => {
    const parsed = RecordVersionSchema.safeParse(await convert());
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
    }
    expect(parsed.success).toBe(true);
  });

  it('carries every field and every piece of evidence across', async () => {
    const { rec } = await record();
    const version = await convert();
    // Found fields plus the ones nothing answered — a missing value is a finding.
    expect(version.values).toHaveLength(rec.fields.size + rec.missing.length);
    const evidenceCount = [...rec.fields.values()].reduce((n, f) => n + f.evidence.length, 0);
    expect(version.observations).toHaveLength(evidenceCount);
  });

  it('points every value at the observations behind it', async () => {
    const version = await convert();
    const ids = new Set(version.observations.map((o) => o.id));
    for (const v of version.values) {
      if (v.state === 'missing') {
        expect(v.observationIds).toEqual([]); // nothing answered, so nothing to cite
        continue;
      }
      expect(v.observationIds.length).toBeGreaterThan(0);
      for (const id of v.observationIds) expect(ids.has(id)).toBe(true);
    }
  });
});

describe('the state mapping', () => {
  it('never calls an agent read "verified"', async () => {
    // Their schema reserves `verified` for a named person plus their evidence. An agent
    // reading a public record is not that, and laundering it would be the one mistake
    // this whole layer exists to prevent.
    const version = await convert();
    expect(version.values.some((v) => v.state === 'verified')).toBe(false);
    expect(VALUE_STATE.found).not.toBe('verified');
  });

  it('keeps a conflict as a conflict, with its candidates and no current value', async () => {
    const version = await convert();
    const peak = version.values.find((v) => v.field === 'load_peak_kw')!;
    expect(peak.state).toBe('conflicting');
    expect(peak.current).toBeNull(); // a person chooses; the adapter does not
    expect(peak.candidates.length).toBeGreaterThanOrEqual(2);
    expect(peak.conflictKind).toBe('source_disagreement');
  });

  it('flags what blocks a decision', async () => {
    const version = await convert();
    const flagged = version.values.filter((v) => v.flags.includes('blocks_decision'));
    expect(flagged.length).toBeGreaterThan(0);
    // The one that decides this project is the one nobody has.
    const bus = version.values.find((v) => v.field === 'electrical_bus_rating_a')!;
    expect(bus.state).toBe('missing');
    expect(bus.flags).toContain('blocks_decision');
    expect(bus.owner).toBe('public_data');
  });
});

describe('provenance survives the crossing', () => {
  it('distinguishes reading a source from a model drafting off an image', async () => {
    // Their METHODS make this distinction and treat model_draft as never verifiable.
    expect(methodOf('agent', 'parcel')).toBe('source_read');
    expect(methodOf('agent', 'gis_footprint')).toBe('source_read');
    expect(methodOf('agent', 'staff_photo_charuco')).toBe('model_draft');
    expect(methodOf('agent', 'bill')).toBe('model_draft');
    expect(methodOf('human', 'engineer')).toBe('person_entered');
    expect(methodOf('deterministic', 'parcel')).toBe('computed');
  });

  it('carries the crop through as an image region', async () => {
    const version = await convert();
    const withRegion = version.observations.filter((o) => o.locator.imageRegion);
    expect(withRegion.length).toBeGreaterThan(0);
    for (const o of withRegion) {
      const r = o.locator.imageRegion!;
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
    }
  });

  it('keeps the synthetic flag honest, which their schema enforces', async () => {
    const version = await convert();
    // Every observation comes from a synthetic fixture, and their superRefine rejects an
    // observation whose flag disagrees with its source origin.
    expect(version.observations.every((o) => o.synthetic)).toBe(true);
    for (const o of version.observations) {
      expect(o.synthetic).toBe(o.source.dataOrigin === 'synthetic');
    }
  });

  it('hashes the reference, and says that is what it is', async () => {
    const a = refHash('file://x.jpg', 'A photo');
    expect(a).toBe(refHash('file://x.jpg', 'A photo')); // stable
    expect(a).not.toBe(refHash('file://y.jpg', 'A photo')); // discriminating
    expect(a).toMatch(/^ref-[0-9a-f]{16}$/);
  });
});

describe('field keys', () => {
  it('converts dotted keys to the snake_case the contract requires', () => {
    expect(toContractFieldKey('electrical.bus_rating_a')).toBe('electrical_bus_rating_a');
    expect(toContractFieldKey('openings.0.at_ft')).toBe('openings_0_at_ft');
    expect(toContractFieldKey('openings[].wall')).toBe('openings_wall');
  });

  it('produces keys their fieldKey regex accepts', async () => {
    const version = await convert();
    for (const v of version.values) expect(v.field).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
