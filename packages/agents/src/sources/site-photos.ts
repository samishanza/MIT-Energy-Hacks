// REAL EVIDENCE — not synthetic, and deliberately not marked as such.
//
// Two phone photos from the Century Tywood site: the revenue meter and the utility
// transformer. Per EQORE, this is the entire set of site photos available for this
// project. That makes them the most honest test the system has.
//
// Transcribed by reading the images. Values are recorded exactly as printed; anything
// ambiguous carries a range or is left out, and nothing is inferred from what a value
// "ought" to be.
//
// The finding, which is the argument for this whole project:
//
//   Both photos are rich in IDENTIFIERS and contain not one RATING.
//
//   The meter gives its type, serial, form and both transformer ratios — but the
//   "Mult. by" box on its face is blank. The transformer label gives manufacturer,
//   catalogue number, serial, workorder, stock number and shipping weight — and no kVA,
//   no voltage, no impedance.
//
//   So neither photo moves the two fields that are actually blocking the design
//   (switchgear bus rating, transformer kVA). What they do supply is the exact keys
//   needed to ASK the right party for them: a Howard Industries catalogue number, and
//   an Eversource/NSTAR account tied to meter 08105653. The next action is a document
//   request, not a site visit — and nobody needed to be on site to work that out.

import type { Proposal } from "@eqore/catalog";
import { nowIso } from "@eqore/catalog";

const METER_REF = 'site-photos/revenue-meter.jpg';
const XFMR_REF = 'site-photos/transformer.jpg';

const meterEvidence = (crop: { x: number; y: number; w: number; h: number }) => ({
  sourceKind: 'staff_photo' as const,
  tier: 2 as const,
  ref: METER_REF,
  label: 'Site photo: revenue meter, Honeywell A39SM (real)',
  crop,
  extractedBy: 'agent' as const,
  agentId: 'capture_result',
  timestamp: nowIso(),
});

const xfmrEvidence = (crop: { x: number; y: number; w: number; h: number }) => ({
  sourceKind: 'staff_photo' as const,
  tier: 2 as const,
  ref: XFMR_REF,
  label: 'Site photo: pad-mount transformer label, Howard Industries (real)',
  crop,
  extractedBy: 'agent' as const,
  agentId: 'capture_result',
  timestamp: nowIso(),
});

/**
 * What the revenue meter photo actually resolves.
 *
 * Note what is NOT here: no bus rating, no main breaker, no service capacity. A revenue
 * meter tells you about the metering, not about the gear behind it.
 */
export const METER_PHOTO_PROPOSALS: Proposal[] = [
  {
    agentId: 'capture_result',
    fieldKey: 'electrical.revenue_meter_model',
    value: 'Honeywell A39SM',
    confidence: 0.96,
    rationale: 'TYPE A39SM printed top-left of the faceplate, Honeywell brand mark beside the serial.',
    evidence: meterEvidence({ x: 0.3, y: 0.34, w: 0.3, h: 0.04 }),
  },
  {
    agentId: 'capture_result',
    fieldKey: 'electrical.revenue_meter_serial',
    value: '08105653',
    confidence: 0.97,
    rationale:
      'SERIAL # 08105653, corroborated by the barcode string KZG08105653UBC33 lower on the same label.',
    evidence: meterEvidence({ x: 0.28, y: 0.53, w: 0.34, h: 0.045 }),
  },
  {
    agentId: 'capture_result',
    fieldKey: 'electrical.meter_form',
    value: '9S',
    confidence: 0.93,
    rationale:
      '"FM 9S Watthour Meter" and a separate "9S" mark. Form 9S is transformer-rated, which is why CTs exist on this service at all.',
    evidence: meterEvidence({ x: 0.3, y: 0.62, w: 0.26, h: 0.035 }),
  },
  {
    agentId: 'capture_result',
    fieldKey: 'electrical.ct_ratio',
    value: 5,
    confidence: 0.82,
    rationale:
      'CTR field on the faceplate reads ":5". Printed small and partly in shadow, so worth a second look before any demand figure rests on it.',
    evidence: meterEvidence({ x: 0.62, y: 0.37, w: 0.16, h: 0.03 }),
  },
  {
    agentId: 'capture_result',
    fieldKey: 'electrical.vt_ratio',
    value: 1,
    confidence: 0.85,
    rationale: 'VTR field reads ":1", consistent with a direct voltage connection at 480 V.',
    evidence: meterEvidence({ x: 0.62, y: 0.34, w: 0.16, h: 0.03 }),
  },
  {
    agentId: 'capture_result',
    fieldKey: 'electrical.service_voltage_v',
    value: 480,
    unit: 'V',
    range: [120, 480],
    inferred: true,
    confidence: 0.35,
    rationale:
      'The faceplate states the meter RANGE, "CL20, 120 TO 480V, 4W, 60Hz" — that is what the meter can accept, not what this service runs at. Recorded only as a bound; the 2003 permit is the better evidence for the actual 480 V.',
    evidence: meterEvidence({ x: 0.3, y: 0.655, w: 0.33, h: 0.03 }),
  },
];

/**
 * What the transformer photo resolves — which is to say, who made it and nothing about
 * what it can do. The kVA rating that the interconnection study needs is not on this label.
 */
export const TRANSFORMER_PHOTO_PROPOSALS: Proposal[] = [
  {
    agentId: 'capture_result',
    fieldKey: 'electrical.switchgear_make_model',
    value: 'Howard Industries pad-mount, catalogue 9185-435488-017',
    confidence: 0.9,
    rationale:
      'HOWARD INDUSTRIES, INC with CATALOG NUMBER 9185-435488-017. The catalogue number is the key to request the rating from the manufacturer or from Eversource.',
    evidence: xfmrEvidence({ x: 0.33, y: 0.28, w: 0.3, h: 0.06 }),
  },
];

/**
 * Fields a reader might expect these photos to settle, and which they do not.
 * Asserted in tests so nobody later "improves" an inference into this gap.
 */
export const NOT_RESOLVED_BY_SITE_PHOTOS = [
  'electrical.bus_rating_a',
  'electrical.main_breaker_a',
  'electrical.transformer_kva',
  'electrical.ct_multiplier',
  'load.peak_kw',
] as const;

/**
 * Discrepancies a person should look at. Reported, never auto-resolved.
 */
export const SITE_PHOTO_FLAGS = [
  {
    ref: XFMR_REF,
    issue:
      'The upper barcode reads 2808583614 while the lower "MFG SERIAL NUMBER" reads HI2803583614. ' +
      'Those differ in the fourth digit (8 vs 3). One is a misread or the labels genuinely disagree; ' +
      'either way a human should confirm which serial to quote when requesting the rating. ' +
      'The plan set quotes 2808583614.',
  },
  {
    ref: XFMR_REF,
    issue:
      'Customer name on the label is NSTAR SERVICES. NSTAR is the predecessor utility to Eversource, ' +
      'which corroborates the territory correction made earlier — but it also means the label predates ' +
      'the current utility branding, so the equipment is not new.',
  },
  {
    ref: METER_REF,
    issue:
      'The "Mult. by" box on the meter face is blank. CTR and VTR are both printed, so the billing ' +
      'multiplier should be derived as their product and reconciled against the bill, not read off the meter.',
  },
];
