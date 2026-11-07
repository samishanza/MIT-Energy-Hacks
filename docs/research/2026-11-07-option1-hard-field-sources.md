# Option 1 research: sources for hard-to-collect fields

Date checked: 2026-11-07. Everything here is **real public data, not synthetic**. Test sites: 29 Everett St and 11 Bartzak Dr, Holliston. No one was contacted and nothing was filed. No time savings are claimed.

**Evidence labels**
- **C** = confirmed: I read it in the source today, and the link is given.
- **S** = seen only in a search-result excerpt. I did not open the page, or it failed to open.
- **I** = my inference.

## Bottom line

1. **Vision assessor cards can show construction, sprinklers and wall height, but Holliston isn't on Vision.** Vision lists 79 Massachusetts towns, and I read 2 cards. The Framingham card shows frame, exterior walls, wall height and % sprinkler. Its "Electric" field says only "Typical", so it gives no rating.
2. **No source I tested gave service size, equipment ratings or switchgear location for either test site.** These stay with wiring permits, customer documents, or a site visit. Listings state amps and volts, but only for buildings on the market.
3. **Planning filings are the best surprise.** A Holliston filing contains a real one-line drawing, for a proposed solar project on a different Bartzak Dr parcel.
4. **Everything else gives a hint, not a value.** Use codes, NAICS codes, appraiser wall types and old maps are not IBC occupancy or construction classes. An engineer has to assign those.

## Results by lead

| # | Lead | Result |
|---|---|---|
| 1 | Listings and broker flyers | **Partly true, failed at both test sites.** Listings do state amps, volts and phase, but neither site had such a listing |
| 2 | Vision cards | **Worked, but not in Holliston.** Strong construction data in 2 of 2 cards read |
| 3 | Regulatory filings | **ECHO/FRS worked for identity only.** Tier II and generator permits gave no site data |
| 4 | Sanborn maps | **Failed at both test sites.** Neither street is in the 1942 index |
| 5 | Existing PV/DER data | **Mostly failed at site level.** Only large ground arrays have coordinates |
| 6 | Prior planning filings | **Failed for both exact addresses, worked next door.** One real one-line found |
| 7 | Bing and county oblique imagery | **Failed on terms or access.** Mapillary is possible, but its terms limit extraction |

## Source table

"Person-read" means a person views the page and enters the value, keeping the source link. "API" means a documented or structured endpoint.

