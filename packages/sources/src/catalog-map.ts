import type { Owner } from "@eqore/contract";

export type Family = "physical" | "utility" | "energy" | "customer" | "decision";

export type CatalogRoute = {
  key: string;
  // The record field that answers this key. Generated from the key when no collector fills it yet.
  field: string;
  label?: string;
  family: Family;
  // Who must supply it when no source has. Never public data without a configured source.
  owner: Owner;
  why: string;
  // A public source may exist, and nothing here collects it yet.
  publicNotCollected?: boolean;
};

const ENGINEER = "An engineer decides or reads this for the plan set.";
const PERMIT = "Permit records and property cards hold this, and a person opens them.";
const NAMEPLATE = "A doors-closed photo of an exterior label, or an old plan set, supplies this.";
const INSIDE = "This is inside the equipment, so a qualified person reads it. Facility staff aren't asked to open anything.";
const BILL = "The bill or the meter supplies this.";
const CODE_TABLE = "Published code tables hold this. The agent layer has them, and the record doesn't collect them yet, so an engineer confirms it for now.";
const BYLAW = "The town's zoning bylaw holds this, and a person reads it.";

const row = (key: string, field: string, family: Family, owner: Owner, why: string, extra: Partial<CatalogRoute> = {}): CatalogRoute => ({ key, field, family, owner, why, ...extra });

