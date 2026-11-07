// Tier 0/1. Old electrical permits and archived plan sets from the town portal.
//
// This is where the electrical facts come from when we are lucky. Everything read off a
// scanned page carries its page and crop — the gatekeeper rejects it otherwise, because
// an engineer cannot check a number they cannot see in context.

import type { Agent, AgentContext } from './base';
import { Emit } from './base';
import type { PermitRecord } from "./sources/types";

/** Newest record wins when two permits disagree; both are still proposed. */
const byNewest = (a: PermitRecord, b: PermitRecord) => b.issuedYear - a.issuedYear;

export const recordsAgent: Agent = {
  id: 'records',
  tier: 0,
  purpose:
    'Service size, switchgear data and equipment-room geometry from archived electrical permits and plan sets.',
  tools: ['permit_portal.search', 'permit_portal.fetch', 'docling.parse'],

  async run(ctx: AgentContext) {
    const e = new Emit('records');

    e.tool('permit_portal.search', { address: ctx.site.address, city: ctx.site.city });
    const records = (await ctx.sources.permitRecords(ctx.site)).slice().sort(byNewest);

    if (!records.length) {
      e.miss(
        'electrical.service_voltage_v',
        'electrical.service_phase',
        'electrical.bus_rating_a',
        'electrical.main_breaker_a',
        'electrical.switchgear_make_model',
        'electrical.spare_spaces',
        'room.working_clearance_ft',
      );
      e.note('no electrical permits found in the town portal for this address');
      return e.result();
    }

    for (const r of records) {
      e.tool('permit_portal.fetch', { permitNumber: r.permitNumber });
      e.tool('docling.parse', { ref: r.ref, page: r.page });

      const kind = r.kind === 'plan_set' ? 'old_plan_set' : 'permit_record';
      const where = { crop: r.crop, page: r.page };
      const cite = `${r.permitNumber} (${r.issuedYear}), page ${r.page}`;
      const age = new Date().getFullYear() - r.issuedYear;
      /** A 2003 permit describes the service as built in 2003, not as it stands today. */
      const aged = age > 10 ? ` Record is ${age} years old; the service may have been altered since.` : '';

      if (r.serviceVoltageV !== undefined) {
        e.propose('electrical.service_voltage_v', r.serviceVoltageV, r, kind, {
          unit: 'V',
          confidence: age > 10 ? 0.75 : 0.9,
          rationale: `Service voltage on ${cite}.${aged}`,
          ...where,
        });
      }
      if (r.servicePhase !== undefined) {
        e.propose('electrical.service_phase', r.servicePhase, r, kind, {
          confidence: age > 10 ? 0.75 : 0.9,
          rationale: `Service phase on ${cite}.${aged}`,
          ...where,
        });
      }
      if (r.mainBreakerA !== undefined) {
        e.propose('electrical.main_breaker_a', r.mainBreakerA, r, kind, {
          unit: 'A',
          confidence: age > 10 ? 0.7 : 0.85,
          rationale: `Main breaker / service size on ${cite}.${aged}`,
          ...where,
        });
      }

      // The decisive field. Permits record the service size; they rarely record the bus.
      if (r.busRatingA !== undefined) {
        e.propose('electrical.bus_rating_a', r.busRatingA, r, kind, {
          unit: 'A',
          confidence: age > 10 ? 0.7 : 0.85,
          rationale:
            `Switchgear bus rating stated on ${cite}. This sets the NEC 705.12 allowance, so it decides load-side versus supply-side.${aged}`,
          ...where,
        });
      }

      if (r.switchgearMakeModel) {
        e.propose('electrical.switchgear_make_model', r.switchgearMakeModel, r, kind, {
          confidence: 0.8,
          rationale: `Switchgear make and model on ${cite}.`,
          ...where,
        });
      }
      if (r.spareSpaces !== undefined) {
        e.propose('electrical.spare_spaces', r.spareSpaces, r, kind, {
          confidence: age > 10 ? 0.4 : 0.7,
          rationale:
            `Spare spaces counted on the panel schedule in ${cite}. Spares get consumed over time, so treat this as an upper bound.${aged}`,
          ...where,
        });
      }
      if (r.availableFaultCurrentA !== undefined) {
        e.propose('electrical.available_fault_current_a', r.availableFaultCurrentA, r, kind, {
          unit: 'A',
          confidence: 0.6,
          rationale: `Available fault current noted on ${cite}. The utility is the authority on this; confirm with them.${aged}`,
          ...where,
        });
      }

      if (r.occupancy) {
        e.propose('site.occupancy_type', r.occupancy, r, kind, {
          confidence: 0.8,
          rationale: `Occupancy classification on ${cite}.`,
          ...where,
        });
      }
      if (r.construction) {
        e.propose('site.construction_type', r.construction, r, kind, {
          confidence: 0.8,
          rationale: `Construction type on ${cite}.`,
          ...where,
        });
      }
      if (r.sprinklered !== undefined) {
        e.propose('fire.sprinklered', r.sprinklered, r, kind, {
          confidence: 0.75,
          rationale: `Sprinkler coverage indicated on ${cite}.`,
          ...where,
        });
      }

      if (r.room) {
        const m = r.room;
        if (m.workingClearanceFt !== undefined) {
          e.propose('room.working_clearance_ft', m.workingClearanceFt, r, kind, {
            unit: 'ft',
            range: [m.workingClearanceFt - 1, m.workingClearanceFt + 1],
            confidence: 0.5,
            rationale:
              `Scaled off the equipment-room plan in ${cite}. Scaled dimensions off an old sheet are soft; NEC 110.26 clearance is worth a LiDAR scan if it is tight.${aged}`,
            ...where,
          });
        }
        if (m.doorWidthFt !== undefined) {
          e.propose('room.door_width_ft', m.doorWidthFt, r, kind, {
            unit: 'ft',
            confidence: 0.6,
            rationale: `Door width scaled from the room plan in ${cite}.`,
            ...where,
          });
        }
        if (m.wallSpaceFt !== undefined) {
          e.propose('room.wall_space_ft', m.wallSpaceFt, r, kind, {
            unit: 'ft',
            confidence: 0.45,
            rationale: `Free wall run scaled from ${cite}; obstructions added since will not show.${aged}`,
            ...where,
          });
        }
      }
    }

    // Report what the archive could not give us. This is what drives Tier 2.
    const resolved = new Set(e.proposals.map((p) => p.fieldKey));
    for (const key of [
      'electrical.bus_rating_a',
      'electrical.spare_spaces',
      'electrical.switchgear_make_model',
      'electrical.available_fault_current_a',
      'room.working_clearance_ft',
    ]) {
      if (!resolved.has(key)) e.miss(key);
    }
    if (!resolved.has('electrical.bus_rating_a')) {
      e.note(
        'permits state the service size but not the switchgear bus rating — the usual case, and the usual reason for a site visit',
      );
    }

    return e.result();
  },
};