| Source | Target fields | Automatable | Terms status | Test result |
|---|---|---|---|---|
| [Vision property cards](https://www.vgsi.com/massachusetts-online-database/) | Wall and construction class, sprinkler, wall height, occupancy hint, openings (photo and sketch), outbuildings. Not ratings | Person-read. Pages are structured HTML, but there is no API I found | `gis.vgsi.com/robots.txt` returns 404. Footer says "All rights reserved". No use terms found on pages read. **Bulk use unresolved** | 79 MA towns listed (C), and Ashland links to a different site. **Holliston not listed.** Read 2 cards, below |
| [State-hosted Tyler search](https://mapublicaccess.tylerhost.net/search/commonsearch.aspx?mode=address&sjur=MA136) | Likely similar to Vision (I) | Person-read | Disclaimer: "solely for your own use and cannot be sold" (C) | Holliston is 1 of 34 towns in the menu by my count. **Maintenance notice on both checks, so no card read** |
| [LoopNet](https://www.loopnet.com/robots.txt) | Amps, volts, phase, sprinkler | **No** | Even `robots.txt` returned 403, so treated as off limits. Terms not read | Excerpts only (S). Not opened |
| [Crexi](https://www.crexi.com/robots.txt) | Same | No | Robots bars `/api` and `/comps`. [Terms](https://www.crexi.com/terms) returned 403, not read | Not opened |
| CBRE listing pages | Same | Person-read | Robots bars `/api` and search, not listing pages. Terms not read | [Marlborough](https://www.cbre.com/properties/properties-for-lease/industrial/details/US-SMPL-39958/360-cedar-hill-street-marlborough-ma-01752) (excerpt: 1,600 A, 480/277 V, S) returned 404 when opened. [Pittsfield](https://www.cbre.com/properties/properties-for-lease/industrial/details/US-SMPL-94389/15-commercial-street-pittsfield-ma-01201) page loaded, but my text search found no amps. **Listings disappear** |
| [MassEcon Site Finder](https://www.massecon.com/site-finder/) | Unknown | No | Not found | **Failed.** The page has a heading and contact details, and no site data was visible to my fetch |
| [EPA ECHO](https://echodata.epa.gov/echo/echo_rest_services.get_facilities) and [Envirofacts TRI](https://data.epa.gov/efservice/TRI_FACILITY/TRI_FACILITY_ID/01746WFWDN29EVE/JSON) | Occupant, SIC and NAICS, program IDs, inspection dates. No electrical | **API, no key** | No block seen. Federal data, terms not read | **Works at both sites**, below |
| EPCRA Tier II ([EPA guidance](https://www.epa.gov/system/files/documents/2022-01/chapter-8-epcra-section-324.pdf), [MEMA 2023 memo](https://www.mass.gov/doc/tier-ii-memo-2023/download)) | Chemical inventory, possibly battery chemistry, possibly site plan | No. Request only | Reports should be public subject to trade secrets. A training slide says by records request. A MEMA memo, which I couldn't pin to a specific year, says site plans are "most likely exempt". The 2023 memo says site plans weren't required that year (all S) | **Not tested.** `mass.gov` returned 403 to automated reads |
| MassDEP air records ([ePLACE](https://eplace.eea.mass.gov), [records guide](https://www.mass.gov/guides/guidelines-for-making-a-public-records-request-at-massdep)) | Generators, perhaps kW and fuel (I) | Person-read | ePLACE shows only authorizations issued electronically (S). File review by request (S) | **Not tested at a site.** Emergency engine records: not found in 1 search |
| [Sanborn maps, Library of Congress](https://www.loc.gov/collections/sanborn-maps/) | Construction, openings, stories, fire walls, hydrants, for old buildings | API (JSON and IIIF images), but reading the map is by eye | [Public domain](https://www.loc.gov/item/sanborn03750_006/) (C). Robots sets `Crawl-Delay: 5` | 6 Holliston editions, 1888 to 1942 (C). **Neither street appears** |
| [MassCEC PV in PTS](https://www.masscec.com/public-records-requests) | Existing PV, town-level | Download | Published for download. Terms not read | Has city and ZIP, **no street address** (C), below |
| [USPVDB](https://energy.usgs.gov/api/uspvdb/v1/projects) | Existing large PV, with coordinates | **API, no key** | USGS data, terms not read | Works. **Nothing on either site**, below |
| [Tracking the Sun](https://eta-publications.lbl.gov/sites/default/files/2026-08/lbnl_publicdatafile_userguide_8.07.26.pdf) | Existing PV | Download | Excludes confidential data (C). Terms not read | Guide lists city and ZIP fields, and I saw no street address field. Data file not downloaded |
| SMART and RPS unit lists, [mass.gov](https://www.mass.gov/info-details/lists-of-qualified-generation-units) | Existing PV | Unknown | `mass.gov` returned 403 to automated reads | **Not read.** Whether they have addresses is unknown. A person should check |
| Town planning filings, [Holliston](https://www.townofholliston.us/DocumentCenter/View/4194/Bartzak-Drive---Response-Materials-to-Hearing-3-9-2023-PDF) | Site plan, single-line, feeder voltage, survey | Person-read. Find with a web search limited to the town's domain | Robots bars the town's own `/Search`, but not `DocumentCenter` | **Real one-line found, neighbouring parcel**, below |
| Bing Streetside and bird's eye | Openings, fire access, exposures | No | Older licences bar storing, building a database or deriving data (S). The [old Bing terms page](https://www.microsoft.com/en-us/maps/bing-maps/product/print-rights-may-2018) now redirects to Azure Maps (C). **Current terms not read** | Not used. Terms look wrong for stored values |
| [Mapillary](https://www.mapillary.com/legal) | Openings, fire access, exposures | Person-read | Content under CC BY-SA (§3.2). Bars "data mining, robots or similar" methods not approved and derivatives of the services (§5.1). Lists allowed commercial purposes (§12.1). API-extracted data needs attribution (§11) (C). **Needs legal reading before stored values** | Coverage at the sites not tested. API needs a token, per the [remote-sensing lane](2026-11-07-option1-remote-sensing.md) |
| Town and county oblique viewers | Same | No | No Massachusetts terms found in 1 search | Belmont may offer one through MapGeo, per a vendor newsletter (S, page not opened). Not tested |

## Test details

### Vision cards (lead 2)

Two commercial cards read. Templates differ by town, so a parser would need per-town handling (I).

| Field | [100 Clinton St, Framingham](https://gis.vgsi.com/framinghamma/Parcel.aspx?pid=2265) (industrial) | [178 Main St, Sturbridge](https://gis.vgsi.com/sturbridgema/Parcel.aspx?pid=102518) (retail condo) |
|---|---|---|
| Frame | Steel | Not shown |
| Exterior wall | Corrugated steel | Concrete/cinder, brick/masonry |
| Roof | Flat, membrane | Flat, tar and gravel |
| Wall height | 14 | Not shown |
| Sprinkler | % Sprinkler 100 | Wet/concealed, 105,660 sq ft |
| Electric | **"Typical"** | Not shown |
| Area | 67,465 for building 1, plus a second building | 105,660 |
| Year built | 1961 | 1972 |
| Photo and sketch | Sections present, not opened | Present (C). Sketch file loads |

**What this adds:**
- **It fills the L3 gap.** L3 has no `BLD_AREA` for the Framingham parcel, and the card has one. Framingham had 0 of 108 use-code 4xx parcels with `BLD_AREA` in my earlier check.
- **It resolved a real conflict.** The Sturbridge plan cover names SEA Sturbridge Plaza LLC, and the Decision names Dragonfly Ibis Sturbridge LLC. The card's ownership history shows SEA as earlier owner and Dragonfly from 07/30/2018, so the plan cover looks out of date (I).
- **Caveat:** these are appraiser categories, not IBC construction types or fire ratings. An engineer has to interpret them.
- **Caveat:** 79 of the state's 351 towns are listed, and I don't know how many EQORE sites fall in them.

### Listings (lead 1)

Excerpts state power for real Massachusetts buildings (all S): [Peabody](https://www.loopnet.com/Listing/3-Technology-Dr-Peabody-MA/37319802/) 1,225 A, 277/480 V, 3-phase; [Leominster](https://www.loopnet.com/Listing/50-June-St-Leominster-MA/41461094/) 2,000 A, 480 V, 3-phase; [Methuen](https://loopnet.com/Listing/46-Old-Ferry-Rd-Methuen-MA/33126306) 4,000 A, with a [second listing](https://www.loopnet.ca/Listing/46-Old-Ferry-Rd-Methuen-MA/37521081) saying 4,000 to 7,500 A. A Holliston listing at 201 Summer St gives 1,600 A, but I couldn't identify the source page.

**At the test sites:** 29 Everett St appeared with lot size only, and 11 Bartzak Dr returned nothing (1 search). None of the excerpts gave service details for either.

**Limits:**
- Listings cover only buildings on the market, while EQORE's customers are generally occupying theirs (I).
- These are broker marketing claims, and sources can disagree, as at Methuen.
- They give no switchgear location or equipment ratings.
- I could not confirm this in a page I opened myself. Everything here rests on excerpts.

### ECHO and TRI (lead 3)

| Site | Federal records | What it shows |
|---|---|---|
| 29 Everett St | Cold Chain Technologies (SIC 3086, 3471, 3499; TRI ID `01746WFWDN29EVE`). WF Wood Inc (SIC 3471, plating; last inspection 04/10/1997) | TRI reporting years run 1989 to 2016, and `fac_closed_ind` is 1, which I read as closed (I). So the listed occupant may be out of date |
| 11 Bartzak Dr | Herb Chambers Collision Center (Clean Water Act record, no violation identified) | **New conflict:** L3 calls this parcel "Buildings for manufacturing operations" |

Three spellings of one address appear across these records and L3: Everett Road, Everett Rd., Everett St. Address matching needs normalizing, and matching by coordinates was not tested.

This helps with occupant identity and with chemical or plating exposure hints (I). It says nothing about electrical service.

### Sanborn (lead 4)

The [1942 Holliston key sheet](https://www.loc.gov/item/sanborn03750_006/) (8 sheets, corrected March 1942) has a street index with no Everett or Bartzak entry. I read the index by eye. Lowland St is in the index, on sheet 1.

**Date limit:** 1942 is the latest Holliston edition online. Use it only for buildings known to predate it, and treat it as history, not as what stands today.

### PV and DER (lead 5)

- **[MassCEC PV in PTS](https://www.masscec.com/sites/default/files/documents/Solar-PV-Systems-in-MA-as-of-Jan-2025.xlsx)** (as of 1-14-2025): fields include capacity, in-service date, city, ZIP, facility type, installer, inverter maker and utility, with **no street address** (C). Holliston has 511 rows, 11 of them "Industrial". The file's notes say it is not complete for SMART projects.
- **[USPVDB](https://energy.usgs.gov/api/uspvdb/v1/projects):** one project in a box around the area: "Holliston, LLC", 1.5 MW AC, 2020, greenfield, no battery value. The point falls on the 106 Lowland St parcel in L3, about 0.3 km from the 29 Everett centroid. Nothing on either test parcel. It may be the same system as a 1,638 kW DC "Industrial" PTS row from 2020 (I).
- **Conclusion:** public lists can say "a town has N industrial systems", or find a large ground array by coordinates. They can't confirm rooftop PV at a given address. That needs imagery (remote-sensing lane) or the customer.

### Planning filings (lead 6)

- **Exact addresses:** nothing for 11 Bartzak Dr or 29 Everett St in 1 domain-limited web search. This is not proof that nothing exists. The town's own site search is barred to software by robots, so a person should try it.
- **Found next door:** a [filing for 0 Bartzak Dr](https://www.townofholliston.us/DocumentCenter/View/4194/Bartzak-Drive---Response-Materials-to-Hearing-3-9-2023-PDF), parcel `014.0-0004-0021.4` (C). It contains sheet E-101 "ONE LINE" by JEM Engineering, created 1/19/21, with 7 listed revisions through 12/19/22.
- **Useful content:** revision 3 reads "Add 3 phase 13.2kv recloser", and the point of interconnection "would lead towards the circuit line on Bartzak Drive to the West" (C). This suggests a 3-phase 13.2 kV line on the same street as 11 Bartzak Dr (I). It is the primary line, not the building's service.
- **Limit:** it is one project's new connection, not a survey of an existing facility. It also contains personal emails and phone numbers, so don't copy it wholesale.
- **Records exist:** the same PDF mentions scans of a prior site plan and survey base map held for that lot (C).
- **Earlier lead now supported:** [Town Meeting Article 23](https://www.townofholliston.us/ArchiveCenter/ViewFile/Item/254) names "the energy storage facility proposed at 600 Central Street" and solar at 103 Bartzak Drive (C). Filings for that storage project may exist. I did not look for them.

### Imagery (lead 7)

The [remote-sensing lane](2026-11-07-option1-remote-sensing.md) already covers Google and the commercial vendors. Nothing here beats it for stored values. Bing's older licences bar storing or deriving data, and Mapillary needs a legal reading before any stored measurement. A person looking at street imagery can suggest where to check openings and access, but shouldn't record it as a measured value.

## How to collect each target field

For the test sites, this is the best method I found. "Public, test site" says whether it worked at 29 Everett St or 11 Bartzak Dr.

| Target field | Best public method | Public, test site | Fallback | Label for the record |
|---|---|---|---|---|
| Voltage/phase | Listing if on the market. Planning one-line for primary voltage | Primary line only, inferred at 11 Bartzak | Wiring permit, bill, nameplate photo | Reported by broker, or inferred |
| Service size | Listing amps | **No** | Wiring permit (form has the field), customer | Reported, with date |
| Equipment ratings | None found | **No** | Customer single-line, nameplate photos, site visit | Missing |
| Main switchgear location | None found | **No** | Customer, existing plans, site visit | Missing |
| Openings/exits | Vision photo and sketch, street imagery | Not obtained | Customer photos, plan set, site visit | Inferred, needs a person |
| Wall and construction class | Vision frame and wall fields | **Not in Holliston.** Tyler was down | Commercial permit form (has the field), engineer | Reported, not an IBC type |
| Occupancy class | L3 use code, Vision type, ECHO NAICS | Hints only, and they conflict at 11 Bartzak | Commercial permit form (use group), engineer | Inferred |
| Fire access | None direct. Parcel and imagery | Not obtained | Fire Department review, site visit | Missing or inferred |
| Exposures | Roofprints and parcel geometry. ECHO for hazardous neighbours | Geometry available in the earlier work, not computed here | Engineer review | Inferred from calculation |
| Existing PV/DER | USPVDB for large arrays, then imagery | None on the parcels in USPVDB. Rooftop unknown | Customer, interconnection records | Absent from USPVDB only, never "no PV" |
| Existing site plan or single-line | Domain-limited web search, then records request | **Not for the exact addresses.** Neighbouring parcel yes | Customer, Registry of Deeds | Dated, proposed or as-built marked |

## Recommendation

| Source | Call | Reason |
|---|---|---|
| ECHO and TRI | **Use in demo** | Free API, works at both sites, and creates a real occupant conflict |
| Vision card, one site by hand | **Use in demo** | Shows what's possible, and resolved a real owner conflict. Not for Holliston sites |
| Holliston planning filing (one-line) | **Use in demo** | Real evidence, labeled as a neighbouring parcel's proposed project |
| USPVDB | **Use in demo** | Simple coordinate check, labeled so absence never means "no PV" |
| Tyler card for Holliston | Stretch | May fill the gaps once it's back, by a person. Has a no-resale disclaimer |
| CBRE and other broker pages | Stretch | Person-read when a site happens to be listed. Treat as claims |
| MassCEC PV in PTS | Stretch | Town-level context only |
| Mapillary | Stretch | Person-read hints, and needs a legal reading first |
| Tier II and MassDEP records | Stretch | Request-only, and replies won't fit a demo |
| Sanborn | Stretch | Only for confirmed pre-1942 buildings. Useless at both test sites |
| Bulk Vision collection | Avoid until terms are clear | No explicit permission found, and "All rights reserved" |
| LoopNet, Crexi | **Avoid** | Blocked or unread terms |
| Bing, county oblique viewers | Avoid | Terms bar storing, or none found |
| MassEcon Site Finder | Avoid | No usable data seen |
| Tracking the Sun | Avoid for this use | No street address found, so it can't reach a site |

**Consider a demo site with more evidence (I).** 178 Main St, Sturbridge has a plan set, Decision, Vision card and real conflicts in one place. It is a retail plaza rather than a manufacturer, and the plan set is for rooftop solar and batteries. The team should decide whether that's acceptable. I did not check its serving utility.

## Open questions for people

1. Does EQORE accept a customer document or photo request as "no site visit"? Ratings and switchgear location likely depend on it.
2. Can Vision's data be used in bulk? This needs Vision or the town to say. Nobody has been asked.
3. A person could try the town's own site search for both addresses, and the Tyler card once it's back.

## Method notes

- 12 web searches, plus small reads. About 3 Vision pages per town tested, with pauses.
- `mapsonline.net`, the OpenGov portal and FEMA's `/arcgis` paths were not touched.
- `mass.gov`, LoopNet, Crexi terms and `commercialsearch.com` returned 403. I did not work around those blocks.
- PDF and spreadsheet files were read as data in the session scratchpad. Nothing was executed.
- I downloaded one 13.5 MB published spreadsheet, the only large read.
