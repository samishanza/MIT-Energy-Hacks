// One call that produces everything a screen needs.
//
// The whole pipeline, in the order it costs money:
//   Tier 0/1 agents -> gatekeeper -> reconcile -> Setback compile -> readiness + gaps
//
// Tier 2 evidence is a separate, later step on purpose. A capture result only arrives
// because an engineer approved an ask, so the two states — before and after the photo
// comes back — are both real states of the record, and the UI can show the difference.

import { runDiscovery, type AgentRun } from "@eqore/agents";
import { validateProposal, type AcceptedProposal, type Rejection } from "@eqore/gatekeeper";
import type { Proposal } from "@eqore/catalog";
import { analyse, type ReadinessReport } from "./readiness.ts";
import { reconcile, verifyRecord, type Inconsistency, type SiteRecord } from "./reconcile.ts";
import { EQORE_EDGE760 } from "./rules.ts";
import type { PackSpec } from "./types.ts";
import { METER_PHOTO_PROPOSALS, TRANSFORMER_PHOTO_PROPOSALS, SITE_PHOTO_FLAGS } from "@eqore/agents";
import type { SiteInput, SourceClient } from "@eqore/agents";

export interface BuildOptions {
  spec?: PackSpec;
  packs?: number;
  /** Include the two real Tier-2 site photos, as if the capture task had come back. */
  withSitePhotos?: boolean;
}

export interface BuiltRecord {
  record: SiteRecord;
  report: ReadinessReport;
  runs: AgentRun[];
  /** Everything the gatekeeper refused, across every agent. Shown in the control tower. */
  rejected: Rejection[];
  /** Discrepancies a person should adjudicate but no code should resolve. */
  flags: { ref: string; issue: string }[];
  /** Contradictions only visible once the whole record is assembled. */
  inconsistencies: Inconsistency[];
  stats: {
    proposed: number;
    accepted: number;
    rejected: number;
    fieldsResolved: number;
    toolCalls: number;
    wallMs: number;
  };
}

export async function buildRecord(
  site: SiteInput,
  sources: SourceClient,
  opts: BuildOptions = {},
): Promise<BuiltRecord> {
  const { runs } = await runDiscovery(site, sources);

  const accepted: AcceptedProposal[] = runs.flatMap((r) => r.gate.accepted);
  const rejected: Rejection[] = runs.flatMap((r) => r.gate.rejected);
  const flags = [...SITE_PHOTO_FLAGS];
  let proposed = runs.reduce((n, r) => n + r.result.proposals.length, 0);

  if (opts.withSitePhotos) {
    // Tier-2 evidence goes through exactly the same gate as everything else.
    const capture: Proposal[] = [...METER_PHOTO_PROPOSALS, ...TRANSFORMER_PHOTO_PROPOSALS];
    proposed += capture.length;
    const known = Object.fromEntries([...accepted.map((a) => [a.proposal.fieldKey, a.value] as const)]);
    for (const p of capture) {
      const { accepted: a, rejection } = validateProposal(p, { known });
      if (a) accepted.push(a);
      else if (rejection) rejected.push(rejection);
    }
  }

  const record = reconcile(site.siteId, accepted);
  // Final sweep: catch contradictions that only became visible once everything landed.
  const inconsistencies = verifyRecord(record);
  const report = analyse(record, opts.spec ?? EQORE_EDGE760, opts.packs ?? 1);

  return {
    record,
    report,
    runs,
    rejected,
    flags,
    inconsistencies,
    stats: {
      proposed,
      accepted: accepted.length,
      rejected: rejected.length,
      fieldsResolved: record.fields.size,
      toolCalls: runs.reduce((n, r) => n + r.result.toolCalls.length, 0),
      wallMs: runs.reduce((n, r) => n + r.wallMs, 0),
    },
  };
}
