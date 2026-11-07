# Option 1 inputs and the datasets that supply them

Date: 2026-11-07. Works back from what the utility asks for at interconnection. This is research input. D1, D9, D11, and D12 are still open.

**Labels:** **Tested** means a lane or the lead queried it on a real site. **Read** means the source was read but no site value was pulled. **Not tested** means a source is named but hasn't been tried. Which source is best for each input is the lead's recommendation.

## What the utilities ask for

**National Grid MA:** [M.D.P.U. No. 1468](https://nationalgridus.com/media/pdfs/billing-payments/tariffs/mae/mdpu_1468_dg_interconnection_tariff_.pdf), Exhibit C, Expedited/Standard application. Read in full. It's dated September 15, 2021, and the brief warns the tariff is revised regularly, so **check the current version before relying on it.**

- It has no field for service size or switchgear rating. Those reach the utility through the **one-line diagram, which must carry a Massachusetts PE stamp**.
- Facilities of 250 kW or more must first get a **Pre-Application Report**. It costs $100 to $750 by size and the company has 10 business days to issue it. It's optional below 250 kW.
- The company has 10 business days to say whether an application is complete, and if not, what's missing.

**PG&E:** [Rule 21 application, Form 79-1174-03](https://PGE.com/tariffs/assets/pdf/tariffbook/ELEC_FORMS_79-1174-03.pdf). Its required documents were read. It requires a single-line, site plans, a disconnect specification, and transformer nameplate data when a transformer is used to interconnect.

**Eversource MA:** we saw only search excerpts of its seminar decks, because mass.gov blocks automated reads. They say the site plan should show property and lot lines, street names, and interconnecting pole numbers, and that storage needs a battery sheet. See the [August 2024 deck](https://www.mass.gov/doc/august-21-2024-eversource-west-expeditedstandard/download) and the [interconnection workshop deck](https://www.mass.gov/doc/interconnection-workshop/download). Read these directly before relying on them.

## Inputs and sources

### From public datasets

| Input | Required by | Dataset | Access | Status |
|---|---|---|---|---|
| Facility address, parcel ID | National Grid | MassGIS L3 parcels | API, no key | Tested |
| Property and lot lines | Eversource (excerpt), both samples | MassGIS L3 parcels | API, no key | Tested. Reference grade |
| Single parcel? | National Grid | Derived from L3 by a deterministic check | Computed | Not tested |
| Aerial base map | Samples | MassGIS 15 cm imagery, 2025 | Tile service, no key | Tested |
| Building outline | Samples | MassGIS roofprints, checked against USGS 3DEP lidar | API, no key | Tested at one site. Outline dates from 2011 |
| Street names | Eversource (excerpt) | L3 addresses or a MassGIS roads layer | Unknown for roads | Not tested |
| Location map | National Grid ("USGS topographic map or other") | USGS topo maps | Download | Not tested |
| Serving utility, as a draft | National Grid | OpenEI URDB by location | API, free key | Tested. The bill confirms it |
| Feeder, substation, voltage, hosting capacity, as a preview | Same items as the Pre-Application Report | National Grid System Data Portal | API, no key | Tested, but returned 0 feeders in Holliston, which is Eversource |
| Landowner, as a lead | National Grid (Attachments 1A and 1B) | L3 `OWNER1`, then the registry of deeds | API, then a person | L3 tested. Sturbridge shows owner fields can conflict |

### From the utility

| Input | Required by | Source | Access | Status |
|---|---|---|---|---|
| Circuit name and voltage, substation, phase availability, radial or network, nearby feeders, likely track, system constraints | National Grid, for 250 kW or more | **Pre-Application Report (Exhibit B)** | A person files it and pays the fee. Up to 10 business days | Read. It's the authoritative version of the preview above |

### From the customer or a site photo

No public source tested gives these. See `2026-11-07-option1-hard-field-sources.md`.

| Input | Required by | Source | Access | Status |
|---|---|---|---|---|
| Account number, meter number | National Grid, which says to consult an actual bill | **Electric bill** | Customer upload, draft extraction | Not tested. Labeled synthetic in a demo |
| Customer, contacts, site control | National Grid | EQORE's signed contract, Attachment 1A or 1B | Entered by EQORE, signed by a person | Not tested |
| Service voltage, main device and bus rating, kAIC | One-line (National Grid and PG&E), samples | **Doors-closed nameplate photo**, old single-line, filled wiring permit | Facility contact, or a records request | Not tested. Internal ratings need a qualified person |
| Locations of switchboard, meter, CT cabinet, utility transformer | PG&E site plans, samples | **Pin confirmed on the aerial, plus a geotagged photo** | Facility contact | Not tested. Imagery alone did not identify equipment at the one site tried |
| Existing panels | Sample 1 | Photo | Facility contact | Not tested |
| Existing generation and its application numbers | National Grid | Customer, prior permits, imagery for visible PV | Mixed | Imagery tested by eye. Public PV lists mostly failed at site level |
| Utility pole number | Eversource (excerpt) | Photo of the pole tag | Facility contact | Not tested |
| Transformer nameplate, when customer-owned or existing | PG&E, National Grid | Photo, doors closed | Facility contact | Not tested |

### Not site facts: engineer decisions and equipment data

The record should not collect these from the site. They're listed so the application check can show who owns each one.

System capacity, equipment make and model, unit AC ratings, power factor, fault contribution, proposed transformer, breaker, fuse, relay setpoints, CT and PT data, export plan, location of protective interface equipment, tie-in point, conduit route, PE stamp, and signatures.

### Kept for sizing, not required by the forms read

15-minute interval data, peak demand, bill history, and rate schedule. Exhibit C doesn't ask for them. The bill stays in scope because it provides account and meter numbers. The PG&E form's oversized-system attestation refers to 12 months of usage, which applies only to that tariff option.

## Two-part collection method

The team, drawing on what engineers told them, split collection into physical data and technical electrical data. This section tests that split. Queries were run on 2026-11-07 at map points chosen near industrial areas, not at known customer sites, so the nearest line or feeder may not be the one serving a given building.

### Part 1: physical data

**Google Earth Engine** was named by engineers. It hasn't been tested, because it needs an account.

- [Noncommercial use is free, while commercial use has a subscription fee and compute charges](https://developers.google.com/earth-engine/guides/noncommercial_tiers). [Using it to sell a product or service requires a commercial license](https://earthengine.google.com/noncommercial). A hackathon build may qualify as noncommercial, but EQORE's production use likely wouldn't. Confirm this.
- Its likely national imagery source, NAIP, is [typically 60 to 100 cm](https://docs.opendata.aws/naip/readme.html), compared with 15 cm from MassGIS. The site plan sample shows parking stalls and equipment at 1 in = 20 ft.
- **Open question:** Sample 1 cites "KMZ" data, which is the Google Earth file format. Confirm whether the engineers meant **Google Earth** or **Google Earth Engine**. As we understand it, Earth Engine's catalog is a set of datasets and doesn't include the imagery shown in Google Earth, but we haven't confirmed that. They have different terms, and the Maps Platform limits in the remote-sensing report may not be the ones that govern Google Earth.

**Lead's recommendation:** use Earth Engine, or the same public datasets directly, as the fallback that works anywhere, and use better local data where it exists.

| Region | Parcel | Footprint | Imagery | Status |
|---|---|---|---|---|
| Massachusetts | MassGIS L3 | MassGIS roofprints, no height | MassGIS 15 cm | Tested |
| Los Angeles | NavigateLA parcels | [NavigateLA layer 393](https://maps.lacity.org/arcgis/rest/services/Mapping/NavigateLA/MapServer/393), LARIAC, with height, elevation, source, and date | Not tested | Footprints tested. 1,099,074 records |
| Elsewhere | County data | Microsoft or Overture, check ODbL first | NAIP | Not tested |

### Part 2: technical electrical data

**This splits into two sides.** Public maps cover the utility's side. They don't cover the customer's side.

**Utility side: public, and tested.** It's published as map services with no key at all three places tried. These items overlap the Pre-Application Report (feeder, substation, voltage, phase, capacity), so they work as a preview. The report remains the authoritative version and is non-binding itself.

| Source | Point tried | What came back |
|---|---|---|
| [National Grid MA portal](https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP) | Worcester | Feeder `05_01_3J341`, Bancroft Street substation, 4.16 kV, 3 phase, 0.64 MW hosting capacity available, pending storage on the feeder, group study status, CIP fee and ASO flags |
| [PG&E GRIP](https://services2.arcgis.com/mJaJSax0KPHoCNB6/arcgis/rest/services/DRPComplianceRelProd/FeatureServer) | Fremont | Newark 21 kV feeder 2105, 3 phase, load capacity 0 kW, generation capacity 4,338 kW, limiting criterion "Thermal", screen result "Unlikely to pass", analysis dated July 2026 |
| [NavigateLA layers 109 and 110](https://maps.lacity.org/arcgis/rest/services/Mapping/NavigateLA/MapServer/109) | Chatsworth, Sun Valley | LADWP overhead conductors (164,182) and underground cables (87,583), with voltage (4.8 kV), dated 11/6/2026. Sourced from LADWP's EV charger site. The underground layer says its path is "not intended to be spatially accurate". A disclaimer applies and wasn't read |

**Limits:**

- **This is a utility pattern, more than a city one.** Los Angeles owns LADWP, so its city portal carries power lines. Elsewhere the data sits with the utility, as with PG&E and National Grid. Eversource's map has no download on its landing page and hasn't been tried by API. The DOE keeps [an atlas of utility hosting capacity maps](https://www.energy.gov/eere/us-atlas-electric-distribution-system-hosting-capacity-maps), which is a starting list for other utilities.
- **Hosting capacity maps aren't site answers.** They [don't address site-specific interconnection questions](https://www.energy.gov/eere/us-atlas-electric-distribution-system-hosting-capacity-maps), and were built largely around generation export, so read them with care for a non-exporting battery.
- **Los Angeles isn't in the brief's service area.** EQORE names Massachusetts and the Bay Area. LADWP is a municipal utility, so PG&E's Rule 21 form wouldn't be the governing document there (general knowledge). LADWP's rules weren't read.
- **Terms unread.** PG&E's guide says no login is required. Neither PG&E's, National Grid's, nor the city's terms of use have been read. No `robots.txt` was found on `maps.lacity.org`.

**Customer side: still not public.** Main switchboard rating, bus rating, kAIC, panel inventory, meter number, and equipment location stayed empty in every test. They come from the bill, doors-closed photos, old drawings, or a qualified person.

### Why this can repeat for any site

**All four tested public sources are ArcGIS REST services:** MassGIS, National Grid, PG&E, and NavigateLA. The same point query worked on each. So a new region could be added mainly as configuration, listing which service and which field supplies each input. This is a hypothesis from four services. Field names differ, and some utilities publish no API. It is the most repeatable method we've found, and we found no product doing this for storage in the search so far.

### Existing methods

Solar tools show parts of this working. [Aurora's AutoDesigner is reported to use the Google Solar API](https://surge-website.pages.dev/blog/ai-solar-design-automated-pv-layout), [Solargraf offers plan sets with line diagrams and PE stamping](https://www.solargraf.com/get-install-ready-permit-plan-sets/), and SolarAPP+ automates residential permit review. These are mostly vendor claims, mostly residential. One search found nothing on panel photo intake, agentic permitting, or commercial storage. Search further before relying on this.

## Demo implications

Recommendations from the lead, not yet decided:

- **Use a National Grid site in Massachusetts, such as Worcester.** The form, feeder data, 15 cm imagery, and parcels all line up there, and Worcester has better assessor fill rates. The test shows National Grid serves at least the point tried. Pick a real industrial parcel and confirm.
- **Run PG&E as a second region** to show repeatability. It also has the most current form we read and a direct capacity result per line section.
- **Measure what can be shown:** how many required application items have evidence, how many are engineer-owned, and which conflicts were caught before submission. The tariff's completeness notice is the step this can reduce. There is no baseline for how often applications fail it, so ask EQORE.

## Questions for EQORE

1. Which current Exhibit C and Eversource forms do you use?
2. What most often comes back from the completeness review?
3. Do you request a Pre-Application Report below 250 kW?
4. What do you collect for the one-line today, and from whom?
