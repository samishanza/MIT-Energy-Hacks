// Speak the team's contract.
//
// Two models of the same system grew up in parallel. @eqore/contract models
// `observations` (one raw reading from one source) and `values` (the resolved answer,
// pointing back at the observations supporting it). This package models `Evidence` and
// `Field`, which collapse those two into one. Theirs is the better shape — a value that
// cites its observations survives re-resolution, and ours has to rebuild the citation
// every time — so this adapter converts ours into theirs rather than the other way
// round, and the contract stays the schema of record.
//
// The interesting work is the state mapping, because the two vocabularies disagree about
// one thing that matters. See VALUE_STATE below.

import {
  CONTRACT_VERSION,
  type MapFeature,
  type Observation,
  type ObservedValue,
  type Method,
  type Owner,
  type RecordVersion,
  type Value,
  type ValueState,
} from '@eqore/contract';
import { specFor, type SourceKind } from '@eqore/catalog';
import type { Field, FieldStatus } from '@eqore/catalog';
import type { SiteRecord } from './reconcile.ts';

/**
 * Our status to theirs.
 *
 * The one that does not map cleanly is `found`. Their vocabulary's nearest word is
 * `verified`, but in their schema a verified value REQUIRES a named person and their
 * evidence — and rightly so. A value an agent read off a public record has no person
 * behind it. Calling it verified would launder an unreviewed extraction into the one
 * state the contract reserves for human sign-off.
 *
 * So `found` becomes `inferred`, which their schema defines as having a current value, a
 * method and a grade — all of which we have. It understates slightly: a parcel id read
 * cleanly from MassGIS is firmer than "inferred" suggests. That is the right direction to
 * be wrong in, and the gap is worth raising with whoever owns the contract, because a
 * state for "sourced but not yet reviewed" is missing and it is the commonest state here.
 */
export const VALUE_STATE: Record<FieldStatus, ValueState> = {
  found: 'inferred',
  inferred: 'inferred',
  conflict: 'conflicting',
  missing: 'missing',
  quarantined: 'unreadable',
};

/** Who is on the hook for supplying each kind of source. */
const OWNER_OF: Record<SourceKind, Owner> = {
  parcel: 'public_data',
  assessor: 'public_data',
  aerial: 'public_data',
  gis_footprint: 'public_data',
  lidar_3dep: 'public_data',
  street_level: 'public_data',
  permit_record: 'public_data',
  code_table: 'public_data',
  flood_map: 'public_data',
  hydrant_gis: 'public_data',
  tariff_db: 'utility',
  hosting_map: 'utility',
  old_plan_set: 'customer',
  survey: 'customer',
  bill: 'customer',
  green_button: 'customer',
  intake_form: 'customer',
  staff_laser: 'customer',
  staff_photo: 'customer',
  staff_photo_charuco: 'customer',
  staff_lidar: 'customer',
  meter_reader: 'customer',
  site_visit: 'qualified_person',
  engineer: 'engineer',
};

/**
 * Fitness grade: what a number is good enough FOR, which their contract models and ours
 * does not. A nameplate read is nameplate grade; something measured well enough to lay
 * out a pad is layout grade; a reference figure is reference grade.
 */
function gradeOf(kind: SourceKind): 'reference' | 'layout' | 'nameplate' {
  switch (kind) {
    case 'staff_photo_charuco':
    case 'staff_photo':
    case 'permit_record':
    case 'old_plan_set':
      return 'nameplate';
    case 'staff_laser':
    case 'staff_lidar':
    case 'survey':
    case 'site_visit':
    case 'lidar_3dep':
    case 'gis_footprint':
      return 'layout';
    default:
      return 'reference';
  }
}

/**
 * Their METHODS separate reading a source from a model drafting off a photo, and treat
 * model_draft as never a verified value. Ours records only who extracted it, so the
 * source kind supplies the rest: anything read off an image or a scan is a draft, and
 * anything pulled from structured data is a source read.
 */
const DRAFTED_FROM_MEDIA: SourceKind[] = [
  'aerial',
  'street_level',
  'permit_record',
  'old_plan_set',
  'survey',
  'bill',
  'staff_photo',
  'staff_photo_charuco',
  'staff_lidar',
];

export function methodOf(extractedBy: Field['evidence'][number]['extractedBy'], kind: SourceKind): Method {
  if (extractedBy === 'human') return 'person_entered';
  if (extractedBy === 'deterministic') return 'computed';
  if (DRAFTED_FROM_MEDIA.includes(kind)) return 'model_draft';
  return 'source_read';
}

/**
 * A stable hash of the evidence REFERENCE, not of its bytes.
 *
 * The contract's contentHash is meant to fingerprint retrieved content, and the honest
 * thing to say is that this adapter never holds the bytes — it is converting a record
 * whose evidence is a pointer. So this fingerprints the pointer, which still makes an
 * observation identifiable and de-duplicable, and does not pretend to verify content.
 * When the record starts carrying retrieved bodies, hash those instead.
 *
 * Deliberately not node:crypto: this package is imported by the browser app.
 */
