import type { FitnessGrade, Owner } from "@eqore/contract";

// Team value for the demo until EQORE gives one. It was set before any candidate parcel was
// looked at, and it keeps the 5% gap at 11 Bartzak Dr a conflict.
export const LOT_SIZE_TOLERANCE = 0.03;

export type Comparison =
  // Numbers agree when they differ by no more than this share of the larger one.
  | { kind: "tolerance"; relative: number }
  | { kind: "exact" }
  // Several values are alternatives to settle, not sources disagreeing.
  | { kind: "candidates" }
  // A newer reading replaces an unconfirmed one, as when a pin is moved.
  | { kind: "latest" };

export type FieldDefinition = {
  field: string;
  label: string;
  owner: Owner;
  grade: FitnessGrade;
  comparison?: Comparison;
  missingReason?: string;
};

const NO_EVIDENCE = "No evidence yet.";
const ENGINEER = "An engineer decision. The tool never fills it.";
const QUALIFIED = "Not on an exterior label. Needs a qualified person, not a facility photo.";

export const FIELDS: FieldDefinition[] = [
  // Physical facts from public sources.
  { field: "site_location", label: "Site location", owner: "public_data", grade: "reference" },
  { field: "parcel_id", label: "Parcel ID", owner: "public_data", grade: "reference" },
  { field: "property_line", label: "Property line", owner: "public_data", grade: "reference" },
  { field: "use_code", label: "Assessor use code", owner: "public_data", grade: "reference" },
  { field: "year_built", label: "Year built", owner: "public_data", grade: "reference" },
  {
    field: "lot_size_acres",
    label: "Lot size",
    owner: "public_data",
    grade: "reference",
    comparison: { kind: "tolerance", relative: LOT_SIZE_TOLERANCE },
  },
  { field: "building_area_sqft", label: "Building area", owner: "customer", grade: "reference" },
  { field: "building_outline", label: "Building outline", owner: "public_data", grade: "reference" },
  { field: "aerial_image", label: "Aerial image", owner: "public_data", grade: "reference" },
  { field: "elevation_m", label: "Ground elevation", owner: "public_data", grade: "reference" },

  // Utility-published context. The Pre-Application Report is the authoritative version.
  { field: "serving_utility", label: "Serving utility", owner: "utility", grade: "reference" },
  { field: "feeder", label: "Feeder", owner: "utility", grade: "reference", comparison: { kind: "candidates" } },

  // Customer-side facts.
  { field: "interconnecting_customer", label: "Interconnecting customer and contacts", owner: "customer", grade: "reference" },
  { field: "site_control", label: "Site control", owner: "customer", grade: "reference" },
  { field: "existing_generation", label: "Existing generation", owner: "customer", grade: "reference" },
  {
    field: "existing_facility_record",
    label: "Existing facility's application number and nameplate capacity",
    owner: "customer",
    grade: "reference",
    missingReason: "No evidence yet. This applies only if the application changes an existing facility. Public data doesn't fill it.",
  },
  { field: "account_number", label: "Account number", owner: "customer", grade: "nameplate" },
  { field: "meter_number", label: "Meter number", owner: "customer", grade: "nameplate" },
  { field: "peak_demand_kw", label: "Billed peak demand", owner: "customer", grade: "nameplate", comparison: { kind: "tolerance", relative: 0 } },
  { field: "service_voltage", label: "Service voltage", owner: "customer", grade: "nameplate" },
  { field: "main_device_rating", label: "Main device rating", owner: "engineer", grade: "nameplate" },
  { field: "bus_rating", label: "Bus rating", owner: "qualified_person", grade: "nameplate", missingReason: QUALIFIED },
  { field: "kaic_rating", label: "Short-circuit rating (kAIC)", owner: "qualified_person", grade: "nameplate", missingReason: QUALIFIED },
  { field: "switchboard_location", label: "Main switchboard location", owner: "customer", grade: "layout", comparison: { kind: "latest" } },
  { field: "meter_location", label: "Meter location", owner: "customer", grade: "layout", comparison: { kind: "latest" } },
  { field: "utility_transformer_location", label: "Utility transformer location", owner: "customer", grade: "layout", comparison: { kind: "latest" } },

  // Engineer decisions and documents.
  { field: "system_capacity_kw", label: "System capacity", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "facility_change_plan", label: "New facility, or the proposed change and total capacity", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "generating_equipment", label: "Equipment make, model, and AC ratings", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "export_plan", label: "Export plan", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "single_parcel", label: "Facility on a single parcel", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "generator_characteristics", label: "Power factor and fault contribution", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "interconnection_equipment", label: "Transformer, fuse, breaker, relays, CTs, and PTs", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "one_line_diagram", label: "PE-stamped one-line diagram", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "site_documentation", label: "Site documentation of the facility location", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "protective_interface_location", label: "Location of protective interface equipment", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "protection_schematics", label: "Protection and control schematics", owner: "engineer", grade: "reference", missingReason: ENGINEER },
  { field: "applicant_signature", label: "Applicant signature", owner: "engineer", grade: "reference", missingReason: "A person signs this. The tool never fills it." },
].map((definition) => ({ ...definition, missingReason: definition.missingReason ?? NO_EVIDENCE })) as FieldDefinition[];

// Details stored as their own observations, so each keeps its source, and shown on the feeder.
export const FEEDER_ATTRIBUTES: Record<string, string> = {
  feeder_substation: "substation",
  feeder_voltage: "voltage",
  feeder_phase: "phase",
  feeder_hosting_capacity: "hosting_capacity",
  feeder_load_capacity: "load_capacity",
  feeder_limiting_criterion: "limiting_criterion",
  feeder_screen_result: "screen_result",
};

export function fieldDefinition(field: string): FieldDefinition | undefined {
  return FIELDS.find((definition) => definition.field === field);
}
