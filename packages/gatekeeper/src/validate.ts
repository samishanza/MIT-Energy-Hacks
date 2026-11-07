// The gatekeeper is synchronous and deterministic. Nothing reaches the site record,
// and nothing reaches the customer, without passing it.
//
// It does not judge whether a value is *right* — that is reconciliation's job.
// It judges whether a value is *admissible*: sourced, in scope, in units, physically possible.

import {
  isAgentAllowed,
  specFor,
  type AgentId,
  type Bounds,
  type FieldSpec,
} from "@eqore/catalog";
import { convert } from "@eqore/catalog";
import {
  CROP_REQUIRED_SOURCES,
  SOURCE_TIER,
  type AgentResult,
  type CaptureTask,
  type ExternalAction,
  type FieldValue,
  type Proposal,
} from "@eqore/catalog";
import { checkBudget, zeroSpent, type BudgetBreach, type Spent } from './budgets.ts';

export interface AcceptedProposal {
  proposal: Proposal;
  /** Value after unit conversion into the catalog unit. */
  value: FieldValue;
  unit?: string;
  range?: [number, number];
  unitConverted: boolean;
  spec: FieldSpec;
}

export interface Rejection {
  agentId: string;
  fieldKey: string;
  /** Machine-readable so tests and the watchdog can assert on them. */
  codes: RejectionCode[];
  reasons: string[];
  proposal: Proposal;
}

export type RejectionCode =
  | 'unknown_field'
  | 'agent_not_permitted'
  | 'missing_evidence'
  | 'missing_crop'
  | 'tier_mismatch'
  | 'unit_error'
  | 'out_of_bounds'
  | 'not_standard_value'
  | 'bad_range'
  | 'source_kind_mismatch'
  | 'inferred_requires_range'
  | 'bad_confidence'
  | 'missing_rationale'
  | 'cross_field_implausible'
  | 'budget_exceeded';

export interface GateResult {
  accepted: AcceptedProposal[];
  rejected: Rejection[];
  /** External actions never execute. They queue for a named engineer to approve. */
  approvalQueue: ExternalAction[];
  /** Actions the gatekeeper refused outright, e.g. a task that would open live gear. */
  blockedActions: { action: ExternalAction; reasons: string[] }[];
  budgetBreach: BudgetBreach | null;
}

/** Known values from the record so far, used only for cross-field plausibility. */
export interface GateContext {
  known?: Record<string, number | string | boolean | null>;
}

// ------------------------------------------------------------------ bounds

function checkBounds(value: FieldValue, bounds: Bounds): { codes: RejectionCode[]; reasons: string[] } {
  const codes: RejectionCode[] = [];
  const reasons: string[] = [];

  switch (bounds.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        codes.push('out_of_bounds');
        reasons.push(`expected a finite number, got ${JSON.stringify(value)}`);
        break;
      }
      if (value < bounds.min || value > bounds.max) {
        codes.push('out_of_bounds');
        reasons.push(`${value} is outside the plausible range ${bounds.min}..${bounds.max}`);
      }
      if (bounds.standard && !bounds.standard.includes(value)) {
        codes.push('not_standard_value');
        reasons.push(
          `${value} is not a value this equipment ships in (nearest: ${nearest(value, bounds.standard)}) — likely a misread`,
        );
      }
      break;
    }
    case 'enum': {
      if (typeof value !== 'string' || !bounds.values.includes(value)) {
        codes.push('out_of_bounds');
        reasons.push(`"${String(value)}" is not one of ${bounds.values.join(', ')}`);
      }
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        codes.push('out_of_bounds');
        reasons.push(`expected true or false, got ${JSON.stringify(value)}`);
      }
      break;
    }
    case 'string': {
      if (typeof value !== 'string' || value.trim() === '') {
        codes.push('out_of_bounds');
        reasons.push('expected a non-empty string');
      } else if (bounds.maxLength && value.length > bounds.maxLength) {
        codes.push('out_of_bounds');
        reasons.push(`string longer than ${bounds.maxLength} characters`);
      }
      break;
    }
  }
  return { codes, reasons };
}

