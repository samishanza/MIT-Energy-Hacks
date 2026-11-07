// Per-agent budgets per site. On breach: stop the agent and escalate to the engineer.
// An agent that loops is a cost problem and a signal that its sources are not answering.

import type { AgentId } from "@eqore/catalog";

export interface Budget {
  maxToolCalls: number;
  maxProposals: number;
  maxWallMs: number;
  maxSpendUsd: number;
}

export const DEFAULT_BUDGETS: Record<AgentId, Budget> = {
  parcel: { maxToolCalls: 12, maxProposals: 20, maxWallMs: 30_000, maxSpendUsd: 0.25 },
  imagery: { maxToolCalls: 25, maxProposals: 40, maxWallMs: 90_000, maxSpendUsd: 1.5 },
  records: { maxToolCalls: 30, maxProposals: 25, maxWallMs: 120_000, maxSpendUsd: 1.5 },
  utility: { maxToolCalls: 10, maxProposals: 12, maxWallMs: 30_000, maxSpendUsd: 0.25 },
  code: { maxToolCalls: 6, maxProposals: 15, maxWallMs: 10_000, maxSpendUsd: 0.05 },
  intake: { maxToolCalls: 20, maxProposals: 20, maxWallMs: 60_000, maxSpendUsd: 1.0 },
  capture: { maxToolCalls: 6, maxProposals: 0, maxWallMs: 15_000, maxSpendUsd: 0.2 },
  // One vision call per returned photo, with room for a re-shoot.
  capture_result: { maxToolCalls: 8, maxProposals: 15, maxWallMs: 120_000, maxSpendUsd: 1.0 },
};

export interface Spent {
  toolCalls: number;
  proposals: number;
  wallMs: number;
  spendUsd: number;
}

export const zeroSpent = (): Spent => ({ toolCalls: 0, proposals: 0, wallMs: 0, spendUsd: 0 });

export interface BudgetBreach {
  agentId: AgentId;
  limit: keyof Budget;
  allowed: number;
  used: number;
}

export function checkBudget(agentId: AgentId, spent: Spent, budget: Budget = DEFAULT_BUDGETS[agentId]): BudgetBreach | null {
  const pairs: [keyof Budget, number, number][] = [
    ['maxToolCalls', budget.maxToolCalls, spent.toolCalls],
    ['maxProposals', budget.maxProposals, spent.proposals],
    ['maxWallMs', budget.maxWallMs, spent.wallMs],
    ['maxSpendUsd', budget.maxSpendUsd, spent.spendUsd],
  ];
  for (const [limit, allowed, used] of pairs) {
    if (used > allowed) return { agentId, limit, allowed, used };
  }
  return null;
}
