# Option 1 to plan set bridge

Lane: plan-set-bridge. Date: 2026-11-07. Works backward from what a plan set must show to what a site record must hold. This is research input. D1 in `docs/project/decision.md` is still open.

Code and engineering statements here are for people to verify. Nothing here is a compliance determination.

## Bottom line

1. **Store primitives, not distances.** Most of what a reviewer checks is the distance between a battery and something else. The battery position is an engineer's decision, so the record holds the positions of lot lines, walls, openings, exits, and exposures. Distances are computed per layout.
2. **One geometric question drives the Massachusetts fire analysis we could read.** Is the system more than 100 ft from every exposure? If not, a secondary source reports NFPA 855 (2020) group limits of 50 kWh with 3 ft separation and a 600 kWh maximum. The provided samples don't state this classification or any fire-code geometry, so it may sit in a separate fire package. We no longer say a plan set can't be laid out without it. Ask EQORE.
3. **"Verified" and "good enough to dimension from" are different axes.** A person can verify that a GIS parcel polygon came from the assessor. It still isn't a boundary survey. The contract needs a confidence state and a separate fitness grade.
4. **We found no published drafter tolerance.** Our proposal is a margin test: a value can support a check only if its distance from the governing threshold is larger than its stated uncertainty. This is inference.
5. **Corrected: an aerial photo and public parcel data can be the site plan base, but they can't supply the electrical existing conditions.** Sample 1's site plan states its dimensions are "based on aerial imagery and publicly available property boundary KMZ data only. For reference only. Not surveyed." We earlier expected a survey to be necessary, and an excerpt of 780 CMR still points that way for Massachusetts, so the answer may depend on the AHJ. What the samples get from somewhere other than public data is the existing switchboard ratings, panels, meter, and tap location. Sample 2 places photos of that gear on the sheet.
6. **A real Massachusetts plan set already works this way.** Sturbridge's existing conditions sheet labels each layer with its method: tested 5 cm drone and ground survey for the base, "graphic plotting only" for flood zone, and public GIS, not field delineation, for wetlands. Its stamped electrical cover sheet places equipment on an aerial photo. Mixed grades appear on a filed set when each is labeled, which is what Option 1 would produce. See "Sturbridge: what a real set shows".
7. **The drawings already mark the fact and decision boundary.** `(E)` marks existing items and `(N)` marks new ones in both samples. To a first approximation, the record holds the `(E)` items and engineers decide the `(N)` items. The samples also carry labels for uncertain values: "assumed available fault current", `~14'-1"`, "not surveyed", "conduit routing is diagrammatic", and "there may not exist a vault". The record's states can map onto these.

## Evidence labels

- **Read**: we read the source document itself.
- **Secondary**: we read a document that reports what a code says. We did not read the code.
- **Excerpt**: we saw only a search-result excerpt because the page blocked fetching.
- **Inference**: our reasoning, with no source behind it.

## Sources and who they apply to

The scope column matters most. Several sources named in the brief are residential or small-system documents.

