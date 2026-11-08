# What we map, and from where

Every feature drawn on the site map and every value in the site record, with the source it comes from. Sources are configured per region in `packages/sources/config/`. Massachusetts (`massachusetts.ts`) is the full region; California PG&E (`california-pge.ts`) is a partial second one. Why each kind of value can be wrong is collected once, at the end.

## Map features

Each feature has a `kind`, a `field` that ties it to a record value, and a label. Features we inferred or detected carry a `basis` attribute.

| Feature | Kind | Source | Basis |
|---|---|---|---|
| Property line | `property_line` | MassGIS L3 parcels | public record |
| Building outlines | `building_outline` | MassGIS building roofprints | public record |
| Roads in front of the site | `road` | US Census TIGERweb local roads | public record |
| Open ground for a pad | `candidate_area` | Computed: the largest open area clear of the buildings and the lot-line setback | computed |
| Lot and building dimensions | `dimension_line` | Computed from the parcel and building outlines | computed |
| Wetlands on or near the parcel | `constraint` | MassDEP wetlands | public record |
| Nearest fire stations | `constraint` | MassGIS fire stations | public record |
| Distribution feeder lines, with phase and overhead or underground | `utility_line` | National Grid System Data Portal, overview layers 1, 2, 4, 5 | utility map |
| Feeder candidates near the site, with hosting capacity | `utility_line` | National Grid System Data Portal, 3-phase feeders | utility map |
| Transmission lines | `utility_line` | HIFLD transmission lines (US Fish and Wildlife Service copy) | public record |
| Substations | `substation` | National Grid substations | utility map |
| Proposed substations | `substation` | National Grid proposed substations | utility map |
| Utility poles | `existing_equipment` | USGS 3DEP lidar, by shape | detected (lidar) |
| Overhead conductors between poles | `utility_line` | USGS 3DEP lidar, by shape | detected (lidar) |
| Service drop, service pole, service entrance | `utility_line`, `existing_equipment` | USGS 3DEP lidar, by shape | detected (lidar) |
| Possible pad-mount transformers | `existing_equipment` | USGS 3DEP lidar, by shape | detected (lidar) |
| Service path from the nearest mapped line, when lidar finds no drop | `utility_line`, `existing_equipment` | Computed from the National Grid line segments and the building | inferred |
| Concept battery pad, AC disconnect, trench route, new breaker | `candidate_area`, `existing_equipment`, `utility_line` | Computed by `@eqore/electrical` from the record | concept |
| Photo pins | `capture_pin` | Equipment located from a person's photo through the capture link, until someone verifies it | human evidence |

The aerial basemap is MassGIS 2025 imagery in Massachusetts, and NAIP through Earth Engine elsewhere.

## Record values, by group

| Group | Fields | Source |
|---|---|---|
| Location | `site_location` | US Census geocoder, then the MassGIS parcel; or a pin the engineer places |
| Parcel | `parcel_id`, `use_code`, `use_description`, `year_built`, `building_area_sqft`, `building_stories`, `zoning_district`, `lot_size_acres` | MassGIS L3 parcels (assessor data) |
| Town | `municipality`, `county` | MassGIS municipalities |
| Geometry | `lot_width_ft`, `lot_depth_ft`, `building_*_ft`, `building_footprint_sqft`, `roofprint_coverage_pct`, `building_to_lot_line_ft`, `pad_zone_*` | Computed from parcels and roofprints |
| Road | `road_name`, `road_width_ft`, `road_lanes`, `road_surface_type` | MassGIS-MassDOT roads |
| Terrain | `ground_elevation_ft`, `site_slope_pct` | USGS point elevation; MassGIS lidar elevation; USGS 3DEP 10 m via Earth Engine |
| Land cover | `land_cover` | ESA WorldCover 2021 via Earth Engine |
| Constraints | `wetlands_nearby`, `wetland_type`, `wetland_acres`, `fire_stations_nearby` | MassDEP wetlands; MassGIS fire stations |
| Flood zone | `flood_zone` | A person reads the FEMA Flood Map Service Center (link only, not queried) |
| Serving utility | `serving_utility`, `utility_territories` | National Grid feeder at the site; HIFLD retail service territories |
| Feeder | `feeder`, `feeder_substation`, `feeder_voltage`, `feeder_phase`, `feeder_hosting_capacity`, `feeder_construction` | National Grid System Data Portal, 3-phase feeders and overview layers |
| Feeder loading | `feeder_peak_loading_pct`, `feeder_peak_forecast`, `feeder_rating_mva` | National Grid feeder loading |
| Hosting capacity near the site | `feeder_nodal_*`, `feeder_installed_dg`, `feeder_queued_dg`, `feeder_aso_study` | National Grid nodal hosting capacity |
| Group studies | `feeder_study_status` | National Grid group studies |
| Grid nearby | `substations_nearby`, `proposed_substations_nearby`, `transmission_nearby` | National Grid substations and proposed substations; HIFLD transmission lines |
| How the building is fed | `grid_service_path` | USGS 3DEP lidar service drop; otherwise the nearest National Grid line segment |
| Detected equipment | `detected_grid_equipment` | USGS 3DEP lidar |
| Existing service | `service_size_a`, `service_voltage`, `service_construction`, `service_phase`, `transformer_kva`, `electrical_permit_history` | City of Cambridge electrical permits (structured fields); City of Somerville permit applications (permit text) |
| Customer and nameplate facts | `account_number`, `meter_number`, `peak_demand_kw`, `main_device_rating`, `bus_rating`, `kaic_rating`, `switchboard_location`, `meter_location` | Photos and the utility bill through the capture link; a qualified person for bus and kAIC |
| Engineer decisions | `system_capacity_kw`, `generating_equipment`, `one_line_diagram`, and the rest owned by `engineer` | The engineer of record |

