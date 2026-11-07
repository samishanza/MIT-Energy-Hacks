import type { RegionConfig } from "../src/registry.ts";

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
        licenseNote: "PG&E public map, no login. Terms not yet read. Utility-published context for the location queried, not a site answer.",
        robotsChecked: "2026-11-07",
        objectIdAttribute: "FeederId",
        sourceDate: { attribute: "ICA_Analysis_Date", format: "text" },
        outFields: ["FeederId", "FeederName", "voltage_kv", "phase_cnt", "LoadCapacity_kW", "GenCapacity_kW", "limiting_criteria", "ScreenL", "ICA_Analysis_Date"],
        groupByAttribute: "FeederId",
        fields: [
          { field: "feeder", attribute: "FeederName", type: "text", grade: "reference" },
          { field: "feeder_voltage", attribute: "voltage_kv", type: "quantity", unit: "kV", grade: "reference" },
          { field: "feeder_phase", attribute: "phase_cnt", type: "quantity", unit: "phase", grade: "reference" },
          { field: "feeder_hosting_capacity", attribute: "GenCapacity_kW", type: "quantity", sourceUnit: "kW", unit: "MW", grade: "reference" },
          { field: "feeder_load_capacity", attribute: "LoadCapacity_kW", type: "quantity", sourceUnit: "kW", unit: "MW", grade: "reference" },
          { field: "feeder_limiting_criterion", attribute: "limiting_criteria", type: "text", grade: "reference" },
          { field: "feeder_screen_result", attribute: "ScreenL", type: "text", grade: "reference" },
        ],
      },
    },
  ],
  unavailable: [
    {
      sourceId: "earth-engine",
      name: "Google Earth Engine imagery and elevation",
      fields: ["aerial_image", "elevation_m"],
      reason: "The Earth Engine adapter isn't built yet, so imagery and elevation are missing.",
    },
  ],
  personRoutes: [
    {
      sourceId: "alameda-county-assessor",
      name: "Alameda County assessor",
      fields: ["parcel_id", "property_line", "lot_size_acres", "building_outline", "building_area_sqft"],
      reason: "No county parcel source is configured for this region, and its terms haven't been checked. A person looks this up.",
    },
  ],
};
