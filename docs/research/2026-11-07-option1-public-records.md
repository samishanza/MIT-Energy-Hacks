# Option 1 research: public records and published data

Lane: public records. Date checked: 2026-11-07. All Holliston values below are **real public data, not synthetic**. Nothing was invented, and no time savings are claimed.

**Evidence labels**
- **C** = confirmed: I read it in the source on 2026-11-07, and the link is given.
- **S** = seen only in a search-result excerpt. The link is given, but I did not open the page, or it failed to open.
- **I** = my inference.

## Bottom line

1. Public data reliably fills identity, parcel, footprint, zoning and code. For one real manufacturing site in Holliston it gave 12 of 35 seed fields, and **0 of 9 electrical fields**. Some of the other gaps belong to other lanes (height, grade, load).
2. The electrical data probably exists in public records, but software can't fetch it. Massachusetts' wiring permit form asks for existing service amps, volts, overhead or underground, and number of meters. However, the portals that would hold those records bar robots: `mapsonline.net` and the one OpenGov portal I sampled both say `Disallow: /`.
3. So I recommend the record does more than flag a gap. It should name the document that fills the gap and who holds it, and draft the request for a person to send. This is not evidence that Option 1 can't work, but "no site visit" depends on a person-run records step for electrical data, unless the customer supplies it.

**What I could not answer.** I don't know what fields the Holliston portal shows or whether plan sets can be downloaded there. I stopped automated access once I saw the robots rule. A person needs to open the portal in a browser. See "Open items".

## Source comparison

