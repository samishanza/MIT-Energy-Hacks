// What the outside world hands us, before any agent interprets it.
//
// Agents read these payloads and emit Proposals. Keeping the seam here means the same
// agent code runs against a labeled fixture today and a live MassGIS / Overture / URDB
// adapter tomorrow, and the gatekeeper tests do not need the network.

import type { BBox } from "@eqore/catalog";

export interface SourceDoc {
  /** URL, file path or asset id. An engineer must be able to open this and see the value. */
  ref: string;
  label: string;
  /** True when this payload is fabricated for the demo. Propagates into every Evidence. */
  synthetic?: boolean;
}

export type Wall = 'north' | 'south' | 'east' | 'west';

export interface ParcelRecord extends SourceDoc {
  parcelId: string;
  /** Absent from MassGIS L3: the standardized assessor join is a separate request. */
  owner?: string;
  address: string;
  lotWidthFt: number;
  lotDepthFt: number;
  /** Parcel polygons are surveyed-ish but not survey grade; this drives the range. */
  toleranceFt: number;
  /** Absent from MassGIS L3. A use code is not a zoning district and must not stand in for one. */
  zoningDistrict?: string;
  roadSide?: Wall;
  floodZone?: string;
  /** Owner of the parcel across the nearest property line; named on a stamped site plan. */
  abutterOwner?: string;
}

export interface AssessorRecord extends SourceDoc {
  owner?: string;
  yearBuilt: number;
  /** Assessor building area often disagrees with the measured footprint. That is signal. */
  buildingAreaSqft: number;
}

export interface AerialOpening {
  wall: Wall;
  kind: 'door' | 'window' | 'vent' | 'air-intake';
  atFt: number;
  widthFt: number;
  /** Per-opening detection confidence from segmentation. */
  confidence: number;
  toleranceFt: number;
}

export interface AerialMeasurement extends SourceDoc {
  crop: BBox;
  /** Ground sample distance, in ft/px. Sets the floor on how precise any measurement can be. */
  gsdFtPerPx: number;
  building: { offsetXFt: number; offsetYFt: number; widthFt: number; depthFt: number; toleranceFt: number };
  padZone: { xFt: number; yFt: number; widthFt: number; depthFt: number };
  surface: 'asphalt' | 'concrete' | 'gravel' | 'grass' | 'dirt' | 'unknown';
  cableRouteFt: number;
  accessClearFt: number;
  exposureFt: number;
  openings: AerialOpening[];
  existingPvKw?: number;
}

/**
 * Building and lot extents taken from GIS vector layers rather than measured off a photo.
 * Reference grade: good enough to lay out a pad, not a survey.
 */
export interface FootprintRecord extends SourceDoc {
  /** Bounding box of the parcel polygon, in feet. */
  lot: { widthFt: number; depthFt: number };
  /** Building bbox in feet, offset from the parcel's north-west corner. */
  building: { offsetXFt: number; offsetYFt: number; widthFt: number; depthFt: number };
  /** How far off these can be, from the source layer's own accuracy statement. */
  toleranceFt: number;
  /** Published area, when the layer carries one. Cross-checks the measured bbox. */
  buildingAreaSqft?: number;
  /**
   * Every other structure on the parcel, largest first, as bboxes in the same frame.
   *
   * A commercial parcel routinely carries sheds, canopies and outbuildings alongside the
   * main plant. Clearances are measured to all of them, and a pad zone has to keep out
   * of all of them, so dropping them would understate the keep-out and overstate the yard.
   */
  otherBuildings: { offsetXFt: number; offsetYFt: number; widthFt: number; depthFt: number }[];
}

export interface ElevationSample extends SourceDoc {
  buildingHeightFt: number;
  toleranceFt: number;
}

export interface StreetLevelObservation extends SourceDoc {
  crop: BBox;
  transformer?: {
    distanceFt: number;
    toleranceFt: number;
    /** Stencilled kVA, when it is legible. Never a point value downstream: inference only. */
    stenciledKva?: number;
    legible: boolean;
  };
  knoxBox?: boolean;
}

