// Put the gate on the collection path.
//
// The gatekeeper was built around Proposals, which is what the agent layer emits. But
// almost all of the data now arrives the other way, as contract Observations from
// packages/sources, and that path had no gate at all. The claim that nothing reaches the
// record without passing a check was true of one path and false of the other: a bus
// rating of 1750 A would be refused from an agent and accepted from a collector.
//
// This adapts an Observation into the same checks, so both paths are held to one
// standard. It deliberately takes the field mapping as an argument rather than importing
// it, so this package stays free of any dependency on the collectors it guards.

import type { Observation } from '@eqore/contract';
import { specFor, type AgentId } from '@eqore/catalog';
import type { FieldValue, Proposal, SourceKind } from '@eqore/catalog';
import { validateProposal, type GateContext, type Rejection } from './validate.ts';

export interface ObservationGateOptions {
  /** Contract field name (snake_case) to catalog key. Usually built from CATALOG_ROUTES. */
  keyForField: (field: string) => string | undefined;
  /**
   * Values already established, for the cross-field physics. Keyed by catalog key.
   * Without this, a peak demand that exceeds the service cannot be caught.
   */
  known?: Record<string, FieldValue>;
  /**
   * Treated as this agent for permission purposes. Defaults to `collector`, whose scope
   * is derived from the catalog: public machine-readable layers only. That still refuses
   * it a bus rating or a CT multiplier, which is the check that matters.
   */
  agentId?: AgentId;
}

export interface ObservationVerdict {
  observation: Observation;
  /** Catalog key this observation answers, when it answers one. */
  key?: string;
  status: 'admitted' | 'rejected' | 'unmapped' | 'no_value';
  rejection?: Rejection;
}

export interface ObservationGateResult {
  verdicts: ObservationVerdict[];
  admitted: ObservationVerdict[];
  rejected: ObservationVerdict[];
  /** Observations whose field is not in the catalog. Not an error — just unguarded. */
  unmapped: ObservationVerdict[];
  /** Values that passed, keyed by catalog key, for chaining into the next batch. */
  known: Record<string, FieldValue>;
}

/** Contract source kinds are coarser than ours; map onto the nearest catalog kind. */
function sourceKindOf(o: Observation): SourceKind {
  switch (o.source.kind) {
    case 'human_evidence':
      return o.method === 'person_entered' ? 'engineer' : 'staff_photo';
    case 'geocoder':
      return 'parcel';
    case 'earth_engine':
      return 'lidar_3dep';
    default:
      // An arcgis_rest layer is a public GIS source. Which one it is matters for
      // precedence, not for admission, and the identity carries the detail.
      return o.method === 'model_draft' ? 'aerial' : 'parcel';
  }
}

function toProposal(o: Observation, key: string, agentId: AgentId): Proposal | null {
  if (!o.value || o.value.type === 'none') return null;

  const value: FieldValue =
    o.value.type === 'quantity' ? o.value.value : o.value.type === 'boolean' ? o.value.value : o.value.value;

  const kind = sourceKindOf(o);
  const region = o.locator.imageRegion;

  return {
    agentId,
    fieldKey: key,
    value,
    unit: o.value.type === 'quantity' ? o.value.unit : undefined,
    confidence: o.grade === 'nameplate' ? 0.85 : o.grade === 'layout' ? 0.75 : 0.65,
    rationale: `${o.source.name} (${o.method})`,
    inferred: o.method === 'computed' || o.method === 'assumed',
    evidence: {
      sourceKind: kind,
      tier: kind === 'engineer' ? 3 : kind === 'staff_photo' ? 2 : 0,
      ref: o.identity.query || o.identity.sourceId,
      label: o.source.name,
      crop: region ? { x: region.x, y: region.y, w: region.width, h: region.height } : undefined,
      extractedBy:
        o.method === 'person_entered' ? 'human' : o.method === 'computed' ? 'deterministic' : o.method === 'model_draft' ? 'agent' : 'parser',
      agentId,
      timestamp: o.retrievedAt,
      synthetic: o.synthetic || undefined,
    },
  };
}

/**
 * Run contract observations through the same admission control the agents face.
 *
 * Unmapped fields are reported, not rejected: the collectors legitimately produce things
 * the plan-set catalog does not ask for, and refusing those would be the gate overreaching.
 * What it will not do is let a catalogued field through without the checks.
 */
export function gateObservations(
  observations: Observation[],
  opts: ObservationGateOptions,
): ObservationGateResult {
  const agentId = opts.agentId ?? 'collector';
  const known: Record<string, FieldValue> = { ...(opts.known ?? {}) };
  const verdicts: ObservationVerdict[] = [];

  for (const o of observations) {
    const key = opts.keyForField(o.field);

    if (!key || !specFor(key)) {
      verdicts.push({ observation: o, key, status: 'unmapped' });
      continue;
    }
    if (!o.value || o.value.type === 'none') {
      // "Asked, and nothing answered" is a finding, and there is nothing to check.
      verdicts.push({ observation: o, key, status: 'no_value' });
      continue;
    }

    const proposal = toProposal(o, key, agentId);
    if (!proposal) {
      verdicts.push({ observation: o, key, status: 'no_value' });
      continue;
    }

    const ctx: GateContext = { known: known as GateContext['known'] };
    const { accepted, rejection } = validateProposal(proposal, ctx);

    if (accepted) {
      known[key] = accepted.value;
      verdicts.push({ observation: o, key, status: 'admitted' });
    } else {
      verdicts.push({ observation: o, key, status: 'rejected', rejection });
    }
  }

  return {
    verdicts,
    admitted: verdicts.filter((v) => v.status === 'admitted'),
    rejected: verdicts.filter((v) => v.status === 'rejected'),
    unmapped: verdicts.filter((v) => v.status === 'unmapped'),
    known,
  };
}