## Built from the record

| Output | Where | From |
|---|---|---|
| Concept single-line, conductor schedule, and calculations | `packages/electrical/src/design.ts`, `single-line.ts` | Record values plus the equipment configuration in `catalog.ts`, sized to the 2023 NEC tables in `nec.ts` |
| Concept site layout | `packages/electrical/src/layout.ts` | Open ground and the service entrance in the record |
| Pre-Application Report request draft | `packages/electrical/src/pre-application.ts` | Record values, the configuration, and National Grid's tariff M.D.P.U. No. 1599, Section 3.2 and Exhibit B |
| DXF and KML exports | `apps/api/src/export-files.ts` | Record features |

## Sources

| Source | Region | Access | License or terms |
|---|---|---|---|
| US Census geocoder | national | public API | US government, public domain |
| MassGIS L3 parcels, roofprints, municipalities, fire stations | MA | ArcGIS REST | MassGIS open data |
| MassGIS-MassDOT roads | MA | ArcGIS REST | MassGIS open data |
| US Census TIGERweb local roads | national | ArcGIS REST | public domain |
| MassDEP wetlands | MA | ArcGIS REST | MassGIS open data |
| MassGIS lidar elevation (2013 to 2021) | MA | ArcGIS image service | MassGIS; no robots rule could be read |
| MassGIS 2025 aerial imagery | MA | tiles | MassGIS, no restrictions stated |
| National Grid MA System Data Portal | MA | ArcGIS REST, no key | no terms found; robots.txt 404 |
| HIFLD transmission lines and retail territories | national | ArcGIS REST | public |
| USGS Elevation Point Query Service | national | public API | public domain |
| USGS 3DEP lidar point clouds | national | Entwine Point Tiles on AWS | public domain |
| Google Earth Engine: ESA WorldCover, USGS 3DEP 10 m, USDA NAIP | national | service account key, kept out of git | each dataset's license |
| City of Cambridge electrical permits (`hvtc-3ab9`) | Cambridge | Socrata API | PDDL; crawl-delay 1 |
| City of Somerville permit applications (`nneb-s3f7`) | Somerville | Socrata API | ODbL, attribution required |
| PG&E GRIP line sections, substations, transmission | CA (PG&E) | ArcGIS REST | PG&E public map |

Each source's full terms note is in its `licenseNote` in the config.

### Not used

| Source | Why |
|---|---|
| Eversource hosting capacity map | Its terms bar automated access |
| FEMA's own map services | Barred by team decision; flood zone is a person route |
| OpenStreetMap Overpass, the OSM API, planet and Geofabrik extracts | Barred by robots.txt or usage policy |
| Google Street View and 3D Tiles | Google's terms forbid deriving data from them |
| interconnection.fyi | Its terms forbid scraping |
| NavigateLA, Boston's data API, ViewPoint Cloud, PermitEyes, PeopleGIS, AxisGIS, Patriot Properties | Terms or robots.txt bar access |

### Not public anywhere

Main breaker rating, bus rating, switchgear location, available fault current, the serving transformer, and the account and meter numbers. These come from photos, the utility bill, the utility, or the engineer.

## Why values can be uncertain

The product shows each value's state (verified, inferred, missing, conflicting, or unreadable) and its source. Here is why each kind can be wrong:

- **Assessor data** (parcels, year built, building area, zoning) is entered by towns at different times and is often stale or blank. Zoning is blank or "0" in many towns.
- **Roofprints** come from imagery and can miss additions or merge buildings.
- **Utility maps** show the utility's published view of feeders and capacity. They're updated on the utility's schedule, not live, and they don't say which line serves a given building.
- **The nearest mapped line** is a guess about which line feeds the building. The nearest line isn't always the serving one.
- **Lidar detection** finds equipment by shape, since the lidar doesn't label poles or wires. A pole can be a lamp post or a sign, a pad-mount can be an HVAC unit or a dumpster, and a drop can be a tree branch. The 3DEP collections here are from 2021.
- **Permits** record work when it was issued. The service may have changed since, and a permit's service fields can describe a sub-service. Somerville's values are read from free text.
- **Service territories** often overlap at the edges, so a site can show several candidate utilities.
- **Concept outputs** (design, layout, run length, draft request) use one equipment configuration taken from one supplied plan set, which isn't confirmed as EQORE's standard. The run length is a straight-line lower bound. The engineer of record decides everything that is built or submitted.
- **Earth Engine land cover** is at 10 m resolution, so small features are blended.
