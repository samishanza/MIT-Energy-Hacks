// Agents search and read. They never decide, and they never write.
//
// Each agent returns an AgentResult full of Proposals. The gatekeeper admits or rejects
// each one; the deterministic engine reconciles what is admitted. An agent that wants to
// reach a human does it by emitting an ExternalAction, which queues for engineer approval.

import { isAgentAllowed, type AgentId } from "@eqore/catalog";
import {
  SOURCE_TIER,
  nowIso,
  type AgentResult,
  type BBox,
  type Evidence,
  type ExternalAction,
  type FieldValue,
  type Proposal,
  type SourceKind,
} from "@eqore/catalog";
import type { SiteInput, SourceClient, SourceDoc } from "./sources/types.ts";

export interface AgentContext {
  site: SiteInput;
  sources: SourceClient;
  /** Values already in the record. Lets an agent skip work and the capture agent see gaps. */
  known: Record<string, FieldValue>;
  /** Field keys the engine says are still blocking a decision. Drives the capture agent. */
  blocking: string[];
}

export interface Agent {
  id: AgentId;
  /** The cheapest tier this agent operates at. */
  tier: 0 | 1 | 2 | 3;
  purpose: string;
  /** Scoped tool list. An agent calling anything else is a watchdog alert. */
  tools: string[];
  run(ctx: AgentContext): Promise<AgentResult>;
}

export interface ProposeOpts {
  unit?: string;
  range?: [number, number];
  confidence: number;
  rationale: string;
  /** Derived rather than read. Forces a range; the gatekeeper enforces it. */
  inferred?: boolean;
  crop?: BBox;
  page?: number;
}

/**
 * Collects an agent's output. Every propose() call has to name the source document it
 * came from, so there is no code path that produces a value without evidence.
 */
export class Emit {
  readonly proposals: Proposal[] = [];
  readonly toolCalls: { tool: string; args: Record<string, unknown> }[] = [];
  readonly externalActions: ExternalAction[] = [];
  readonly couldNotResolve: string[] = [];
  private notes: string[] = [];
  private readonly agentId: AgentId;

  constructor(agentId: AgentId) {
    this.agentId = agentId;
  }

  tool(tool: string, args: Record<string, unknown> = {}) {
    this.toolCalls.push({ tool, args });
  }

  evidence(doc: SourceDoc, sourceKind: SourceKind, opts: { crop?: BBox; page?: number } = {}): Evidence {
    const crop = opts.crop && opts.page !== undefined ? { ...opts.crop, page: opts.page } : opts.crop;
    return {
      sourceKind,
      tier: SOURCE_TIER[sourceKind],
      ref: doc.ref,
      label: doc.label,
      crop,
      extractedBy: 'agent',
      agentId: this.agentId,
      timestamp: nowIso(),
      synthetic: doc.synthetic,
    };
  }

  /**
   * Emit one proposal. Returns false and records a note when the field is outside this
   * agent's scope — the gatekeeper would reject it anyway, and an agent that notices
   * its own overreach is cheaper to debug than one that does not.
   */
  propose(
    key: string,
    value: FieldValue,
    doc: SourceDoc,
    sourceKind: SourceKind,
    opts: ProposeOpts,
  ): boolean {
    if (!isAgentAllowed(this.agentId, key)) {
      this.notes.push(`skipped ${key}: outside ${this.agentId}'s scope`);
      return false;
    }
    if (value === null || value === undefined || value === '') return false;
    this.proposals.push({
      agentId: this.agentId,
      fieldKey: key,
      value,
      unit: opts.unit,
      range: opts.range,
      evidence: this.evidence(doc, sourceKind, { crop: opts.crop, page: opts.page }),
      confidence: opts.confidence,
      rationale: opts.rationale,
      inferred: opts.inferred,
    });
    return true;
  }

  miss(...keys: string[]) {
    for (const k of keys) if (!this.couldNotResolve.includes(k)) this.couldNotResolve.push(k);
  }

  action(a: ExternalAction) {
    this.externalActions.push(a);
  }

  note(n: string) {
    this.notes.push(n);
  }

  result(): AgentResult {
    return {
      agentId: this.agentId,
      proposals: this.proposals,
      externalActions: this.externalActions,
      toolCalls: this.toolCalls,
      couldNotResolve: this.couldNotResolve,
      notes: this.notes.length ? this.notes.join(' · ') : undefined,
    };
  }
}

/**
 * A measurement is never tighter than the instrument. Aerial work is floored at two
 * ground samples; anything finer than that is false precision.
 */
export function rangeFrom(value: number, toleranceFt: number, gsdFtPerPx?: number): [number, number] {
  const floor = gsdFtPerPx ? 2 * gsdFtPerPx : 0;
  const t = Math.max(toleranceFt, floor);
  return [round2(value - t), round2(value + t)];
}

export const round2 = (x: number) => Math.round(x * 100) / 100;