// One row per catalog key, written out so that a new catalog field has to be routed on purpose.
export const CATALOG_ROUTES: CatalogRoute[] = [
  row("site.address", "site_location", "physical", "public_data", "Resolved from the address."),
  row("site.parcel_id", "parcel_id", "physical", "public_data", "Assessor parcel layer."),
  row("site.owner", "site_owner", "customer", "customer", "The signed contract names the owner. Owner names aren't stored from public layers."),
  row("site.year_built", "year_built", "physical", "public_data", "Assessor parcel layer."),
  row("site.occupancy_type", "occupancy_type", "decision", "engineer", "The use code only hints at it, so an engineer classifies it."),
  row("site.construction_type", "construction_type", "decision", "engineer", PERMIT),
  row("site.flood_zone", "flood_zone", "physical", "engineer", "A person reads it from FEMA's flood map, because no flood layer is queried."),
  row("ahj.building", "ahj_building", "decision", "engineer", "The municipality points to it, and a person confirms the office.", { publicNotCollected: true }),
  row("ahj.fire", "ahj_fire", "decision", "engineer", "The municipality points to it, and a person confirms the office.", { publicNotCollected: true }),
  row("codes.building", "codes_building", "decision", "engineer", CODE_TABLE, { publicNotCollected: true }),
  row("codes.fire", "codes_fire", "decision", "engineer", CODE_TABLE, { publicNotCollected: true }),
  row("codes.electrical", "codes_electrical", "decision", "engineer", CODE_TABLE, { publicNotCollected: true }),
  row("codes.ess", "codes_ess", "decision", "engineer", CODE_TABLE, { publicNotCollected: true }),
  row("codes.local_amendments", "codes_local_amendments", "decision", "engineer", CODE_TABLE, { publicNotCollected: true }),
  row("lot.width_ft", "lot_width_ft", "physical", "public_data", "Fitted from the parcel polygon."),
  row("lot.depth_ft", "lot_depth_ft", "physical", "public_data", "Fitted from the parcel polygon."),
  row("building.offset_x_ft", "building_x_ft", "physical", "public_data", "Fitted from the largest roofprint."),
  row("building.offset_y_ft", "building_y_ft", "physical", "public_data", "Fitted from the largest roofprint."),
  row("building.width_ft", "building_width_ft", "physical", "public_data", "Fitted from the largest roofprint."),
  row("building.depth_ft", "building_depth_ft", "physical", "public_data", "Fitted from the largest roofprint."),
  row("building.height_ft", "building_height_ft", "physical", "public_data", "Stories times an assumed floor height, until something measures it."),
  row("openings[].wall", "openings_wall", "customer", "customer", "A doors-closed photo of the building shows this."),
  row("openings[].kind", "openings_kind", "customer", "customer", "A doors-closed photo of the building shows this."),
  row("openings[].at_ft", "openings_at_ft", "decision", "engineer", "A photo can't measure this, so an old plan set or a site visit does."),
  row("openings[].width_ft", "openings_width_ft", "decision", "engineer", "A photo can't measure this, so an old plan set or a site visit does."),
  row("pad_zone.candidate_area_sqft", "candidate_areas", "physical", "public_data", "Derived from the parcel and roofprint polygons. A suggestion of where there is room; the owner still approves the pad."),
  row("pad_zone.x_ft", "pad_zone_x_ft", "decision", "engineer", "The tool suggests open areas, and the owner and engineer choose one."),
  row("pad_zone.y_ft", "pad_zone_y_ft", "decision", "engineer", "The tool suggests open areas, and the owner and engineer choose one."),
  row("pad_zone.width_ft", "pad_zone_width_ft", "decision", "engineer", "The tool suggests open areas, and the owner and engineer choose one."),
  row("pad_zone.depth_ft", "pad_zone_depth_ft", "decision", "engineer", "The tool suggests open areas, and the owner and engineer choose one."),
  row("site.road_side", "road_side", "physical", "public_data", "Fitted from the parcel and mapped roads."),
  row("site.surface_type", "site_surface_type", "decision", "engineer", "Land cover can suggest it, and a person confirms the surface at the pad."),
  row("site.slope_percent", "site_slope_pct", "physical", "public_data", "Lidar elevation samples across the parcel."),
  row("site.transformer_distance_ft", "transformer_distance_ft", "customer", "customer", "A geotagged photo of the transformer locates it, and imagery alone doesn't."),
  row("cable.route_length_ft", "cable_route_length_ft", "decision", "engineer", ENGINEER),
  row("site.existing_pv_kw", "existing_generation", "customer", "customer", "The customer or prior applications supply this."),
  row("access.fire_apparatus_clear_ft", "fire_apparatus_clear_ft", "decision", "engineer", ENGINEER),
  row("electrical.service_voltage_v", "service_voltage", "customer", "customer", NAMEPLATE),
  row("electrical.service_phase", "service_phase", "customer", "customer", NAMEPLATE),
  row("electrical.transformer_kva", "transformer_kva", "customer", "customer", NAMEPLATE),
  row("electrical.switchgear_make_model", "switchgear_make_model", "customer", "customer", NAMEPLATE),
  row("electrical.bus_rating_a", "bus_rating", "customer", "qualified_person", INSIDE),
  row("electrical.main_breaker_a", "main_device_rating", "customer", "engineer", NAMEPLATE),
  row("electrical.spare_spaces", "spare_spaces", "customer", "qualified_person", INSIDE),
  row("electrical.available_fault_current_a", "available_fault_current_a", "utility", "utility", "The utility states this on request."),
  row("electrical.meter_number", "meter_number", "customer", "customer", BILL),
  row("electrical.ct_ratio", "ct_ratio", "customer", "customer", BILL),
  row("electrical.vt_ratio", "vt_ratio", "customer", "customer", BILL),
  row("electrical.meter_form", "meter_form", "customer", "customer", BILL),
  row("electrical.ct_multiplier", "ct_multiplier", "customer", "customer", BILL),
  row("room.working_clearance_ft", "room_working_clearance_ft", "customer", "qualified_person", "A person in the room measures this."),
  row("room.door_width_ft", "room_door_width_ft", "customer", "qualified_person", "A person in the room measures this."),
  row("room.wall_space_ft", "room_wall_space_ft", "customer", "qualified_person", "A person in the room measures this."),
  row("fire.distance_to_exposure_ft", "fire_distance_to_exposure_ft", "decision", "engineer", "Roofprints help, and an engineer decides what counts as an exposure."),
  row("fire.hydrant_distance_ft", "fire_hydrant_distance_ft", "decision", "engineer", "Local hydrant layers may exist, and none is configured yet.", { publicNotCollected: true }),
  row("fire.sprinklered", "fire_sprinklered", "customer", "customer", PERMIT),
  row("fire.knox_box", "fire_knox_box", "customer", "customer", "A doors-closed photo of the entrance shows this."),
  row("zoning.district", "zoning_district", "physical", "public_data", "Assessor parcel layer, where the town reports it."),
  row("zoning.setback_front_ft", "zoning_setback_front_ft", "decision", "engineer", BYLAW, { publicNotCollected: true }),
  row("zoning.setback_side_ft", "zoning_setback_side_ft", "decision", "engineer", BYLAW, { publicNotCollected: true }),
  row("zoning.setback_rear_ft", "zoning_setback_rear_ft", "decision", "engineer", BYLAW, { publicNotCollected: true }),
  row("zoning.screening_required", "zoning_screening_required", "decision", "engineer", BYLAW, { publicNotCollected: true }),
  row("utility.name", "serving_utility", "utility", "utility", "The utility service that returned a feeder, confirmed by the bill."),
  row("utility.account_number", "account_number", "customer", "customer", BILL),
  row("utility.rate_schedule", "rate_schedule", "energy", "customer", "The bill names the schedule."),
  row("utility.feeder_hosting_capacity_kw", "feeder", "utility", "utility", "Carried on each feeder candidate."),
  row("utility.existing_dg_kw", "utility_existing_dg_kw", "utility", "utility", "The Pre-Application Report states this."),
  row("load.peak_kw", "peak_demand_kw", "energy", "customer", BILL),
  row("design.wind_speed_mph", "design_wind_speed_mph", "decision", "engineer", CODE_TABLE, { publicNotCollected: true }),
  row("design.snow_load_psf", "design_snow_load_psf", "decision", "engineer", CODE_TABLE, { publicNotCollected: true }),
  row("design.temp_high_f", "design_temp_high_f", "decision", "engineer", CODE_TABLE, { publicNotCollected: true }),
  row("design.temp_low_f", "design_temp_low_f", "decision", "engineer", CODE_TABLE, { publicNotCollected: true }),
  row("site.abutter_owner", "abutter_owner", "customer", "customer", "The registry of deeds holds this, and a person looks it up. Owner names aren't stored from public layers."),
  row("utility.pole_number", "utility_pole_number", "customer", "customer", "A photo of the pole tag shows this."),
  row("electrical.revenue_meter_model", "revenue_meter_model", "customer", "customer", NAMEPLATE),
  row("electrical.revenue_meter_serial", "revenue_meter_serial", "customer", "customer", NAMEPLATE),
  row("electrical.poi", "electrical_poi", "decision", "engineer", ENGINEER),
  row("electrical.existing_branch_count", "existing_branch_count", "customer", "qualified_person", INSIDE),
  row("room.meter_to_panel_ft", "room_meter_to_panel_ft", "customer", "qualified_person", "A person in the room measures this."),
];

