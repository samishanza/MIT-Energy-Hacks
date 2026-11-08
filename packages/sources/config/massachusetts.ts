import type { ArcgisEntry, FeederDetail, RegionConfig } from "../src/registry.ts";
import { censusLocalRoads } from "./census-roads.ts";
import { hifldTerritories, hifldTransmission, usgsPointElevation } from "./national.ts";

const NATIONAL_GRID = "https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP";
const NATIONAL_GRID_NOTE = "National Grid public portal, no key. No terms were found on the portal or service, and robots.txt returned 404. Utility-published context, not a site answer.";

const ngEntry = (id: string, name: string, path: string, layer: number, rest: Partial<ArcgisEntry> & Pick<ArcgisEntry, "objectIdAttribute" | "outFields" | "fields">): ArcgisEntry => ({
  kind: "arcgis_rest",
  id,
  name: `National Grid MA System Data Portal, ${name}`,
  serviceUrl: `${NATIONAL_GRID}/${path}/MapServer`,
  layer,
  searchRadiusMeters: 0,
  licenseNote: NATIONAL_GRID_NOTE,
  robotsChecked: "2026-11-07",
  attributesOnly: true,
  ...rest,
});

const MW = (field: string, attribute: string) => ({ field, attribute, type: "quantity" as const, unit: "MW", grade: "reference" as const });

const nationalGridDetails: FeederDetail[] = [
  {
    kind: "by_feeder",
    joinAttribute: "Master_CDF",
    entry: ngEntry("national-grid-feeder-loading", "feeder loading", "MASDP_Feeders", 0, {
      objectIdAttribute: "Master_CDF",
      sourceDate: { attribute: "Last_Updated", format: "text" },
      outFields: ["Master_CDF", "Substation", "Voltage__kV_", "Peak_Pct_Current_Year", "SN__MVA_", "Peak_MVA_Current_Year", "Peak_MVA_Year_Plus1", "Peak_MVA_Year_Plus2", "Peak_MVA_Year_Plus3", "Peak_MVA_Year_Plus4", "Peak_MVA_Year_Plus5", "Last_Updated"],
      fields: [
        { field: "feeder_layer_substation", attribute: "Substation", type: "text", grade: "reference" },
        { field: "feeder_layer_voltage", attribute: "Voltage__kV_", type: "quantity", unit: "kV", grade: "reference" },
        { field: "feeder_peak_loading_pct", attribute: "Peak_Pct_Current_Year", transform: { kind: "percent_text" }, grade: "reference" },
        { field: "feeder_rating_mva", attribute: "SN__MVA_", type: "quantity", unit: "MVA", zeroIsMissing: true, grade: "reference" },
        {
          field: "feeder_peak_forecast",
          transform: {
            kind: "series",
            attributes: ["Peak_MVA_Current_Year", "Peak_MVA_Year_Plus1", "Peak_MVA_Year_Plus2", "Peak_MVA_Year_Plus3", "Peak_MVA_Year_Plus4", "Peak_MVA_Year_Plus5"],
            unit: "MVA",
            describe: "peak this year, then each of the next five, as the utility forecasts",
          },
          grade: "reference",
        },
      ],
    }),
  },
  {
    kind: "construction",
    joinAttribute: "Master_CDF",
    constructionAttribute: "Construction",
    lengthAttribute: "Shape_Length",
    underground: "UG",
    field: "feeder_construction",
    entries: [1, 2, 4, 5].map((layer) =>
      ngEntry(`national-grid-construction-${layer}`, `overview layer ${layer}`, "MASDP_Overview", layer, { objectIdAttribute: "OBJECTID", outFields: ["OBJECTID", "Master_CDF", "Construction", "Shape_Length"], fields: [] }),
    ),
  },
  {
    kind: "by_feeder",
    joinAttribute: "Master_CDF",
    entry: ngEntry("national-grid-group-studies", "group studies", "MASDP_Group_Study_Feeders", 1, {
      objectIdAttribute: "Master_CDF",
      sourceDate: { attribute: "Last_Updated", format: "epoch_ms" },
      outFields: ["Master_CDF", "Group_Study_Map_Status", "Last_Updated"],
      fields: [{ field: "feeder_study_status", attribute: "Group_Study_Map_Status", type: "text", grade: "reference" }],
    }),
  },
  {
    kind: "by_feeder",
    joinAttribute: "Master_CDF",
    entry: ngEntry("national-grid-nodal-feeders", "nodal hosting capacity by feeder", "Nodal_Hosting_Capacity_MA", 0, {
      objectIdAttribute: "Master_CDF",
      sourceDate: { attribute: "hca_refresh_date", format: "text" },
      outFields: ["Master_CDF", "substation_name", "feeder_voltage", "feeder_installed_dg", "feeder_queued_dg", "Ongoing_ASO_Study", "hca_refresh_date"],
      fields: [
        { field: "feeder_nodal_substation", attribute: "substation_name", type: "text", grade: "reference" },
        { field: "feeder_nodal_voltage", attribute: "feeder_voltage", type: "quantity", unit: "kV", grade: "reference" },
        MW("feeder_installed_dg", "feeder_installed_dg"), MW("feeder_queued_dg", "feeder_queued_dg"), { field: "feeder_aso_study", attribute: "Ongoing_ASO_Study", type: "text", grade: "reference" }],
    }),
  },
  {
    // The primary segment nearest the site, with every limit kept and the lowest named.
    kind: "nearest",
    joinAttribute: "feeder_cdf",
    entry: ngEntry("national-grid-nodal-primary", "nodal hosting capacity on the primary", "Nodal_Hosting_Capacity_MA", 2, {
      attributesOnly: false,
      searchRadiusMeters: 30,
      objectIdAttribute: "feeder_cdf",
      groupByAttribute: "feeder_cdf",
      outFields: ["feeder_cdf", "primary_hc_over_voltage", "primary_hc_voltage_deviation", "primary_hc_regulator_deviation", "primary_hc_thermal_from_gen", "primary_hc_anti_islanding", "primary_hc_flicker"],
      fields: [
        {
          field: "feeder_nodal_hosting_capacity",
          transform: {
            kind: "lowest_of",
            unit: "MW",
            limits: {
              primary_hc_over_voltage: "over-voltage",
              primary_hc_voltage_deviation: "voltage deviation",
              primary_hc_regulator_deviation: "regulator deviation",
              primary_hc_thermal_from_gen: "thermal",
              primary_hc_anti_islanding: "anti-islanding",
              primary_hc_flicker: "flicker",
            },
          },
          sentinels: [-99.99],
          grade: "reference",
        },
      ],
    }),
  },
];

