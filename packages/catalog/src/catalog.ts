// The field catalog is derived from what a plan set requires, not from what is easy to scrape.
//
// Sources used to derive it: Woodside CA ESS submittal requirements, NYC DOB battery
// application checklist, IFC/CFC 1207.1.5 construction documents, NYSERDA BESS model permit.
// TODO(schema owner): refine against EQORE's own sample plan sets once we have them.
//
// This file is the shared contract. One named owner changes it (decision.md D5).

import type { SourceKind, Tier } from './types.ts';

export type AgentId =
  | 'parcel'
  | 'imagery'
  | 'records'
  | 'utility'
  | 'code'
  | 'intake'
  | 'capture'
  /**
   * Turns returned Tier-2 evidence (a nameplate photo, a laser reading, a room scan)
   * into proposals. Deliberately separate from `capture`, which only drafts the ask and
   * may never write a value, and from `records`, which reads public archives.
   *
   * Its permissions are not listed per field: it may write exactly those fields the
   * catalog already says a staff capture can resolve. See isAgentAllowed.
   */
  | 'capture_result'
  /**
   * The first-party collection pipeline reading public machine-readable layers.
   *
   * It is not any one agent — it reads parcels, footprints, elevation and grid layers in
   * one pass — so a single agent identity would either refuse half its legitimate output
   * or have to be given everything. Its permission is derived instead: see isAgentAllowed.
   */
  | 'collector';

/** Plan-set sheets. E-xxx ids match the sheets the Setback engine already draws. */
export const SHEETS = {
  COVER: 'G-001 cover',
  SITE_PLAN: 'E-001 site plan',
  ONE_LINE: 'E-101 single-line',
  ELEVATION: 'E-201 elevation',
  BOM: 'E-301 BOM',
  EQUIP_ROOM: 'E-401 equipment room',
  FIRE: 'FP-101 fire protection',
  ZONING: 'Z-101 zoning',
  INTERCONNECT: 'IX-101 interconnection',
} as const;

export type SheetId = (typeof SHEETS)[keyof typeof SHEETS];

export type Bounds =
  /** `standard` lists the only values the real world ships, e.g. switchgear bus ratings. */
  | { kind: 'number'; min: number; max: number; standard?: number[] }
  | { kind: 'enum'; values: string[] }
  | { kind: 'string'; maxLength?: number }
  | { kind: 'boolean' };

export interface FieldSpec {
  key: string;
  label: string;
  unit?: string;
  bounds: Bounds;
  /** Which sheets cannot be drawn without this value. */
  neededBy: SheetId[];
  /** Only these agents may propose this key. Anything else is an out-of-scope write. */
  allowedAgents: AgentId[];
  /** Where we look first, and what it costs us. */
  cheapestSource: { kind: SourceKind; tier: Tier };
  /** What we fall back to when the cheapest source cannot resolve it. */
  fallback?: { kind: SourceKind; tier: Tier };
  /** Dotted path in the Setback `Site` model, for export_to_setback(). */
  setbackPath?: string;
  /** This field may only ever be inferred with a range, never read as a point value. */
  inferredOnly?: boolean;
  notes?: string;
}

/** Switchgear bus ratings are not continuous. A proposal of 1750 A is an extraction error. */
export const STANDARD_BUS_RATINGS_A = [400, 600, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000];
export const STANDARD_BREAKER_A = [
  100, 125, 150, 200, 225, 250, 300, 400, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000,
];
export const SERVICE_VOLTAGES_V = [208, 240, 277, 480, 600, 4160, 13800];

const T0 = (kind: SourceKind) => ({ kind, tier: 0 as Tier });
const T1 = (kind: SourceKind) => ({ kind, tier: 1 as Tier });
const T2 = (kind: SourceKind) => ({ kind, tier: 2 as Tier });
const T3 = (kind: SourceKind) => ({ kind, tier: 3 as Tier });

