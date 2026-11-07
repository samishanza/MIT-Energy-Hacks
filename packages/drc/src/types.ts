// Core data model. All distances in feet, power in kW, energy in kWh, current in A.

export type SourceKind =
  | 'aerial'
  | 'site-photo'
  | 'nameplate'
  | 'bill'
  | 'interval-data'
  | 'survey'
  | 'assumed';

/** Where a value came from. `crop` is a box (0..1 fractions) inside `asset`. */
export interface Source {
  kind: SourceKind;
  label: string; // e.g. "Aerial, Esri World Imagery"
  asset?: string; // url or path to the image / pdf page
  crop?: { x: number; y: number; w: number; h: number };
  extractedBy?: 'vision-model' | 'human' | 'parser' | 'default';
}

/** A measured or extracted quantity with provenance and uncertainty. */
export interface Param {
  value: number;
  unit: string;
  source: Source;
  /** plausible low/high given the source quality; drives uncertainty ranking */
  range?: [number, number];
  /** other sources that disagree (conflict detection) */
  alternates?: { value: number; source: Source }[];
  /** what a human should do to pin this down */
  howToResolve?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'north' | 'south' | 'east' | 'west';

export interface Opening {
  id: string;
  kind: 'door' | 'window' | 'vent' | 'air-intake';
  wall: Side;
  /** offset along the wall from its west/north end, ft */
  at: Param;
  width: number;
}

export interface Site {
  id: string;
  name: string;
  city: string;
  state: 'MA' | 'NH' | 'CA';
  utility: string;
  tariff: string;
  /** rule-pack overlay ids applied on top of the base code */
  ahjOverlays: string[];
  ahjName: string;
  lot: { w: Param; h: Param };
  /** side of the lot that fronts the public road (fire access side) */
  roadSide: Side;
  building: { x: Param; y: Param; w: Param; h: Param };
  openings: Opening[];
  /** the area the owner will let us use (yard, parking strip) */
  padZone: { x: Param; y: Param; w: Param; h: Param };
  service: { voltage: Param; mainBreakerA: Param; busRatingA: Param };
  peakKW: Param;
  packs: number;
  synthetic: boolean;
  /** optional hand-placed origin; if absent the solver places the array */
  manualOrigin?: { x: number; y: number; orient: 'row-x' | 'row-y' };
}

export interface PackSpec {
  version: string;
  /** footprint width along the row, depth, and height, ft */
  w: number;
  d: number;
  h: number;
  kW: number;
  kWh: number;
  assumed: boolean;
}

export interface Placement {
  units: Rect[];
  orient: 'row-x' | 'row-y';
  spacing: number;
  solved: boolean; // found a layout with zero clearance violations
}

export type Severity = 'pass' | 'fail' | 'warn' | 'manual';

export interface Check {
  ruleId: string;
  title: string;
  cite: string;
  severity: Severity;
  measured?: number;
  required?: number;
  unit?: string;
  detail: string;
  /** geometry for the drawing: a line between the two closest points */
  witness?: { x1: number; y1: number; x2: number; y2: number };
}

export interface CompileResult {
  site: Site;
  spec: PackSpec;
  placement: Placement;
  checks: Check[];
  status: 'pass' | 'warn' | 'fail';
  electrical: {
    backfeedPerPackA: number;
    totalBackfeedA: number;
    allowanceA: number;
    method: 'load-side' | 'supply-side';
    ocpdA: number;
  };
  arrayKWh: number;
}
