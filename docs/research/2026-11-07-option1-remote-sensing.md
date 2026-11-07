# Option 1 research: remote sensing

Date: 2026-11-07. Lane: data about a site's physical geometry, collected with nobody on site. Budget used: 15 searches, plus direct fetches and live endpoint queries.

Claims are marked **[confirmed]** with a source, **[tested]** when I queried the endpoint myself, or **[inference]** when the conclusion is mine. Nothing here is legal advice. The licensing readings need a person to check them before anything ships.

## Bottom line

- Free public data covers much of the Geometry group. Lidar, 15 cm orthos, and footprints all returned real data for a Holliston industrial parcel with no key.
- Remote sensing supplies **no Electrical field directly**. Only existing PV and transformer location are even inferable. Service size, voltage/phase, switchgear, meter number, single-line, tie-in, and conduit path have to come from another lane. This does not rule out Option 1, but "without a site visit" stays partial for that group. **[inference, supported by the test below]**
- Google Street View and Maps imagery cannot be the obvious demo. The terms prohibit storing it or deriving content from it, and Street View cannot share a screen with a non-Google map. The Solar API is the exception, with an explicit energy-system permission and a 30-day cache. **[confirmed]**

## Live test: 11 Bartzak Dr, Holliston, MA

This parcel was chosen only because it is a large industrial building in Holliston. It has no known connection to EQORE. Every value below is real public data, not synthetic. Scripts and downloads are in `C:\Users\zhang\AppData\Local\Temp\claude\261fd98fcb735596\cb4209b9-912c-44f6-87b7-be590d2f60d5\scratchpad`.

| Field | Value returned | Source and method | Suggested record label |
|---|---|---|---|
| parcel ID, boundary | `M_206064_886636`, 47-vertex polygon | MassGIS L3 parcels, FY2025, no key | inferred (assessor mapping, not a survey) |
| lot size | **7.339 acres** assessor attribute vs **6.98 acres** computed from the polygon, about 5% apart | Same layer; area computed by me in Web Mercator with a latitude correction | **conflicting** (keep both) |
| building footprint | 82,621 sq ft attribute; 82,681 sq ft from polygon | MassGIS Building Structures. `SOURCE=ROLTA`, `SOURCETYPE=ROOFPRINT_SHIFTED`, `SOURCEDATA=DIGITALGLOBE 2011 30CM ORTHO` | inferred. It is a roofprint from 2011 imagery |
| footprint fit | Of class 6 (building) lidar points near the outline, 90,439 fell inside, 2,921 within 1 m outside, 584 at 1-3 m | Lidar points compared with the polygon | The 2011 outline still fits the 2021 roof at this site |
| building height | Roof median 110.59 m, ground within 10 m of the outline median 104.88 m, so **about 5.7 m (18.7 ft)**. Using 5th/95th percentiles the range is about 5.1-7.0 m | 3DEP `MA_CentralEastern_1_2021` via Entwine (EPT). 43 tiles, **12 MB**, 844,887 points, no key | inferred. It measures roof surface above nearby ground in 2021, not code "building height" |
| point density | About 14.9 points/m² across a smaller box around the building (all returns); class 6 inside the footprint 11.8/m² | Same | n/a |
| distance to lot line | Closest building vertex is **5.6 m** from the parcel line | Computed from the two polygons, building vertices only | inferred. Not usable for a clearance decision |
| grade/slope | Bare-earth 99.26 m west to 106.83 m east across about 157 m, about 4.8% on that one transect | USGS EPQS, 1 m DEM, no key | inferred. A pad needs its own local slope check |
| flood zone | Zone X, "AREA OF MINIMAL FLOOD HAZARD", SFHA false, DFIRM 25017C | FEMA NFHL `identify` on layer 28 | inferred until checked against the current FIRM panel |
| FIRM panel, effective date | **25017C0631G, effective 7/8/2025**. The same query, with a 1-pixel tolerance on a wide extent, also returned 25027C0900E, effective 7/4/2011 | FEMA NFHL `identify` on layer 3, no key | Store both as `conflicting` until a person checks. The site's flood polygon is in 25017C, and Holliston being in Middlesex County points to the first panel **[inference]**. Rerun with a tighter extent |
| hydrants, power | **0** OSM power features and **0** hydrants across the surrounding industrial area; 80 buildings, 0 with height | Overpass | **missing**, not "none". Absence in OSM says nothing about the site |
| existing PV | No array visible on this roof. An array **is** visible on the neighboring 84 October Hill Rd building | MassGIS spring 2025 ortho, by eye | inferred, pending human check. OSM had no record of it |
| transformer, switchgear, meter | Could not identify any | 8 ortho tiles viewed by eye (not the full perimeter) | **missing** |

