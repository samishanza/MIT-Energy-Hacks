# Public data for customer-side and service-side electrical facts

Date checked: 2026-11-07. Everything here is **real public data, not synthetic**. Nothing was filed, requested, or signed up for. No time savings are claimed.

**Evidence labels**
- **C** = confirmed: I read it on the primary page or file today, and the link is given.
- **S** = seen only in a search-result excerpt or a secondary page.
- **I** = my inference.

Related lanes, not repeated here: [hard-field sources](2026-11-07-option1-hard-field-sources.md) (listings, Vision cards, planning filings), [public records](2026-11-07-option1-public-records.md) (wiring permit form, portals), [remote sensing](2026-11-07-option1-remote-sensing.md) (Google terms, 3DEP heights), [inputs and datasets](2026-11-07-option1-inputs-and-datasets.md), and [tariff 1632](2026-11-07-national-grid-tariff-1632.md).

## Summary

No public source gives the main breaker rating, bus rating, switchgear location, or the utility's available fault current for a site. The best finding is the **City of Cambridge Electrical Permits** dataset. It is an open, no-key API under a public-domain licence, and it stores the **existing service amps, volts, meter count, and overhead or underground** for each permit at a street address. 805 commercial permits have a nonzero existing service, including 4,000 A at 480 V (C). Somerville publishes permit descriptions that sometimes state amps, volts, and even the utility's transformer kVA, in free text (C). Interconnection queues are weaker than they look. ISO-NE, PJM, NYISO and CAISO list transmission-level projects by county and point of interconnection, not building services. New York's utility SIR inventories list every distribution project with **circuit ID, substation, ZIP, and storage kW**, but no street address (C). Massachusetts has no current public per-project distribution queue that I found. EIA-860 gives **grid voltage at the point of interconnection** and the wires owner for plants of 1 MW or more (C), so it helps only at large sites. On the utility side, the most useful document is not public. It is National Grid's **Pre-Application Report**, which costs $100 to $750 and is mandatory at 250 kW or more. It returns the circuit voltage at the site, phase availability, network or radial service, and nearby feeders (C). The prototype could draft that request from the site record. Street imagery won't give stored values. Google's terms bar object detection. Mapillary has a utility-pole class but no transformer class. Massachusetts 3DEP lidar has no wire or pole classes.

## Ranked table

Ranked by how much each source improves per-site electrical inference. "Per site" means it can be tied to one address or parcel.

