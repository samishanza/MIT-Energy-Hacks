// Turn a pile of accepted proposals into one site record.
//
// Agents disagree. That is the point of running more than one of them. This module
// decides which value stands, using a fixed source precedence rather than a model's
// opinion, and it never discards the losing evidence — a conflict an engineer cannot
// see is worse than no conflict at all.

import { crossFieldChecks, type AcceptedProposal } from "@eqore/gatekeeper";
import { FIELD_CATALOG, specFor, type SheetId } from "@eqore/catalog";
import type { Evidence, Field, FieldValue, SourceKind } from "@eqore/catalog";

/**
 * Fixed precedence. Higher wins. A person beats a site visit, a site visit beats a
 * measurement, a measurement beats a document, a document beats a picture from space.
 *
 * Two notes that are judgement calls worth arguing about:
 *  - `survey` outranks `old_plan_set`: a boundary survey is the authority on a lot line.
 *  - `green_button` outranks `bill`: interval data is the real peak; billed demand may
 *    be ratcheted from an earlier month.
 */
export const SOURCE_PRECEDENCE: Record<SourceKind, number> = {
  engineer: 100,
  site_visit: 90,
  staff_laser: 80,
  staff_lidar: 78,
  staff_photo_charuco: 70,
  staff_photo: 66,
  meter_reader: 60,
  survey: 58,
  old_plan_set: 55,
  green_button: 52,
  permit_record: 50,
  bill: 46,
  intake_form: 40,
  assessor: 35,
  parcel: 34,
  code_table: 33,
  tariff_db: 32,
  gis_footprint: 31,
  hosting_map: 30,
  flood_map: 29,
  lidar_3dep: 28,
  hydrant_gis: 26,
  street_level: 24,
  aerial: 20,
};

/** Two numbers agree if they are within 2%, or if their stated ranges overlap. */
export function valuesAgree(a: AcceptedProposal, b: AcceptedProposal): boolean {
  if (typeof a.value === 'number' && typeof b.value === 'number') {
    const scale = Math.max(Math.abs(a.value), Math.abs(b.value), 1);
    if (Math.abs(a.value - b.value) / scale <= 0.02) return true;
    if (a.range && b.range) return a.range[0] <= b.range[1] && b.range[0] <= a.range[1];
    return false;
  }
  if (typeof a.value === 'string' && typeof b.value === 'string') {
    return norm(a.value) === norm(b.value);
  }
  return a.value === b.value;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s,.]+/g, ' ');

const rank = (p: AcceptedProposal) => SOURCE_PRECEDENCE[p.proposal.evidence.sourceKind] ?? 0;

export interface ConflictNote {
  fieldKey: string;
  /** The value that stands, and why. */
  resolution: string;
  /** Every competing reading, best source first, for side-by-side review. */
  competing: { value: FieldValue; unit?: string; source: SourceKind; label: string; confidence: number }[];
}

export interface SiteRecord {
  siteId: string;
  fields: Map<string, Field>;
  conflicts: ConflictNote[];
  /** Catalog keys with no accepted proposal at all. */
  missing: string[];
}

/**
 * Build the record. Deterministic: the same proposals in any order produce the same
 * record, because ordering is by source precedence and then by confidence, not arrival.
 */