const nearest = (v: number, xs: number[]) => xs.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

// ------------------------------------------------------- cross-field physics

/**
 * Checks that need more than one field. These are the ones that catch a doctored
 * document: a number can be in range on its own and still be impossible in context.
 */
export function crossFieldChecks(
  key: string,
  value: FieldValue,
  known: Record<string, number | string | boolean | null>,
): string[] {
  const out: string[] = [];
  const num = (k: string) => (typeof known[k] === 'number' ? (known[k] as number) : undefined);

  if (key === 'load.peak_kw' && typeof value === 'number') {
    const v = num('electrical.service_voltage_v');
    // The bus rating is the better bound, but the main breaker bounds demand too, and it
    // is the one we usually have from an old permit.
    const ampsKey = num('electrical.bus_rating_a') !== undefined ? 'electrical.bus_rating_a' : 'electrical.main_breaker_a';
    const amps = num(ampsKey);
    if (v && amps) {
      // Three-phase apparent power at the service, as an upper bound on real demand.
      const capacityKw = (Math.sqrt(3) * v * amps) / 1000;
      if (value > capacityKw) {
        out.push(
          `peak demand ${value} kW exceeds the service capacity of ${Math.round(capacityKw)} kW ` +
            `(sqrt(3) x ${v} V x ${amps} A, from ${ampsKey}) — the service physically cannot deliver it`,
        );
      }
    }
  }

  // The billing multiplier is the product of the two ratios printed on the meter face.
  // When we have both, the multiplier is arithmetic, not an opinion — so a bill that
  // disagrees with the meter is caught here rather than silently averaged later.
  if (key === 'electrical.ct_multiplier' && typeof value === 'number') {
    const ctr = num('electrical.ct_ratio');
    const vtr = num('electrical.vt_ratio');
    if (ctr && vtr) {
      const expected = ctr * vtr;
      if (Math.abs(value - expected) > 1e-6) {
        out.push(
          `CT multiplier ${value} does not equal CTR ${ctr} x VTR ${vtr} = ${expected} ` +
            `— one of the three is misread, and every demand figure depends on it`,
        );
      }
    }
  }

  if (key === 'electrical.main_breaker_a' && typeof value === 'number') {
    const bus = num('electrical.bus_rating_a');
    if (bus && value > bus) {
      out.push(`main breaker ${value} A exceeds the bus rating ${bus} A it sits on`);
    }
  }

  // Any distance has to fit inside the lot it is measured on.
  const lotW = num('lot.width_ft');
  const lotH = num('lot.depth_ft');
  const diag = lotW && lotH ? Math.hypot(lotW, lotH) : undefined;
  if (diag && typeof value === 'number' && key.endsWith('_ft') && !key.startsWith('lot.')) {
    if (value > diag) {
      out.push(`${value} ft is longer than the lot diagonal (${Math.round(diag)} ft)`);
    }
  }

  return out;
}

// ------------------------------------------------------------- the gate