| # | Source | Electrical fields per site | Coverage | Access | Terms status | Use? |
|---|---|---|---|---|---|---|
| 1 | [Cambridge Electrical Permits](https://data.cambridgema.gov/d/hvtc-3ab9) (`hvtc-3ab9`) | Existing service amps and volts, existing meter count, overhead or underground (existing). New service amps, volts, and meters. kVA, ampacity, generators, PV panels, building use, full address, lat/long, issue date (C) | Cambridge only. 23,019 permits, 2018-08-23 to 2026-11-06. 3,291 have existing amps, and 805 are commercial with nonzero amps (C) | Socrata API, no key (C) | Licence PDDL, public domain (C). Robots: crawl-delay 1, API paths not barred (C) | **Yes** |
| 2 | National Grid MA [Pre-Application Report](https://nationalgridus.com/media/pdfs/billing-payments/tariffs/mae/mdpu_1468_dg_interconnection_tariff_.pdf) (tariff §3.2, Exhibit B) | Circuit voltage at substation and at the facility, circuit name, substation and its transformer rating, phases near the site, distance to 3-phase, network or radial, feeders within 1/4 mile, connected and queued DG (C) | Any National Grid MA site | **Request, not public.** $100 below 250 kW, $250 for 250 to 500 kW, $750 above. Issued in 10 business days (C) | Tariff process. Report is "non-binding" and "a snapshot in time" (C) | **Yes, as a drafted request** |
| 3 | [Somerville Applications for Permits and Licenses](https://data.somervillema.gov/d/nneb-s3f7) (`nneb-s3f7`) | Free-text description. 2,346 electrical permits mention "AMP". Examples state "1200 amp 277/480 volt 3 phase" and "Eversource to upgrade transformer to 1500 KVA" (C). Address, parcel number, lat/long, dates | Somerville only. 25,577 electrical permits (C) | Socrata API, no key (C) | Licence ODbL, which needs attribution and share-alike (C). Robots crawl-delay 1 (C) | **Yes**, as text-extracted claims |
| 4 | [EIA-860](https://www.eia.gov/electricity/data/eia860/) and [EIA-860M](https://www.eia.gov/electricity/data/eia860m/) | Plant lat/long, grid voltage at up to 3 points of interconnection (kV), owner of the wires it connects to, balancing authority. Generator MW, storage MWh (C, from the [instructions](https://www.eia.gov/survey/form/eia_860/instructions.pdf)) | US plants of 1 MW or more. Annual 2025 data released 2026-09-10. Monthly file covers status (C) | Excel downloads. API exists but needs a key, which I didn't request | Public domain, with attribution asked (C, [EIA policy](https://www.eia.gov/about/copyrights_reuse.php)) | **Yes**, for large sites and neighbours |
| 5 | NY DPS [SIR Inventory](https://dps.ny.gov/distributed-generation-information) (monthly, per utility) | City/Town, County, ZIP, Circuit ID, Substation, NYISO zone, PV/ESS/other kW AC, hybrid flag, metering type, protective equipment, review dates, costs, completion status (C, O&R file headers). No street address, no kWh (C) | All NY investor-owned utilities. September 2026 files posted (C) | XLSX, 2.4 to 15 MB each. Con Edison is a .7z (C) | No terms stated on the page. Robots doesn't bar `/system/files/` (C) | **Yes, for NY expansion** |
| 6 | [Cambridge BEUDO 2015-2024](https://data.cambridgema.gov/d/72g6-j7aq) (`72g6-j7aq`) | Annual grid kWh, on-site renewable kWh, GFA, property type, MapLot, address, lat/long (C). Load scale only, no equipment | Cambridge buildings over 25,000 sq ft and others covered by the ordinance (C) | Socrata API, no key (C) | Licence field empty in the metadata (C). Terms page not read | Maybe. Useful for sizing, not service |
| 7 | [NYC DOB NOW Electrical Permit Applications](https://data.cityofnewyork.us/d/dm9a-ab7w) and [Details](https://data.cityofnewyork.us/d/xmmq-y7za) | Existing, new, removed, and total meters. "Notify utility" flag, lat/long, BIN. Details list fee items by ampacity band, such as "Over 1200 amps" and "3Ø over 225 amps", and Total_KVA (C). These are work items, not the service rating (I) | NYC only | Socrata API, no key (C) | Licence field empty (C). NYC terms not read | Maybe, outside MA |
| 8 | [Cambridge GIS Utility Poles](https://github.com/cambridgegis/cambridgegis_data_infra/tree/master/Utility_Poles) and Utility Facilities | 2,457 pole points with type and elevation only. 14 facilities, including 4 "Major Electric Transformer Station" points with addresses (C) | Cambridge. Photogrammetry from a 2018 flight (C) | GeoJSON on GitHub | PDDL (C) | Maybe. Pole location, not ownership or equipment |
| 9 | [Boston Approved Building Permits](https://data.boston.gov/dataset/approved-building-permits), [BERDO](https://data.boston.gov/dataset/b09a8b71-274b-4365-9ce6-49b8b44602ef) | Permits: work type, description, "Electrical Temporary Service" type (S). BERDO: electricity use, likely in thousands of kWh (S) | Boston | **403 to my automated reads.** Robots bars `/api/` and `/datastore/`, crawl-delay 10 (C) | Not read | Maybe, by a person downloading the CSV |
| 10 | [ISO-NE interconnection queue](https://www.iso-ne.com/system-planning/transmission-planning/interconnection-request-queue) | Queue position, fuel, net/summer/winter MW, county and state, POI, service type, study status (C). Battery and generator MW are not split for co-located projects (C) | New England. Excludes many distribution-connected and retail projects (C) | XLSX and PDF from the page | No licence stated (C). `robots.txt` returned 404 | No for a site record. Context only |
| 11 | [LBNL Queued Up](https://emp.lbl.gov/queues), PJM, NYISO, CAISO queues | Queue ID, county, POI or transmission owner, MW, type, status, dates (S). PJM's public export has no substation column (S) | Transmission-level, all US ISOs | XLSX downloads. [NYISO file](https://www.nyiso.com/interconnections) found (C). LBNL page returned 403 | Not read | No for a site record |
| 12 | [MA DG Interconnection Council archive](https://sites.google.com/site/massdgic/madgic_ic_archived) | Project-by-project utility reports, expedited and standard track only (C). Fields not listed | MA, applications from 2009 to February 2017 (C) | Google Drive file. Not opened | Not read | Maybe, history only |
| 13 | [Interconnection.fyi](https://www.interconnection.fyi/dg/project/ma-fitchburg-4729) | MA distribution projects with town, circuit (e.g. Unitil `39W19`), kW, status (C) | 16 states, by its own claim (S) | Web pages. Robots allows all (C) | **Terms bar scraping and bulk download, and allow only personal non-commercial use** (C) | **No** |
| 14 | SMART ([masmartsolar.com](https://www.masmartsolar.com/)) and mass.gov unit lists | Unknown | MA | Site returned 401. mass.gov returns 403 to automated reads | Not read | No, unless a person checks |
| 15 | Mapillary | Detected `object--support--utility-pole`, `object--support--pole`, `object--junction-box`, `object--manhole`, `object--street-light`. **No transformer, wire, or cable class** ([docs](https://www.mapillary.com/developer/api-documentation/points), C) | Crowd-sourced, unknown at sites | API with token | CC BY-SA. §5.1 bars unapproved data mining (C, per the remote-sensing lane) | Maybe, person-read hints |
| 16 | USGS 3DEP point clouds | Poles, wires, and pad-mounts would sit in "unclassified". MA Central Eastern 2021 delivered classes 1-7, 9, 17, 18, 20, 22, **with no wire or tower classes 13-16** ([report](https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/metadata/MA_CentralEastern_2021_B21/MA_CentralEastern_2_2021/reports/Central_East_MA_NIR_lidar_Report_Final_Signed.pdf), Table 8, C) | National, varies by project | EPT tiles on AWS, no key | Public domain | Maybe, an untested detector |
| 17 | KartaView | Street photos only | Unknown | API not checked | Imagery CC BY-SA 4.0 per the [OSM wiki](https://wiki.openstreetmap.org/wiki/KartaView) (S). Its own terms page loads by script and I couldn't read it | No until terms are read |
| 18 | Google Street View Static and Photorealistic 3D Tiles | Visual only | Wide | Key and billing needed | [Map Tiles policies](https://developers.google.com/maps/documentation/tile/policies) bar extraction, deriving content, and "image analysis, object detection" (C) | **No** for stored values |
| 19 | Worcester and Springfield permits | Worcester has a building permits FeatureServer from 2021 (S). Springfield has no open dataset that I found | City | Worcester GIS host didn't respond to me | Not read | Not tested |
| 20 | Municipal light plant GIS | None published that I found. West Boylston is mapping poles and transformers internally (S) | MA MLPs | None | n/a | No |
| 21 | EIA CBECS | Survey microdata, not per building (I) | National sample | Download | Public domain | No |

## What interconnection applications ask for

### Massachusetts, National Grid

Source: [M.D.P.U. No. 1468](https://nationalgridus.com/media/pdfs/billing-payments/tariffs/mae/mdpu_1468_dg_interconnection_tariff_.pdf), read from the PDF text (C). The current No. 1632 has the same fields plus a "new or changed Facility" block, per the [tariff comparison](2026-11-07-national-grid-tariff-1632.md). Eversource's equivalent was not read, because its terms bar automated use.

**Exhibit B, Pre-Application Report request (what the applicant sends).** Street address with cross streets, a map picture and GPS coordinates. Generation type, size in AC kW, single or three phase, stand-alone or not. If there is existing service: the account number and the site's minimum and maximum kW load. Whether a new service or a service upgrade is needed.

**Pre-Application Report (what the utility returns), §3.2.** 1 circuit voltage at the substation. 2 circuit name. 3 circuit voltage at the proposed Facility. 4 substation name. 5 substation transformer rating. 6 whether single or three phase is available near the site. 7 if single phase, distance to three phase. 8 and 9 connected and queued DG by technology, on the circuit and the substation transformer. 10 whether 3V0 is deployed. 11 area network, spot network, or radial. 12 feeders within 1/4 mile, by GIS snapshot. 13 nearest feeder's rating and length to the substation. 14 likely Standard track. 15 Affected System Operator study. 16 other constraints. **It does not include available fault current or the service transformer** (C).

**Exhibit C, Expedited/Standard application (Sheets 111 to 117).**
- Site: facility address, city, ZIP, distribution company, **account number, meter number**. Existing generation on the same account, parcel or building, with its application numbers.
- System: design capacity nominal and maximum in kW and kVA. Generator type (synchronous, induction, inverter), manufacturer, model, prime mover, energy source. IEEE 1547.1 / UL 1741 listed. Up to 3 unit types, each with manufacturer, model, quantity, single or three phase, and nominal and maximum kW, kVA and AC volts.
- Operation: export or not, export form (net metering and others), ISO-NE market participation for the DG and the storage separately.
- Technical detail: listed components (type, manufacturer, model, standard). Unit count, power factor rating and adjustable range. **Max design fault contribution current** (instantaneous or RMS), harmonics, start-up power.
- Interconnection equipment: whether a transformer sits between the generator and the point of interconnection, and who provides it. **Customer transformer nameplate kVA, phases, impedance % on a kVA base, primary and secondary volts and winding (delta, wye, wye grounded)**. Transformer fuse maker, type, size, speed, with time-current curves. **Interconnecting circuit breaker maker, type, load rating (A), interrupting rating (A), trip speed (cycles)**. Protective relay functions and setpoints, or discrete relays with settings and coordination curves. CT and PT maker, type, accuracy class, ratio.
- Attachments: a **one-line diagram with a Massachusetts PE stamp** showing all generating equipment, current and potential circuits, and protection and control. Site documentation showing the precise location. Location of the protective interface equipment on the property. Protection and control schematics.
- **Not asked on the form:** existing service size, main breaker or bus rating, switchgear location, service voltage, and storage kWh. Exhibit C has no storage kWh field. Service facts reach the utility only through the PE-stamped one-line (C).

### New York, all investor-owned utilities

Source: [NY SIR effective February 1, 2024](https://dps.ny.gov/system/files/documents/2024/12/sirs-effective-february-1-2024-liz2.docx), Appendices F, G and K, read from the file text (C). I didn't check whether a later SIR version exists.

- **Appendix F checklist:** DG technology, fuel, AC kW, metering type. UL 1741 certificate. Interface equipment data sheets, including any custom transformer, disconnect or recloser. **Account and meter numbers for existing services.** For a new service, a site plan on a satellite image showing all components from the existing on-site electrical system to the PCC, new and existing marked apart.
- **Single-line (PV and BESS) or three-line (others) must show:** number, ratings, connections and type of all major components, such as generators, step-up, auxiliary and grounding transformers, neutral reactors, switches, disconnects, protection, breakers and instrument transformers. Also inverter protection settings, and step-up transformer MVA, impedance, taps, neutral connection, windings and voltages. A NY PE seal is required at 1,000 V or more.
- **Appendix K, storage:** stand-alone or hybrid, with hybrid options A to D. DC- or AC-coupled. Storage inverter kW and **storage kWh** (mandatory for reporting). Chemistry. Maximum import kW including auxiliary loads. Ramp rates, power factor range, operating limits such as no charging 2-7 pm. Protection and control summary, grounding, **short-circuit current capability**, and how the system islands for backup.
- **Appendix G, Screen 1:** the utility checks whether "the existing service, transformer (i.e., transformer closest to PCC), and network protector(s)" are adequate. So in NY the utility, not the applicant, judges the service transformer (C).

### Fields to collect, from both states

| Group | Fields | Public source found |
|---|---|---|
| Account and meter | Account number, meter number, meter count | Meter count: Cambridge and NYC permits. Account and meter numbers: customer bill only |
| Existing service | Voltage, phases, amps, overhead or underground | Cambridge permits (structured), Somerville permits (text). Listings, per the hard-field lane |
| Utility side | Circuit and substation, circuit voltage, network or radial, phases nearby | NG Pre-Application Report (request). NY SIR inventory (circuit and substation of nearby projects). NG system data portal (already collected) |
| Service transformer | kVA, location, ownership | Rarely in Somerville permit text. Otherwise none |
| Available fault current | kA at the service | **None public.** From the utility on request, or the label on the service equipment (I: NEC 110.24 requires that marking at non-dwelling services. Not checked against the code text today) |
| Main breaker, bus, switchgear location | Ratings and location | None public. Customer one-line, nameplate photos, or a site visit |
| Proposed equipment | Inverter, battery, transformer, breaker, relays, CT and PT | Datasheets. Engineer and vendor choose these, not public records |

## Notes per source

### Cambridge Electrical Permits (rank 1)
- Columns read from the [view metadata](https://data.cambridgema.gov/api/views/hvtc-3ab9.json) (C): `amps_existing_service`, `volts_existing_service`, `count_of_meters_existing`, `overhead_existing`, `underground_existing`, and matching `_new_service` and `_temporary` fields, plus `kva`, `ampacity`, `generators`, `photovoltaic_panels`, `building_use`, `full_address`, `latitude`, `longitude`.
- Sample commercial rows (C): 400 Main St, 4,000 A, 480 V, underground, 1 meter, issued 2026-10-15. 300 Third St, 3,000 A, 480 V, underground. 320 Memorial Dr, 3,000 A, 208 V, 2 meters.
- **Data quality:** amps and volts are stored as text. Voltage values include "120208" and "277480", which I read as 120/208 V and 277/480 V written without a slash (I). 41 commercial rows show "0". A value of "277" alone is ambiguous. Normalise with a deterministic lookup, and keep the raw string.
- **Meaning:** this is what the electrician declared on the permit, on that date. Label it "reported on permit", with the permit number and date. A later permit can supersede it.
- 0 permits mention "battery" or "energy storage" in the description (C).
- **Matters beyond Cambridge (I):** the fields mirror the state wiring permit form found by the [public-records lane](2026-11-07-option1-public-records.md). Any town's filled permit should hold the same values, through a records request.

### National Grid Pre-Application Report (rank 2)
- Mandatory at 250 kW or more, optional below (C). A peak-shaving battery at a C&I site will often be under 250 kW, so this would be optional there (I).
- It answers the utility-side questions a plan set needs: circuit voltage at the site, phases, network or radial (C).
- The prototype could fill Exhibit B from the site record. A person sends it and pays (I). Treat the reply as utility-provided evidence with its date, since the tariff calls it a snapshot.

### Somerville permits (rank 3)
- Same platform as Cambridge, but the service facts are only in `project_description_or_business_name` (C).
- Extract with a deterministic pattern, such as `(\d+)\s*amp` and `(\d+/\d+)\s*v`, and keep the source sentence. Label as "extracted from permit text". 209 records mention battery or energy storage (C), not checked further.
- ODbL share-alike may matter if the record is redistributed (I).

### EIA-860 and 860M (rank 4)
- Schedule 2 line 14 asks for "grid voltage at the point(s) of interconnection", up to three values in kV. Line 13 asks for the owner of the transmission or distribution facilities. Line 3 asks for latitude and longitude. Storage asks for nameplate energy capacity in MWh (C, [instructions](https://www.eia.gov/survey/form/eia_860/instructions.pdf)).
- Only plants of 1 MW or more are included (C). Most C&I battery sites are smaller (I). Use it to find big neighbours, campus plants, or existing on-site generation.
- [PUDL](https://docs.catalyst.coop/pudl/en/latest/data_sources/eia860.html) republishes it as clean tables (S).

### NY SIR inventory (rank 5)
- I read the column headers of one 2.4 MB file, [O&R September 2026](https://dps.ny.gov/system/files/documents/2026/10/oru-sir-report-september-2026-redacted.xlsx). It has 18,257 rows, and 1,559 have ESS kW above 0 (C). A sample row: New Hampton, ZIP 10958, circuit `103-2-13`, substation Westtown, hybrid, 9.6 kW ESS.
- The [SIR navigator](https://sites.google.com/view/nys-sir-navigator/ii-interconnection/ii-j-intercnct-inventory) lists the required minimum fields (S). It matched the file.
- Redacted versions drop applicant names. There is no street address, so a site can only be matched to its ZIP and to nearby circuits (C, I).
- Other files are 7 to 15 MB, and Con Edison's is a .7z archive (C). I didn't download them.

### Massachusetts distribution queues (ranks 12-14)
- No current, public, per-project distribution queue was found for National Grid, Eversource or Unitil in Massachusetts. Unitil told New Hampshire a public online queue isn't worth the cost ([filing](https://www.energy.nh.gov/sites/g/files/ehbemt551/files/inline-documents/sonh/ip-2022-01-unitil-comments-set-3-08-18-23.pdf), S).
- Utilities file annual Timeline Enforcement Mechanism reports with the DPU, such as National Grid's 2025 report in [D.P.U. 26-48](https://www.nationalgridus.com/media/pdfs/our-company/dpu/2026/dpu-26-48-notice-of-filing-and-request-for-comments.pdf) (S). These cover timelines, not equipment (I).
- The DPU file room at `eeaonline.eea.state.ma.us/DPU/Fileroom` loads, but only its title was visible to my fetch, and its `robots.txt` is 404 (C). Dispute and group-study filings may contain one-lines. A person should search it.
- Interconnection.fyi has MA distribution records, but its [terms](https://www.interconnection.fyi/terms) forbid scraping and commercial use without a licence (C).

### Transmission queues (ranks 10-11)
- ISO-NE's public queue says it leaves out many distribution-connected, retail, and qualifying-facility projects (C). A behind-the-meter C&I battery would rarely appear (I).
- Use it only to note large nearby projects that could change the feeder or substation picture (I).

### Building energy disclosure (ranks 6 and 9)
- Cambridge BEUDO gives annual grid kWh by building, with lat/long (C). It tells an engineer the load scale, not the service rating. Annual kWh isn't peak kW (I).
- Boston BERDO is on Analyze Boston, which returned 403 to my reads. Robots bars its API paths (C). A person can download the CSV and keep the file as evidence.

### Electrical permits nationally (rank 7 and others)
- NYC: meters and amp-band fee items, no service rating field (C).
- Seattle (`c4tj-daue`) and Los Angeles (`ysqd-apz7`): description, address, lat/long. LA also has solar and EV flags (C, column lists from the Socrata catalog). No service fields.
- Cambridge is the only city I found with structured existing-service fields.

### Street and 3D imagery (ranks 15-18)
- **Google:** the Map Tiles policy bars "image analysis, object detection" and "geodata extraction" (C). Street View Static costs $7.00 per 1,000 after 10,000 free a month. Photorealistic 3D Tiles cost $6.00 per 1,000 after 1,000 free (C, [pricing](https://developers.google.com/maps/billing-and-pricing/pricing)). Don't use either for stored values.
- **Mapillary:** utility poles yes, transformers no (C). Pole detections could suggest overhead service. A person should confirm, and the terms need a legal reading first.
- **3DEP:** Massachusetts Central Eastern 2021 has no wire or tower classes (C). A pole or pad-mount detector would have to work on unclassified points at about 13.75 first returns per m² (C, same report). Whether that works is untested (I). Lidar is public domain, so a derived value could be stored.
- **KartaView:** terms page unreadable to my fetch. Not recommended until a person reads it.

## Open questions for people

1. Will EQORE accept a drafted Pre-Application Report request as part of the workflow? It is the only route found to the circuit voltage at the site.
2. Are EQORE's Massachusetts sites in Cambridge or Somerville? If not, the permit fields still define what a records request should ask for.
3. Can EQORE get available fault current from National Grid by letter, and how long does that take? No public source exists.
4. Should someone download Boston's permits and BERDO by hand, and Worcester's FeatureServer?

## Method notes

- About 25 web searches and 30 page or API reads. Socrata queries used `$select` aggregates and `$limit` of 6 rows or fewer.
- Files read: tariff 1468 PDF (650 KB), NY SIR docx (373 KB), EIA-860 instructions PDF (764 KB), 3DEP project report PDF (5.7 MB), the O&R SIR XLSX (2.4 MB, headers and counts only), and Cambridge pole and facility GeoJSON (430 KB). All were read as data in the session scratchpad, and downloaded data files were deleted afterwards. Nothing was executed from them.
- Blocked and not worked around: `data.boston.gov` (403), `emp.lbl.gov` (403), `masmartsolar.com` (401), `mass.gov` (403, per earlier lanes), and the Worcester GIS host (no response).
- Not touched: Eversource, FEMA, OpenStreetMap Overpass, and Geofabrik.
