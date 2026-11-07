// Option 1 shared contract: how a value enters the site record.
//
// Rule: agents PROPOSE, the gatekeeper validates, deterministic code DECIDES.
// No agent writes a Field directly. Every Proposal carries Evidence or it is rejected.

/** Cheapest evidence first. 0 public remote, 1 customer docs, 2 guided staff capture, 3 site visit. */
export type Tier = 0 | 1 | 2 | 3;

export type SourceKind =
  // Tier 0 — public, remote, no one on site
  | 'parcel'
  | 'assessor'
  | 'aerial'
  | 'lidar_3dep'
  | 'street_level'
  | 'permit_record'
  | 'tariff_db'
  | 'hosting_map'
  | 'code_table'
  | 'flood_map'
  | 'hydrant_gis'
  // Tier 1 — the customer sends us something
  | 'old_plan_set'
  /**
   * A recorded plot plan or boundary survey. Distinct from a plan set: it is the only
   * source that carries survey-grade bearings and distances, which is what a stamped
   * site plan needs for a lot-line setback. No tape measure substitutes for it.
   */
  | 'survey'
  | 'bill'
  | 'green_button'
  | 'intake_form'
  // Tier 2 — facility staff, 15 minutes, mailed kit
  | 'staff_laser'
  /** A plain phone photo of equipment, no scale card. Readable, but not measurable. */
  | 'staff_photo'
  | 'staff_photo_charuco'
  | 'staff_lidar'
  | 'meter_reader'
  // Tier 3 — someone drives there
  | 'site_visit'
  // a human overrides
  | 'engineer';

export const SOURCE_TIER: Record<SourceKind, Tier> = {
  parcel: 0,
  assessor: 0,
  aerial: 0,
  lidar_3dep: 0,
  street_level: 0,
  permit_record: 0,
  tariff_db: 0,
  hosting_map: 0,
  code_table: 0,
  flood_map: 0,
  hydrant_gis: 0,
  old_plan_set: 1,
  survey: 1,
  bill: 1,
  green_button: 1,
  intake_form: 1,
  staff_laser: 2,
  staff_photo: 2,
  staff_photo_charuco: 2,
  staff_lidar: 2,
  meter_reader: 2,
  site_visit: 3,
  engineer: 3,
};

/** Region of an image or PDF page a value was read from, as 0..1 fractions. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1-indexed page, for multi-page plan sets and bills. */
  page?: number;
}

export interface Evidence {
  sourceKind: SourceKind;
  tier: Tier;
  /** URL, file path, or asset id. An engineer must be able to open this. */
  ref: string;
  /** Required when the source is an image or a PDF page. Enforced by the gatekeeper. */
  crop?: BBox;
  extractedBy: 'agent' | 'parser' | 'human' | 'deterministic';
  agentId?: string;
  timestamp: string;
  /** Short human-readable label for the review queue, e.g. "Holliston permit #B-2014-0391, sheet E-1". */
  label: string;
  /** True when the underlying asset is fabricated for the demo. Surfaced in the UI. */
  synthetic?: boolean;
}

/** Image and page sources must carry a crop: an engineer has to see where the number came from. */
export const CROP_REQUIRED_SOURCES: SourceKind[] = [
  'aerial',
  'street_level',
  'permit_record',
  'old_plan_set',
  'survey',
  'bill',
  'staff_photo',
  'staff_photo_charuco',
  'staff_lidar',
];

export type FieldStatus = 'found' | 'inferred' | 'conflict' | 'missing' | 'quarantined';

export type FieldValue = number | string | boolean | null;

export interface Field {
  key: string;
  value: FieldValue;
  unit?: string;
  /** Plausible low/high. A field with a range is a candidate for value-of-information ranking. */
  range?: [number, number];
  /** 0..1. Agent-reported, then adjusted by the engine from source precedence and agreement. */
  confidence: number;
  status: FieldStatus;
  /** Every source, including the ones that disagree. Disagreement is signal, not noise. */
  evidence: Evidence[];
  /** Sheet ids this field is required by, e.g. ["E-101 single-line"]. */
  neededBy: string[];
  /** Computed by the engine, not by an agent: how tight this value has to be to decide. */
  requiredPrecision?: number;
  /** Computed by the engine: would a plausible alternative value change the design? */
  blocksDecision: boolean;
}

/** What an agent is allowed to emit. It is a request to write, not a write. */
export interface Proposal {
  agentId: string;
  fieldKey: string;
  value: FieldValue;
  unit?: string;
  range?: [number, number];
  /** REQUIRED. A proposal without evidence is rejected, with no exception. */
  evidence: Evidence;
  /** Agent's own confidence, 0..1. The engine may lower it; it never raises it. */
  confidence: number;
  /** Short, for the engineer review queue. Why the agent believes this. */
  rationale: string;
  /** True when the agent derived rather than read the value. Forces a range. */
  inferred?: boolean;
}

/** Tier 2: a task we would ask facility staff to do. Never sent without engineer approval. */
export interface CaptureTask {
  id: string;
  agentId: string;
  /** Field keys this task would resolve. */
  resolves: string[];
  kind: 'laser_measurement' | 'nameplate_photo' | 'lidar_scan' | 'photo' | 'document_request';
  instruction: string;
  /** Equipment the task involves, so the safety rule can be checked deterministically. */
  touchesEnergizedEquipment: boolean;
  estimatedMinutes: number;
  rationale: string;
}

/** Anything that leaves our system and reaches a human outside the team. */
export type ExternalAction =
  | { kind: 'capture_task'; task: CaptureTask }
  | { kind: 'customer_message'; body: string; fieldKeys: string[] }
  | { kind: 'site_visit_required'; fieldKeys: string[]; rationale: string };

export interface AgentResult {
  agentId: string;
  proposals: Proposal[];
  /** Routed to the engineer approval queue by the gatekeeper. Never executed by the agent. */
  externalActions: ExternalAction[];
  /** What the agent looked at, for the watchdog's loop detection and cost accounting. */
  toolCalls: { tool: string; args: Record<string, unknown> }[];
  /** Fields the agent looked for and could not resolve from its own sources. */
  couldNotResolve: string[];
  notes?: string;
}

export const nowIso = () => new Date().toISOString();