| Source | Seed fields | Form | Dating and reliability | Variation | Access and terms | Time to real data |
|---|---|---|---|---|---|---|
| [MassGIS L3 parcels](https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0) (C) | Address, parcel ID, boundary, owner, use code, zoning code, sale book and page | Structured API (Query, Extract, 2000 records per call). Statewide bulk files also exist ([S](https://www3.epa.gov/region1/npdes/rda/ar/2022-MassGIS-MassGIS-data-property-tax-parcels.pdf)) | Use `FY` for attributes and `LAST_EDIT` for the polygon. At my test site: FY 2025, polygon edited 2013-01-29 | Same schema statewide, but contents vary by town (see below). Standardized for 350 of 351 towns; Boston is handled separately (C, layer description) | No robots rule found. The [mass.gov page](https://www.mass.gov/info-details/massgis-data-property-tax-parcels) returned 403 to my fetch, so **terms not read** | Minutes (done) |
| [MassGIS Building Structures](https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Building_Structures/FeatureServer/0) (C) | Building footprint | Structured API | Roofprints from 2011-12 imagery. `SOURCEDATE` is 2011 at my site, so expansions since then won't show | Statewide | As above | Minutes (done) |
| Holliston [zoning page](https://www.townofholliston.us/383/Zoning-By-Law-Maps) (C) | Setbacks, height limit, coverage, overlay maps | Text PDF for the by-law and table. Overlay maps are PDF or JPG | Date by document title: by-law 2025, map 2023, Industrial Park map 10-2025. The dimensional table has no date I could find | Per town. No statewide zoning layer matched in a name filter of MassGIS's 486 services | Town robots rules don't block `DocumentCenter` | Minutes (done). Needs hand encoding per town |
| Holliston [permit portal](https://www.mapsonline.net/hollistonma/public_permit_reports.html.php) (PeopleGIS "SimpliCITY") | Unknown | Web report in an iframe | Not seen | Per vendor, per town | [robots.txt](https://www.mapsonline.net/robots.txt): `Disallow: /` for all agents (C) | **Blocked for software.** Person with a browser: not tested |
| Building Department counter | Plot plans, building plans, zoning history ([2023 Permitting Guide](https://www.townofholliston.us/DocumentCenter/View/131/2023-Permitting-Guide-PDF), C) | Paper or staff-provided | Permit date | Per town | Staff | Unknown |
| [Massachusetts wiring permit form](https://www.townofholliston.us/DocumentCenter/View/141/Wiring-Application-PDF) (C) | Service amps, volts, overhead or underground, number of meters, utility authorization number | Blank state form. Filled copies are held by the town | Permit date. Form is Rev. 1/07 | State form from the Department of Fire Services, so probably common across towns (I) | Through a records request or the portal | Filled copy: records request |
| [Commercial building permit form](https://www.townofholliston.us/DocumentCenter/View/134/Building-Permit-Application-Commercial-PDF) (C) | Use group, height, area per floor, construction type, sprinkler, code edition | Blank form. Filled copies are held by the town | Permit date | State-style form (I) | As above | As above |
| [Public records request (G.L. c.66 §10)](https://malegislature.gov/Laws/GeneralLaws/PartI/TitleX/Chapter66/section10) (C) | Anything the town holds | Human process. Holliston uses a [Google Form](https://docs.google.com/forms/d/e/1FAIpQLSeyJ899ywTgVYhSUeVu6WW4v3uFmurDcxm8792jLWVCfT3kuA/viewform) (C, linked from the town site) | Dated by the record | Same law statewide | 10 business days to respond. Municipal limit 25 business days, plus at most one 30-business-day extension. Staff time up to $25/hour. First 2 hours free only above 20,000 population. A missed 10-day response bars the fee. Plans may be withheld under the public-safety exemption ([S](https://nefac.org/?p=14902)) | At least days to weeks. **Not filed:** outward-facing, the team's call |
| [Holliston property record cards](https://mapublicaccess.tylerhost.net/search/commonsearch.aspx?mode=address&sjur=MA136) (Tyler iasWorld) | Likely building details missing from L3 (I) | Human search form | Not seen | Vendor varies. Athol uses [AxisGIS](https://www.athol-ma.gov/node/4336) (S) | **Showed a maintenance notice when checked.** Disclaimer says data is "solely for your own use and cannot be sold" (C), which matters for a commercial product | Not obtained |
| S. Middlesex Registry of Deeds, [masslandrecords.com](https://www.masslandrecords.com) ([named in the guide](https://www.townofholliston.us/DocumentCenter/View/131/2023-Permitting-Guide-PDF), C) | Deed and recorded plans. L3 gives the book and page directly | Human search, images (I) | Recording date | One registry per county district (I) | robots.txt returned a redirect, so unresolved. Not used | Not tested |
| Esri copy of FEMA flood data, [USA Flood Hazard Reduced Set](https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0) (C) | Flood zone | Structured API | `VERSION_ID`, `DFIRM_ID`. No effective date seen | National | Esri's terms not read | Minutes (done) |
| FEMA NFHL direct, [hazards.fema.gov](https://hazards.fema.gov/robots.txt), [msc.fema.gov](https://msc.fema.gov/robots.txt) | Flood zone | REST service and human portal | Authoritative | National | robots.txt disallows `/arcgis` on both and query strings (C). **I did not query it** | Person: not tested |
| [OpenEI URDB](https://api.openei.org/utility_rates) (C) | Serving utility by lat/lon, candidate rate schedules | Structured API. `DEMO_KEY` worked; [free key signup](https://openei.org/services/api/signup) (S) | `startdate`, `enddate`, `revisions`, plus a link to the utility's tariff PDF | National | Key required | Minutes (done) |
| [National Grid MA System Data Portal](https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP) (C) | Feeder ID, substation, voltage, available hosting capacity, connected and pending storage | Structured API, no key needed in my test | `Updated_Date` field. Monthly per [help guide](https://systemdataportal.nationalgrid.com/MA/documents/MA_Data_Portal_Help_Guide_v1.pdf) (S). **One column named "current year" has the alias "2022 MVA"**, so check vintage | Per utility | No robots rule found. Terms not found | Minutes for a National Grid site. **Holliston returned 0 feeders** |
| [Eversource MA hosting map](https://www.eversource.com/residential/about/doing-business-with-us/interconnections/massachusetts/hosting-capacity-map), [Interconnection Navigator](https://navigator.eversource.envelio.com/) (C) | Parcel-level seasonal hosting capacity and headroom | Interactive map. No download offered on the landing page | Refresh date not stated. [FAQ](https://www.eversource.com/residential/about/doing-business-with-us/interconnections/hosting-capacity-map-faqs) calls values "estimated" and doesn't mention storage | Per utility | Login status not determined. No robots rule found | Value not retrieved. Should be quick for a person (I) |
| [PG&E GRIP](https://pge.com/assets/pge/docs/about/doing-business-with-pge/pge-grip-quick-start-guide.pdf) (C) | Feeder and line ICA results, feeder load profiles | Map, zipped CSV by division, and a [REST endpoint](https://services2.arcgis.com/mJaJSax0KPHoCNB6/arcgis/rest/services/DRPComplianceRelProd/FeatureServer) | Update frequency not found | Per utility | Guide states "There is no log in required." `grip.pge.com` has `Crawl-delay: 60` | Metadata read. No site tested |
| [California county assessors](https://boe.ca.gov/proptaxes/pdf/confidentiality_of_county_assessors_records.pdf) (S) | Parcel, characteristics | Per-parcel requests in the results I saw ([Santa Clara form](https://www.sccassessor.org/images/Forms/SSE%20Division/Map%20and%20Property%20Characteristics%20Request%20Form%207-31-15.pdf), [Monterey fee](https://www.countyofmonterey.gov/government/departments-a-h/assessor/assessor/real-property/property-characteristics-request)) | §408.3 disclaimers say characteristics aren't continuously updated (S) | Per county. No statewide L3 equivalent found in 1 search | Fees vary | Not tested |
| Code adoption | Code editions | Regulations and PDFs | See "Code editions" below | Massachusetts editions are statewide. California not researched | Public | Minutes, then maintained by hand |
| [OpenStreetMap via Overpass](https://overpass-api.de) (C) | Hydrants | Structured API | Not authoritative | Community-mapped | ODbL | Done: **0 hydrants mapped in Holliston**, which means not mapped, not absent |

**Hydrants:** I found no authoritative source. Not found in the MassGIS service-name filter, or in 1 OSM query at 400 m and 1 town-wide. The town's map layers on `mapsonline.net` are off limits to software, so a person would need to check there or ask the Water or Fire Department.

**Hosting capacity caveat (I):** these maps were built around generation export. National Grid's guide describes available "Solar MW". For a non-exporting peak-shaving battery they may be a weak proxy, so an engineer should read them as context rather than as an interconnection answer.

## Field coverage

D = direct. I = inferred. N = no. D\* = the blank form has this field, but I saw no filled record. P = only if a plan is attached, not seen.

| Seed field | L3 | Roofprints | Town zoning | Permits and plans | Registry | Flood | URDB | Hosting maps | State code |
|---|---|---|---|---|---|---|---|---|---|
| address | D | N | N | D\* | P | N | N | N | N |
| parcel ID | D | N | N | D\* | P | N | N | N | N |
| owner | D | N | N | D\* | D\* | N | N | N | N |
| occupancy type | I (use code, not IBC use group) | N | N | D\* | N | N | N | N | N |
| AHJ | I (town) | N | N | D\* | N | N | N | N | N |
| serving utility | N | N | N | N | N | N | D | I | N |
| rate schedule | N | N | N | N | N | N | I (candidates) | N | N |
| parcel boundary | D | N | N | P | P | N | N | N | N |
| building footprint | N | D | N | P | P | N | N | N | N |
| building height | N (`STORIES` blank at site) | N | N | D\* | N | N | N | N | N |
| setbacks | N | N | D (limits) | P (as-built) | N | N | N | N | N |
| candidate pad location | N | N | N | N | N | N | N | N | N |
| distance to openings/exits | N | N | N | P | N | N | N | N | N |
| distance to lot line | I (after a pad is placed) | N | N | P | P | N | N | N | N |
| vehicle/fire access | N | N | N | P | N | N | N | N | N |
| hydrants | N | N | N | P | N | N | N | N | N |
| overhead obstructions | N | N | N | P | N | N | N | N | N |
| grade/slope | N | N | N | P | P | N | N | N | N |
| flood zone | N | N | N | N | N | D | N | N | N |
| service size | N | N | N | D\* | N | N | N | N | N |
| voltage/phase | N | N | N | D\* (volts) | N | N | I (rate voltage class) | I (feeder only) | N |
| main switchgear location | N | N | N | P | N | N | N | N | N |
| utility transformer location | N | N | N | P | N | N | N | N | N |
| meter number/location | N | N | N | D\* (count only) | N | N | N | N | N |
| existing single-line diagram | N | N | N | P | N | N | N | N | N |
| existing DER/PV | N | N | N | I | N | N | N | I (feeder total) | N |
| tie-in point | N | N | N | P | N | N | N | N | N |
| conduit run path | N | N | N | P | N | N | N | N | N |
| 15-minute interval data | N | N | N | N | N | N | N | N | N |
| peak demand | N | N | N | N | N | N | N | N | N |
| bill history | N | N | N | N | N | N | N | N | N |
| code edition, local amendments | N | N | I (local by-law only) | D\* (edition) | N | N | N | N | D (edition) |
| zoning | D (code) | N | D | N | N | N | N | N | N |
| feeder hosting capacity | N | N | N | N | N | N | N | D | N |
| interconnection track | N | N | N | N | N | N | N | I | N |

Load fields have no public source in this lane. They need the customer or a synthetic stand-in.

## Holliston test: 29 Everett St

I chose it because it is the highest-valued parcel among Holliston's use-code 4xx (industrial) parcels in L3. Real public data, retrieved 2026-11-07. The owner is a business entity by name pattern. I did not copy the name.

**CLAUDE.md gap:** its five states have no word for "read directly from a source, but not checked by a person". I used "reported" below. The data model owner should decide on this.

| Field | Value | Source | Source date | State |
|---|---|---|---|---|
| address | 29 EVERETT ST, Holliston 01746 | L3 | FY2025 | reported |
| parcel ID | `012.0-0004-0019.0`, `LOC_ID M_207544_884583` | L3 | FY2025 | reported |
| owner | Populated, business entity, name not copied. Last sale 2022-01-31, $16,000,000, Book 79611 Page 534 | L3 | FY2025 | reported |
| occupancy type | Use code 400, "Buildings for manufacturing operations". IBC use group missing | L3 | FY2025 | reported (use), missing (IBC) |
| occupant | Sources disagree: [a manufacturer listing](https://www.mapquest.com/us/massachusetts/cold-chain-technologies-79042) (S) and a [state cannabis licence application](https://masscannabiscontrol.com/wp-content/uploads/2021/08/MP281466_New-England-Cannabis-Corporation-Inc..pdf) (C) | Web | Undated, and about 2021 by URL path | **conflicting** |
| AHJ | Holliston [Building Department and Wiring Inspector](https://www.townofholliston.us/187/Building). Fire review through [Fire](https://www.townofholliston.us/180/Fire) (I) | Town | Current page | reported |
| serving utility | Eversource (NSTAR Electric, EIA 54913). Three signals agree: URDB returned only NSTAR for this point; [town page](https://www.townofholliston.us/sustainability/links/community-choice-power-supply-program) names Eversource (S, direct fetch 404); National Grid has 0 feeders in a box around the site | URDB, town, National Grid | 2026 | inferred |
| rate schedule | Not determined. URDB returns four NSTAR rate districts for the point and does not say which applies | URDB | 2026-02-01 | **missing** |
| parcel boundary | 51-vertex polygon | L3 | Edited 2013-01-29 | reported |
| lot size | Assessor 4.049 acres vs about 4.31 acres from the polygon (my planar calculation, about 6% apart) | L3 | FY2025, 2013 | **conflicting** |
| building footprint | 48,263 sq ft roofprint, `ROOFPRINT_SHIFTED` | Roofprints | 2011 | reported, stale |
| building size, other | "Approximate square footage" 53,610 in the licence application. Not the same measure as a roofprint | CCC PDF | About 2021 | **conflicting** |
| `BLD_AREA`, `YEAR_BUILT`, `STORIES` | 0, blank, blank | L3 | FY2025 | missing |
| zoning | `I`, read as Industrial District (I) | L3 and [table](https://www.townofholliston.us/DocumentCenter/View/1153/Zoning-By-Laws-Dimensional-Table-PDF) | FY2025 | reported |
| setbacks | Front 30, side 20, rear 30 ft. Max 3 stories, 40 ft. Max 40% coverage, FAR 0.50. Subordinate to Buffer Area rules | Table | Undated | reported |
| coverage check | About 27% (roofprint over assessor lot, my calculation) vs 40% limit. A good deterministic-check demo | Calculated | Mixed vintages | inferred |
| battery use class | [2025 by-law](https://www.townofholliston.us/DocumentCenter/View/10370/2025-Zoning-By-Laws) text search found "energy storage" only in the MBTA overlay section and "advance battery systems" only in an R&D definition. No storage use category found. Solar has a 50 ft perimeter setback, and whether that reaches a battery is a question for a person | By-law | 2025 | **missing** |
| flood zone | No polygon intersects the parcel in Esri's reduced set. A, AE and X polygons exist nearby (DFIRM 25017C). Not proof of zone X | Esri copy of FEMA | Version 1.1.1.0 and 2.1.3.0 nearby | inferred |
| hydrants | 0 in OSM. Means not mapped | OSM | 2026-11-07 | missing |
| adopted code | See "Code editions" | State | 2026 | reported |
| feeder hosting capacity | Not retrieved from the Eversource map | n/a | n/a | missing |
| electrical (all 9), load (all 3) | None | n/a | n/a | **missing** |
| height, pad, openings, lot-line distance, access, obstructions, grade | None from this lane | n/a | n/a | missing |

**Result:** 12 of the 35 seed fields have some value, counting occupancy, utility and flood as partial or inferred. This is one site, so it is not a coverage rate. Time was not measured, so I make no time claim.

**The most useful output is the conflicts.** One site produced three conflicts between real public sources (occupant, lot size, building size), which is the messy input the brief asks for.

**Second site, from the remote-sensing lane (not rechecked by me).** 11 Bartzak Dr shows the same pattern: `BLD_AREA` 0, `YEAR_BUILT` blank, and lot size 7.339 acres vs about 6.98 from the polygon. The polygon is larger than the assessor figure at 29 Everett St and smaller here, so the gap isn't a constant offset (I), though two sites can't establish a pattern. That lane used a different L3 endpoint, on `arcgisserver.digital.mass.gov`. See `docs/research/2026-11-07-option1-remote-sensing.md`.

**Candidate rate, for reference only.** URDB lists "Greater Boston General Service Time of Use G-3" at $30.05/kW flat demand, $370/month fixed, with energy $0.02501 plus $0.17092 adjustment per kWh, starting 2026-02-01. I did not check this against the [Eversource tariff PDF](https://www.eversource.com/docs/default-source/rates-tariffs/ema-greater-boston-rates.pdf?sfvrsn=875c1c95_19), or establish that this site is in Greater Boston. URDB's description ties G-3 to metering at 14,000 volts or above, so **the correct rate depends on a missing electrical field**. URDB also returned near-duplicate entries, so a person should choose the rate.

## How much varies by town

**The same L3 schema hides real differences.** These are counts for use-code 4xx parcels, which include vacant industrial land, so they are not fill rates for built parcels.

| Town | Sampled FY | 4xx parcels | `BLD_AREA` > 0 | `YEAR_BUILT` > 0 |
|---|---|---|---|---|
| Holliston | 2025 | 162 | 0 | 1 |
| Framingham | 2025 | 108 | 0 | 65 |
| Natick | 2027 | 50 | 31 | 31 |
| Milford | 2026 | 164 | 55 | 56 |
| Worcester | 2026 | 500 | 267 | 267 |

Holliston as a whole has `YEAR_BUILT` on 5,239 of 6,421 parcels, but only 1 of 162 industrial and 3 of 99 use-code 3xx (commercial) parcels. **The gaps fall on the class EQORE serves.** No parcel in Holliston has `BLD_AREA` above 0. FY comes from one sampled record per town.

| Scope | Sources | Adapter cost (I) |
|---|---|---|
| Works statewide or nationally | L3, roofprints, URDB, flood copy, MA code editions, c.66 §10, state wiring form | One adapter each, plus fill checks by town |
| Per utility | National Grid, Eversource, PG&E, Unitil | One per utility. Different forms: API vs interactive map |
| Per county | California assessors | One per county |
| Per town | Permit records, zoning limits, overlays, hydrants, record cards | The real scaling cost |

**Vendor concentration.** I can't say that a few vendors cover most towns. I found no current share figures in 3 searches.
- The only count found: OpenGov "used now by 83 municipalities" in a [2021 Newton document](https://web.northeastern.edu/rasala/newton_zoning_docs/pdf/2021-01-11_Fund_Muni_Info_Sys-2.pdf) (S), which is old and limited to one vendor.
- OpenGov bought ViewPoint in [2019](https://www.govtech.com/biz/OpenGov-Acquires-ViewPoint-Adds-Permitting-and-Licensing.html) (S).
- A sample OpenGov portal, [Hanover](https://hanoverma.portal.opengov.com/robots.txt), has `Disallow: /` (C). This is one portal, so I can't generalize it to all of them.
- [Accela's shared host](https://aca-prod.accela.com/robots.txt) returned no robots file. No Bay Area agency or Accela terms were tested.
- Whether OpenGov exposes plan attachments to the public: not found in 2 searches.

**Inference:** even with high concentration, portal adapters won't scale without vendor or town permission. A template for records requests covers every Massachusetts town under one statute, though slowly.

## Recording dates and confidence

Every value stores `source_url`, `retrieved_at`, `source_as_of` and `state`. Confidence should come from rules, not from a model score (I):

| Source type | `source_as_of` | Rule |
|---|---|---|
| Wiring or building permit | Permit issue date | Any later permit at the address marks the earlier value as possibly superseded. A value without a newer-permit search stays unverified |
| Plan set | Sheet date and revision | Shows what was proposed, not what was built, until an engineer or as-built confirms it |
| Assessor attributes | `FY` | Treat 0 or blank as missing, never as a real zero. `BLD_AREA` = 0 on a $17.8M building shows why |
| Polygon | `LAST_EDIT` | Assessor boundaries are not survey boundaries. Flag for engineer before setback work |
| Roofprint | `SOURCEDATE` | Flag if a permit or sale came after the image date |
| Tariff | `startdate`, `enddate`, tariff PDF | Check against the source PDF |
| Hosting capacity | `Updated_Date` or retrieval date | Treat as volatile and refetch before use |
| Directory listing | Retrieval date | Lead only. Never fills a field |

## Code editions (Massachusetts)

- **Building:** 780 CMR 10th edition, based on the 2021 IBC, effective Oct 11, 2024. Concurrency ended June 30, 2025 ([S](https://coderedconsultants.com/?p=3945)).
- **Electrical:** 527 CMR 12.00, based on the **2026 NEC**, effective April 24, 2026 ([C](https://www.icc-nta.org/code-update/new-massachusetts-electrical-code-in-effect/)). An earlier state draft shows Feb 28, 2026 ([S](https://www.mass.gov/doc/proposed-amendments-to-527-cmr-1200-ma-electrical-code-2026-edition/download)).
- **Fire:** 527 CMR 1.00, based on the 2021 NFPA 1, effective Dec 9, 2022 ([S](https://coderedconsultants.com/insights_categories/insight_2_code_updates/page/5)). A draft based on the 2024 edition appears in [late-2025 board minutes](https://www.mass.gov/doc/bfpr-minutes-11625/download) (S). **Adoption not confirmed.**
- **Local amendments:** I did not research how much towns can amend the state code. Local by-laws like zoning clearly vary. California code adoption was not researched (0 searches).

## Recommendation

| Source | Call | Reason |
|---|---|---|
| MassGIS L3 parcels | **Use in demo** | Real API, minutes to data, and its blanks and conflicts show the product's value |
| MassGIS roofprints | **Use in demo** | Statewide footprint with a clear date, and a real conflict to show |
| Holliston dimensional table | **Use in demo** | Real limits. Encode one district by hand for a deterministic check |
| OpenEI URDB | **Use in demo** | Gives the utility and candidates, and shows why rate stays "missing" until a bill arrives |
| Esri copy of FEMA flood data | **Use in demo** | Fast, but label as inferred and tell the user to confirm with FEMA |
| MA code editions table | **Use in demo** | Small hand-kept table with sources |
| Blank wiring and commercial permit forms | **Use in demo** | They define which missing fields a records request can fill |
| Generated records request draft | **Use in demo** | Closes the loop: a gap becomes a named document and a person sends the request. Replies take at least days, so don't plan on one arriving in time |
| Filing a real request for 29 Everett St | Stretch | Real evidence if it returns in time, but the team must approve it |
| Person-read portal or counter records | Stretch | Most valuable if available, entered by hand with the source kept. Not verified |
| Eversource Interconnection Navigator | Stretch | Parcel-level value, but person-read until terms and login are checked |
| National Grid data portal | Stretch | Clean API, but doesn't cover the Holliston site. Use for a second site |
| Property record cards | Stretch | Could fill the L3 gaps, but it was under maintenance and has a no-resale disclaimer |
| Registry of Deeds | Stretch | Could settle the lot-size conflict. Robots rules unresolved |
| PG&E GRIP | Stretch | Open and well documented, for a Bay Area second site only |
| California assessors | Avoid for demo | Per-county and per-parcel, with fees in the examples I saw |
| Scraping MapsOnline or OpenGov portals | **Avoid** | robots.txt bars it. Needs vendor or town permission |
| Direct FEMA `/arcgis` queries | Avoid | robots.txt bars it, and a copy exists for the demo |
| OSM hydrants | Avoid | 0 mapped here, and easy to misread as "no hydrants" |
| Directory and aggregator sites | Avoid | Unreliable and conflicting. Leads only |
| ORNL copy of Eversource hosting data | Avoid | [Metadata](https://openenergyhub.ornl.gov/explore/dataset/dghosting_adminvw_dg_hosting_ced_ema_st) dated 2024, API returned 403, no license found |

## Update: real plan sets on a planning board page

Added after the first draft, following a lead from plan-set-bridge. **Real public documents, not synthetic.**

[Sturbridge's filing page for 178 Main Street](https://www.sturbridge.gov/850/NextGrid---178-Main-Street---Modificatio) (C) has [Site Plans](https://www.sturbridge.gov/DocumentCenter/View/577/Site-Plans), [Updated Site Plans](https://www.sturbridge.gov/DocumentCenter/View/579/Updated-Site-Plans), [Narrative](https://www.sturbridge.gov/DocumentCenter/View/576/Narrative), [Application](https://www.sturbridge.gov/DocumentCenter/View/574/Application), [Decision](https://www.sturbridge.gov/DocumentCenter/View/575/Decision) and [Solar Specs](https://www.sturbridge.gov/DocumentCenter/View/578/Solar-Specs). Sturbridge's robots rules don't list `DocumentCenter`.

- **What the updated set shows (C):** a rooftop solar and battery project. Drawing index: G001, V101, C101, C102, C501. Revisions: 0 on 02/24/2025 (issued for building permit), 1 on 03/10/2025 (planning and fire comments), 2 on 03/24/2025 (updated layout), 3 on 04/01/2025 (address updated). Its PDF text can be extracted.
- **What this changes:** planning board filing pages are a software-readable source of real plan sets, at least in this town. I had not covered them as a source. How many towns post them is unknown.
- **What it doesn't change:** the index lists general, survey and civil sheets only. It lists no electrical sheets, so this set would not fill most electrical seed fields.
- **Conflict to demo (C):** the first set says 194 Main Street throughout, and the updated set says 178 Main Street, with revision 3 reading "address updated". A real address change across versions.
- **Real survey notes name their public sources (C):** V101's references include the tax assessor's map, FIRM panel 25027C0927F (revised June 21, 2023), recorded plans with registry book and plan numbers, town sewer cards and ALTA surveys. This is evidence of where a real plan set's site data comes from, and a good checklist for this record's source list.
- **Unindexed sheets:** plan-set-bridge found two electrical sheets by ARC Design (C-1, C-2: cover and placard) in the first set, beyond the index. No single-line is posted. See `docs/research/2026-11-07-option1-plan-set-bridge.md`.
- **Scanned document:** the Decision PDF has no text layer, only two page scans. No OCR tool was available, so I read the page images by eye. Check them before quoting.
- **What the town decided (C):** on April 7, 2025 the Planning Board voted 6-0 to approve a **waiver of site plan review**, signed 4/10/25, with general conditions. Condition 3 says all other necessary permits must still be obtained. So this is not electrical, fire or code acceptance of the drawings. Those reviews are listed but not posted on the filing page.
- **Two more conflicts to demo (C):**
  - **Plan revision:** the Decision cites the plan "revised through 03/24/2025", but the posted updated set carries revision 3 dated 04/01/2025, six days before the meeting. Which revision the board had isn't stated.
  - **Owner:** the Decision names Dragonfly Ibis Sturbridge, LLC (misspelled "Dragonly" on page 1), while the plan cover names SEA Sturbridge Plaza LLC. The filing doesn't explain the difference.
- **Link rot:** older `/sites/g/files/...` links on Sturbridge and Holliston returned 404, while the Sturbridge `/DocumentCenter/View/` links work. Store a retrieved copy or hash with each source, not only the URL (I).

[Pembroke's review letter](https://www.pembroke-ma.gov/DocumentCenter/View/7543/Site-Additional) (C) names a Morse Engineering "Proposed Site Plan, 48 Schoosett Street", dated July 14, 2025, revised September 16, 2025. I did not find the plan set itself in 1 search.

## Open items

1. **Portal check, person needed.** Open the [Holliston portal](https://www.mapsonline.net/hollistonma/public_permit_reports.html.php) and note the report columns and whether permits have attachments. Try 29 Everett St. Already requested from the lead.
2. **Decide whether to file a records request** for wiring and building permits at 29 Everett St. Not filed.
3. **Possible real battery plans in Holliston, unverified.** A search excerpt shows a [Conservation Commission agenda](https://www.townofholliston.us/sites/g/files/vyhlif706/f/agendas/concomagenda_12.13.pdf) with a battery storage filing at 600 Central St, but the link returned 404 and L3 lists that parcel as a religious use. A [trade article](https://hartenergy.com/exclusives/altus-power-adds-massachusetts-solar-system-battery-storage-205905) mentions a Holliston solar and battery project (S). Conservation or Planning files could hold a real site plan.
4. **Century Tywood.** A Holliston-focused search returned a [MapQuest listing for Century Ty-Wood Corp](https://mapquest.com/us/massachusetts/century-ty-wood-corp-269815931) (S), but the page came back empty. No Holliston L3 parcel has an owner matching `TY%WOOD`, and one follow-up search found nothing. I can't tell if the brief's plan set is a Holliston site. Worth asking EQORE.
5. **Terms to read before any production use:** MassGIS, Esri, National Grid, Eversource.
6. **Ask EQORE:** does EQORE already get service size from wiring permits, and how long does that take today?

## Method notes

- Budget: 16 web searches, plus small reads of the APIs above.
- Before I saw the robots rule, I made two reads of the Holliston portal shell page (one fetch, one download). I made none after, and I did not open the iframe report.
- Downloaded PDFs were only read as text, in the session scratchpad. Nothing was executed.
- Some table claims rest on search excerpts because pages failed to open. Those are marked S.
