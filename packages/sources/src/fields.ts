import type { FitnessGrade, Owner } from "@eqore/contract";
import { CATALOG_ROUTES, type Family } from "./catalog-map.ts";

// Team value for the demo until EQORE gives one.
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
  family?: Family;
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
  { field: "zoning_district", label: "Zoning district", owner: "public_data", grade: "reference" },
  { field: "building_stories", label: "Stories", owner: "public_data", grade: "reference" },
  { field: "use_description", label: "Assessor use", owner: "public_data", grade: "reference" },
  { field: "building_height_ft", label: "Building height (estimate)", owner: "public_data", grade: "reference" },
  { field: "candidate_areas", label: "Largest candidate pad area", owner: "public_data", grade: "reference" },
  ...[
    ["municipality", "Municipality"],
    ["county", "County"],
    ["road_name", "Fronting road"],
    ["road_width_ft", "Road surface width"],
    ["road_lanes", "Road lanes"],
    ["road_surface_type", "Road surface type"],
    ["wetlands_nearby", "Wetlands nearby"],
    ["fire_stations_nearby", "Fire stations nearby"],
    ["substations_nearby", "Substations nearby"],
    ["land_cover", "Land cover across the site"],
    ["transmission_nearby", "Transmission lines nearby"],
    ["proposed_substations_nearby", "Proposed substations nearby"],
    ["grid_service_path", "How the building is likely fed (inferred)"],
    ["detected_grid_equipment", "Grid equipment detected in lidar"],
    ["electrical_permit_history", "Electrical permits on file"],
    ["service_size_a", "Service size on a permit"],
    ["service_construction", "Overhead or underground service, on a permit"],
    ["service_phase", "Service phases, on a permit"],
    ["transformer_kva", "Transformer size, on a permit"],
    ["ground_elevation_ft", "Ground elevation"],
    ["site_slope_pct", "Ground slope across the parcel"],
  ].map(([field, label]): FieldDefinition => ({ field: field!, label: label!, owner: "public_data", grade: "reference", comparison: { kind: "latest" }, missingReason: "No source has answered for this site." })),
  ...[
    ["lot_width_ft", "Lot width (fitted east-west extent)"],
    ["lot_depth_ft", "Lot depth (fitted north-south extent)"],
    ["building_x_ft", "Main building, west side from the lot's west side"],
    ["building_y_ft", "Main building, north side from the lot's north side"],
    ["building_width_ft", "Main building width (fitted east-west extent)"],
    ["building_depth_ft", "Main building depth (fitted north-south extent)"],
    ["building_footprint_sqft", "Main building footprint"],
    ["roofprint_coverage_pct", "Roofprint coverage of the parcel"],
    ["building_to_lot_line_ft", "Main building to the parcel line"],
    ["distance_to_nearest_line_ft", "Main building to the nearest mapped line"],
    ["road_side", "Side of the lot facing the road"],
  ].map(([field, label]): FieldDefinition => ({
    field: field!,
    label: label!,
    owner: "public_data",
    grade: "reference",
    comparison: { kind: "latest" },
    missingReason: "Needs a parcel polygon and the outlines or lines it's measured from, and this site has none yet.",
  })),
  { field: "elevation_m", label: "Ground elevation", owner: "public_data", grade: "reference" },

  // Utility-published context. The Pre-Application Report is the authoritative version.
  { field: "serving_utility", label: "Serving utility", owner: "utility", grade: "reference", comparison: { kind: "candidates" } },
  { field: "utility_territories", label: "Utility territories mapped here", owner: "utility", grade: "reference", comparison: { kind: "latest" }, missingReason: "No service territory source has answered for this site." },
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

const HAND_FAMILY: Record<string, Family> = {
  substations_nearby: "utility",
  transmission_nearby: "utility",
  proposed_substations_nearby: "utility",
  grid_service_path: "utility",
  detected_grid_equipment: "utility",
  electrical_permit_history: "customer",
  serving_utility: "utility",
  feeder: "utility",
  peak_demand_kw: "energy",
};

for (const route of CATALOG_ROUTES) {
  if (!FIELDS.some((definition) => definition.field === route.field)) {
    FIELDS.push({ field: route.field, label: route.label ?? route.key, owner: route.owner, grade: "reference", family: route.family, missingReason: route.why });
  }
}
for (const definition of FIELDS) {
  definition.family ??= HAND_FAMILY[definition.field] ?? CATALOG_ROUTES.find((route) => route.field === definition.field)?.family ?? (definition.owner === "public_data" ? "physical" : definition.owner === "utility" ? "utility" : definition.owner === "customer" || definition.owner === "qualified_person" ? "customer" : "decision");
}

// Details stored as their own observations, so each keeps its source, and shown on the feeder.
export const FEEDER_ATTRIBUTES: Record<string, string> = {
  feeder_substation: "substation",
  feeder_voltage: "voltage",
  feeder_phase: "phase",
  feeder_hosting_capacity: "hosting_capacity",
  feeder_load_capacity: "load_capacity",
  feeder_limiting_criterion: "limiting_criterion",
  feeder_screen_result: "screen_result",
  feeder_peak_loading_pct: "peak_loading",
  feeder_peak_forecast: "peak_forecast",
  feeder_rating_mva: "rating",
  feeder_construction: "construction",
  feeder_study_status: "study_status",
  feeder_installed_dg: "installed_dg",
  feeder_queued_dg: "queued_dg",
  feeder_aso_study: "aso_study",
  feeder_nodal_hosting_capacity: "hosting_capacity_near_site",
};

export function fieldDefinition(field: string): FieldDefinition | undefined {
  return FIELDS.find((definition) => definition.field === field);
}
