// Tier 0. Tariff and feeder-level interconnection facts.

import type { Agent, AgentContext } from './base';
import { Emit } from './base';

export const utilityAgent: Agent = {
  id: 'utility',
  tier: 0,
  purpose: 'Serving utility, rate schedule, feeder hosting capacity and existing generation on the feeder.',
  tools: ['openei.urdb', 'hosting_map.query'],

  async run(ctx: AgentContext) {
    const e = new Emit('utility');

    e.tool('openei.urdb', { address: ctx.site.address, state: ctx.site.state });
    const t = await ctx.sources.tariff(ctx.site);

    if (t) {
      e.propose('utility.name', t.utility, t, 'tariff_db', {
        confidence: 0.9,
        rationale: 'Serving utility for this service territory.',
      });
      e.propose('utility.rate_schedule', t.rateSchedule, t, 'tariff_db', {
        confidence: 0.6,
        rationale:
          'Most likely schedule for a C&I customer of this size in this territory. The bill is authoritative — this is a starting point, not the account’s actual rate.',
      });
    } else {
      e.miss('utility.name', 'utility.rate_schedule');
    }

    e.tool('hosting_map.query', { address: ctx.site.address });
    const h = await ctx.sources.hostingCapacity(ctx.site);

    if (h) {
      e.propose('utility.feeder_hosting_capacity_kw', h.feederHostingKw, h, 'hosting_map', {
        unit: 'kW',
        range: [Math.round(h.feederHostingKw * 0.8), Math.round(h.feederHostingKw * 1.2)],
        confidence: 0.5,
        rationale:
          'Published hosting capacity at this feeder. These maps are refreshed on a lag and are indicative only; the utility’s study governs.',
      });
      e.propose('utility.existing_dg_kw', h.existingDgKw, h, 'hosting_map', {
        unit: 'kW',
        confidence: 0.55,
        rationale:
          'Distributed generation already interconnected on this feeder. Generation already on the account reduces the NEC 705.12 allowance available to us.',
      });
    } else {
      e.miss('utility.feeder_hosting_capacity_kw', 'utility.existing_dg_kw');
      e.note('no hosting-capacity layer published for this feeder');
    }

    return e.result();
  },
};