const MASSGIS = "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services";
const CREDIT = 'Credit: "MassGIS (Bureau of Geographic Information), Commonwealth of Massachusetts EOTSS".';
const HOST_ROBOTS = "The ArcGIS Online host answered robots.txt with 403, so no rule was read.";

export const massachusetts: RegionConfig = {
  id: "massachusetts",
  name: "Massachusetts (National Grid)",
  states: ["MA"],
  parcels: {
    addressAttribute: "SITE_ADDR",
    cityAttribute: "CITY",
    idAttribute: "LOC_ID",
    useAttribute: "USE_DESC",
    lotSizeAttribute: "LOT_SIZE",
    lotUnitsAttribute: "LOT_UNITS",
    yearBuiltAttribute: "YEAR_BUILT",
    storiesAttribute: "STORIES",
    entry: {
      kind: "arcgis_rest",
      id: "massgis-l3-parcels",
      name: "MassGIS L3 property tax parcels",
      serviceUrl: `${MASSGIS}/Massachusetts_Property_Tax_Parcels/FeatureServer`,
      layer: 0,
      searchRadiusMeters: 0,
      licenseNote: `MassGIS: a representation of property boundaries, not an authoritative source; the registries of deeds and a licensed surveyor are. ${HOST_ROBOTS} ${CREDIT}`,
      robotsChecked: "2026-11-07",
      objectIdAttribute: "LOC_ID",
      sourceDate: { attribute: "FY", format: "fiscal_year" },
      // Owner fields are left out on purpose, so they never reach a stored value or a recording.
      outFields: ["LOC_ID", "MAP_PAR_ID", "SITE_ADDR", "CITY", "ZIP", "USE_CODE", "USE_DESC", "LOT_SIZE", "LOT_UNITS", "BLD_AREA", "YEAR_BUILT", "FY", "ZONING", "STORIES"],
      fields: [
        { field: "parcel_id", attribute: "LOC_ID", type: "text", grade: "reference" },
        { field: "use_code", attribute: "USE_CODE", type: "text", grade: "reference" },
        { field: "building_area_sqft", attribute: "BLD_AREA", type: "quantity", unit: "sqft", zeroIsMissing: true, grade: "reference" },
        { field: "year_built", attribute: "YEAR_BUILT", type: "quantity", unit: "year", zeroIsMissing: true, grade: "reference" },
        // Towns that don't report a district leave a placeholder such as 0.
        { field: "zoning_district", attribute: "ZONING", type: "text", blankValues: ["0", "00", "-", "N/A", "NA", "NONE", "UNKNOWN", "UNK"], grade: "reference" },
        { field: "building_stories", attribute: "STORIES", type: "quantity", unit: "stories", zeroIsMissing: true, grade: "reference" },
        { field: "use_description", attribute: "USE_DESC", type: "text", grade: "reference" },
      ],
    },
  },
  buildings: {
    idAttribute: "STRUCT_ID",
    sourceDateAttribute: "SOURCEDATE",
    entry: {
      kind: "arcgis_rest",
      id: "massgis-roofprints",
      name: "MassGIS building structures (roofprints)",
      serviceUrl: `${MASSGIS}/Building_Structures/FeatureServer`,
      layer: 0,
      searchRadiusMeters: 0,
      licenseNote: `MassGIS and City of Boston, with no license text on the item. Reference grade, with no height. ${HOST_ROBOTS} ${CREDIT}`,
      robotsChecked: "2026-11-07",
      objectIdAttribute: "STRUCT_ID",
      sourceDate: { attribute: "SOURCEDATE", format: "yyyymmdd" },
      outFields: ["STRUCT_ID", "SOURCEDATE", "AREA_SQ_FT"],
      fields: [],
    },
  },
  // Only towns whose villages were seen filed under the town. Others resolve by the geocoded point.
  villages: {
    HYANNIS: "BARNSTABLE",
    CENTERVILLE: "BARNSTABLE",
    OSTERVILLE: "BARNSTABLE",
    COTUIT: "BARNSTABLE",
    "MARSTONS MILLS": "BARNSTABLE",
    "WEST BARNSTABLE": "BARNSTABLE",
  },
  territories: {
    ...hifldTerritories,
    withoutMap: {
      Eversource: "Eversource's hosting capacity map isn't read, because its terms bar reuse of its content without written permission. Ask Eversource for the feeder, or read it from a Pre-Application Report.",
    },
  },
  grid: [
    {
      utilityName: "National Grid",
      widenToMeters: 150,
      details: nationalGridDetails,
      segments: {
        searchMeters: 150,
        feederAttribute: "Master_CDF",
        constructionAttribute: "Construction",
        phasesAttribute: "Phases",
        construction: { OH: "overhead", UG: "underground" },
        entries: [1, 2, 4, 5].map((layer) =>
          ngEntry(`national-grid-segments-${layer}`, `line segments, overview layer ${layer}`, "MASDP_Overview", layer, {
            attributesOnly: false,
            objectIdAttribute: "OBJECTID",
            outFields: ["OBJECTID", "Master_CDF", "Construction", "Phases"],
            fields: [],
          }),
        ),
      },
      // The hosting capacity layer returns no geometry, so the lines come from the feeder layer.
      lineGeometry: {
        kind: "arcgis_rest",
        id: "national-grid-feeder-lines",
        name: "National Grid MA System Data Portal, feeder lines",
        serviceUrl: "https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP/MASDP_Feeders/MapServer",
        layer: 0,
        searchRadiusMeters: 30,
        licenseNote: "National Grid public portal, no key. No terms were found on the portal or service, and robots.txt returned 404. Line positions are schematic context, not a survey.",
        robotsChecked: "2026-11-07",
        objectIdAttribute: "Master_CDF",
        outFields: ["Master_CDF"],
        groupByAttribute: "Master_CDF",
        fields: [],
      },
      entry: {
        kind: "arcgis_rest",
        id: "national-grid-hosting-capacity",
        name: "National Grid MA System Data Portal, 3-phase feeders",
        serviceUrl: "https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP/MASDP_HostingCapacity/MapServer",
        layer: 0,
        // The feeder count depends on this distance, so it's fixed here and stored on each observation.
        searchRadiusMeters: 30,
        licenseNote: "National Grid public portal, no key. No terms were found on the portal or service, and robots.txt returned 404. Utility-published context for the location queried, not a site answer.",
        robotsChecked: "2026-11-07",
        objectIdAttribute: "Master_CDF",
        sourceDate: { attribute: "Updated_Date", format: "epoch_ms" },
        outFields: ["Master_CDF", "Substation", "Operating_Voltage_kV", "HC_Available_MW", "Updated_Date"],
        groupByAttribute: "Master_CDF",
        fields: [
          { field: "feeder", attribute: "Master_CDF", type: "text", grade: "reference" },
          { field: "feeder_substation", attribute: "Substation", type: "text", grade: "reference" },
          { field: "feeder_voltage", attribute: "Operating_Voltage_kV", type: "quantity", unit: "kV", grade: "reference" },
          { field: "feeder_phase", constant: { type: "quantity", value: 3, unit: "phase" }, grade: "reference" },
          { field: "feeder_hosting_capacity", attribute: "HC_Available_MW", type: "quantity", unit: "MW", grade: "reference" },
        ],
      },
    },
  ],
  roads: censusLocalRoads,
  layers: [
    {
      mode: { kind: "items", field: "proposed_substations_nearby", noun: "proposed substation", plural: "proposed substations", nameAttribute: "OBJECTID", labelPrefix: "Proposed substation #", feature: "substation", limit: 10, absent: "unknown", note: "A substation National Grid proposes, with measured distance. It isn't built, and the utility decides whether it ever serves the site." },
      entry: ngEntry("national-grid-proposed-substations", "proposed substations", "MASDP_Proposed_Substation", 0, {
        attributesOnly: false,
        searchRadiusMeters: 10000,
        objectIdAttribute: "OBJECTID",
        outFields: ["OBJECTID", "CIP_Fee"],
        fields: [{ field: "cip_fee", attribute: "CIP_Fee", type: "text", grade: "reference" }],
      }),
    },
    {
      mode: { kind: "items", field: "transmission_nearby", noun: "mapped transmission line", plural: "mapped transmission lines", nameAttribute: "SUB_1", labelPrefix: "Transmission line from ", feature: "utility_line", limit: 50, absent: "unknown", note: "Nearby context with measured distance. A transmission line isn't a point of interconnection for this site, and the owner named in this national layer can be out of date." },
      entry: hifldTransmission,
    },
    {
      mode: { kind: "items", field: "substations_nearby", noun: "mapped substation", plural: "mapped substations", nameAttribute: "NAME", feature: "substation", limit: 50, absent: "unknown", note: "Nearby context with measured distance. Distance doesn't show which substation serves the site." },
      entry: ngEntry("national-grid-substations", "substations", "MASDP_Substations", 0, {
        attributesOnly: false,
        searchRadiusMeters: 3000,
        objectIdAttribute: "OBJECTID",
        outFields: ["OBJECTID", "NAME", "TYPE", "STATUS"],
        fields: [
          { field: "substation_type", attribute: "TYPE", type: "text", grade: "reference" },
          { field: "substation_status", attribute: "STATUS", type: "text", grade: "reference" },
        ],
      }),
    },
    {
      mode: { kind: "one", pick: "first" },
      entry: {
        kind: "arcgis_rest",
        id: "massgis-municipalities",
        name: "MassGIS municipalities",
        serviceUrl: `${MASSGIS}/Massachusetts_Municipalities/FeatureServer`,
        layer: 1,
        searchRadiusMeters: 0,
        licenseNote: `MassGIS: public records; authoritative boundaries come only from a licensed surveyor. ${HOST_ROBOTS} ${CREDIT}`,
        robotsChecked: "2026-11-07",
        objectIdAttribute: "OBJECTID",
        outFields: ["OBJECTID", "TOWN", "COUNTY"],
        fields: [
          { field: "municipality", attribute: "TOWN", type: "text", grade: "reference" },
          { field: "county", attribute: "COUNTY", type: "text", grade: "reference" },
        ],
      },
    },
    {
      mode: { kind: "one", pick: "address_street", streetAttribute: "STREETNAME", emptyReason: "MassDOT maps no road within 50 m of this parcel." },
      entry: {
        kind: "arcgis_rest",
        id: "massdot-roads",
        name: "MassGIS-MassDOT roads",
        serviceUrl: `${MASSGIS}/MassDOTRoads_gdb/FeatureServer`,
        layer: 0,
        searchRadiusMeters: 50,
        licenseNote: `MassDOT and MassGIS: "a public resource and may be used by anyone for their purposes", and not a legal description. ${HOST_ROBOTS} ${CREDIT}`,
        robotsChecked: "2026-11-07",
        objectIdAttribute: "OBJECTID",
        outFields: ["OBJECTID", "STREETNAME", "NUM_LANES", "SURFACE_TP", "SURFACE_WD"],
        fields: [
          { field: "road_name", attribute: "STREETNAME", type: "text", grade: "reference" },
          { field: "road_width_ft", attribute: "SURFACE_WD", type: "quantity", unit: "ft", zeroIsMissing: true, grade: "reference" },
          { field: "road_lanes", attribute: "NUM_LANES", type: "quantity", unit: "lanes", zeroIsMissing: true, grade: "reference" },
          { field: "road_surface_type", attribute: "SURFACE_TP", type: "text", blankValues: ["0"], grade: "reference" },
        ],
      },
    },
    {
      mode: { kind: "items", field: "wetlands_nearby", noun: "mapped wetland area", plural: "mapped wetland areas", nameAttribute: "IT_VALDESC", feature: "constraint", limit: 10, absent: "none_mapped", note: "Photo-interpreted, for planning only, and not a delineation under the Wetlands Protection Act." },
      entry: {
        kind: "arcgis_rest",
        id: "massdep-wetlands",
        name: "MassDEP wetlands",
        serviceUrl: `${MASSGIS}/DEP_Wetlands/FeatureServer`,
        layer: 1,
        searchRadiusMeters: 500,
        licenseNote: `MassDEP and MassGIS: "for planning purposes only", determined by photographic interpretation, and not delineations under M.G.L. c. 131 s. 40. ${HOST_ROBOTS} ${CREDIT}`,
        robotsChecked: "2026-11-07",
        objectIdAttribute: "OBJECTID",
        outFields: ["OBJECTID", "IT_VALDESC", "AREAACRES"],
        fields: [
          { field: "wetland_type", attribute: "IT_VALDESC", type: "text", grade: "reference" },
          { field: "wetland_acres", attribute: "AREAACRES", type: "quantity", unit: "acre", grade: "reference" },
        ],
      },
    },
    {
      mode: { kind: "items", field: "fire_stations_nearby", noun: "fire station", plural: "fire stations", nameAttribute: "NAME", feature: "constraint", limit: 3, absent: "unknown" },
      entry: {
        kind: "arcgis_rest",
        id: "massgis-fire-stations",
        name: "MassGIS fire stations",
        serviceUrl: `${MASSGIS}/Fire_Stations/FeatureServer`,
        layer: 0,
        searchRadiusMeters: 8000,
        licenseNote: `MEMA and MassGIS, with no license text on the item. ${HOST_ROBOTS} ${CREDIT}`,
        robotsChecked: "2026-11-07",
        objectIdAttribute: "OBJECTID",
        outFields: ["OBJECTID", "NAME", "ADDRESS", "CITY"],
        fields: [
          { field: "address", attribute: "ADDRESS", type: "text", grade: "reference" },
          { field: "city", attribute: "CITY", type: "text", grade: "reference" },
        ],
      },
    },
  ],
  jsonSources: [usgsPointElevation],
  lidarSlope: {
    sourceDate: "2013 to 2021",
    source: {
      id: "massgis-lidar-dem",
      name: "MassGIS lidar elevation",
      kind: "arcgis_rest",
      dataOrigin: "real",
      url: "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/LiDAR/DEM_lidar_2013to2021_32bitFloat/ImageServer",
      licenseNote: "MassGIS. Its host returned 502 for robots.txt, so no rule could be read, and no terms were found on the service. Mixed vintage, 2013 to 2021.",
    },
  },
  imagery: {
    id: "massgis-imagery-2025",
    name: "MassGIS 2025 aerial imagery",
    serviceUrl: "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer",
    tileUrlTemplate:
      "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer/tile/{z}/{y}/{x}",
    attribution: "MassGIS 2025 aerial imagery",
    sourceDate: "2025",
    maxZoom: 20,
    licenseNote: "MassGIS: no restrictions apply, but conditions may have changed since the flight, and it isn't for critical use without checking.",
    description: "MassGIS 2025 aerial imagery, 15 cm, flown March to April 2025",
  },
  // Imagery stays MassGIS where it's configured, and lidar slope stays the current slope.
  earthEngine: { landCover: true, terrain: true, imagery: false },
  unavailable: [],
  personRoutes: [
    {
      sourceId: "fema-flood-map",
      name: "FEMA Flood Map Service Center",
      fields: ["flood_zone"],
      reason: "A person reads the flood zone for the site from FEMA's Flood Map Service Center (msc.fema.gov). The tool doesn't query FEMA's services, which bar automated access.",
    },
  ],
};