What the imagery showed at 15 cm: cars, parking stripes, a light pole and its shadow, rooftop units, solar panels, and an unlabeled dark object in a lawn. I could not name that object. A pad-mounted transformer would appear as a small box, so telling it apart from HVAC or other boxes takes context or a person. **[tested, my visual judgment]**

Lidar sees that something is there but not what it is. The parcel has 1,179 2 m cells holding non-building returns between 0.5 and 4 m above ground. They are classed only as vegetation or unclassified, so cars, fences, and equipment are not separated. **[tested]**

Key checks: the Mapillary API without a token returned error 190. The Solar API without a key returned 403. **[tested]**

## Method comparison

| Method | Resolution or accuracy | Coverage and vintage | Licensing | Cost and access |
|---|---|---|---|---|
| **USGS 3DEP lidar** (TNM API, EPT) | Project report for Central Eastern MA: first-return density 13.75 pts/m², ground 8.15 pts/m², NVA 0.074 m at 95%, RMSE about 0.038 m, horizontal 0.16-0.20 m at 95%, includes class 6 buildings ([report](https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/metadata/MA_CentralEastern_2021_B21/MA_CentralEastern_2_2021/reports/Central_East_MA_NIR_lidar_Report_Final_Signed.pdf)). The report's accuracy table extracted out of alignment, so re-check it in the PDF. Alameda 2021 QL1 was designed for 8 pulses/m² ([report](https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/metadata/CA_AlamedaCounty_2021_B21/CA_AlamedaCo_1_2021/reports/Alameda_Technical_Data_Report_Final_Signed.pdf)) | **[tested]** Holliston: `MA_CentralEastern_2021_B21`. Fremont and Hayward: `CA_AlamedaCounty_2021_B21`. San Jose: `CA_SantaClaraCounty_2020_A20`. South San Francisco: `CA_CaliforniaGaps_B23`. Richmond: `CA_NoCAL_3DEP_Supp_Funding_2018_D18` plus older data | USGS-produced data is public domain; credit requested ([USGS](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)). Storing and deriving is fine | Free, no key. Stream tiles rather than the 228 MB LAZ file. No Python LAZ library would build on this machine's Python 3.15; npm `laz-perf` worked |
| **MassGIS lidar** | MassGIS's statewide set combines 2013-2021 QL1 and QL2 ([MassGIS](https://www.mass.gov/info-details/massgis-data-lidar-terrain-data), search excerpt; the page blocks automated fetches) | MA only. Mixed vintage, so check the tile | Not separately checked | Free. DEM image services listed under the `LiDAR` folder **[tested]** |
| **MassGIS orthoimagery** | 15 cm, 4-band, flown 3/18-4/23/2025; leaf-off conditions | MA statewide 2025 and 2023 ([2025 item](https://www.arcgis.com/home/item.html?id=a3bbd504c80746ac9aedc7b5ca4e0d00), [2023 item](https://www.arcgis.com/home/item.html?id=6c7009c789354573a42af7251fb768a4)) | "No restrictions apply to these data"; acknowledgement of MassGIS appreciated; warns against critical use without knowing limits | Free tile service, no key **[tested]** |
| **NAIP** | 60 cm recent cycles. Horizontal accuracy quoted as ±4 m or ±6 m by secondary sources ([Mississippi page](https://maris.mississippi.edu/html/DATA/data_Aerial/NAIP/NAIP2023.html)) | State cycle every 2-3 years. Parcel-level vintage **not confirmed**: my catalog query returned only overview rows labeled 2022 | "Public Domain with Attribution" ([AWS registry](https://registry.opendata.aws/naip/)) | Free via [USGS service](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer). AWS buckets are requester-pays |
| **Santa Clara County data** | 2023 lidar-derived rooftop footprints; 2020 orthos. A 0.25 ft figure appeared but I could not tie it to a year ([buildings service](https://maps.santaclaracounty.gov/server/rest/services/basic/SCCBuildings/MapServer)) | Santa Clara County only. Alameda county equivalents: not found in 1 search | Item lists "None" for restrictions | Free REST service, not tested live |
| **Nearmap** | 5.6 cm vertical GSD on latest cameras ([FAQ](https://support.nearmap.com)) | MA and Bay coverage not checked | Derived-measurement terms not found in 1 search | API needs an active subscription ([docs](https://developer.nearmap.com/docs)); price by quote |
| **EagleView** | Not found | Not found | Derived-measurement terms not found in 1 search | Imagery trial closed to new participants ([page](https://company.eagleview.com/imagery-api-free-trial/)). Self-serve property data trial: 30 properties, no card ([Sept 2026](https://www.eagleview.com/blog/build-faster-with-free-trial-access-to-eagleviews-property-data/)). Sandbox limited to an EagleView-chosen area |
| **Maxar/Vantor** | Not found | Not found | Not found | Not found in 1 search |
| **Google Street View** | Not a measurement product | Road-visible frontage. Rear yards and interior lots are likely invisible **[inference]** | See licensing; effectively rules out stored or derived use | Static: 10,000/month free cap, then $7.00 per 1,000; metadata unlimited ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing)). I read the columns from the table layout |
| **Mapillary** | Crowd-sourced. Object classes include `object--fire-hydrant`, `object--support--utility-pole`, `object--manhole`, `object--street-light`, **no transformer class** ([docs](https://www.mapillary.com/developer/api-documentation/points)) | Coverage at these sites unknown (needs a token to test) | User content under CC BY-SA. Commercial use governed by Section 12, which requires safeguards against reidentification and disclosure ([terms](https://mapillary.com/legal)) | Token required **[tested]**. Reportedly free, per a third-party doc |
| **MassGIS Building Structures** | Roofprints over 150 sq ft. **No height field** in the live layer **[tested]**. Lean corrections shifted many outlines | MA statewide. Edits continuing through May 2026, but individual polygons can still date from 2011, as in the test ([layer](https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Building_Structures/FeatureServer/0)) | No license text on the item; other MassGIS items say no restrictions. **Verify** | Free, no key, 2,000 records per query **[tested]** |
| **Microsoft footprints** | 98.5% precision, 92.4% recall on polygons; no height. Imagery 2019-2020 in some areas, about 2012 average elsewhere ([repo](https://github.com/microsoft/USBuildingFootprints)) | US | ODbL | Free download |
| **Overture buildings** | Merged sources; height sometimes present, often null | Global | ODbL plus CC BY 4.0 attributions ([docs](https://docs.overturemaps.org/attribution/)) | Free. Not tested live |
| **OpenStreetMap** | Volunteer-mapped; thin in this area | **[tested]** 80 buildings, none with height, no power or hydrant features | ODbL | Free; Overpass API |
| **FEMA USA Structures** | Schema has height and occupancy ([FEMA](https://gis-fema.hub.arcgis.com/pages/usa-structures)) | The view I found describes itself as Alaska and returned nothing at Holliston. **Not properly tested** | Not found | Free |
| **Google Solar API** | HIGH 0.1 m/pixel; MEDIUM 0.25 m/pixel; BASE 0.25 m/pixel from satellite ([type docs](https://googleapis.dev/python/google-maps-solar/latest/_modules/google/maps/solar_v1/types/solar_service.html)) | Coverage varies and can return 404; commercial coverage not stated ([coverage](https://developers.google.com/maps/documentation/solar/coverage)). **Not tested at Holliston** (no key) | See licensing | Building Insights: 10,000/month free cap, then $10.00 per 1,000. Data Layers: 1,000 free cap, then $75.00 per 1,000 ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing)). Key required |
| **FEMA NFHL** (added) | Flood zone polygon; map-grade | **[tested]** Zone X at the site. `/query` on layer 28 returned 400 and the MassGIS mirror returned no features; `identify` worked | Federal source; license not separately checked | Free, no key |
| **USGS EPQS** (added) | Bare-earth elevation at 1 m at this site **[tested]** | Depends on the DEM | USGS | Free, no key |

## Field coverage

**D** = can be read or computed deterministically from the data. **I** = needs a person or model to interpret, or combines inputs that are not survey grade. **N** = not available.

Columns: **Lidar** (3DEP, MassGIS) | **Ortho** (MassGIS 15 cm) | **NAIP** | **Comm** (commercial aerial, not verified hands-on) | **Street** (Street View, Mapillary) | **Foot** (footprint datasets) | **Solar** (Google Solar API, not tested) | **Other** (FEMA NFHL). These ratings are my reading of each product **[inference]**, except where the live test above shows a result.

| Seed field | Lidar | Ortho | NAIP | Comm | Street | Foot | Solar | Other |
|---|---|---|---|---|---|---|---|---|
| address | N | N | N | N | I | N | N | N |
| parcel ID | N | N | N | N | N | N | N | N |
| owner | N | N | N | N | N | N | N | N |
| occupancy type | N | I | N | I | I | I | N | N |
| AHJ | N | N | N | N | N | N | N | N |
| serving utility | N | N | N | N | I | N | N | N |
| rate schedule | N | N | N | N | N | N | N | N |
| parcel boundary | N | N | N | N | N | N | N | N |
| building footprint | I | I | I | I | N | D | I | N |
| building height | D | N | N | I | I | N | D | N |
| setbacks | N | N | N | N | N | N | N | N |
| candidate battery pad location | I | I | N | I | I | N | N | N |
| distance to building openings/exits | N | N | N | I | I | N | N | N |
| distance to lot line | I | I | N | I | N | I | N | N |
| vehicle/fire access | N | I | I | I | I | N | N | N |
| hydrants | N | I | N | I | I | N | N | N |
| overhead obstructions | I | I | N | I | I | N | N | N |
| grade/slope | D | N | N | I | N | N | N | N |
| flood zone | N | N | N | N | N | N | N | D |
| FIRM panel and effective date (added) | N | N | N | N | N | N | N | D |
| exposures: vegetation (added) | D | I | I | I | I | N | N | N |
| exposures: combustible storage (added) | N | I | N | I | I | N | N | N |
| wall construction type (added) | N | N | N | I | I | N | N | N |
| wetlands distance (added) | N | I | I | I | N | N | N | N |
| service size | N | N | N | N | N | N | N | N |
| voltage/phase | N | N | N | N | N | N | N | N |
| main switchgear location | N | N | N | N | I | N | N | N |
| utility transformer location | N | I | N | I | I | N | N | N |
| meter number/location | N | N | N | N | I | N | N | N |
| existing single-line diagram | N | N | N | N | N | N | N | N |
| existing DER/PV | N | I | I | I | I | N | I | N |
| tie-in point | N | N | N | N | N | N | N | N |
| conduit run path | N | N | N | N | N | N | N | N |
| 15-minute interval data | N | N | N | N | N | N | N | N |
| peak demand | N | N | N | N | N | N | N | N |
| bill history | N | N | N | N | N | N | N | N |
| adopted code edition and local amendments | N | N | N | N | N | N | N | N |
| zoning | N | N | N | N | N | N | N | N |
| feeder hosting capacity | N | N | N | N | N | N | N | N |
| interconnection track | N | N | N | N | N | N | N | N |

Notes on the ratings that matter most:

- **Candidate battery pad location:** per the plan-set-bridge lane, the pad and tie-in point are engineer decisions. The record should store free areas and constraints as site facts (open paved area, local slope, distance to exposures, lot line, and hydrant), never a chosen pad. The I ratings in that row apply to those facts.
- **Priority for reviewers:** the plan-set-bridge lane ranks these high: lot lines, footprint with openings and wall construction, exposures, fire access, nearest hydrant, overhead lines, flood zone with FIRM panel, and wetlands. Of these, openings, wall construction, and hydrants are the weakest from remote sensing and need capture or records.
- **Vegetation exposure:** lidar classes 3-5 give vegetation height and position as of 2021, and growth since then is not captured. **[inference]**
- **Wetlands:** a mapped layer is the better source. MassGIS lists wetlands services (for example `AGOL/DEP_Wetlands_FieldMaps`), which I did not query. Mapped wetlands are not a delineation. **[inference]**
- **Switchgear, meter, openings/exits:** the Street rating applies only when the equipment or door is on an exterior wall that faces a public road. Interior switchgear rooms are invisible to every method. **[inference]**
- **Distance to lot line:** needs the parcel layer from the public-records lane. Assessor parcels are not surveys, so this stays inferred, however precise the arithmetic looks.
- **Setbacks:** the required distance comes from zoning. Remote sensing can only measure what exists.
- **Existing DER/PV, Solar column:** the docs mention detected arrays, which I did not examine or test. Existing batteries are not visible in any of this. **[inference]**
- **Occupancy type, Foot column:** some datasets carry it, but I did not verify it at a site.

## Licensing

**Google Maps Platform Terms** (last modified August 26, 2026; quotes taken directly from the [terms](https://cloud.google.com/maps-platform/terms)), Section 3.2.3:

- (a) "Customer will not export, extract, or otherwise scrape Google Maps Content for use outside the Services", including "bulk download Google Maps tiles, Street View images".
- (b) "Customer will not cache Google Maps Content except as expressly permitted under the Maps Service Specific Terms."
- (c) "Customer will not create content based on Google Maps Content." Examples include "trace or digitize roadways, building outlines, utility posts, or electrical lines from the Maps JavaScript API Satellite base map type" and "construct an index of tree locations within a city from Street View imagery". It also bars using the content to "train, test, validate or fine-tune" models.
- (e) "Customer will not use the Google Maps Core Services with or near a non-Google Map", for example "display Street View imagery and non-Google Maps on the same screen".

Google's [Street View policies](https://developers.google.com/maps/documentation/streetview/policies) repeat this: don't "construct a location index from Street View imagery". Only the panorama ID may be stored indefinitely.

**What this means for the demo. [inference]**

- Saving Street View frames as evidence is out.
- Running a vision model over Street View to record "transformer at X" closely matches the prohibited index example, so it is out.
- Tracing a building or utility pole from Google satellite is named outright.
- A record page with a Street View panel beside a MassGIS map is out under (e).
- A person opening Google Maps in a separate tab and typing what they saw is less clear, because the note might still count as content based on Google's. Don't build the demo around it without asking EQORE or counsel.

**Google Solar API** (Service Specific Terms, last modified October 28, 2026, [Section 20](https://cloud.google.com/maps-platform/terms/maps-service-terms)):

- 20.1: use is allowed "(a) to determine the feasibility of installing energy systems for a particular address or geographic area, (b) to design or install an energy system, or (c) for a Downstream Transaction".
- 20.2: "Customer may temporarily cache the 'Building Insights' and 'Data Layers'... for up to 30 consecutive calendar days, after which Customer must delete". The deletion rule does not apply to data "incorporated into fixed media (e.g. energy system design, feasibility study, commercial proposal, marketing materials) for use in a Downstream Transaction".
- Results shown on a map must be on a Google Map, with Google attribution ([policies](https://developers.google.com/maps/documentation/solar/policies)).

"Energy system" is not defined in the section I read. A battery plausibly fits, but that is my reading. A system of record that keeps Solar values indefinitely conflicts with the 30-day rule unless each value sits in a fixed-media deliverable. Solar values therefore need an expiry date in the record. **[inference]**

**Other sources:**

- **USGS, NAIP, MassGIS imagery:** public domain or stated no restrictions, as quoted in the table. Storing and deriving is fine, with credit.
- **ODbL (Microsoft, Overture, OSM):** deriving is allowed but share-alike obligations can attach to a derived database. **Check this before mixing these into a stored commercial record**, because it could affect EQORE's data later. **[inference]** MassGIS avoids the issue in MA.
- **Mapillary:** CC BY-SA on user content, Section 12 conditions for commercial use. Attribution and share-alike would need to carry into the record.
- **Nearmap, EagleView, Maxar/Vantor:** derived-measurement terms not found. Do not assume they allow it.

## How methods fail and how to label it

| Failure | Example | Label |
|---|---|---|
| Old source presented as current | 2011 roofprint, 2021 lidar on a site changed since | `inferred`, with source date stored and a staleness flag |
| Two sources disagree | 7.339 vs 6.98 acres | `conflicting`, keep both with sources |
| Dataset has no entry | OSM shows 0 hydrants | `missing`. Never convert to "none present" |
| Pixels show something unidentifiable | Dark object in lawn | `unreadable`, with a link to the tile |
| Trees, shadows, or building lean hide the target | Rear wall, lean offset | `unreadable` or `missing`, with the reason |
| Precision exceeds accuracy | 5.6 m lot-line distance from assessor parcels; NAIP at ±4 m | `inferred`, with the accuracy basis stored. Never use for a clearance decision |
| Point-cloud class misread | Unclassified points may be cars, fences, or equipment | `inferred`, or `unreadable` when the type matters |
| Solar API returns 404 or low quality | Coverage gap | `missing`; store `imageryQuality` and `imageryDate` when present |
| Licensed value expires | Solar cache past 30 days | Delete the value, keep the fact that it was fetched, mark `missing` |

`verified` should mean a person checked the value against a named source and that the record stores who and when. No remote-sensing value should start as `verified`. Corrections add to the original rather than replacing it, per `CLAUDE.md`.

## Recommendation

**Use in demo**

- **3DEP lidar via EPT:** real measured height and grade, public domain, proven above at 12 MB per site.
- **MassGIS 15 cm orthos:** free and current to 2025, with the best public evidence image for PV and access, stored without license trouble. MA only.
- **MassGIS Building Structures:** free outlines whose source and date fields map directly onto provenance tracking. MA only.
- **FEMA NFHL:** one no-key call fills flood zone. Use `identify`.

**Stretch**

- **Google Solar API:** the only Google product with a stated energy-system use. Keep it on its own Google-map view with a 30-day expiry, and test at a real site first because I had no key.
- **NAIP:** the free Bay Area fallback, for context only, since 60 cm and ±4 m cannot support clearance.
- **Santa Clara County footprints and orthos:** useful if the demo needs a Bay Area site, but one county only.
- **Mapillary:** hydrant and pole detections could fill two gaps, but coverage is unknown and share-alike applies.
- **Microsoft and Overture footprints:** fill footprint gaps outside MA, after checking ODbL.
- **EagleView self-serve trial:** 30 free properties may be worth a look, but derived-data terms are unknown.

**Avoid**

- **Google Street View as stored evidence or model input:** the terms bar storing it or deriving content from it.
- **Tracing or measuring on Google satellite:** the terms name building outlines, utility posts, and electrical lines.
- **Nearmap:** requires a paid subscription, and terms are unverified.
- **Maxar/Vantor:** nothing found, and the MassGIS orthos already provide 15 cm at no cost.
- **OSM for utility or hydrant fields:** zero features in the test area, and absence would mislead.
- **Claiming automatic transformer or switchgear detection:** I could not identify any at the test site by eye. A pole cross-arm detector reached about 80% in a [UConn study](https://www.eversource.uconn.edu/wp-content/uploads/2018/10/Uconn_Exploring_Remote_Sensing_Applications-final.pdf), but I found no accuracy study for pad-mounted units in 1 search.

## Not established

- Solar API response at any Holliston or Bay Area site (no key).
- Mapillary coverage at any site (no token).
- Street View coverage of rear yards and equipment at industrial sites (not tested).
- Whether MassGIS Building Structures carries a stated license (the item's license field is empty).
- NAIP parcel-level vintage in MA or the Bay Area.
- Whether 15 cm imagery can reliably show pad-mounted equipment across sites. My view is from 8 tiles at one site, and none was positively identified.
