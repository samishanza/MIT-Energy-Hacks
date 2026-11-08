import type { JsonSource } from "../src/json-api.ts";
import type { ArcgisEntry, TerritorySource } from "../src/registry.ts";

// HIFLD's transmission lines, as the US Fish and Wildlife Service republishes them. The national HIFLD Open site closed in 2025.
export const hifldTransmission: ArcgisEntry = {
  kind: "arcgis_rest",
  id: "hifld-transmission-lines",
  name: "HIFLD electric power transmission lines (US Fish and Wildlife Service copy)",
  serviceUrl: "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer",
  layer: 0,
  searchRadiusMeters: 3000,
  licenseNote: "HIFLD data republished by the US Fish and Wildlife Service, whose license text disclaims liability and warranty and asks users to read the metadata. Source dates are often 2015 or older. The ArcGIS Online host answered robots.txt with 403, so no rule was read.",
  robotsChecked: "2026-11-07",
  objectIdAttribute: "OBJECTID",
  sourceDate: { attribute: "SOURCEDATE", format: "epoch_ms" },
  outFields: ["OBJECTID", "OWNER", "VOLTAGE", "SUB_1", "SUB_2", "STATUS", "SOURCEDATE"],
  fields: [
    { field: "line_voltage", attribute: "VOLTAGE", type: "quantity", unit: "kV", sentinels: [-999999], zeroIsMissing: true, grade: "reference" },
    { field: "line_owner", attribute: "OWNER", type: "text", blankValues: ["NOT AVAILABLE"], grade: "reference" },
    { field: "line_from", attribute: "SUB_1", type: "text", blankValues: ["NOT AVAILABLE"], grade: "reference" },
    { field: "line_to", attribute: "SUB_2", type: "text", blankValues: ["NOT AVAILABLE"], grade: "reference" },
    { field: "line_status", attribute: "STATUS", type: "text", grade: "reference" },
  ],
};

export const hifldTerritories: Omit<TerritorySource, "withoutMap"> = {
  nameAttribute: "NAME",
  customersAttribute: "CUSTOMERS",
  areaAttribute: "Shape__Area",
  // Only names checked against the companies' own filings: NSTAR Electric does business as Eversource,
  // Massachusetts Electric and Nantucket Electric as National Grid, Fitchburg Gas and Electric Light as Unitil.
  commonNames: {
    "MASSACHUSETTS ELECTRIC CO": "National Grid",
    "NANTUCKET ELECTRIC CO": "National Grid",
    "NSTAR ELECTRIC COMPANY": "Eversource",
    "FITCHBURG GAS & ELEC LIGHT CO": "Unitil",
    "PACIFIC GAS & ELECTRIC CO": "PG&E",
  },
  entry: {
    kind: "arcgis_rest",
    id: "hifld-retail-territories",
    name: "HIFLD electric retail service territories",
    serviceUrl: "https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer",
    layer: 0,
    searchRadiusMeters: 0,
    licenseNote: "From the HIFLD Open dataset published in 2025, per the item. Boundaries are approximate and overlap. The ArcGIS Online host answered robots.txt with 403, so no rule was read.",
    robotsChecked: "2026-11-07",
    objectIdAttribute: "ID",
    attributesOnly: true,
    sourceDate: { attribute: "SOURCEDATE", format: "epoch_ms" },
    outFields: ["ID", "NAME", "TYPE", "CUSTOMERS", "Shape__Area", "SOURCEDATE"],
    fields: [],
  },
};

const ELEVATION_FIELD = "ground_elevation_ft";

// The service marks a point with no data using a large negative number.
const usable = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > -1000;

export const usgsPointElevation: JsonSource = {
  id: "usgs-epqs",
  name: "USGS Elevation Point Query Service",
  url: "https://epqs.nationalmap.gov/v1/json",
  licenseNote: "USGS-produced data is public domain, with credit requested. Its robots.txt request returned 403, so no rule was read. Answers can be intermittent.",
  robotsChecked: "2026-11-07",
  fields: [ELEVATION_FIELD],
  params: ({ location: [longitude, latitude] }) => ({ x: String(longitude), y: String(latitude), wkid: "4326", units: "Feet", includeDate: "false" }),
  read: (body) => {
    const raw = (body as { value?: unknown }).value;
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (!usable(value)) return [];
    return [{ field: ELEVATION_FIELD, value: { type: "quantity", value: Math.round(value * 10) / 10, unit: "ft" }, attribute: "value", grade: "reference" }];
  },
  emptyReason: "The elevation service holds no value at this point.",
};
