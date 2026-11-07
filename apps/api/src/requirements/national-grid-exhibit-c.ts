import type { Owner, ValueState } from "@eqore/contract";

export type RequirementRow = {
  id: string;
  rowKind: "form" | "input";
  label: string;
  citation: string;
  fields: string[];
  minState: ValueState;
  owner: Owner;
  // For an input row: the drawing it feeds. These rows are team-derived, because the form has no field for them.
  parentItemId?: string;
  // Public data can preview this row, but only the named document satisfies it.
  previewOnly?: boolean;
};

export type RequirementsTable = {
  utility: string;
  form: string;
  formDate: string;
  superseded: boolean;
  rows: RequirementRow[];
};

const exhibitC = (pages: string) => `M.D.P.U. No. 1632, Exhibit C, Page ${pages}`;
const oneLineInput = "Input to the PE-stamped one-line (Exhibit C, Page 124). Team-derived, not a form field";
const siteDocInput = "Input to the site documentation (Exhibit C, Page 124). Team-derived, not a form field";

const customerRow = (id: string, label: string, pages: string, field: string): RequirementRow => ({
  id,
  rowKind: "form",
  label,
  citation: exhibitC(pages),
  fields: [field],
  minState: "verified",
  owner: "customer",
});

const engineerRow = (id: string, label: string, pages: string, field: string): RequirementRow => ({
  id,
  rowKind: "form",
  label,
  citation: exhibitC(pages),
  fields: [field],
  minState: "verified",
  owner: "engineer",
});

const inputRow = (id: string, label: string, parentItemId: string, field: string, owner: Owner, minState: ValueState = "verified"): RequirementRow => ({
  id,
  rowKind: "input",
  label,
  citation: parentItemId === "one-line" ? oneLineInput : siteDocInput,
  fields: [field],
  minState,
  owner,
  parentItemId,
});

// Page numbers were read from the tariff PDF, effective May 1, 2026.
// Eversource's seminar excerpts are out of scope for this table.
export const NATIONAL_GRID_EXHIBIT_C: RequirementsTable = {
  utility: "National Grid",
  form: "M.D.P.U. No. 1632, Exhibit C",
  formDate: "2026-05-01",
  superseded: false,
  rows: [
    customerRow("applicant-contacts", "Interconnecting customer and contacts", "116", "interconnecting_customer"),
    customerRow("site-control", "Site control, with Attachment 1A or 1B", "116, 125 to 128", "site_control"),
    engineerRow("single-parcel", "Facility on a single parcel of land", "116", "single_parcel"),
    customerRow("existing-generation", "Existing generation and its application numbers", "117", "existing_generation"),
    // The form's new-or-change block holds facts two parties own, so it takes one row for each.
    customerRow("existing-facility", "If changing an existing facility: its application number and nameplate capacity", "117", "existing_facility_record"),
    engineerRow("new-or-change", "New facility or change to an existing one: the change description, proposed change, and total capacity", "117", "facility_change_plan"),
    {
      id: "facility-address",
      rowKind: "form",
      label: "Address of the facility",
      citation: exhibitC("117"),
      fields: ["site_location", "parcel_id"],
      minState: "inferred",
      owner: "public_data",
    },
    {
      id: "distribution-company",
      rowKind: "form",
      label: "Electric distribution company",
      citation: exhibitC("117"),
      fields: ["serving_utility"],
      minState: "inferred",
      owner: "utility",
    },
    customerRow("account-number", "Account number, from an actual bill", "115, 117", "account_number"),
    customerRow("meter-number", "Meter number, from an actual bill", "115, 117", "meter_number"),
    {
      id: "pre-application-report",
      rowKind: "form",
      label: "Pre-Application Report",
      citation: `${exhibitC("114, 117")}; Exhibit B, Page 112`,
      fields: ["feeder"],
      minState: "verified",
      owner: "utility",
      previewOnly: true,
    },
    engineerRow("system-capacity", "System design capacity", "117", "system_capacity_kw"),
    engineerRow("generating-equipment", "Generating units: make, model, quantity, and AC ratings", "118 to 119", "generating_equipment"),
    engineerRow("export-plan", "Export plan", "119", "export_plan"),
    engineerRow("applicant-signature", "Interconnecting customer signature", "120", "applicant_signature"),
    engineerRow("generator-characteristics", "Power factor and fault contribution", "121", "generator_characteristics"),
    engineerRow("interconnection-equipment", "Transformer, fuse, breaker, relays, CTs, and PTs", "122 to 123", "interconnection_equipment"),
    engineerRow("one-line", "PE-stamped one-line diagram", "124", "one_line_diagram"),
    inputRow("service-voltage", "Service voltage", "one-line", "service_voltage", "customer"),
    inputRow("main-device", "Main device rating", "one-line", "main_device_rating", "engineer"),
    inputRow("bus", "Bus rating", "one-line", "bus_rating", "qualified_person"),
    inputRow("kaic", "Short-circuit rating (kAIC)", "one-line", "kaic_rating", "qualified_person"),
    engineerRow("site-documentation", "Site documentation of the facility's precise location", "124", "site_documentation"),
    inputRow("property-line", "Property line", "site-documentation", "property_line", "public_data", "inferred"),
    inputRow("building-outline", "Building outline", "site-documentation", "building_outline", "public_data", "inferred"),
    inputRow("aerial", "Aerial image", "site-documentation", "aerial_image", "public_data", "inferred"),
    inputRow("switchboard-location", "Main switchboard location", "site-documentation", "switchboard_location", "customer"),
    inputRow("meter-location", "Meter location", "site-documentation", "meter_location", "customer"),
    inputRow("transformer-location", "Utility transformer location", "site-documentation", "utility_transformer_location", "customer"),
    engineerRow("protective-interface-location", "Location of protective interface equipment", "124", "protective_interface_location"),
    engineerRow("protection-schematics", "Protection and control schematics", "124", "protection_schematics"),
  ],
};
