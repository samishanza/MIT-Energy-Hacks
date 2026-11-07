// Tier 0. Jurisdiction to code editions, from a static table.
//
// This agent reads a table. It does not reason about code and it does not invent section
// numbers: an unmapped jurisdiction comes back as missing, not as a guess. The adopted
// edition changes the setbacks the Setback rule pack applies, so a wrong answer here is
// worse than no answer.

import type { Agent, AgentContext } from './base.ts';
import { Emit } from './base.ts';

export const codeAgent: Agent = {
  id: 'code',
  tier: 0,
  purpose:
    'Codes and editions in force, the building and fire authorities, local ESS amendments and bylaw setbacks, from a maintained jurisdiction table.',
  tools: ['code_table.lookup'],

  async run(ctx: AgentContext) {
    const e = new Emit('code');

    e.tool('code_table.lookup', { city: ctx.site.city, state: ctx.site.state });
    const c = await ctx.sources.codeTable(ctx.site);

    if (!c) {
      e.miss(
        'ahj.building',
        'ahj.fire',
        'codes.building',
        'codes.fire',
        'codes.electrical',
        'codes.ess',
        'codes.local_amendments',
      );
      e.note(
        `${ctx.site.city}, ${ctx.site.state} is not in the jurisdiction table. A person has to add it; this agent will not infer an adopted edition.`,
      );
      return e.result();
    }

    e.propose('ahj.building', c.buildingAhj, c, 'code_table', {
      confidence: 0.9,
      rationale: 'Building authority for this municipality.',
    });
    e.propose('ahj.fire', c.fireAhj, c, 'code_table', {
      confidence: 0.9,
      rationale: 'Fire authority with ESS plan-review jurisdiction here.',
    });
    e.propose('codes.building', c.building, c, 'code_table', {
      confidence: 0.85,
      rationale: 'Building code edition recorded as adopted. Confirm with the AHJ before submittal.',
    });
    e.propose('codes.fire', c.fire, c, 'code_table', {
      confidence: 0.85,
      rationale: 'Fire code edition recorded as adopted.',
    });
    e.propose('codes.electrical', c.electrical, c, 'code_table', {
      confidence: 0.85,
      rationale: 'Electrical code edition recorded as adopted.',
    });
    e.propose('codes.ess', c.ess, c, 'code_table', {
      confidence: 0.8,
      rationale:
        'ESS standard edition recorded as adopted. This selects which NFPA 855 setbacks the rule pack applies, so it is worth confirming directly with the fire AHJ.',
    });
    e.propose('codes.local_amendments', c.localAmendments, c, 'code_table', {
      confidence: 0.7,
      rationale:
        c.overlayIds.length
          ? `Local amendments on file; maps to Setback overlays [${c.overlayIds.join(', ')}].`
          : 'No local ESS amendments on file for this jurisdiction.',
    });

    if (c.zoningSetbacks) {
      const z = c.zoningSetbacks;
      const note =
        'Bylaw setback, distinct from the fire-code separation. Both apply and the stricter one governs.';
      e.propose('zoning.setback_front_ft', z.frontFt, c, 'code_table', {
        unit: 'ft', confidence: 0.75, rationale: note,
      });
      e.propose('zoning.setback_side_ft', z.sideFt, c, 'code_table', {
        unit: 'ft', confidence: 0.75, rationale: note,
      });
      e.propose('zoning.setback_rear_ft', z.rearFt, c, 'code_table', {
        unit: 'ft', confidence: 0.75, rationale: note,
      });
    } else {
      e.miss('zoning.setback_front_ft', 'zoning.setback_side_ft', 'zoning.setback_rear_ft');
      e.note('bylaw setbacks not in the table for this district; read the bylaw');
    }

    if (c.designCriteria) {
      const d = c.designCriteria;
      e.propose('design.wind_speed_mph', d.windSpeedMph, c, 'code_table', {
        unit: 'mph',
        confidence: 0.85,
        rationale:
          'ASCE 7 ultimate design wind speed at this location. The anchor and weld schedule is sized from it, so a wrong value shows up as an under-designed foundation.',
      });
      e.propose('design.snow_load_psf', d.snowLoadPsf, c, 'code_table', {
        unit: 'psf',
        confidence: 0.85,
        rationale: 'Ground snow load at this location; combines with dead load in the overturning check.',
      });
      e.propose('design.temp_high_f', d.tempHighF, c, 'code_table', {
        unit: 'degF',
        confidence: 0.8,
        rationale: 'High design temperature; bounds thermal-management duty and conductor ampacity correction.',
      });
      e.propose('design.temp_low_f', d.tempLowF, c, 'code_table', {
        unit: 'degF',
        confidence: 0.8,
        rationale: 'Low design temperature; bounds cold-weather battery derate and frost depth for the conduit run.',
      });
    } else {
      e.miss('design.wind_speed_mph', 'design.snow_load_psf', 'design.temp_high_f', 'design.temp_low_f');
      e.note('no design criteria in the table for this location; look them up in ASCE 7 before the structural sheets');
    }

    if (c.screeningRequired !== undefined) {
      e.propose('zoning.screening_required', c.screeningRequired, c, 'code_table', {
        confidence: 0.7,
        rationale: 'Screening requirement for outdoor equipment in this district.',
      });
    } else {
      e.miss('zoning.screening_required');
    }

    return e.result();
  },
};
