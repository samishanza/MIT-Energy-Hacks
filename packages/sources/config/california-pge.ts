import type { RegionConfig } from "../src/registry.ts";
import { censusLocalRoads } from "./census-roads.ts";
import { hifldTerritories, usgsPointElevation } from "./national.ts";

// The PG&E GRIP service, whose layers share a host and terms.
const PGE_ENTRY = {
  kind: "arcgis_rest" as const,
  serviceUrl: "https://services2.arcgis.com/mJaJSax0KPHoCNB6/arcgis/rest/services/DRPComplianceRelProd/FeatureServer",
  licenseNote: 'PG&E: the item says it makes the data "available for general public consumption". The ArcGIS Online host answered robots.txt with 403, so no rule was read. Utility-published context for the location queried, not a site answer.',
  robotsChecked: "2026-11-07",
};

export const californiaPge: RegionConfig = {
  id: "california-pge",
  name: "California (PG&E)",
  states: ["CA"],
  grid: [
    {
      utilityName: "PG&E",
      entry: {
        kind: "arcgis_rest",
        id: "pge-grip-line-detail",
        name: "PG&E GRIP line sections",
        serviceUrl: "https://services2.arcgis.com/mJaJSax0KPHoCNB6/arcgis/rest/services/DRPComplianceRelProd/FeatureServer",
        layer: 3,
        // A Census point falls along the street, so this search is wider than one from a parcel.
        searchRadiusMeters: 100,
        licenseNote: 'PG&E: the item says it makes the data "available for general public consumption". The ArcGIS Online host answered robots.txt with 403, so no rule was read. Utility-published context for the location queried, not a site answer.',
        robotsChecked: "2026-11-07",
        objectIdAttribute: "FeederId",
        sourceDate: { attribute: "ICA_Analysis_Date", format: "text" },
        outFields: ["FeederId", "FeederName", "voltage_kv", "phase_cnt", "LoadCapacity_kW", "GenCapacity_kW", "limiting_criteria", "ScreenL", "ICA_Analysis_Date"],
        groupByAttribute: "FeederId",
        fields: [
          { field: "feeder", attribute: "FeederName", type: "text", grade: "reference" },
          { field: "feeder_voltage", attribute: "voltage_kv", type: "quantity", unit: "kV", grade: "reference" },
          { field: "feeder_phase", attribute: "phase_cnt", type: "quantity", unit: "phase", grade: "reference" },
          { field: "feeder_hosting_capacity", attribute: "GenCapacity_kW", type: "quantity", sourceUnit: "kW", unit: "MW", sentinels: [-99.99], grade: "reference" },
          { field: "feeder_load_capacity", attribute: "LoadCapacity_kW", type: "quantity", sourceUnit: "kW", unit: "MW", sentinels: [-99.99], grade: "reference" },
          { field: "feeder_limiting_criterion", attribute: "limiting_criteria", type: "text", grade: "reference" },
          { field: "feeder_screen_result", attribute: "ScreenL", type: "text", grade: "reference" },
        ],
      },
    },
  ],
  roads: censusLocalRoads,
  layers: [
    {
      mode: { kind: "items", field: "substations_nearby", noun: "mapped substation", plural: "mapped substations", nameAttribute: "SubstationName", feature: "substation", limit: 3, absent: "unknown", note: "Nearby context with measured distance. Distance doesn't show which substation serves the site." },
      entry: {
        ...PGE_ENTRY,
        id: "pge-substations",
        name: "PG&E GRIP distribution substations",
        layer: 0,
        searchRadiusMeters: 3000,
        objectIdAttribute: "OBJECTID",
        outFields: ["OBJECTID", "SubstationName", "Voltage_kV"],
        // Its DG totals state no unit, so they aren't read.
        fields: [{ field: "substation_voltage", attribute: "Voltage_kV", type: "quantity", unit: "kV", grade: "reference" }],
      },
    },
    {
      mode: { kind: "items", field: "transmission_nearby", noun: "mapped transmission line", plural: "mapped transmission lines", nameAttribute: "TLINE_NAME", feature: "utility_line", limit: 5, absent: "unknown", note: "Nearby context with measured distance. A transmission line isn't a point of interconnection for this site." },
      entry: {
        ...PGE_ENTRY,
        id: "pge-transmission",
        name: "PG&E GRIP transmission lines",
        layer: 5,
        searchRadiusMeters: 1500,
        objectIdAttribute: "OBJECTID",
        outFields: ["OBJECTID", "TLINE_NAME", "RATEDKV"],
        fields: [{ field: "line_voltage", attribute: "RATEDKV", type: "quantity", unit: "kV", grade: "reference" }],
      },
    },
  ],
  jsonSources: [usgsPointElevation],
  territories: { ...hifldTerritories, withoutMap: {} },
  earthEngine: { landCover: true, terrain: true, imagery: true },
  unavailable: [],
  personRoutes: [
    {
      sourceId: "alameda-county-assessor",
      name: "Alameda County assessor",
      fields: ["parcel_id", "property_line", "lot_size_acres", "building_outline", "building_area_sqft"],
      reason: "No county parcel source is configured for this region, and its terms haven't been checked. A person looks this up.",
    },
  ],
};