export const FIELD_CATALOG: FieldSpec[] = [
  // ---------------------------------------------------------------- cover sheet
  {
    key: 'site.address',
    label: 'Street address',
    bounds: { kind: 'string', maxLength: 200 },
    neededBy: [SHEETS.COVER, SHEETS.SITE_PLAN],
    allowedAgents: ['parcel'],
    cheapestSource: T0('parcel'),
  },
  {
    key: 'site.parcel_id',
    label: 'Assessor parcel ID',
    bounds: { kind: 'string', maxLength: 60 },
    neededBy: [SHEETS.COVER],
    allowedAgents: ['parcel'],
    cheapestSource: T0('parcel'),
  },
  {
    key: 'site.owner',
    label: 'Property owner of record',
    bounds: { kind: 'string', maxLength: 200 },
    neededBy: [SHEETS.COVER],
    allowedAgents: ['parcel'],
    cheapestSource: T0('assessor'),
  },
  {
    key: 'site.year_built',
    label: 'Year built',
    bounds: { kind: 'number', min: 1700, max: 2026 },
    neededBy: [SHEETS.COVER],
    allowedAgents: ['parcel'],
    cheapestSource: T0('assessor'),
    notes: 'Proxy for the NEC edition the existing service was built to.',
  },
  {
    key: 'site.occupancy_type',
    label: 'Occupancy classification',
    bounds: { kind: 'enum', values: ['F-1', 'F-2', 'S-1', 'S-2', 'B', 'H-2', 'H-3', 'M', 'A', 'unknown'] },
    neededBy: [SHEETS.COVER, SHEETS.FIRE],
    allowedAgents: ['code', 'records'],
    cheapestSource: T0('permit_record'),
    fallback: T1('old_plan_set'),
  },
  {
    key: 'site.construction_type',
    label: 'Construction type',
    bounds: { kind: 'enum', values: ['I-A', 'I-B', 'II-A', 'II-B', 'III-A', 'III-B', 'IV', 'V-A', 'V-B', 'unknown'] },
    neededBy: [SHEETS.COVER, SHEETS.FIRE],
    allowedAgents: ['code', 'records'],
    cheapestSource: T0('permit_record'),
    fallback: T1('old_plan_set'),
  },
  {
    key: 'site.flood_zone',
    label: 'FEMA flood zone',
    bounds: { kind: 'string', maxLength: 20 },
    neededBy: [SHEETS.COVER, SHEETS.SITE_PLAN],
    allowedAgents: ['parcel'],
    cheapestSource: T0('flood_map'),
    notes: 'A battery in Zone AE changes the pad elevation requirement.',
  },
  {
    key: 'ahj.building',
    label: 'Building authority having jurisdiction',
    bounds: { kind: 'string', maxLength: 120 },
    neededBy: [SHEETS.COVER],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
    setbackPath: 'ahjName',
  },
  {
    key: 'ahj.fire',
    label: 'Fire authority having jurisdiction',
    bounds: { kind: 'string', maxLength: 120 },
    neededBy: [SHEETS.COVER, SHEETS.FIRE],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
  },
  {
    key: 'codes.building',
    label: 'Building code edition in force',
    bounds: { kind: 'string', maxLength: 120 },
    neededBy: [SHEETS.COVER],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
  },
  {
    key: 'codes.fire',
    label: 'Fire code edition in force',
    bounds: { kind: 'string', maxLength: 120 },
    neededBy: [SHEETS.COVER, SHEETS.FIRE],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
  },
  {
    key: 'codes.electrical',
    label: 'Electrical code edition in force',
    bounds: { kind: 'string', maxLength: 120 },
    neededBy: [SHEETS.COVER, SHEETS.ONE_LINE],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
  },
  {
    key: 'codes.ess',
    label: 'ESS standard edition (NFPA 855)',
    bounds: { kind: 'string', maxLength: 120 },
    neededBy: [SHEETS.COVER, SHEETS.SITE_PLAN, SHEETS.FIRE],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
    notes: 'Which edition is adopted changes the setbacks the Setback rule pack applies.',
  },
  {
    key: 'codes.local_amendments',
    label: 'Local amendments affecting ESS setbacks',
    bounds: { kind: 'string', maxLength: 400 },
    neededBy: [SHEETS.COVER, SHEETS.SITE_PLAN],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
    setbackPath: 'ahjOverlays',
  },

  // ---------------------------------------------------------------- site plan
  {
    key: 'lot.width_ft',
    label: 'Lot width (E–W)',
    unit: 'ft',
    bounds: { kind: 'number', min: 10, max: 5000 },
    neededBy: [SHEETS.SITE_PLAN, SHEETS.ZONING],
    allowedAgents: ['parcel'],
    cheapestSource: T0('parcel'),
    // Not a laser shot. A stamped site plan needs survey-grade bearings and distances,
    // so when the parcel polygon is not good enough the answer is the recorded plot
    // plan, which the owner usually already holds. (Century Tywood ESS-1.0 is drawn on
    // one: bearings to the second, distances to the hundredth of a foot.)
    fallback: T1('survey'),
    setbackPath: 'lot.w',
  },
  {
    key: 'lot.depth_ft',
    label: 'Lot depth (N–S)',
    unit: 'ft',
    bounds: { kind: 'number', min: 10, max: 5000 },
    neededBy: [SHEETS.SITE_PLAN, SHEETS.ZONING],
    allowedAgents: ['parcel'],
    cheapestSource: T0('parcel'),
    fallback: T1('survey'),
    setbackPath: 'lot.h',
  },
  {
    key: 'building.offset_x_ft',
    label: 'Building west wall offset from lot line',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 2000 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    setbackPath: 'building.x',
  },
  {
    key: 'building.offset_y_ft',
    label: 'Building north wall offset from lot line',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 2000 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    setbackPath: 'building.y',
  },
  {
    key: 'building.width_ft',
    label: 'Building width',
    unit: 'ft',
    bounds: { kind: 'number', min: 10, max: 3000 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    fallback: T2('staff_laser'),
    setbackPath: 'building.w',
  },
  {
    key: 'building.depth_ft',
    label: 'Building depth',
    unit: 'ft',
    bounds: { kind: 'number', min: 10, max: 3000 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    fallback: T2('staff_laser'),
    setbackPath: 'building.h',
  },
  {
    key: 'building.height_ft',
    label: 'Building height',
    unit: 'ft',
    bounds: { kind: 'number', min: 6, max: 500 },
    neededBy: [SHEETS.ELEVATION, SHEETS.ZONING],
    allowedAgents: ['imagery'],
    cheapestSource: T0('lidar_3dep'),
    fallback: T2('staff_lidar'),
  },
  {
    key: 'openings[].wall',
    label: 'Opening: which wall',
    bounds: { kind: 'enum', values: ['north', 'south', 'east', 'west'] },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    fallback: T2('staff_photo_charuco'),
  },
  {
    key: 'openings[].kind',
    label: 'Opening: type',
    bounds: { kind: 'enum', values: ['door', 'window', 'vent', 'air-intake'] },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('street_level'),
    fallback: T2('staff_photo_charuco'),
    notes: 'NFPA 855 treats air intakes like openings; misclassifying one moves a keep-out zone.',
  },
  {
    key: 'openings[].at_ft',
    label: 'Opening: offset along the wall',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 3000 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    fallback: T2('staff_laser'),
  },
  {
    key: 'openings[].width_ft',
    label: 'Opening: width',
    unit: 'ft',
    bounds: { kind: 'number', min: 0.5, max: 60 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('street_level'),
    fallback: T2('staff_laser'),
  },
  {
    key: 'pad_zone.x_ft',
    label: 'Candidate pad zone: west edge',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 5000 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    setbackPath: 'padZone.x',
    notes: 'A candidate, not an approved area. The owner approves the pad zone, not an agent.',
  },
  {
    key: 'pad_zone.y_ft',
    label: 'Candidate pad zone: north edge',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 5000 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    setbackPath: 'padZone.y',
  },
  {
    key: 'pad_zone.width_ft',
    label: 'Candidate pad zone: width',
    unit: 'ft',
    bounds: { kind: 'number', min: 1, max: 1000 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    setbackPath: 'padZone.w',
  },
  {
    key: 'pad_zone.depth_ft',
    label: 'Candidate pad zone: depth',
    unit: 'ft',
    bounds: { kind: 'number', min: 1, max: 1000 },
    neededBy: [SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    setbackPath: 'padZone.h',
  },
  {
    key: 'site.road_side',
    label: 'Side of the lot fronting the public way',
    bounds: { kind: 'enum', values: ['north', 'south', 'east', 'west'] },
    neededBy: [SHEETS.SITE_PLAN, SHEETS.FIRE],
    allowedAgents: ['imagery', 'parcel'],
    cheapestSource: T0('parcel'),
    setbackPath: 'roadSide',
  },
  {
    key: 'site.surface_type',
    label: 'Pad zone surface',
    bounds: { kind: 'enum', values: ['asphalt', 'concrete', 'gravel', 'grass', 'dirt', 'unknown'] },
    neededBy: [SHEETS.SITE_PLAN, SHEETS.BOM],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
  },
  {
    key: 'site.slope_percent',
    label: 'Ground slope at the pad',
    unit: '%',
    bounds: { kind: 'number', min: 0, max: 60 },
    neededBy: [SHEETS.SITE_PLAN, SHEETS.ELEVATION],
    allowedAgents: ['imagery'],
    cheapestSource: T0('lidar_3dep'),
    fallback: T2('staff_laser'),
    notes:
      'Above roughly 2% a pad needs grading or a stepped foundation — real money and a real ' +
      'schedule item. Nothing in the parcel or footprint layers hints at it, so it has to be ' +
      'measured off a bare-earth DEM.',
  },
  {
    key: 'site.transformer_distance_ft',
    label: 'Distance from pad zone to utility transformer',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 3000 },
    neededBy: [SHEETS.SITE_PLAN, SHEETS.ONE_LINE],
    allowedAgents: ['imagery'],
    cheapestSource: T0('street_level'),
    fallback: T2('staff_laser'),
  },
  {
    key: 'cable.route_length_ft',
    label: 'Cable route length, pad to point of connection',
    unit: 'ft',
    bounds: { kind: 'number', min: 1, max: 3000 },
    neededBy: [SHEETS.SITE_PLAN, SHEETS.BOM],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    fallback: T2('staff_laser'),
    notes: 'We supply the length. Option 2 picks the conductor size. We never pick the wire.',
  },
  {
    key: 'site.existing_pv_kw',
    label: 'Existing PV or generator capacity',
    unit: 'kW',
    bounds: { kind: 'number', min: 0, max: 20000 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['imagery', 'records', 'utility'],
    cheapestSource: T0('aerial'),
    fallback: T1('old_plan_set'),
    notes: 'Existing DG eats into the 705.12 busbar allowance.',
  },
  {
    key: 'access.fire_apparatus_clear_ft',
    label: 'Clear width of fire apparatus access',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 200 },
    neededBy: [SHEETS.SITE_PLAN, SHEETS.FIRE],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    fallback: T2('staff_laser'),
  },

  // ---------------------------------------------------------------- single-line
  {
    key: 'electrical.service_voltage_v',
    label: 'Service voltage',
    unit: 'V',
    bounds: { kind: 'number', min: 100, max: 35000, standard: SERVICE_VOLTAGES_V },
    neededBy: [SHEETS.ONE_LINE, SHEETS.BOM],
    allowedAgents: ['records', 'intake'],
    cheapestSource: T0('permit_record'),
    fallback: T2('staff_photo_charuco'),
    setbackPath: 'service.voltage',
  },
  {
    key: 'electrical.service_phase',
    label: 'Service phase',
    bounds: { kind: 'enum', values: ['1', '3'] },
    neededBy: [SHEETS.ONE_LINE],
    allowedAgents: ['records', 'intake'],
    cheapestSource: T0('permit_record'),
    fallback: T2('staff_photo_charuco'),
  },
  {
    key: 'electrical.transformer_kva',
    label: 'Utility transformer rating',
    unit: 'kVA',
    bounds: { kind: 'number', min: 10, max: 10000 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['imagery', 'records', 'utility'],
    cheapestSource: T0('street_level'),
    fallback: T2('staff_photo_charuco'),
    inferredOnly: true,
    notes: 'The imagery agent may only infer this from a stenciled pad-mount, always with a range.',
  },
  {
    key: 'electrical.switchgear_make_model',
    label: 'Main switchgear make and model',
    bounds: { kind: 'string', maxLength: 160 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.BOM],
    allowedAgents: ['records'],
    cheapestSource: T1('old_plan_set'),
    fallback: T2('staff_photo_charuco'),
  },
  {
    key: 'electrical.bus_rating_a',
    label: 'Switchgear bus rating',
    unit: 'A',
    bounds: { kind: 'number', min: 100, max: 6000, standard: STANDARD_BUS_RATINGS_A },
    neededBy: [SHEETS.ONE_LINE, SHEETS.BOM],
    allowedAgents: ['records'],
    cheapestSource: T0('permit_record'),
    fallback: T2('staff_photo_charuco'),
    setbackPath: 'service.busRatingA',
    notes:
      'The decisive hidden fact. It sets the NEC 705.12 120% allowance, which decides load-side vs supply-side tap. Rarely in public records; usually only on a nameplate.',
  },
  {
    key: 'electrical.main_breaker_a',
    label: 'Main breaker rating',
    unit: 'A',
    bounds: { kind: 'number', min: 100, max: 6000, standard: STANDARD_BREAKER_A },
    neededBy: [SHEETS.ONE_LINE, SHEETS.BOM],
    allowedAgents: ['records', 'intake'],
    cheapestSource: T0('permit_record'),
    fallback: T2('staff_photo_charuco'),
    setbackPath: 'service.mainBreakerA',
  },
  {
    key: 'electrical.spare_spaces',
    label: 'Spare breaker spaces in main switchgear',
    bounds: { kind: 'number', min: 0, max: 60 },
    neededBy: [SHEETS.ONE_LINE],
    allowedAgents: ['records'],
    cheapestSource: T1('old_plan_set'),
    fallback: T3('site_visit'),
    notes:
      'Zero spares turns a load-side tap into new gear, which is a lead-time problem. ' +
      'Counting spares means opening the dead-front, which we will never ask facility staff to do — ' +
      'so if this blocks the design, it takes a qualified person on site.',
  },
  {
    key: 'electrical.available_fault_current_a',
    label: 'Available fault current',
    unit: 'A',
    bounds: { kind: 'number', min: 1000, max: 200000 },
    neededBy: [SHEETS.ONE_LINE],
    allowedAgents: ['records', 'utility'],
    cheapestSource: T0('hosting_map'),
    fallback: T1('old_plan_set'),
    notes:
      'The utility is the authority here and will state it in writing on request. ' +
      'No amount of site work substitutes for that letter.',
  },
  {
    key: 'electrical.meter_number',
    label: 'Utility meter number',
    bounds: { kind: 'string', maxLength: 40 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['intake'],
    cheapestSource: T1('bill'),
  },
  {
    key: 'electrical.ct_ratio',
    label: 'Meter CT ratio (CTR)',
    bounds: { kind: 'number', min: 1, max: 2000 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['intake', 'records'],
    cheapestSource: T1('bill'),
    fallback: T2('staff_photo'),
    notes:
      'Printed on the meter face as "CTR". Half of the billing multiplier, and the half ' +
      'that is actually legible in a photo of a closed meter.',
  },
  {
    key: 'electrical.vt_ratio',
    label: 'Meter VT ratio (VTR)',
    bounds: { kind: 'number', min: 1, max: 200 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['intake', 'records'],
    cheapestSource: T1('bill'),
    fallback: T2('staff_photo'),
    notes: 'Printed on the meter face as "VTR". 1 on a self-contained voltage connection.',
  },
  {
    key: 'electrical.meter_form',
    label: 'Meter form',
    bounds: { kind: 'string', maxLength: 20 },
    neededBy: [SHEETS.ONE_LINE],
    allowedAgents: ['intake', 'records'],
    cheapestSource: T1('bill'),
    fallback: T2('staff_photo'),
    notes: 'e.g. 9S — a 3-element transformer-rated form, which implies CTs are present at all.',
  },
  {
    key: 'electrical.ct_multiplier',
    label: 'Meter CT multiplier',
    bounds: { kind: 'number', min: 1, max: 2000 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['intake'],
    cheapestSource: T1('bill'),
    fallback: T2('staff_photo'),
    notes:
      'Required before any optical meter-reader pulse count can be converted to kW. ' +
      'On a real meter face the "Mult. by" box is often left BLANK while CTR and VTR are ' +
      'both printed — so this is usually derived (CTR x VTR) and cross-checked against ' +
      'the bill, not read. The gatekeeper enforces that product when both ratios are known.',
  },

  // ---------------------------------------------------------------- equipment room
  {
    key: 'room.working_clearance_ft',
    label: 'Working clearance in front of switchgear',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 40 },
    neededBy: [SHEETS.EQUIP_ROOM],
    allowedAgents: ['records'],
    cheapestSource: T1('old_plan_set'),
    fallback: T2('staff_lidar'),
    notes: 'NEC 110.26 working space. Almost never in a public record.',
  },
  {
    key: 'room.door_width_ft',
    label: 'Equipment room door width',
    unit: 'ft',
    bounds: { kind: 'number', min: 1, max: 20 },
    neededBy: [SHEETS.EQUIP_ROOM],
    allowedAgents: ['records'],
    cheapestSource: T1('old_plan_set'),
    fallback: T2('staff_lidar'),
  },
  {
    key: 'room.wall_space_ft',
    label: 'Free wall space for new disconnect',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 100 },
    neededBy: [SHEETS.EQUIP_ROOM],
    allowedAgents: ['records'],
    cheapestSource: T1('old_plan_set'),
    fallback: T2('staff_lidar'),
  },

  // ---------------------------------------------------------------- fire
  {
    key: 'fire.distance_to_exposure_ft',
    label: 'Distance from pad zone to nearest exposure',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 2000 },
    neededBy: [SHEETS.FIRE, SHEETS.SITE_PLAN],
    allowedAgents: ['imagery'],
    cheapestSource: T0('aerial'),
    fallback: T2('staff_laser'),
  },
  {
    key: 'fire.hydrant_distance_ft',
    label: 'Distance to nearest hydrant',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 5000 },
    neededBy: [SHEETS.FIRE],
    allowedAgents: ['imagery'],
    cheapestSource: T0('hydrant_gis'),
  },
  {
    key: 'fire.sprinklered',
    label: 'Building is sprinklered',
    bounds: { kind: 'boolean' },
    neededBy: [SHEETS.FIRE],
    allowedAgents: ['records'],
    cheapestSource: T0('permit_record'),
    fallback: T1('intake_form'),
  },
  {
    key: 'fire.knox_box',
    label: 'Knox box present',
    bounds: { kind: 'boolean' },
    neededBy: [SHEETS.FIRE],
    allowedAgents: ['imagery'],
    cheapestSource: T0('street_level'),
    fallback: T2('staff_photo_charuco'),
  },

  // ---------------------------------------------------------------- zoning
  {
    key: 'zoning.district',
    label: 'Zoning district',
    bounds: { kind: 'string', maxLength: 60 },
    neededBy: [SHEETS.ZONING, SHEETS.COVER],
    allowedAgents: ['parcel'],
    cheapestSource: T0('parcel'),
  },
  {
    key: 'zoning.setback_front_ft',
    label: 'Bylaw front setback',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 300 },
    neededBy: [SHEETS.ZONING, SHEETS.SITE_PLAN],
    allowedAgents: ['parcel', 'code'],
    cheapestSource: T0('code_table'),
    notes: 'Distinct from fire-code setbacks. Both apply; the stricter governs.',
  },
  {
    key: 'zoning.setback_side_ft',
    label: 'Bylaw side setback',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 300 },
    neededBy: [SHEETS.ZONING, SHEETS.SITE_PLAN],
    allowedAgents: ['parcel', 'code'],
    cheapestSource: T0('code_table'),
  },
  {
    key: 'zoning.setback_rear_ft',
    label: 'Bylaw rear setback',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 300 },
    neededBy: [SHEETS.ZONING, SHEETS.SITE_PLAN],
    allowedAgents: ['parcel', 'code'],
    cheapestSource: T0('code_table'),
  },
  {
    key: 'zoning.screening_required',
    label: 'Screening required for outdoor equipment',
    bounds: { kind: 'boolean' },
    neededBy: [SHEETS.ZONING],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
  },

  // ---------------------------------------------------------------- interconnection
  {
    key: 'utility.name',
    label: 'Serving utility',
    bounds: { kind: 'string', maxLength: 80 },
    neededBy: [SHEETS.INTERCONNECT, SHEETS.ONE_LINE],
    allowedAgents: ['utility', 'intake'],
    cheapestSource: T0('tariff_db'),
    setbackPath: 'utility',
  },
  {
    key: 'utility.account_number',
    label: 'Utility account number',
    bounds: { kind: 'string', maxLength: 40 },
    neededBy: [SHEETS.INTERCONNECT],
    allowedAgents: ['intake'],
    cheapestSource: T1('bill'),
  },
  {
    key: 'utility.rate_schedule',
    label: 'Rate schedule',
    bounds: { kind: 'string', maxLength: 40 },
    neededBy: [SHEETS.INTERCONNECT],
    allowedAgents: ['utility', 'intake'],
    cheapestSource: T0('tariff_db'),
    fallback: T1('bill'),
    setbackPath: 'tariff',
  },
  {
    key: 'utility.feeder_hosting_capacity_kw',
    label: 'Feeder hosting capacity',
    unit: 'kW',
    bounds: { kind: 'number', min: 0, max: 100000 },
    neededBy: [SHEETS.INTERCONNECT],
    allowedAgents: ['utility'],
    cheapestSource: T0('hosting_map'),
  },
  {
    key: 'utility.existing_dg_kw',
    label: 'Existing distributed generation on the account',
    unit: 'kW',
    bounds: { kind: 'number', min: 0, max: 50000 },
    neededBy: [SHEETS.INTERCONNECT, SHEETS.ONE_LINE],
    allowedAgents: ['utility'],
    cheapestSource: T0('hosting_map'),
    fallback: T1('bill'),
  },
  {
    key: 'load.peak_kw',
    label: 'Peak demand (15-min)',
    unit: 'kW',
    bounds: { kind: 'number', min: 1, max: 100000 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['intake'],
    cheapestSource: T1('green_button'),
    fallback: T1('bill'),
    setbackPath: 'peakKW',
    notes: 'Interval max is the real peak. Bill demand may be ratcheted, so the two will disagree.',
  },

  // ------------------------------------------------- derived from the real plan set
  // Everything below was missing from the first pass of this catalog. It comes from
  // reading the Century Tywood stamped set (rev B, 2026-01-11) and asking, per sheet,
  // "what site fact had to be known before this could be drawn?"

  // ESS-1.0 carries a Design Criteria block. Without it the structural sheets (anchor
  // schedule, weld calcs, I-beam sizing) cannot be produced — ESS-6.4 sizes welds
  // directly from the wind and snow numbers. These are location facts, not design
  // choices, so they belong in the site record.
  {
    key: 'design.wind_speed_mph',
    label: 'Design wind speed',
    unit: 'mph',
    bounds: { kind: 'number', min: 70, max: 200 },
    neededBy: [SHEETS.COVER, SHEETS.ELEVATION],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
    notes: 'ASCE 7 ultimate design wind speed at this site. Drives the overturning check and the weld schedule.',
  },
  {
    key: 'design.snow_load_psf',
    label: 'Ground snow load',
    unit: 'psf',
    bounds: { kind: 'number', min: 0, max: 300 },
    neededBy: [SHEETS.COVER, SHEETS.ELEVATION],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
  },
  {
    key: 'design.temp_high_f',
    label: 'High design temperature',
    unit: 'degF',
    bounds: { kind: 'number', min: 60, max: 140 },
    neededBy: [SHEETS.COVER],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
    notes: 'Bounds the battery thermal-management duty and the conductor ampacity correction.',
  },
  {
    key: 'design.temp_low_f',
    label: 'Low design temperature',
    unit: 'degF',
    bounds: { kind: 'number', min: -70, max: 60 },
    neededBy: [SHEETS.COVER],
    allowedAgents: ['code'],
    cheapestSource: T0('code_table'),
  },

  // ESS-1.0 dimensions the setback to the NEAREST property line, which means knowing
  // which parcel is on the other side of it.
  {
    key: 'site.abutter_owner',
    label: 'Abutting owner at the nearest property line',
    bounds: { kind: 'string', maxLength: 200 },
    neededBy: [SHEETS.SITE_PLAN, SHEETS.ZONING],
    allowedAgents: ['parcel'],
    cheapestSource: T0('parcel'),
    notes: 'Named on the site plan. Also decides who gets abutter notice if a variance is needed.',
  },

  // ESS-1.0 and ESS-13.0 both identify the interconnecting pole by number — it is how
  // the utility finds the job.
  {
    key: 'utility.pole_number',
    label: 'Interconnecting utility pole number',
    bounds: { kind: 'string', maxLength: 40 },
    neededBy: [SHEETS.INTERCONNECT, SHEETS.ONE_LINE],
    allowedAgents: ['imagery', 'utility'],
    cheapestSource: T0('street_level'),
    fallback: T2('staff_photo_charuco'),
    notes: 'Stencilled on the pole and readable from street-level imagery.',
  },

  // ESS-13.0 names the revenue meter by make, type and serial. The serial is what ties
  // our record to the utility account, and it is on the meter face, not the bill.
  {
    key: 'electrical.revenue_meter_model',
    label: 'Revenue meter make and model',
    bounds: { kind: 'string', maxLength: 120 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['records', 'intake'],
    cheapestSource: T1('bill'),
    fallback: T2('staff_photo_charuco'),
  },
  {
    key: 'electrical.revenue_meter_serial',
    label: 'Revenue meter serial number',
    bounds: { kind: 'string', maxLength: 40 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['records', 'intake'],
    cheapestSource: T1('bill'),
    fallback: T2('staff_photo_charuco'),
    notes: 'On the meter face. A photo of the closed meter resolves it.',
  },

  // ESS-1.0 states the point of interconnection explicitly. It is a site fact (where the
  // existing gear allows a tie) even though the tap method is a design decision.
  {
    key: 'electrical.poi',
    label: 'Point of interconnection',
    bounds: {
      kind: 'enum',
      values: ['main_distribution_panel', 'main_switchgear', 'service_entrance', 'utility_transformer', 'unknown'],
    },
    neededBy: [SHEETS.ONE_LINE, SHEETS.INTERCONNECT],
    allowedAgents: ['records'],
    cheapestSource: T1('old_plan_set'),
    fallback: T3('site_visit'),
  },

  // ESS-4.1 draws the existing panel with its branch breakers (LP, LP1..LP4, main
  // building disconnect). The count is what tells you whether a new breaker fits.
  {
    key: 'electrical.existing_branch_count',
    label: 'Existing branch breakers in the main distribution panel',
    bounds: { kind: 'number', min: 0, max: 200 },
    neededBy: [SHEETS.ONE_LINE, SHEETS.EQUIP_ROOM],
    allowedAgents: ['records'],
    cheapestSource: T1('old_plan_set'),
    fallback: T3('site_visit'),
    notes: 'Counting these means opening the dead-front, same as spare spaces. Not a Tier 2 ask.',
  },

  // ESS-9.2 shows the utility meter on the opposite wall from the distribution panel.
  // That distance sets the interior conduit run, which is real material and labour.
  {
    key: 'room.meter_to_panel_ft',
    label: 'Utility meter to distribution panel, inside the electrical room',
    unit: 'ft',
    bounds: { kind: 'number', min: 0, max: 200 },
    neededBy: [SHEETS.EQUIP_ROOM, SHEETS.BOM],
    allowedAgents: ['records'],
    cheapestSource: T1('old_plan_set'),
    fallback: T2('staff_lidar'),
  },
];

// --------------------------------------------------------------------- lookup

/** `openings.2.at_ft` is catalogued once, as `openings[].at_ft`. */
export const normalizeKey = (key: string) => key.replace(/\.\d+\./g, '[].');

const BY_KEY = new Map(FIELD_CATALOG.map((f) => [f.key, f]));

export function specFor(key: string): FieldSpec | undefined {
  return BY_KEY.get(key) ?? BY_KEY.get(normalizeKey(key));
}

/** Public layers a collector can query directly and parse without a human reading it. */
export const COLLECTABLE_SOURCES: SourceKind[] = [
  'parcel',
  'assessor',
  'aerial',
  'gis_footprint',
  'lidar_3dep',
  'street_level',
  'flood_map',
  'hydrant_gis',
  'hosting_map',
  'tariff_db',
  'code_table',
];

export function isAgentAllowed(agentId: AgentId, key: string): boolean {
  const spec = specFor(key);
  if (!spec) return false;
  // A capture result may write exactly what the catalog already says a staff capture
  // can resolve — no more. Derived rather than listed, so the two can never drift:
  // if a field's Tier-2 route is removed, the write permission goes with it.
  if (agentId === 'capture_result') return !!spec.fallback?.kind.startsWith('staff_');
  // A collector may write what a machine-readable public layer can answer, and nothing
  // else. That still refuses it the fields that actually decide a project — a bus rating
  // comes off a permit or a nameplate, a CT multiplier off a bill — so the check is not
  // vacuous just because the code is first-party.
  if (agentId === 'collector') return COLLECTABLE_SOURCES.includes(spec.cheapestSource.kind);
  return spec.allowedAgents.includes(agentId);
}

export function keysForAgent(agentId: AgentId): FieldSpec[] {
  return FIELD_CATALOG.filter((f) => f.allowedAgents.includes(agentId));
}

export function fieldsForSheet(sheet: SheetId): FieldSpec[] {
  return FIELD_CATALOG.filter((f) => f.neededBy.includes(sheet));
}

export const ALL_SHEETS: SheetId[] = Object.values(SHEETS);
