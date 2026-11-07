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

const exhibitC = (sheet: string) => `M.D.P.U. No. 1468, Exhibit C, Sheet ${sheet}`;
const oneLineInput = "Input to the PE-stamped one-line (Exhibit C, Sheet 117). Team-derived, not a form field";
const siteDocInput = "Input to the site documentation (Exhibit C, Sheet 117). Team-derived, not a form field";

const customerRow = (id: string, label: string, sheet: string, field: string): RequirementRow => ({
  id,
  rowKind: "form",
  label,
  citation: exhibitC(sheet),
  fields: [field],
  minState: "verified",
  owner: "customer",
});

const engineerRow = (id: string, label: string, sheet: string, field: string): RequirementRow => ({
  id,
  rowKind: "form",
  label,
  citation: exhibitC(sheet),
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

// Built from the 2021 tariff because the current one hasn't been read yet. No. 1632, effective
// May 1, 2026, replaced this line, and a person has to compare the two before real use.
// Eversource's seminar excerpts are out of scope for this table.
export const NATIONAL_GRID_EXHIBIT_C: RequirementsTable = {
  utility: "National Grid",
  form: "M.D.P.U. No. 1468, Exhibit C, Expedited/Standard Process Interconnection Application",
  formDate: "2021-09-15",
  superseded: true,
  rows: [
    customerRow("applicant-contacts", "Interconnecting customer and contacts", "110", "interconnecting_customer"),
    customerRow("site-control", "Site control, with Attachment 1A or 1B", "110, 118 to 121", "site_control"),
    engineerRow("single-parcel", "Facility on a single parcel of land", "110", "single_parcel"),
    customerRow("existing-generation", "Existing generation and its application numbers", "111", "existing_generation"),
    {
      id: "facility-address",
      rowKind: "form",
      label: "Address of the facility",
      citation: exhibitC("111"),
      fields: ["site_location", "parcel_id"],
      minState: "inferred",
      owner: "public_data",
    },
    {
      id: "distribution-company",
      rowKind: "form",
      label: "Electric distribution company",
      citation: exhibitC("111"),
      fields: ["serving_utility"],
      minState: "inferred",
      owner: "utility",
    },
    customerRow("account-number", "Account number, from an actual bill", "111", "account_number"),
    customerRow("meter-number", "Meter number, from an actual bill", "111", "meter_number"),
    {
      id: "pre-application-report",
      rowKind: "form",
      label: "Pre-Application Report",
      citation: `${exhibitC("111")}; Exhibit B, Sheet 106`,
      fields: ["feeder"],
      minState: "verified",
      owner: "utility",
      previewOnly: true,
    },
    engineerRow("system-capacity", "System design capacity", "111", "system_capacity_kw"),
    engineerRow("generating-equipment", "Generating units: make, model, quantity, and AC ratings", "111 to 112", "generating_equipment"),
    engineerRow("export-plan", "Export plan", "112", "export_plan"),
    engineerRow("applicant-signature", "Interconnecting customer signature", "113", "applicant_signature"),
    engineerRow("generator-characteristics", "Power factor and fault contribution", "114", "generator_characteristics"),
    engineerRow("interconnection-equipment", "Transformer, fuse, breaker, relays, CTs, and PTs", "115 to 116", "interconnection_equipment"),
    engineerRow("one-line", "PE-stamped one-line diagram", "117", "one_line_diagram"),
    inputRow("service-voltage", "Service voltage", "one-line", "service_voltage", "customer"),
    inputRow("main-device", "Main device rating", "one-line", "main_device_rating", "engineer"),
    inputRow("bus", "Bus rating", "one-line", "bus_rating", "qualified_person"),
    inputRow("kaic", "Short-circuit rating (kAIC)", "one-line", "kaic_rating", "qualified_person"),
    engineerRow("site-documentation", "Site documentation of the facility's precise location", "117", "site_documentation"),
    inputRow("property-line", "Property line", "site-documentation", "property_line", "public_data", "inferred"),
    inputRow("building-outline", "Building outline", "site-documentation", "building_outline", "public_data", "inferred"),
    inputRow("aerial", "Aerial image", "site-documentation", "aerial_image", "public_data", "inferred"),
    inputRow("switchboard-location", "Main switchboard location", "site-documentation", "switchboard_location", "customer"),
    inputRow("meter-location", "Meter location", "site-documentation", "meter_location", "customer"),
    inputRow("transformer-location", "Utility transformer location", "site-documentation", "utility_transformer_location", "customer"),
    engineerRow("protective-interface-location", "Location of protective interface equipment", "117", "protective_interface_location"),
    engineerRow("protection-schematics", "Protection and control schematics", "117", "protection_schematics"),
  ],
};
