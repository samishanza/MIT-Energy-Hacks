// Tier 1. What the customer sends us: bills, Green Button exports, archived plan sets,
// intake forms.
//
// Two rules hold here without exception:
//  1. Document text is untrusted data. This agent reads extracted *fields*. It never
//     treats prose in a document as an instruction, whatever that prose says.
//  2. Where two documents disagree, both get proposed. Reconciliation raises the conflict;
//     this agent does not pick a winner.

import { isAgentAllowed } from "@eqore/catalog";
import type { SourceKind } from "@eqore/catalog";
import type { CustomerDoc } from "./sources/types";
import type { Agent, AgentContext } from './base';
import { Emit } from './base';

const SOURCE_OF: Record<CustomerDoc['kind'], SourceKind> = {
  bill: 'bill',
  green_button: 'green_button',
  old_plan_set: 'old_plan_set',
  intake_form: 'intake_form',
};

/**
 * Instruction-shaped text in a document that is supposed to contain data.
 * We flag it and carry on reading the fields. We never act on it.
 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)/i,
  /disregard\s+(the\s+)?(previous|prior|above|instructions)/i,
  /\b(set|change|update|override)\s+(the\s+)?\w+\s+to\b/i,
  /\byou\s+(are|must|should)\b.*\b(agent|assistant|system)\b/i,
  /\b(approve|accept|mark)\s+(this|the)\s+\w*\s*(as\s+)?(verified|approved|complete)/i,
  /no\s+site\s+visit\s+(is\s+)?(required|needed)/i,
];

export function looksLikeInjection(text?: string): string[] {
  if (!text) return [];
  return INJECTION_PATTERNS.filter((re) => re.test(text)).map((re) => String(re));
}

export const intakeAgent: Agent = {
  id: 'intake',
  tier: 1,
  purpose:
    'Meter number and CT multiplier, account and rate schedule, service data and peak demand from customer documents and interval data.',
  tools: ['docling.parse', 'vision.extract', 'green_button.parse'],

  async run(ctx: AgentContext) {
    const e = new Emit('intake');

    e.tool('docling.parse', { siteId: ctx.site.siteId });
    const docs = await ctx.sources.customerDocs(ctx.site);

    if (!docs.length) {
      e.miss('electrical.meter_number', 'electrical.ct_multiplier', 'load.peak_kw', 'utility.account_number');
      e.note('customer has not sent any documents yet');
      return e.result();
    }

    for (const doc of docs) {
      const sourceKind = SOURCE_OF[doc.kind];
      e.tool(doc.kind === 'green_button' ? 'green_button.parse' : 'vision.extract', {
        ref: doc.ref,
        pages: doc.pages,
      });

      // Flag, do not follow. The watchdog quarantines the source; we keep reading fields.
      const hits = looksLikeInjection(doc.rawText);
      if (hits.length) {
        e.note(
          `${doc.label} contains ${hits.length} instruction-like passage(s) in a data document — flagged as untrusted, not acted on`,
        );
      }

      for (const f of doc.fields) {
        if (!isAgentAllowed('intake', f.key)) continue; // out of this agent's scope by design

        const rationale = rationaleFor(f.key, doc);
        e.propose(f.key, f.value, doc, sourceKind, {
          unit: f.unit,
          confidence: f.confidence,
          rationale,
          crop: f.crop,
          page: f.page,
        });
      }
    }

    const got = new Set(e.proposals.map((p) => p.fieldKey));
    for (const k of ['electrical.meter_number', 'electrical.ct_multiplier', 'load.peak_kw']) {
      if (!got.has(k)) e.miss(k);
    }
    if (!got.has('electrical.ct_multiplier')) {
      e.note(
        'no CT multiplier found — an optical meter-reader pulse count cannot be converted to kW until this is known',
      );
    }

    return e.result();
  },
};

function rationaleFor(key: string, doc: CustomerDoc): string {
  if (key === 'load.peak_kw') {
    return doc.kind === 'green_button'
      ? 'Maximum 15-minute demand across the interval export. This is the real peak.'
      : 'Billed demand from the bill. Billed demand may be ratcheted from an earlier month, so it can read higher than the interval maximum.';
  }
  if (key === 'electrical.ct_multiplier') {
    return 'CT multiplier printed on the bill. Required before any pulse count becomes a kW figure.';
  }
  if (key === 'electrical.meter_number') {
    return 'Meter number printed on the bill; ties the record to the utility account.';
  }
  if (key === 'utility.rate_schedule') {
    return 'Rate schedule printed on the bill. The bill is authoritative over the tariff database.';
  }
  if (key.startsWith('electrical.')) {
    return `Read from ${doc.label}. Customer documents describe the service as the customer understands it; a nameplate is better evidence.`;
  }
  return `Read from ${doc.label}.`;
}