export function validateProposal(
  p: Proposal,
  ctx: GateContext = {},
): { accepted?: AcceptedProposal; rejection?: Rejection } {
  const codes: RejectionCode[] = [];
  const reasons: string[] = [];

  const spec = specFor(p.fieldKey);
  if (!spec) {
    return {
      rejection: {
        agentId: p.agentId,
        fieldKey: p.fieldKey,
        codes: ['unknown_field'],
        reasons: [`"${p.fieldKey}" is not in the field catalog`],
        proposal: p,
      },
    };
  }

  if (!isAgentAllowed(p.agentId as AgentId, p.fieldKey)) {
    codes.push('agent_not_permitted');
    reasons.push(
      `${p.agentId} may not propose ${p.fieldKey} (allowed: ${spec.allowedAgents.join(', ') || 'none'})`,
    );
  }

  // --- evidence
  const e = p.evidence;
  if (!e || !e.ref?.trim() || !e.label?.trim() || !e.timestamp) {
    codes.push('missing_evidence');
    reasons.push('evidence must carry a ref, a label and a timestamp');
  } else {
    if (CROP_REQUIRED_SOURCES.includes(e.sourceKind) && !e.crop) {
      codes.push('missing_crop');
      reasons.push(`${e.sourceKind} evidence must include the crop the value was read from`);
    }
    if (SOURCE_TIER[e.sourceKind] !== e.tier) {
      codes.push('tier_mismatch');
      reasons.push(`${e.sourceKind} is tier ${SOURCE_TIER[e.sourceKind]}, not tier ${e.tier}`);
    }

    // capture_result's permission is derived from the field having a staff-capture
    // route, so it must actually present that evidence. Without this it could label a
    // Tier-2 read as a Tier-0 public record, which would make the record claim a
    // cheaper and more verifiable provenance than the value really has — and source
    // precedence, value-of-information ranking and the audit trail all rest on tier.
    //
    // The rule is that the evidence must be a Tier-2 staff capture — not that it must be
    // the exact kind the catalog names. A nameplate read off a plain phone photo is
    // legitimate where the catalog says staff_photo_charuco: the scale card governs
    // whether you can MEASURE from the image, not whether you can READ text on it. That
    // difference is carried by confidence, and by the reader noting the absence of a card.
    if (p.agentId === 'capture_result' && !e.sourceKind.startsWith('staff_')) {
      codes.push('source_kind_mismatch');
      reasons.push(
        `a capture result for ${p.fieldKey} must carry staff capture evidence, not ${e.sourceKind}`,
      );
    }
  }

  // --- rationale and confidence
  if (!p.rationale?.trim()) {
    codes.push('missing_rationale');
    reasons.push('an engineer reviewing this needs a one-line reason');
  }
  if (!(p.confidence >= 0 && p.confidence <= 1)) {
    codes.push('bad_confidence');
    reasons.push(`confidence must be between 0 and 1, got ${p.confidence}`);
  }

  // --- units
  let value: FieldValue = p.value;
  let range = p.range;
  let unitConverted = false;
  if (spec.bounds.kind === 'number') {
    if (typeof p.value !== 'number') {
      codes.push('out_of_bounds');
      reasons.push(`expected a number for ${p.fieldKey}, got ${JSON.stringify(p.value)}`);
    } else {
      const c = convert(p.value, p.unit, spec.unit);
      if (!c.ok) {
        codes.push('unit_error');
        reasons.push(c.reason);
      } else {
        value = c.value;
        unitConverted = c.converted;
        if (range) {
          const lo = convert(range[0], p.unit, spec.unit);
          const hi = convert(range[1], p.unit, spec.unit);
          if (lo.ok && hi.ok) range = [lo.value, hi.value];
        }
      }
    }
  } else if (p.unit) {
    codes.push('unit_error');
    reasons.push(`${p.fieldKey} is not a measured quantity but the proposal supplied unit "${p.unit}"`);
  }

  // --- bounds, on the converted value
  const b = checkBounds(value, spec.bounds);
  codes.push(...b.codes);
  reasons.push(...b.reasons);

  // --- range sanity
  if (range) {
    const [lo, hi] = range;
    if (!(Number.isFinite(lo) && Number.isFinite(hi)) || lo > hi) {
      codes.push('bad_range');
      reasons.push(`range [${lo}, ${hi}] is not ordered low..high`);
    } else if (typeof value === 'number' && (value < lo || value > hi)) {
      codes.push('bad_range');
      reasons.push(`value ${value} falls outside its own stated range [${lo}, ${hi}]`);
    }
  }

  // --- fields we will never accept as a point reading
  if (spec.inferredOnly) {
    if (!p.inferred || !range) {
      codes.push('inferred_requires_range');
      reasons.push(
        `${p.fieldKey} may only be inferred, and an inference must carry a range ` +
          `(it cannot be read directly from this kind of source)`,
      );
    }
  }

  // --- cross-field physics
  if (ctx.known) {
    const xf = crossFieldChecks(p.fieldKey, value, ctx.known);
    if (xf.length) {
      codes.push('cross_field_implausible');
      reasons.push(...xf);
    }
  }

  if (codes.length) {
    return { rejection: { agentId: p.agentId, fieldKey: p.fieldKey, codes, reasons, proposal: p } };
  }
  return { accepted: { proposal: p, value, unit: spec.unit, range, unitConverted, spec } };
}