export function reconcile(siteId: string, accepted: AcceptedProposal[]): SiteRecord {
  const byKey = new Map<string, AcceptedProposal[]>();
  for (const a of accepted) {
    const list = byKey.get(a.proposal.fieldKey) ?? [];
    list.push(a);
    byKey.set(a.proposal.fieldKey, list);
  }

  const fields = new Map<string, Field>();
  const conflicts: ConflictNote[] = [];

  for (const [key, group] of byKey) {
    const spec = specFor(key);
    if (!spec) continue;

    // Best source first; ties broken by the agent's own confidence, then by value so
    // the result cannot depend on which agent happened to run first.
    const sorted = [...group].sort(
      (x, y) =>
        rank(y) - rank(x) ||
        y.proposal.confidence - x.proposal.confidence ||
        String(x.value).localeCompare(String(y.value)),
    );
    // Non-empty by construction (the key exists because a proposal produced it), but
    // the compiler cannot see that, and a guard is cheaper than an assertion.
    const winner = sorted[0];
    if (!winner) continue;

    // A conflict is a disagreement the winner does not already cover. A lower-precedence
    // source agreeing is corroboration; a lower-precedence source disagreeing is a flag.
    const dissenters = sorted.slice(1).filter((p) => !valuesAgree(winner, p));

    const evidence: Evidence[] = sorted.map((p) => p.proposal.evidence);
    const isConflict = dissenters.length > 0;

    if (isConflict) {
      conflicts.push({
        fieldKey: key,
        resolution:
          `Took ${fmt(winner.value, winner.unit)} from ${winner.proposal.evidence.sourceKind} ` +
          `(precedence ${rank(winner)}) over ${dissenters.length} disagreeing source(s).`,
        competing: sorted.map((p) => ({
          value: p.value,
          unit: p.unit,
          source: p.proposal.evidence.sourceKind,
          label: p.proposal.evidence.label,
          confidence: p.proposal.confidence,
        })),
      });
    }

    fields.set(key, {
      key,
      value: winner.value,
      unit: winner.unit,
      range: winner.range,
      // Corroboration raises trust a little; disagreement cuts it. Never above the
      // agent's own number by more than a nudge.
      confidence: adjustConfidence(winner.proposal.confidence, sorted.length - dissenters.length - 1, dissenters.length),
      status: isConflict ? 'conflict' : winner.proposal.inferred ? 'inferred' : 'found',
      evidence,
      neededBy: spec.neededBy,
      blocksDecision: false, // filled in by the value-of-information pass
    });
  }

  const missing = FIELD_CATALOG.filter((f) => !f.key.includes('[]') && !fields.has(f.key)).map((f) => f.key);

  return { siteId, fields, conflicts, missing };
}

function adjustConfidence(base: number, corroborating: number, dissenting: number): number {
  const up = Math.min(0.08, corroborating * 0.04);
  const down = Math.min(0.4, dissenting * 0.2);
  return Math.max(0.05, Math.min(0.99, base + up - down));
}

const fmt = (v: FieldValue, unit?: string) => `${String(v)}${unit ? ` ${unit}` : ''}`;

export interface Inconsistency {
  fieldKey: string;
  reasons: string[];
}

/**
 * Re-run the cross-field checks against the finished record.
 *
 * The gatekeeper is synchronous and can only judge a proposal against what was known at
 * the moment it arrived. Some contradictions only become visible later: a bill's CT
 * multiplier looks fine until a photo of the meter face supplies the two ratios it is
 * supposed to be the product of. Admitting a value and then noticing it cannot be true
 * is not a gatekeeper failure — it is why the record gets a final sweep.
 *
 * These are reported, never auto-resolved. Which of the two readings is wrong is an
 * engineer's call.
 */
export function verifyRecord(record: SiteRecord): Inconsistency[] {
  const known: Record<string, FieldValue> = {};
  for (const [k, f] of record.fields) known[k] = f.value;

  const out: Inconsistency[] = [];
  for (const [k, f] of record.fields) {
    const reasons = crossFieldChecks(k, f.value, known);
    if (reasons.length) {
      out.push({ fieldKey: k, reasons });
      // A value that contradicts the rest of the record is not trustworthy enough to
      // decide anything, so it drops out of 'found' and into the review queue.
      f.status = 'conflict';
    }
  }
  return out;
}

/** Fields the catalog says a given sheet cannot be drawn without. */
export function requiredFor(sheet: SheetId): string[] {
  return FIELD_CATALOG.filter((f) => f.neededBy.includes(sheet)).map((f) => f.key);
}