// Reads a printed service voltage as line-to-line volts: 480Y/277 V is 480 V, 13.8 kV is 13800 V.
// Text it can't read comes back unchanged, so nothing is guessed.
export function lineToLineVolts(printed: string): number | string {
  const scale = /kv/i.test(printed) ? 1000 : 1;
  const numbers = [...printed.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]) * scale);
  if (numbers.length === 0 || numbers.length > 2 || !/^[\d\s./yv-]*(?:k?v(?:olts?)?|y)?[\s\d./yv]*$/i.test(printed.trim())) return printed;
  return Math.max(...numbers);
}

export type CoverageValue = { field: string; state: string; owner: Owner };

// How much of the plan-set catalog has an answer, and who holds the rest.
export function catalogCoverage(values: CoverageValue[]) {
  const byField = new Map(values.map((value) => [value.field, value]));
  const byOwner: Partial<Record<Owner, number>> = {};
  let filled = 0;
  for (const route of CATALOG_ROUTES) {
    const value = byField.get(route.field);
    if (value && value.state !== "missing" && value.state !== "unreadable") {
      filled += 1;
    } else {
      byOwner[route.owner] = (byOwner[route.owner] ?? 0) + 1;
    }
  }
  return { filled, total: CATALOG_ROUTES.length, byOwner };
}

// Catalog fields that list a public source, and that nothing here collects yet.
export function publicFieldsNotCollected(): CatalogRoute[] {
  return CATALOG_ROUTES.filter((route) => route.publicNotCollected);
}
