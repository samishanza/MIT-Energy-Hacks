import type { JsonSource } from "../src/json-api.ts";
import type { TerritorySource } from "../src/registry.ts";

export const hifldTerritories: Omit<TerritorySource, "withoutMap"> = {
  nameAttribute: "NAME",
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
    outFields: ["ID", "NAME", "TYPE", "SOURCEDATE"],
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