// ------------------------------------------------- external action screening

const OPEN_VERB = /\b(open|remove|unscrew|pry|lift|detach)\b/i;
const ENCLOSURE = /\b(panel|cover|door|dead ?front|switchgear|enclosure|cabinet|disconnect)\b/i;
/** "Do not open the door" is the instruction we want, so negated clauses must not trip the check. */
const NEGATED = /\b(do not|don't|never|avoid|without|no need to|must not|should not)\b/i;

/**
 * True when an instruction tells someone to open electrical equipment.
 *
 * Checked clause by clause: a safe task says "do not open any door", and a naive
 * keyword match on open + door would refuse exactly the wording we want to see.
 */
export function readsAsOpeningGear(instruction: string): boolean {
  return instruction
    .split(/[.;:\n]|,\s*(?=and\b|then\b)/)
    .some((clause) => !NEGATED.test(clause) && OPEN_VERB.test(clause) && ENCLOSURE.test(clause));
}

/**
 * Safety rule, enforced here rather than in a prompt: we never ask facility staff
 * to open electrical equipment. Nameplates get photographed on closed gear.
 */
export function screenAction(action: ExternalAction): { reasons: string[] } {
  const reasons: string[] = [];
  if (action.kind === 'capture_task') {
    const t: CaptureTask = action.task;
    if (t.touchesEnergizedEquipment) {
      reasons.push(
        'task would have staff open or reach into energized equipment — refused; ' +
          'photograph the nameplate on closed gear or dispatch a qualified person',
      );
    }
    if (readsAsOpeningGear(t.instruction)) {
      reasons.push('instruction reads as opening an enclosure — refused on the same ground');
    }
    if (t.estimatedMinutes > 30) {
      reasons.push(`task is ${t.estimatedMinutes} min; Tier 2 is a 15-minute ask, split or escalate it`);
    }
  }
  return { reasons };
}

// --------------------------------------------------------------- whole result

export function gate(result: AgentResult, ctx: GateContext = {}, spent?: Spent): GateResult {
  const accepted: AcceptedProposal[] = [];
  const rejected: Rejection[] = [];

  // Cross-field checks see values accepted earlier in this same batch.
  const known: Record<string, number | string | boolean | null> = { ...(ctx.known ?? {}) };

  for (const p of result.proposals) {
    const { accepted: a, rejection } = validateProposal(p, { known });
    if (a) {
      accepted.push(a);
      known[p.fieldKey] = a.value;
    } else if (rejection) {
      rejected.push(rejection);
    }
  }

  const approvalQueue: ExternalAction[] = [];
  const blockedActions: { action: ExternalAction; reasons: string[] }[] = [];
  for (const action of result.externalActions) {
    const { reasons } = screenAction(action);
    if (reasons.length) blockedActions.push({ action, reasons });
    else approvalQueue.push(action);
  }

  const used: Spent = spent ?? {
    ...zeroSpent(),
    toolCalls: result.toolCalls.length,
    proposals: result.proposals.length,
  };
  const budgetBreach = checkBudget(result.agentId as AgentId, used);

  return { accepted, rejected, approvalQueue, blockedActions, budgetBreach };
}