export function refHash(ref: string, label: string): string {
  const s = `${ref}|${label}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `ref-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

function observedValue(f: Field): ObservedValue | null {
  if (f.value === null || f.value === undefined) return null;
  if (typeof f.value === 'number') {
    return { type: 'quantity', value: f.value, unit: f.unit || specFor(f.key)?.unit || 'each' };
  }
  if (typeof f.value === 'boolean') return { type: 'boolean', value: f.value };
  return { type: 'text', value: String(f.value) };
}

/** Our dotted keys to their snake_case. `openings.0.at_ft` -> `openings_0_at_ft`. */
export const toContractFieldKey = (key: string) =>
  key.replace(/\[\]/g, '').replace(/[.]/g, '_').replace(/[^a-z0-9_]/gi, '_').toLowerCase();

export interface ToContractOptions {
  siteId: string;
  address: string;
  region: string;
  location?: [number, number] | null;
  version?: number;
  createdAt?: string;
  trigger?: RecordVersion['trigger'];
  features?: MapFeature[];
  baseMap?: RecordVersion['baseMap'];
  /**
   * Catalog keys that block a decision. Usually from the readiness report's gaps.
   * These are flagged on their Values so a reader can see what is holding the site up.
   */
  blockingFields?: string[];
  /**
   * Emit a Value for every catalog field with no evidence at all (default true).
   *
   * This matters more than it looks. The field that decides the project is usually the
   * one nobody has — the switchgear bus rating — and a record that only lists what it
   * found would quietly drop it. A `missing` Value is how the contract says "asked, and
   * nothing answered", which is a finding, not an absence.
   */
  includeMissing?: boolean;
}

/**
 * Convert a reconciled site record into a contract RecordVersion.
 *
 * Every Evidence item becomes an Observation, and each Field becomes a Value citing the
 * observation ids behind it — including the ones that disagree, because a conflict an
 * engineer cannot see is worse than no conflict at all.
 */
export function toRecordVersion(record: SiteRecord, opts: ToContractOptions): RecordVersion {
  const createdAt = opts.createdAt ?? new Date().toISOString();
  const blocking = new Set(opts.blockingFields ?? []);
  const observations: Observation[] = [];
  const values: Value[] = [];

  let n = 0;
  for (const [key, field] of record.fields) {
    const spec = specFor(key);
    const contractKey = toContractFieldKey(key);
    const observationIds: string[] = [];

    for (const e of field.evidence) {
      const id = `obs-${++n}`;
      observationIds.push(id);
      observations.push({
        id,
        siteId: opts.siteId,
        field: contractKey,
        kind: 'reading',
        value: observedValue(field),
        source: {
          id: e.sourceKind,
          name: e.label,
          kind: 'arcgis_rest',
          // The contract requires these to agree, and conflating them is how synthetic
          // data ends up presented as real.
          dataOrigin: e.synthetic ? 'synthetic' : 'real',
        },
        retrievedAt: e.timestamp,
        sourceDate: null,
        method: methodOf(e.extractedBy, e.sourceKind),
        locator: e.crop
          ? { imageRegion: { x: e.crop.x, y: e.crop.y, width: e.crop.w, height: e.crop.h }, page: e.crop.page }
          : {},
        identity: { sourceId: e.sourceKind, query: e.ref, contentHash: refHash(e.ref, e.label) },
        grade: gradeOf(e.sourceKind),
        synthetic: e.synthetic === true,
      });
    }

    const state = VALUE_STATE[field.status];
    const best = field.evidence[0];
    const current = state === 'conflicting' || state === 'missing' || state === 'unreadable' ? null : observedValue(field);

    values.push({
      field: contractKey,
      label: spec?.label ?? key,
      state,
      grade: best ? gradeOf(best.sourceKind) : null,
      owner: best ? OWNER_OF[best.sourceKind] : 'public_data',
      current,
      method: current && best ? methodOf(best.extractedBy, best.sourceKind) : undefined,
      // A conflict must keep at least two candidates, per their schema.
      candidates:
        state === 'conflicting'
          ? field.evidence.slice(0, Math.max(2, field.evidence.length)).map((e, i) => ({
              id: `${contractKey}-cand-${i}`,
              value: observedValue(field) ?? { type: 'text', value: '' },
              observationId: observationIds[i] ?? observationIds[0] ?? `obs-${n}`,
              sourceName: e.label,
            }))
          : [],
      conflictKind: state === 'conflicting' ? 'source_disagreement' : undefined,
      observationIds,
      flags: field.blocksDecision || blocking.has(key) ? ['blocks_decision'] : [],
      synthetic: field.evidence.every((e) => e.synthetic === true),
    });
  }

  if (opts.includeMissing !== false) {
    for (const key of record.missing) {
      const spec = specFor(key);
      if (!spec) continue;
      values.push({
        field: toContractFieldKey(key),
        label: spec.label,
        state: 'missing',
        grade: null,
        // Whoever would have to supply it, taken from the cheapest source that could.
        owner: OWNER_OF[spec.cheapestSource.kind],
        current: null,
        candidates: [],
        observationIds: [],
        flags: blocking.has(key) ? ['blocks_decision'] : [],
        synthetic: false,
      });
    }
  }

  return {
    id: `${opts.siteId}-v${opts.version ?? 1}`,
    contractVersion: CONTRACT_VERSION,
    version: opts.version ?? 1,
    createdAt,
    trigger: opts.trigger ?? 'run',
    snapshot: false,
    synthetic: values.length > 0 && values.every((v) => v.synthetic),
    site: {
      id: opts.siteId,
      address: opts.address,
      region: opts.region,
      location: opts.location ?? null,
      locationMethod: opts.location ? 'model_draft' : null,
    },
    values,
    observations,
    features: opts.features ?? [],
    baseMap: opts.baseMap ?? null,
    sourceRuns: [],
  };
}
