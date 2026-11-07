// Tier 2. Drafts the 15-minute ask we mail a kit for.
//
// This agent proposes no field values at all — it has no sources. It reads the engine's
// list of still-blocking fields and drafts tasks for facility staff. Nothing it drafts is
// ever sent: every task leaves here as an ExternalAction and waits for a named engineer.
//
// Safety, which the gatekeeper enforces independently: no task ever asks anyone to open
// electrical equipment. Nameplates are photographed on closed gear, measurements are taken
// outside the arc-flash boundary, and anything that cannot be done that way escalates.

import { specFor } from "@eqore/catalog";
import type { CaptureTask } from "@eqore/catalog";
import type { Agent, AgentContext } from './base.ts';
import { Emit } from './base.ts';

const MINUTES = { laser_measurement: 2, nameplate_photo: 5, lidar_scan: 6, photo: 2, document_request: 0 } as const;

export const captureAgent: Agent = {
  id: 'capture',
  tier: 2,
  purpose:
    'Turns the remaining decision-blocking gaps into a short, safe capture task list for facility staff, for engineer approval.',
  tools: ['task_templates.render'],

  async run(ctx: AgentContext) {
    const e = new Emit('capture');
    e.tool('task_templates.render', { blocking: ctx.blocking.length });

    if (!ctx.blocking.length) {
      e.note('nothing is blocking a decision; no capture task is warranted');
      return e.result();
    }

    const laser: string[] = [];
    const nameplate: string[] = [];
    const lidar: string[] = [];
    const askFor: string[] = [];
    const visitOnly: string[] = [];

    for (const key of ctx.blocking) {
      const spec = specFor(key);
      if (!spec) continue;
      switch (spec.fallback?.kind) {
        case 'staff_laser':
          laser.push(key);
          break;
        case 'staff_photo_charuco':
          nameplate.push(key);
          break;
        case 'staff_lidar':
          lidar.push(key);
          break;
        // A Tier 1 fallback means someone already holds the answer on paper. Asking for
        // the document costs no staff time and beats sending anyone anywhere.
        case 'old_plan_set':
        case 'survey':
        case 'bill':
        case 'green_button':
        case 'intake_form':
          askFor.push(key);
          break;
        case 'site_visit':
          visitOnly.push(key);
          break;
        default:
          // No cheaper route left. If it is still blocking, a person has to go.
          visitOnly.push(key);
      }
    }

    const tasks: CaptureTask[] = [];

    if (nameplate.length) {
      const labels = nameplate.map((k) => specFor(k)?.label ?? k);
      tasks.push({
        id: `cap-${ctx.site.siteId}-nameplate`,
        agentId: 'capture',
        resolves: nameplate,
        kind: 'nameplate_photo',
        instruction:
          'Stand in front of the main switchgear with the doors and covers CLOSED. Tape the printed scale card flat on the closed door, next to the nameplate. ' +
          'Take three photos of the nameplate from about three feet back: one straight on, one angled left, one angled right, so at least one is free of glare. ' +
          `We are reading: ${labels.join(', ')}. ` +
          'Do not open any door, cover or dead-front, and do not remove anything. If the nameplate is not readable with the gear closed, stop and tell us.',
        touchesEnergizedEquipment: false,
        estimatedMinutes: MINUTES.nameplate_photo,
        rationale:
          `${labels.join(' and ')} cannot be resolved from public records and currently decides the interconnection method. ` +
          'A scale-card photo of the closed gear resolves it without a site visit.',
      });
    }

    if (laser.length) {
      const legs = laser.map((k) => `- ${specFor(k)?.label ?? k}`).join('\n');
      tasks.push({
        id: `cap-${ctx.site.siteId}-laser`,
        agentId: 'capture',
        resolves: laser,
        kind: 'laser_measurement',
        instruction:
          'Use the laser meter from the kit, outdoors, away from the electrical room. For each measurement below, take the reading and then photograph the laser dot on the target so we can see what was measured:\n' +
          legs +
          '\nStay on the ground, keep clear of any fenced electrical equipment, and do not climb.',
        touchesEnergizedEquipment: false,
        estimatedMinutes: MINUTES.laser_measurement * laser.length,
        rationale:
          'These distances are within the margin that decides whether the array clears its setbacks. Aerial imagery cannot resolve them to the precision the decision needs.',
      });
    }

    if (lidar.length) {
      const labels = lidar.map((k) => specFor(k)?.label ?? k);
      tasks.push({
        id: `cap-${ctx.site.siteId}-lidar`,
        agentId: 'capture',
        resolves: lidar,
        kind: 'lidar_scan',
        instruction:
          'If you have an iPhone Pro or iPad Pro, open the scanning app we sent and walk a slow loop of the electrical room, keeping about six feet from the equipment. ' +
          'Keep the switchgear, the door and the facing wall in frame. Export the scan and upload it. ' +
          `We are measuring: ${labels.join(', ')}. Do not open or touch any equipment.`,
        touchesEnergizedEquipment: false,
        estimatedMinutes: MINUTES.lidar_scan,
        rationale:
          'Working clearance and free wall space decide whether the tie-in equipment fits indoors. A room scan measures them without anyone handling the gear.',
      });
    }

    if (askFor.length) {
      const labels = askFor.map((k) => specFor(k)?.label ?? k);
      tasks.push({
        id: `cap-${ctx.site.siteId}-documents`,
        agentId: 'capture',
        resolves: askFor,
        kind: 'document_request',
        instruction:
          `Please send whatever you already have covering: ${labels.join(', ')}. ` +
          'An existing drawing, a letter from the utility, or a past study is ideal — we do not need anything new produced, ' +
          'and nobody needs to go look at the equipment.',
        touchesEnergizedEquipment: false,
        estimatedMinutes: MINUTES.document_request,
        rationale:
          `${labels.join(' and ')} is normally already documented, and the holder of that document is the authority on it. ` +
          'Asking costs no staff time and no site visit.',
      });
    }

    const total = tasks.reduce((s, t) => s + t.estimatedMinutes, 0);
    for (const task of tasks) {
      e.action({ kind: 'capture_task', task });
    }
    if (tasks.length) {
      e.note(`drafted ${tasks.length} task(s), ~${total} min of staff time, pending engineer approval`);
    }

    if (visitOnly.length) {
      const labels = visitOnly.map((k) => specFor(k)?.label ?? k);
      e.action({
        kind: 'site_visit_required',
        fieldKeys: visitOnly,
        rationale:
          `${labels.join(', ')} cannot be resolved from public records, customer documents, or anything we can safely ask facility staff to do. ` +
          'This is the only remaining route, and it needs a qualified person.',
      });
      e.note(`${visitOnly.length} field(s) have no safe remote route — escalated for a site visit decision`);
    }

    return e.result();
  },
};
