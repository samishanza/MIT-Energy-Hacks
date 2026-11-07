import type { RoadSource } from "../src/registry.ts";

// National, so road side works anywhere a parcel polygon exists.
export const censusLocalRoads: RoadSource = {
  nameAttribute: "NAME",
  entry: {
    kind: "arcgis_rest",
    id: "census-tiger-local-roads",
    name: "US Census TIGERweb local roads",
    serviceUrl: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer",
    layer: 8,
    searchRadiusMeters: 100,
    licenseNote: "US Census Bureau public data. Its robots.txt request was rejected by a firewall, so no rule was read. Road centerlines, not surveyed.",
    robotsChecked: "2026-11-07",
    objectIdAttribute: "OBJECTID",
    outFields: ["OBJECTID", "NAME", "MTFCC"],
    fields: [],
  },
};