export interface PermitRecord extends SourceDoc {
  /** A permit card is tier 0 (public portal); an archived plan set is tier 1. */
  kind: 'permit' | 'plan_set';
  permitNumber: string;
  issuedYear: number;
  description: string;
  /** Page and crop are mandatory for anything read off a scanned permit. */
  page: number;
  crop: BBox;
  serviceVoltageV?: number;
  servicePhase?: '1' | '3';
  mainBreakerA?: number;
  /** Usually absent. Old permits record the service size, not the bus rating. */
  busRatingA?: number;
  switchgearMakeModel?: string;
  spareSpaces?: number;
  availableFaultCurrentA?: number;
  occupancy?: string;
  construction?: string;
  sprinklered?: boolean;
  /** Working clearance / door / wall space, when an old plan set happens to show the room. */
  room?: { workingClearanceFt?: number; doorWidthFt?: number; wallSpaceFt?: number };
}

export interface CodeProfile extends SourceDoc {
  buildingAhj: string;
  fireAhj: string;
  building: string;
  fire: string;
  electrical: string;
  ess: string;
  localAmendments: string;
  /** Setback rule-pack overlay ids this jurisdiction implies, consumed by the Setback engine. */
  overlayIds: string[];
  zoningSetbacks?: { frontFt: number; sideFt: number; rearFt: number };
  screeningRequired?: boolean;
  /** ASCE 7 / code-table values at this location. The structural sheets need these. */
  designCriteria?: { windSpeedMph: number; snowLoadPsf: number; tempHighF: number; tempLowF: number };
}

export interface TariffRecord extends SourceDoc {
  utility: string;
  rateSchedule: string;
}

export interface HostingRecord extends SourceDoc {
  feederHostingKw: number;
  existingDgKw: number;
}

export interface HydrantRecord extends SourceDoc {
  distanceFt: number;
}

/** One extracted datum from a customer document, with the crop it came from. */
export interface DocField {
  /** Catalog field key. */
  key: string;
  value: number | string | boolean;
  unit?: string;
  page?: number;
  crop?: BBox;
  /** Extractor confidence. */
  confidence: number;
}

export interface CustomerDoc extends SourceDoc {
  kind: 'bill' | 'green_button' | 'old_plan_set' | 'intake_form';
  pages: number;
  fields: DocField[];
  /**
   * Raw text, kept so the watchdog can scan it for instruction-like content.
   * Document text is untrusted input. Nothing in here is ever treated as an instruction.
   */
  rawText?: string;
}

export interface SiteInput {
  siteId: string;
  address: string;
  city: string;
  state: 'MA' | 'NH' | 'CA';
  lat?: number;
  lon?: number;
}

/**
 * Every outside call an agent can make. One method per source, each returning a typed
 * payload or null. Agents may only call the methods their tool list names.
 */
export interface SourceClient {
  parcel(site: SiteInput): Promise<ParcelRecord | null>;
  assessor(site: SiteInput): Promise<AssessorRecord | null>;
  aerial(site: SiteInput): Promise<AerialMeasurement | null>;
  elevation(site: SiteInput): Promise<ElevationSample | null>;
  streetLevel(site: SiteInput): Promise<StreetLevelObservation | null>;
  hydrants(site: SiteInput): Promise<HydrantRecord | null>;
  /** Vector extents, where an aerial image read is unavailable. */
  footprint?(site: SiteInput): Promise<FootprintRecord | null>;
  permitRecords(site: SiteInput): Promise<PermitRecord[]>;
  codeTable(site: SiteInput): Promise<CodeProfile | null>;
  tariff(site: SiteInput): Promise<TariffRecord | null>;
  hostingCapacity(site: SiteInput): Promise<HostingRecord | null>;
  customerDocs(site: SiteInput): Promise<CustomerDoc[]>;
}
