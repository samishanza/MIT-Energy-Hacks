// Agent registry and the runner that puts every agent behind the gatekeeper.
//
// There is no way to run an agent and get values into the record without passing through
// gate(). That is the whole point of this module.

import type { AgentId } from "@eqore/catalog";
import { gate, type GateResult } from "@eqore/gatekeeper";
import { zeroSpent } from "@eqore/gatekeeper";
import type { AgentResult, FieldValue } from "@eqore/catalog";
import type { SiteInput, SourceClient } from "./sources/types";
import type { Agent, AgentContext } from './base';
import { captureAgent } from './capture';
import { codeAgent } from './code';
import { imageryAgent } from './imagery';
import { intakeAgent } from './intake';
import { parcelAgent } from './parcel';
import { recordsAgent } from './records';
import { utilityAgent } from './utility';

export const AGENTS: Agent[] = [
  parcelAgent,
  imageryAgent,
  recordsAgent,
  utilityAgent,
  codeAgent,
  intakeAgent,
  captureAgent,
];

export const AGENTS_BY_ID = new Map<AgentId, Agent>(AGENTS.map((a) => [a.id, a]));

/** Agents that gather from sources, in the order we want to spend money in. */
export const DISCOVERY_AGENTS: Agent[] = [parcelAgent, codeAgent, utilityAgent, imageryAgent, recordsAgent, intakeAgent];

export interface AgentRun {
  agentId: AgentId;
  result: AgentResult;
  gate: GateResult;
  wallMs: number;
  /** Tools the agent called that are not on its declared list. A watchdog signal. */
  outOfScopeTools: string[];
}

export async function runAgent(agent: Agent, ctx: AgentContext): Promise<AgentRun> {
  const t0 = Date.now();
  const result = await agent.run(ctx);
  const wallMs = Date.now() - t0;

  const declared = new Set(agent.tools);
  const outOfScopeTools = [...new Set(result.toolCalls.map((t) => t.tool))].filter((t) => !declared.has(t));

  const g = gate(
    result,
    { known: ctx.known as Record<string, string | number | boolean | null> },
    { ...zeroSpent(), toolCalls: result.toolCalls.length, proposals: result.proposals.length, wallMs },
  );

  return { agentId: agent.id, result, gate: g, wallMs, outOfScopeTools };
}

export interface DiscoveryOutcome {
  runs: AgentRun[];
  /** Accepted values, last-writer-wins. The engine does the real reconciliation. */
  known: Record<string, FieldValue>;
  /** Union of what no agent could resolve, minus anything another agent did resolve. */
  unresolved: string[];
}

/**
 * Run the gathering agents cheapest-first and accumulate what passed the gate.
 * This is deliberately not the reconciler: it hands the engine a pile of accepted
 * proposals, including the ones that disagree.
 */
export async function runDiscovery(
  site: SiteInput,
  sources: SourceClient,
  agents: Agent[] = DISCOVERY_AGENTS,
): Promise<DiscoveryOutcome> {
  const known: Record<string, FieldValue> = {};
  const runs: AgentRun[] = [];
  const missed = new Set<string>();

  for (const agent of agents) {
    const run = await runAgent(agent, { site, sources, known, blocking: [] });
    runs.push(run);
    for (const a of run.gate.accepted) known[a.proposal.fieldKey] = a.value;
    for (const k of run.result.couldNotResolve) missed.add(k);
  }

  const unresolved = [...missed].filter((k) => !(k in known));
  return { runs, known, unresolved };
}

// The source seam and the demo payloads, re-exported so downstream packages can build a
// record without reaching into this package's internals.
export * from "./sources/types";
export * from "./sources/fixture";
export * from "./sources/site-photos";
export * from "./base";