| Key | Source | Stated scope | Fit for EQORE | Status |
|---|---|---|---|---|
| WOOD | [Woodside CA Battery Backup Submittal Requirements](https://www.woodsideca.gov/DocumentCenter/View/95/Energy-Storage---Battery-Backup-Systems-Submittal-Requirements-PDF) | "one- and two-family dwellings" | **Residential.** Good item list, wrong occupancy and scale. Fire district requirements are separate and unread. | Read |
| PALO | [Palo Alto ESS Submittal Guidelines](https://www.cityofpaloalto.org/files/assets/public/development-services/building-division/electrical-guidelines/submittals/ess-submittal_with-fire-requirements_2019-05-03.pdf), rev. 05/03/2019 | "SCOPE: RESIDENTIAL" under the 2016 codes | **Residential and superseded.** Useful only to show how clearances change by edition. | Read |
| NYS | [NYSERDA BESS Model Permit](https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Programs/Clean-Energy-Siting/Battery-Energy-Storage-System-Model-Permit.pdf) | "residential and small commercial", aggregate at or below 600 kWh | **Small.** Covers the low end at best. Requires a PE stamp on construction documents. | Read |
| NYC | [NYC DOB OTCR Battery Application Checklist](https://www.nyc.gov/assets/buildings/pdf/OTCR_battery_app_checklist.pdf), PDF created Jan 2019 | "all" BESS submitted to DOB | **C&I relevant, but dated and NYC-specific.** Cites the 2011 NYC Electrical Code. A [DOB notice](https://www.nyc.gov/assets/buildings/pdf/ess-otcr-sn.pdf) (Excerpt) says a spreadsheet now replaces it. | Read |
| RED | [Redmond WA ESS Fire Permit Application](https://www.redmond.gov/DocumentCenter/View/38052), updated Dec 6, 2024 to the 2021 IFC | Above IFC thresholds, no upper limit | **C&I relevant.** Reproduces 2021 IFC 1207 text. Its plan section header says "emergency responder radio system", an apparent copy error. | Read |
| SEA | [Seattle Fire ESS Checklist](https://www.seattle.gov/documents/Departments/Fire/Business/ESSApplicationChecklist.pdf), rev. 04/28/2025 | Above thresholds, no upper limit | **C&I relevant.** | Read |
| MON | [Fire Construction Permit checklist for Lake Stevens, Monroe, and Sultan WA](https://monroewa.gov/DocumentCenter/View/17983/10565-Energy-Storage-System), 2021 WA Fire Code | Section 1207 systems | **C&I relevant.** Clearest outdoor wording found. | Read |
| PEM | [Merrill Engineers review letter, 48 Schoosett St, Pembroke MA](https://www.pembroke-ma.gov/DocumentCenter/View/7543/Site-Additional), Sept 22, 2025 | Six outdoor units on a commercial property, capacity not stated | **Closest real example.** What a Massachusetts reviewer actually asked about. | Read |
| WOR | [Worthington MA BESS Hazard Mitigation Analysis](https://worthington-ma.us/wp-content/uploads/2026/05/2026-5-12-26-0417-MA-Worthington-Ridge-Rd-BESS-HMA-mjd.pdf), Draft Rev B, Apr 16, 2026 | About 9.6 MWh, remote site | **Larger than likely EQORE work.** Our best Massachusetts view of NFPA 855 (2020) and NFPA 1. It's a consultant's draft, and it bars third-party distribution without approval even though the town posts it. Cite it, don't republish it. | Secondary |
| BRK | [Berkeley Form 143, Survey Requirements](https://dev.berkeleyca.gov/sites/default/files/documents/143%20Guidelines%20for%20Survey%20Requirements_1.pdf), rev. 04/27/26 | Building permits generally | **Bay Area survey practice.** Applies only to Berkeley. | Read |
| PGE | [PG&E Rule 21 Application, Form 79-1174-03](https://PGE.com/tariffs/assets/pdf/tariffbook/ELEC_FORMS_79-1174-03.pdf), effective Oct 28, 2026 | Includes non-export Rule 21 | **Current and C&I relevant.** | Read |
| WDT | [PG&E WDT checklist](https://pge.com/assets/pge/docs/about/doing-business-with-pge/wdt-checklist.pdf) | Wholesale Distribution Tariff | **Different program from Rule 21.** Use only as a hint of what utility reviewers ask for. | Read |
| NG | [National Grid Exhibit A, Simplified Application](https://forms.nationalgrid.com/non_html/MAorRIorNH%20-%20Exhibit%20A%20-%20Simplified%20Interconnection%20Application.doc), undated | Simplified process, small systems | **Too small.** Confirms the account and meter number fields only. The expedited or standard form was not read. | Read in part |
| EV | [Eversource East DER seminar, May 2024](https://www.mass.gov/doc/may-8-2024-eversource-east-der-interconnection-seminars/download), [DG workshop, May 2025](https://www.mass.gov/doc/dg-workshop-05072025/download), [DG webinar materials](https://www.mass.gov/doc/dg-webinar-materials-1/download) | Expedited and standard process | **C&I relevant.** mass.gov returned 403. | Excerpt |
| CMR | [780 CMR 107.2 (Justia copy)](https://regulations.justia.com/states/massachusetts/780-cmr/chapter-1/part-2/section-107/subsection-107-2) | Massachusetts building code | **C&I relevant.** Excerpts place the site plan text at both 107.2.1 and 107.2.9, so the section number is unconfirmed. | Excerpt |
| BROOK, NORTH | [Brookline ESS permits](https://www.brooklinema.gov/3576/Energy-Storage-System-Permits), [Northborough BESS page](https://www.northboroughma.gov/fire-rescue-emergency-management/webforms/energy-storage-system-ess-install-modification-operation) | Massachusetts local fire permits | **Relevant.** Both pages blocked fetching. | Excerpt |
| STUR | [Sturbridge MA filing, NextGrid, 178 Main St](https://www.sturbridge.gov/850/NextGrid---178-Main-Street---Modificatio): [Site Plans](https://www.sturbridge.gov/DocumentCenter/View/577/Site-Plans), [Updated Site Plans](https://www.sturbridge.gov/DocumentCenter/View/579/Updated-Site-Plans), [Narrative](https://www.sturbridge.gov/DocumentCenter/View/576/Narrative) | 500 kW / 1,222.02 kWh BESS plus rooftop PV at a commercial plaza | **Best real example, and close to C&I scale.** No single-line posted. Sheets are copyrighted, so cite them and don't redistribute. | Read, including rendered C102 and C-1 |
| SAMP1 | `provided resources/BESS IFC Sample 1.pdf`, 14 sheets, PDF created Jan 21, 2026 | 30 kW / 150 kWh, anonymized ("Sample Building"), lists 2024 IBC, 2024 IFC, 2023 NEC | **Most relevant format, small system.** "IFC" comes from the filename. No sheet shows an issue label or a stamp. | Read, including rendered sheets |
| SAMP2 | `provided resources/BESS IFC Sample 2.pdf`, 11 sheets, PDF created Dec 6, 2023 | 199 kVA / 528 kWh at an existing PV site, 2022 California Building Code, state architect (DSA) references | **Most relevant format, C&I scale.** Redaction is partial: it still shows permit application numbers, equipment photos, and two people in a photo. Don't republish. | Read, including rendered sheets |
| HOL | [Holliston Bartzak Dr filing, sheet E-101](https://www.townofholliston.us/DocumentCenter/View/4194/Bartzak-Drive---Response-Materials-to-Hearing-3-9-2023-PDF) | 499 kW AC ground-mount PV, no battery, Eversource East | **Utility-side one-line only.** It marks itself preliminary and restricts duplication, so cite it. | Read, including rendered sheet |

**Not read in this pass:** NEC Article 706, the NFPA 855 text in any edition, the current California Fire Code, 527 CMR 1.00 and 12.00 directly, the National Grid MA expedited or standard application, and Eversource's own application pages.

**Not found in about 15 searches:** a Massachusetts statewide C&I battery checklist, a Bay Area non-residential ESS plan checklist, and a published drafting tolerance for BESS site plans. One dedicated Bay Area search found only residential documents and a [San Jose declaration form](https://sanjoseca.gov/home/showpublisheddocument/109226/638483709434100000) (Excerpt).

### Code editions to keep straight

- **Massachusetts fire:** WOR says 527 CMR adopts the 2021 edition of NFPA 1, whose Chapter 52 references the 2020 edition of NFPA 855. BROOK and [Solar Power World](https://www.solarpowerworldonline.com/2026/03/battery-storage-moves-forward-in-massachusetts-as-barriers-fall/) agree on the 527 CMR and NFPA 855 (2020) relationship. All of this is Secondary or Excerpt. Confirm with a fire department.
- **Section numbers shift by edition and amendment.** The IFC threshold table is 1207.1.1 in RED and 1207.1.3 in SEA. WOR's NFPA 855 (2020) sections won't match a later edition's numbering.
- **Values shift too.** PALO (2016 California codes) shows 5 ft from lot lines and buildings. RED (2021 IFC) and WOR (NFPA 855 2020) show 10 ft.
- **California:** an SF Fire excerpt refers to a 2025 code effective 1-1-2026. Rule text for the current edition wasn't read.

**Contract consequence (Inference):** store raw measurements, not pass or fail results, so a change of edition re-evaluates old data. A code citation needs the jurisdiction and edition as well as the section number.

## Requirements matrix

Who: **R** means a reviewer checks it. **D** means a drafter needs it to draw. Sources are marked by scope: *resi or small* for WOOD, PALO, NYS, and NG. A row backed only by those sources may not apply at C&I scale.

### Identity and regulatory

| Plan set item | Site facts needed | Sheet | Who | Source |
|---|---|---|---|---|
| Project and owner block | Address, owner, parcel ID or block and lot | Cover | R, D | NYS *small*, NYC, RED, SEA |
| Legal location | Legal description, address | Cover, site plan | R | BRK (CBC 105.3 quote) |
| Applicable codes on cover | AHJ, adopted edition, local amendments | Cover | R, D | WOOD *resi*, NYC "General Notes" |
| Occupancy classification | Occupancy type (a code class, not a business description) | Cover, code analysis | R | MON, NYC |
| Construction type | Construction classification, wall materials | Cover, code analysis | R | NYC, MON |
| Zoning analysis or table | District, whether storage is allowed or accessory, setbacks | Site plan, cover | R | NYC (outdoor), PEM |
| Fire district | Fire district | Cover | R | NYC |
| Who issues what | Fire head issues the permit, building filing comes first in at least one town | Permit routing, not a sheet | R | BROOK and NORTH (Excerpt) |

### Site geometry

| Plan set item | Site facts needed | Sheet | Who | Source |
|---|---|---|---|---|
| Site plan to scale from a boundary survey | Boundary, existing structures, street grades, proposed grades | Site plan | R, D | CMR (Excerpt) |
| Survey detail where triggered | Lengths and bearings, topography, flood plains, creeks, recorded easements | Survey | R, D | BRK |
| Setbacks and clearance to exposures, outdoors | Lot lines, public ways, buildings, stored combustibles, hazardous materials, high-piled stock | Site plan, layout | R, D | MON, RED (IFC 1207.8.3), SEA, WOR |
| Clearance to openings and wall type | Door and window positions, wall construction, fire rating, overhangs | Layout, elevation | R, D | MON. RED exception needs 2-hour wall, no openings or combustible overhangs |
| Means of egress separation | Exit doors, discharge paths | Layout | R, D | WOR, NYC |
| Vegetation clear zone | Vegetation near candidate areas | Site plan | R, D | WOR (10 ft), PEM (fire department asked for 20 ft) |
| Fire apparatus access | Roads, width, vertical clearance, turning radius, grade, dead ends, surface | Site plan | R, D | WOR (NFPA 1 §18.2.3 as amended), NYC "FDNY access" |
| Hydrant or water supply | Nearest hydrant location, public or private supply | Site plan | R | PEM (615 ft), WOR (NFPA 855 §4.13) |
| Flood | FIRM panel and date, zone, base flood elevation, ground elevation | Site plan, elevation | R, D | NYS *small*, NYC, PEM, CMR (Excerpt) |
| Conservation constraints | Wetlands and distance, rare species habitat | Site plan | R | PEM |
| Stormwater and soils | Land disturbance, soils, seasonal high groundwater | Civil | R, D | PEM (planning board review) |
| Security and impact protection | Vehicle traffic paths, existing fencing | Layout | R, D | NYC, WOOD *resi*, WOR, PEM |
| Grade | Slope at candidate areas and on access routes | Civil, site plan | D, R | WOR (10% access grade) |
| Existing utilities and easements | Underground and overhead lines, easements | Site plan | D, R | PEM, BRK, WDT (different program) |

### Electrical

| Plan set item | Site facts needed | Sheet | Who | Source |
|---|---|---|---|---|
| Existing equipment for interconnection | Service, panels, switchgear, and whether each is existing or new | Site plan, SLD | R, D | NYS *small*, WOOD *resi*, PGE |
| Ratings of existing service equipment | Voltage, phase, ampacity, environmental rating | SLD | R, D | NYS *small*, WOOD *resi*. PGE asks for voltages, capacities, and protective functions |
| Single-line with customer loads and utility interconnection | Existing SLD, primary switchgear, secondary switchboard, relays, transformers, breakers | SLD | R, D | PGE, EV, NYC |
| Transformer nameplate | Voltages, capacity, winding, connections, impedance | SLD, interconnection attachment | R | PGE (when transformers interconnect the facility) |
| Existing generation | PV, generators, and how they connect | SLD | R, D | WOOD *resi*, [Eversource 2016 seminar](https://api.sambuz.com/doc/simplified-ppt-presentation-592744) (Excerpt: all generators on one-line and site plan) |
| Physical layout of electrical components | Locations of switchgear, transformers, control panels, meters | Site plan | R, D | PGE |
| Working clearances | Space around existing equipment, meter working clearance | Floor plan, site plan | R, D | NYS *small*, WOOD *resi*, WDT |
| Disconnect and placard locations | Location of service disconnect, sight lines to it | Site plan, signage | R, D | SEA, NYS *small*, PGE |
| Utility account identifiers | Account or service ID, meter number, utility | Interconnection form | R | NG *small*, WDT |
| Fire alarm interface | Whether a building fire alarm panel exists, and where | Fire details | R, D | RED, SEA |

### Equipment and design outputs

These are required on the plan set but **are not site facts**. They are listed so that the record doesn't try to hold them.

| Plan set item | Source | Site facts it depends on |
|---|---|---|
| Quantities, types, ratings, listings, weights, cut sheets | NYC, RED, SEA, MON | None |
| Battery spacing | SEA | None |
| Conduit routing, trench details, overhead runs | NYS *small*, WOOD *resi* | Obstructions, surfaces, utilities |
| Method of interconnection, overcurrent protection, grounding | NYS *small*, WOOD *resi* | Existing ratings, spare positions |
| Wire sizing, short circuit, and connection calculations | WOOD *resi* | Service ratings, available fault current (Inference) |
| Fire suppression, detection, explosion control, signage | NYC, RED, SEA | Occupancy, fire alarm presence |
| Support, seismic restraint, pad or dunnage design | NYC, RED | Floor or soil capacity, seismic and load data (Inference) |
| Commissioning and decommissioning plans, HMA | RED, SEA, MON, NYC | Exposure distances (WOR) |

## Numbers that make the geometry decisive

| Rule (edition) | Value | Status |
|---|---|---|
| Remote outdoor classification: IFC 1207.8.1 (2021) | More than 100 ft from buildings, lot lines, public ways, stored combustibles, hazardous materials, high-piled stock, other exposures | Read, via RED |
| Same, NFPA 855 §4.4.3.1 (2020) | Same 100 ft. WOR words it as lot lines "that can be built upon", excluding grid infrastructure | Secondary |
| Clearance near exposures: IFC 1207.8.3 (2021; RED doesn't print this number beside the text, so we inferred it from order) | 10 ft. Exceptions allow 3 ft with a 1-hour barrier, a 2-hour wall without openings or combustible overhangs, or a tested enclosure (buildings only for the last two) | Read, via RED |
| Clearance near exposures: NFPA 855 §4.4.3.3 (2020) | 10 ft | Secondary |
| Means of egress: NFPA 855 §4.4.3.4 (2020) | At least 10 ft, or 3 ft with official approval and large-scale testing | Secondary |
| Near-exposure groups: NFPA 855 §4.6 (2020) | Groups up to 50 kWh, separated by 3 ft | Secondary |
| Near-exposure maximum: NFPA 855 §4.8 (2020) | 600 kWh | Secondary |
| Vegetation: NFPA 855 §4.4.3.6 (2020) | 10 ft cleared | Secondary |
| Combustible storage: NFPA 855 §4.1.6 (2020) | None within 3 ft | Secondary |
| Fire access: NFPA 1 §18.2.3 (2021, as amended by 527 CMR) | Within 150 ft, 20 ft wide, 13 ft 6 in clear, 25 ft inside radius, 10% grade, turnaround past 150 ft dead end | Secondary |
| Local conditions | Pembroke fire department: 20 ft buffer from exposures including vegetation, suppression, vehicle barrier | Read, via PEM |
| Plan scale | 1/8 in = 1 ft minimum, for plan submittals | Read, RED and MON |

Two lessons from real documents:

- **An AHJ can exceed the code value.** Pembroke's 20 ft is double the 10 ft above. The record needs a place for AHJ-stated conditions, each with its source.
- **Real analysis catches site-driven errors.** WOR flagged a 16 ft access road against a 20 ft minimum. PEM's reviewer asked for clarity on the nearest hydrant.

**Inference on C&I fit:** a battery beside a factory will often be near exposures. If the reported 50 kWh and 600 kWh limits apply as stated, a large cabinet would need a remote location or an approved exception path such as large-scale testing and HMA. An engineer or fire official must confirm this. EQORE can tell us how it handles this in practice (question 4 below).

## Site facts versus design decisions

Test (Inference): **a site fact would still be true if the battery project were cancelled.**

| Layer | What it holds | Who sets it | Examples |
|---|---|---|---|
| Site fact | Things that exist or are officially recorded | Evidence | Lot lines, wall construction, existing switchgear, service voltage, FIRM panel |
| Rule | What applies in this place, by edition | Evidence, confirmed by a person | AHJ, adopted code, amendments, AHJ conditions |
| Derived | Computed from the above | Deterministic code, labeled with inputs | Free area beyond 10 ft of exposures, largest area over 100 ft from exposures |
| Design decision | Choices made for this project | Engineer, outside the site record | Size, chemistry, pad position, tie-in, conduit route |
| Layout check | Derived from a decision plus facts | Deterministic code, tied to a design version | Distance from this pad to that lot line, remote or near classification |

**Two more layers appear in Sturbridge:**

- **Utility decisions.** C-1 says final metering location and grouping "will be determined by the National Grid metering department". The record should hold these as pending, with an owner, and not guess them.
- **Envelopes instead of positions.** C101 and C102 say BESS layout and capacity are "subject to final design (by others) but will remain within the proposed limits of work". So a civil permit sheet can fix an envelope while the layout moves. That supports derived candidate zones over a chosen pad (Inference).

Seed fields that cross this line:

| Seed field | Treat it as | The record holds |
|---|---|---|
| Candidate battery pad location | **Decision** | Derived candidate zones and constraints. Never a selected pad. |
| Tie-in point | **Decision** | Existing gear, bus and breaker ratings, spare positions, nearby space |
| Conduit run path | **Decision** | Obstructions, surfaces, existing utilities, wall penetrations |
| Distance to lot line, distance to openings or exits | **Layout check** | Lot lines, openings, and exits as located geometry |
| Setbacks | **Split it** | Zoning setback (a rule) and fire clearance (a rule). Different sources and different values. Both are measured from primitives. |
| Interconnection track | **Derived from a decision** | Utility rule and service facts. Track depends on size and export. EV (Excerpt): expedited or standard above 15 kW single-phase or 25 kW three-phase, pre-application at 250 kW and up. |
| Occupancy type | **Fact, but a code class** | The classification and its source. An LLM reading "bakery" must not assign it. |
| Existing single-line diagram | **Evidence** | The document, plus the values extracted from it |
| Battery size, configuration, AC or DC coupling | **Decision** | Not in the site record |

## What Option 2 needs per sheet

The samples give the real sheet list: T-000 Title, E-000 and E-001 Notes and Specifications, G-100 Site Plan (Sample 1), E-110 Electrical Site Plan, E-120 and E-121 Electrical Plan Detail, E-200 Equipment Details, E-300 Single Line, E-310 (Sample 2), E-400 Labels and Markings, E-500 and up Data Sheets. They are electrical sets. Sample 2 points to S-series structural sheets and an EB-series sheet that aren't included, and neither sample has a fire sheet. The fire and civil rows below come from checklists and Sturbridge. All value forms and accuracy notes are **Inference** unless a source is named.

| Sheet | Needs from the record | Form that can drive a drawing | Text-note fallback |
|---|---|---|---|
| Cover and general notes | Address, owner, parcel, AHJ, codes and editions, occupancy, construction type, flood status | Typed values, code citation objects | All of these are text in final form, but must be verified |
| Existing conditions or survey | Boundary, structures, topography, easements, utilities | Georeferenced vector geometry with a stated coordinate system, horizontal datum, vertical datum, method, and uncertainty | Not acceptable for a dimension |
| Site plan | All of the above, plus exposures, access roads, hydrant, flood line, wetlands | Georeferenced vectors, with attributes such as "exit door" or "public way" | Approximate items can carry "approximate" or "field verify" where an engineer allows it |
| Equipment layout | Footprint walls with openings, wall construction, nearby gear, free space polygons | Vector geometry in the same coordinate system as the site plan, or a local frame tied to it | Not acceptable near thresholds |
| Elevations | Ground elevation, base flood elevation, wall heights, opening heights, overhead lines | Numbers with vertical datum, e.g. NAVD88 (general knowledge) | Photo reference can support an engineer but can't dimension |
| Single-line and three-line | Utility voltage and phase, service rating, main device, bus rating, transformer, meters, existing DER, customer loads, available fault current | Connectivity graph: nodes and edges with typed ratings and units, each tied to evidence | A scanned old SLD is evidence, never drawing input |
| Fire details | Occupancy, fire alarm panel presence and location, water supply, AHJ conditions | Typed values and points | AHJ conditions stay as quoted text with source |
| Structural and civil | Soil and groundwater, ground condition, roof or slab data, seismic and other design loads, drainage | Typed values with source | Most will need a geotechnical or engineering source. Public data only scopes it. |
| Signage and placards | Service disconnect location, fire alarm panel location, emergency contacts | Points and typed values | Palo Alto (residential) shows a map plaque oriented from the main disconnect, hinting at why location and orientation matter |
| Interconnection attachments | Utility, account, meter number, service data, transformer nameplate | Typed values, plus documents | PGE requires the single-line and site plans before it will process an application |

### Tolerances

**Confirmed reference points. None is a drafter tolerance:**

- **Minimum plan scale** is 1/8 in = 1 ft (RED, MON).
- **Berkeley** triggers survey verification for additions and accessory structures within 12 in of a property line or of a fire-resistance threshold, and requires a survey for newly constructed structures. It says the California Building Code gives no clear guidance on when a survey is needed. Whether a pad counts as a structure there is a plans examiner's call (BRK).
- **ALTA/NSPS 2026** allows up to 2 cm plus 50 ppm relative positional precision, according to search excerpts of 2026 summaries such as [this alert](https://www.mcguirewoods.com/client-resources/alerts/2026/2/updated-alta-nsps-land-title-survey-standards-take-effect-feb-23/) (Excerpt). That's a land title survey standard. We found no permit requirement for it.
- **Approximate values do get used.** WOR gives "approximate" distances of 400 ft to a property line from the drawing set and an aerial map. PEM gives a hydrant at "approximately 615 ft".
- **Sturbridge delivered 5 cm.** V101 reports drone data tested to ASPRS (2023) at 5 cm RMSE horizontal and 5 cm non-vegetated vertical, using 7 checkpoints, plus a supplemental ground survey. This is what one project delivered, not a requirement. Underground utilities on the same sheet are "approximate", and its note says the offsets shown are "not to be used for the construction of any structure".
- **Sturbridge's printed dimensions are whole feet.** C102 at 1 in = 20 ft shows 10 ft, 5 ft, and 2 ft around the BESS yard (read from the rendered sheet). This is one project. Its site sheets run 1 in = 50 ft, 30 ft, and 20 ft, while the WA fire checklists ask for 1/8 in = 1 ft on plan submittals. The first set's C102 used 1 in = 10 ft.
- **Samples use approximate dimensions in construction-labeled sets.** Sample 2's detail at 1/4 in = 1 ft shows `~14'-1"`, `~18'-8"`, and `~7.5"`, alongside firm values such as `3'-6"` working clearance per NEC 110.26 and `10'` for path of egress. Sample 1's detail shows 3.00 ft working clearance at 3/4 in = 1 ft. Both say "equipment dimensions are approximate", and that where field installation varies, the contractor sends the engineer a sketch for review.
- **So field verification is part of the process, and a site plan dimension doesn't have to be final.** This weakens our ±6 in hypothesis as a universal rule. Tolerance likely differs by sheet: reference on the site plan, tighter at clearances in the detail (Inference).

**Inference, for an engineer to validate:**

- **One fixed tolerance is the wrong model.** The precision needed depends on how close the value is to a threshold. Aerial imagery can establish 400 ft against 100 ft. It can't establish 12 ft against 10 ft.
- **Margin test:** a value supports a check only if `|value − threshold| > uncertainty`. Examples, using made-up uncertainties:
  - 400 ft ± 10 ft against 100 ft: supports it.
  - 104 ft ± 8 ft against 100 ft: doesn't.
  - 12 ft ± 3 ft against 10 ft: doesn't.
- **A dimension printed on a layout is a stricter case.** 1/16 in on a 1/8 in scale drawing is 6 in, so a starting hypothesis for "layout grade" is ±6 in or better. We should ask EQORE (question 6).

**From the capture-tools lane, not rechecked here** (details in `docs/research/2026-11-07-option1-capture-tools.md`):

- **Phone lidar:** evidence is about 1 to 20 cm across studies with different metrics, with no electrical-room test found. Treat working clearances from a phone as `inferred` screens, not drawing dimensions.
- **Spare breaker positions:** these are usually internal, so facility staff can't safely close this gap. Route them to "needs qualified person". Exterior nameplate photos can capture voltage, ampacity, and AIC where labeled.
- **Old single-lines:** one may be out of date, and LLM connectivity reading scored poorly on the closest benchmark (OmniSch, PCB schematics, best net-detection F1 27.44%). An auto-read connectivity graph must not feed a line diagram without an engineer.

**From the remote-sensing lane, not rechecked here** (details in `docs/research/2026-11-07-option1-remote-sensing.md`):

- **Remote geometry is `inferred`, not plan grade.** At 11 Bartzak Dr, Holliston: building height about 5.7 m from 2021 lidar, footprint from a 2011 roofprint that still fits the 2021 roof, and closest building-to-parcel-line about 5.6 m using assessor parcels, which are not surveys. The project report gives lidar horizontal accuracy of 0.16 to 0.20 m at 95%.
- **Parcel uncertainty limits the margin test.** Lidar accuracy says nothing about the parcel line, so a computed distance is only as good as its weaker input. Until a parcel layer has a stated accuracy, its uncertainty should be recorded as unknown, so the margin test can't pass on it (Inference).
- **Not available remotely:** equipment clearances to openings, exits, and lot lines can't be confirmed, and electrical sheet inputs aren't available. Door and window positions, wall construction, and hydrants need capture or records. This covers much of our Tier 1 (ranks 2, 4, 5, and 6).
- **FIRM panel can be conflicting from one query.** FEMA NFHL `identify` returned two panels at that address, 25017C0631G (effective 7/8/2025) and 25027C0900E (effective 7/4/2011). The lane's wide query extent may explain the second, and it hasn't been rerun, so both stay conflicting until checked.

### Values that force multi-sheet updates

**Inference.** A later plan set step needs a dependency map like this one.

| Site record change | Sheets affected |
|---|---|
| Boundary or lot line | Survey, site plan, layout, zoning table, code analysis, possibly HMA, fire details |
| Building openings or wall construction | Site plan, layout, elevation, code analysis, possibly HMA |
| Remote or near classification (derived) | Layout, fire details, code analysis, HMA, general notes |
| Service voltage, phase, or rating | SLD, three-line, calculations, equipment schedule, interconnection application, labels |
| Main switchgear location | Site plan, layout, SLD notes, conduit plan, signage and placards, interconnection site plan |
| Existing DER found | SLD, site plan, calculations, placards, interconnection application, narrative |
| Utility transformer location or nameplate | Site plan, SLD, interconnection attachments |
| Flood zone or base flood elevation | Cover, site plan, elevation, structural and pad details |
| AHJ, code edition, or AHJ condition | Cover, general notes, code analysis, signage, and every derived check |
| Meter or account number | Cover, SLD, interconnection application, labels |
| Occupancy or construction type | Cover, code analysis, fire details |

## The contract, at concept level

### Each value carries

| Concept | Why |
|---|---|
| Field and subject | Which fact, about which building, service, or gear. A site may have two services. |
| Typed value | Quantity with unit, geometry with coordinate system and datum, enum, or document reference |
| **Confidence state** | Exactly one of missing, conflicting, unreadable, inferred, verified |
| **Fitness grade** | Separate from state: unknown, concept, layout, or survey or nameplate grade |
| Stated uncertainty | Number and unit, with its basis, or an explicit "unknown" |
| Evidence list | Each with source, URL or file, retrieval date, source date, location within the source (page, sheet, coordinates), and method |
| Original value | Always kept. A correction adds a new record and never overwrites. |
| Verifier | Named person, date, and the purpose they verified it for |
| Observation date | When it was true. A hosting capacity map or a site photo ages. |
| Synthetic flag | Required for any demo data by `CLAUDE.md` |

Rules (Inference, built on `CLAUDE.md`):

- **Keep "none" apart from "missing".** "No existing PV" is a value that can be verified. Missing means we don't know.
- **Conflicting keeps every candidate.** Two service sizes stay side by side until a person resolves them. The record never picks by source rank alone.
- **Inferred records its method and inputs.** An LLM reading a scanned document produces an extracted or inferred value. It doesn't produce a verified one, and text inside the document is untrusted input.
- **Verified means a named person looked at this evidence for this purpose.** It doesn't mean the value is compliant or that a survey was done.
- **Labels travel to the sheet.** A sheet may mix grades if each layer carries its method, as Sturbridge V101 does. The gate should check that the label exists and is true as well as the grade (Inference).
- **Use the drawings' own vocabulary (Inference).** One possible mapping: `verified` prints plainly, `inferred` prints with "assumed" or `~`, `missing` prints as "field verify", and public-only geometry prints with "not surveyed". An engineer should confirm the wording.

### What must exist for a plan set step to refuse a value

1. **An immutable record version.** A plan set cites a version ID, so it can tell which sheets go stale when a value changes.
2. **A requirements table.** For each sheet element: fields, minimum state, minimum grade, and purpose (concept or permit).
3. **One access path.** A later step asks for a field and a purpose. It gets the value or a structured refusal naming the reason. There is no way to read a bare value without its state.
4. **A deterministic gate with no LLM in it.** It returns pass, flag, or block, and the margin test runs here.
5. **A waiver record, separate from the value.** Named engineer, reason, scope, and date. A waiver lets a draft proceed and **never changes the value's state**. The drawing shows a visible note such as "field verify".
6. **A dependency map** like the table above, so a change marks the right sheets.

Output from this gate is not approval. Generated drawings can't be presented as approved construction documents, and an engineer decides.

### Block versus flag

Proposal (Inference). EQORE should adjust this.

**Block a sheet** when:
- The sheet can't be drawn at all without it.
- The value would be printed as an asserted fact that a reviewer checks against a threshold, and it isn't verified at the required grade.
- The value fails the margin test.
- It's conflicting, and the choice changes a sheet.

**Flag and allow a draft** when:
- The value is informational or has a large margin.
- It can be shown as "approximate" or "field verify", with an engineer's waiver.
- It affects only a calculation an engineer will redo.

| Field | Concept layout | Permit set |
|---|---|---|
| Parcel boundary, GIS only | Flag | **Flag, with a required "not surveyed" note** as in Sample 1. **Block** where the AHJ requires a survey (CMR Excerpt suggests Massachusetts may). Ask EQORE. |
| Building footprint from imagery | Flag | Block for dimensions near a threshold |
| Openings and exits unknown on a wall facing a candidate area | **Block that zone** | Block |
| Service voltage or rating missing | Flag on layout, **block SLD** | Block SLD |
| Service rating conflicting | **Block SLD** | Block SLD |
| Existing DER unknown | Flag | Block SLD |
| AHJ or adopted code edition missing | **Block code checks** | Block cover |
| Occupancy missing | Flag | Block cover and code analysis |
| Flood zone missing | Flag | Block site plan |
| Hydrant location missing | Flag | Flag, unless the AHJ requires it |
| Rate schedule or interval data missing | Doesn't touch a sheet | Doesn't touch a sheet |

## Priority-ranked fields

Scored by how many sheets and checks depend on a field, weighted toward C&I-scale sources. The ranking is **Inference**. "Access" is our rough guess at the realistic route and is for the other lanes to correct.

**How the samples change this order.** The table below was ranked before we had them, and it leans on checklists. Neither sample states hydrants, flood, occupancy, or exposure distances. If EQORE's set looks like the samples, the top of the list for the **electrical set** is:

1. Existing main switchboard ratings, sections, and photos (bus, voltage, phase, main breaker, kAIC)
2. Location of the switchboard, electrical room, meter or CT cabinet, and utility transformer
3. Existing panels and loads near the tap
4. Existing DER, with each inverter on the single-line
5. Parcel line, building outline, and aerial base image
6. Space and working clearance around the candidate area, including overhangs, trees, curbs, and egress paths
7. Existing conduits and underground lines
8. Applicable code editions and available fault current

Fire and planning review still need the fire and zoning fields below (Monroe, Pembroke, and Worthington), perhaps in another package.

### Tier 1: can't do a credible layout without these

| Rank | Field | Seed or new | Why | Access (rough) |
|---|---|---|---|---|
| 1 | Parcel boundary with stated accuracy | Seed | Drives classification, clearance, zoning, and the survey question | Public for concept. Survey for permit. |
| 2 | Building footprint with **openings, exits, wall construction, overhangs** | Seed, extended | Reviewer checks these directly, and they unlock the 3 ft exceptions | Imagery, street view, old plans, then site |
| 3 | **Exposures**: public ways, stored combustibles, hazardous materials, high-piled stock | New detail | Named in every code list. Decides remote or near. | Imagery, then customer |
| 4 | Voltage and phase | Seed | Every electrical sheet | Bill or nameplate |
| 5 | Service size and **existing equipment ratings** | Seed, extended | Required on line diagrams | Nameplate. Rarely public. |
| 6 | Main switchgear location | Seed | Site plan, SLD, conduit, placards, tie-in options | Old plans, customer, site |
| 7 | AHJ, **adopted edition**, amendments, **AHJ conditions** | Seed, extended | Every check and the cover sheet | Public |
| 8 | Occupancy and **construction classification** | Seed, extended | NYC and MON ask for these | Permit records |
| 9 | Fire access: roads, width, grade, gate, turning | Seed, extended | Real finding in WOR | Imagery, then site |
| 10 | Existing single-line diagram | Seed | Best evidence source for items 4 to 6 | Customer or records |

### Tier 2: needed for a complete permit package

| Rank | Field | Seed or new | Why |
|---|---|---|---|
| 11 | Existing DER and PV | Seed | SLD, interconnection. Record "none" as a value. |
| 12 | Utility transformer location and **nameplate** | Seed, extended | PGE attachment, site plan |
| 13 | Meter number, location, **account or service ID** | Seed, extended | Interconnection forms |
| 14 | Serving utility | Seed | Interconnection path |
| 15 | Flood zone, **FIRM panel and date, BFE** | Seed, extended | NYC, PEM, CMR |
| 16 | Zoning district and **whether storage is allowed** | Seed, extended | PEM's reviewer questioned the accessory use |
| 17 | Zoning setbacks | Seed | PEM, zoning table |
| 18 | Hydrants and **water supply** | Seed, extended | PEM, WOR |
| 19 | **Wetlands, conservation, habitat** | New | PEM reviewer checked wetlands and rare species habitat |
| 20 | **Vegetation near candidate areas** | New | WOR, PEM |
| 21 | **Fire alarm panel presence and location** | New | RED, SEA |
| 22 | **Working clearance at existing gear, spare breaker positions** | New | NYS, WOOD, WDT, tie-in options |
| 23 | **Easements and existing underground utilities** | New | BRK, PEM, WDT |
| 24 | Grade and slope | Seed | Civil, access |
| 25 | **Soils, seasonal high groundwater, drainage** | New | PEM |
| 26 | Owner, address, parcel ID | Seed | Required everywhere, low effort, so low risk rather than low importance |
| 27 | **Design snow, wind, and climate data** | New | Sturbridge C-1 lists 35 psf ground snow, 124 mph wind, and ASHRAE temperatures from a named airport. Public sources may cover these. Use on the BESS part isn't stated. |
| 28 | **Utility case number, POI pole number** | New | Sturbridge title block and C-1 show both |
| 29 | **Registry book and page, recorded plans** | New | Sturbridge G001 and V101 cite these. Public, and useful evidence for the boundary. |
| 30 | **Photos of existing electrical gear, with equipment IDs** | New | Sample 2 places them on E-120 and marks the proposed tap. They are also the evidence for ranks 4 to 6. |
| 31 | **Available fault current, with basis** | New | Sample 2 prints "assumed available fault current: 65,000 AIC". Sample 1's E-400 has an available fault current label. |
| 32 | **Existing conduits, spares, vaults** | New | Sample 2 shows them, with a note that a vault may not exist. Sample 1 says to field verify. |
| 33 | **Utility circuit ID, primary voltage, overhead or underground** | New | HOL E-101 shows all three. Whether a behind-the-meter set needs them is unconfirmed. |

### Tier 3: doesn't drive a sheet

| Field | Verdict |
|---|---|
| 15-minute interval data | Not on any checklist read. Drives stage 2 sizing. Keep it, but it doesn't help a plan set. |
| Peak demand | Same. Might support a service capacity check. Not confirmed (Inference). |
| Bill history | Not a sheet input. Useful as **evidence** for account, meter, voltage, and rate. A Rhode Island National Grid page (Excerpt) asks for a bill copy. |
| Rate schedule | Economics, not drawings. |
| Feeder hosting capacity | Interconnection risk signal, not a sheet input. Time-sensitive. |
| Building height | Not on any ground-mount checklist read. Matters for rooftop and possibly zoning or elevations. |
| Overhead obstructions | Checklists ask about **new** overhead runs. PEM's plans show proposed overhead and underground services and four new poles. Crane and delivery use is Inference. Keep at low priority. |

### Decisions and derived values to remove from the fact list

Candidate pad location, tie-in point, conduit run path, distance to lot line, distance to openings or exits, interconnection track. See the boundary table above.

## The provided IFC samples

`provided resources/` appeared during this session with two PDFs and an empty `Sample Input Images` folder. It's untracked in git. We don't know who supplied it or whether these are the sets the brief describes. We didn't try to recover redacted text. Neither is the Century Tywood set by name.

**Where each value on the sheets could come from.** The source column is **Inference**, for EQORE to correct.

| Value on the sheet | Sample | Likely source | Reachable without a visit? |
|---|---|---|---|
| Aerial base, building outline, roads | Both | Imagery | Yes |
| Property line | Sample 1 from public KMZ (stated), Sample 2 unstated | Parcel data | Yes, as reference |
| Setback line, overhangs, curbs, trees | Sample 2 | Zoning, imagery, plans, site | Partly |
| Utility transformer location | Both | Imagery, street view | Often |
| Meter and CT cabinet location | Both | Street view, customer | Sometimes |
| Electrical room and entrance | Sample 1 | Customer, old plans | Sometimes |
| Main switchboard: 800 A 208 V, or 3000 A 480Y/277 V 65 kAIC | Both | Nameplate, old single-line | Rarely from public data |
| Sections of the switchboard and tap location | Sample 2, from photos | Site or customer photos | Only with photos |
| Existing panels: 400 A x4, 225 A x2 | Sample 1 | Site or customer photos | Only with photos |
| Existing PV inverters, by circuit | Sample 2 | Prior permit set | If records exist |
| Spare conduits and vault | Sample 2 | Prior permit set, then field verify | Partly |
| Temperatures from a named weather site | Sample 2 | ASHRAE data | Yes |
| Code list | Both | AHJ | Yes |

**Implications (Inference):**

- A useful Option 1 demo doesn't need to replace the visit entirely. Public sources can draft G-100 and the top of T-000. Customer photos can close most of E-120 and the existing side of E-300. The record's job is to show which is which.
- `Sample Input Images` suggests photos are an expected input, but the folder is empty. Ask for its contents.

**Conduit routes confirm the boundary.** Both samples say "conduit routing is diagrammatic, contractor shall determine best conduit route". The tie-in and pad are engineer decisions, and the route is resolved in the field.

**Real inconsistencies inside Sample 1.** We can't tell if these are original or introduced when it was anonymized.

| Value | One sheet | Another sheet |
|---|---|---|
| BESS model voltage | 480 V (T-000, G-100 callout, E-110, E-121, E-300) | 208 V (G-100 details, E-120) |
| Transformer | Inside BESS enclosure (G-100, E-300) | Pad mounted (E-120) |
| Metering box | EMS metering box (G-100, E-300) | DAS enclosure (E-110, E-120) |
| Project type in notes | BESS project | "This PV system" in boilerplate (E-000) |

These are Option 2's problem more than Option 1's. They do show why the design values need one source of truth.

**Fire scale check.** Sample 2 places three 176 kWh cabinets together on one pad, marked UL 9540 and UL 9540A listed, under California code. That doesn't fit a simple reading of the reported 50 kWh grouping, and we don't know the basis. It may rest on test results, a different code, or review not shown here. Don't apply our Massachusetts reading to it, and ask EQORE.

## Real examples

| Item | What we could learn | Limit |
|---|---|---|
| PEM, Pembroke review letter | Real Massachusetts reviewer concerns on an outdoor BESS at a commercial site | Letter only. Plan set by Morse Engineering dated July 14, 2025 was not obtained. |
| WOR, Worthington HMA | Real analysis against NFPA 855 (2020), with approximate distances from drawings and aerials. Figures 13 and 14 are near PDF pages 23 to 26. We couldn't render images. | Larger, remote project. Draft. |
| STUR, Sturbridge sets | Real sheets, see below | No single-line, structural, or fire sheets posted. Public-records found the working URLs after the old paths returned 404. |
| Haverhill MA, National Grid expedited application | Might show a real completed form | Link returned 404 |

**Plan set availability now:** the samples are the only complete sets with a BESS single-line. HOL E-101 is a public PV one-line, with revisions for pole number, meter CT, relay settings, a recloser, utility comments, and an inverter change. Its revision log says 13.2 kV while the drawing says 13.8 kV. Per lane public-records (not rechecked here): the Pembroke set wasn't found in 1 search, the Holliston portal's robots.txt disallows crawling, and Holliston's blank forms ask for service amps, volts, overhead or underground, meter count, use group, construction type, height, area, and sprinkler. No filled form was seen. Details are in `docs/research/2026-11-07-option1-public-records.md`. We did not invent contents for Century Tywood or any other set.

### Sturbridge: what a real set shows

The project is NextGrid / Wahoo Solar at a commercial plaza: 500 kW / 1,222.02 kWh DC-coupled BESS, plus 497.25 kW DC / 249 kW AC rooftop PV. Civil sheets are by Weston & Sampson and electrical sheets by ARC Design, each with its own PE stamp. Civil sheets say both "Issued for building permit" and "Not for construction". All of this was filed for permitting.

**The town's decision doesn't show the drawings were accepted on electrical, fire, or code grounds.** The [Planning Board notice](https://www.sturbridge.gov/DocumentCenter/View/575) (Read by eye from page scans, because it has no text layer) approves a waiver of site plan review, by a 6-0 vote at the April 7, 2025 meeting, signed 4/10/25. Its six conditions are general: build to the plans, follow codes, get all other permits before construction, install erosion controls, keep the site tidy, and give police an emergency contact list. None is specific to battery or electrical design. The board lists reviews by DPW, Building, and Fire, but we didn't see their content. We also haven't seen a building, electrical, or fire permit, so this set shows what was filed, not what passes review.

**Where each V101 layer came from (Read):**

| Layer | Stated basis | Our grade |
|---|---|---|
| Planimetric and topographic features | Drone data from Jan 14, 2025, tested at 5 cm RMSE, plus ground survey Feb 12, 2025 | Survey |
| Elevations | NAVD88 from GNSS network observations, with two temporary benchmarks | Survey |
| Boundary and easements | Survey without a title report, from "available documentation". Recorded plans cited by registry book and plan, plus prior ALTA surveys from 2009 and 2018 | Survey, with a stated caveat |
| Underground utilities | Ground penetrating radar and electromagnetic markout, utility maps, "approximate" | Layout at best |
| Electrical facilities | Map from National Grid | Reference |
| Sewer | Town sanitary sewer cards | Reference |
| Flood zone | "By graphic plotting only", Zone X, FIRM 25027C0927F, revised June 21, 2023 | Public |
| Wetlands | MassMapper GIS, "not based on an on the ground wetland delineation" | Public |

Many of these sources are public records. The field work adds the base survey and the utility markout. That gives a concrete way to test Option 1: how much of V101 could a record reach before anyone visits? (Inference.)

**Other values that appear on sheets (Read):**

- **G001:** zone, lot area and frontage minimums, setbacks of 25, 10, and 10 ft, 30% lot coverage, owner, registry book and page, parcel ID, parcel area.
- **C-1, an aerial photo at 1 in = 100 ft with a PE stamp:** property boundary, main service panel and revenue meter "inside building electrical room", POI at existing utility pole #3, existing transformer, proposed PCC transclosure, equipment pads, utility-accessible gate, and an access road noted as "at least 20' wide and no more than 8% grade". Also the National Grid case number.
- **C-2, Placard:** a site map to be engraved on a red background, with system ratings, a 500 kVA utility transformer, disconnects, and battery cabinets.
- **C102:** three cabinet footprints on one pad by our count from the rendered sheet, 10 ft dimensions from the pads to the fence, bollards, gate, limit of disturbance, and "contractor to avoid concrete loading pad and water valve".

**Whether this yard is remote or near exposures isn't stated in what we read.** C102 also shows a 108 ft dimension whose endpoints we didn't confirm. With 1,222 kWh on site, it would be a good case to ask EQORE about.

**Revisions show what changes a set (Read):**

| Date | Sheet | Change |
|---|---|---|
| 02-24-22 | C-1 | Add note per National Grid |
| 03-01-22 | C-1 | SLD per National Grid review |
| 03-06-24 | C-1 | 551 relay, conductor size |
| 04-10-24 | C-1 | Move S.T. breaker |
| 05-22-24 | C-1 | Per draft SIS |
| 03-10-25 | Civil | Planning and fire comments |
| 03-12-25 | C-1 | Civil update, placard |
| 03-24-25 | Civil | Updated layout, and C102 rescaled |
| 04-01-25 | Civil | Address updated |

C-1, dated 01-10-2022, kept its own revision series while the civil sheets started a new one in 2025. The filing therefore mixes two revision systems from two firms, so a shared version ID would be useful to Option 2 (Inference).

**Real conflicts in the public filing, usable as honest demo material (Read):**

| Value | One source | Another source |
|---|---|---|
| Address | 194 Main St (first set, C-1, CAD file paths) | 178 Main St (narrative, rev 3) |
| Parcel area | 14.435 acres (G001, V101) | 14.6 acres (narrative) |
| Lot | Lot U1, 2.239 acres | Lot 196, 14.435 acres (both in V101) |
| Parcel ID | 415-03417-000 (G001) | 415-03417-U1 (decision, assessor card, which lists retail condo use and a lot size of 0 acres) |
| Property owner | SEA Sturbridge Plaza LLC (G001, both sets) | Dragonfly Ibis Sturbridge, LLC (decision, typed "Dragonly" on page 1). [Assessor card](https://gis.vgsi.com/sturbridgema/Parcel.aspx?pid=102518) shows it as owner from 07/30/2018, so the plan cover looks out of date. |
| Plan revision reviewed | Rev 3, 04/01/2025 (posted set, before the meeting) | "Revised through 03/24/2025" (decision) |
| Battery energy | 1,222.02 kWh (C-1, C-2) | "1MWh" (narrative) |
| Modules | 1,105 (C-1) | "approximately 1,100" (narrative) |
| Code edition | 9th edition 780 CMR, IBC 2015, NEC 2020 (C-1) | The brief names the 10th edition, based on the 2021 IBC |

Some may have ordinary explanations, such as two lots, rounding, a change of owner, or a design that began under an earlier code. The record should show them as conflicting and let a person decide. Three of these concern which parcel the project is on, and that decides which lot lines the clearances are measured from (Inference). The revision row shows why a decision needs to cite a version ID. This matters for D4, because real public conflicts answer the risk noted in `decision.md` that planted conflicts look rigged. Real documents name real parties, so check with the team before showing them.

**Assessor cards reach some Tier 1 fields.** The same card lists exterior walls (concrete or cinder, and brick or masonry), flat tar and gravel roof, a wet sprinkler entry, and year built 1972. It also lists "Occupancy: 4". That looks like a count, not a code occupancy class, so an automated extractor shouldn't treat it as one (Inference).

## Questions for EQORE

**Plan sets**
1. Can we get the Century Tywood plan set and the others? If not, can we see the sheet index and a redacted site plan and single-line?
2. Which sheets vary by site, and which are standard for every project?
3. On a recent set, which values on the drawings came from a survey, the customer, a site visit, or public data?

**Thresholds and fit**
4. Are your sites usually remote or near exposures under NFPA 855? How do you handle the 50 kWh and 600 kWh limits on a near-exposure site? Our reading is secondary.
5. In Massachusetts, do you commission a stamped boundary survey on every project? Do any towns accept less? What about the Bay Area?
6. **What precision does your drafter need before trusting a dimension?** What would they accept for concept layout? Is our margin-test idea how your engineers think?
7. Which edition of NFPA 855 are Massachusetts AHJs actually enforcing? Are there towns that add conditions such as Pembroke's 20 ft?

**Record contents**
8. Which fields in our Tier 1 list most often turn out wrong or missing, and which ones sent you back to site?
9. Where should a gap block a sheet instead of adding a "field verify" note? Do you use that note today?
10. Would your engineers accept candidate zones, or would that step on their layout decision?
11. What does your intake already collect on nameplates and available fault current, and from whom?

**Before and after**
12. How long does site data collection take today, and what share of it is rework? We won't estimate this for you.
13. On a recent delayed project, which missing or wrong site fact caused the most rework?

**Review**
14. Which review comments recur most from Massachusetts AHJs, National Grid, Eversource, and PG&E? Could we see a real comment letter?
15. What do the National Grid and Eversource expedited or standard applications need that isn't in this matrix?

**Real example**
16. Does Sturbridge's structure match your sets: separate civil and electrical packages, with an aerial-based electrical cover sheet? Would your engineers stamp that sheet?
17. When a design starts under one code edition and files under a later one, which edition goes on the sheet?
18. Does your survey sheet use public GIS for wetlands and flood the way Sturbridge's does? When do you pay for field delineation?

**Provided samples**
19. Are `BESS IFC Sample 1` and `2` from EQORE, and do they represent your sets? Can we use them in a public demo?
20. Were these sets also what went to the AHJ, or is the permit set different? Where are the fire, structural, and civil packages?
21. Sample 1's site plan is "not surveyed". When is that acceptable to you and to AHJs, and when do you survey?
22. What was meant to go in `Sample Input Images`? Who takes the switchboard photos today, and how often do they need a second visit?
23. How was Sample 2's "assumed" 65,000 AIC decided, and when does the utility give an actual value?
