# Option 1 research: capture for what public sources can't reach

**Lane:** low-touch capture and customer-supplied data. **Date:** 2026-11-07. **Status:** research input for D1 and D9, not a decision.

**How to read the labels**
- **Confirmed:** read on the linked page. **Confirmed (excerpt):** seen only as a search-result excerpt, because the page refused direct fetch (HTTP 403 or similar). Re-check these before quoting them to EQORE.
- **Inference:** my reasoning, not a source's claim.
- **Not found:** not found in 17 searches and about 40 page fetches in total. Absence here is not proof of absence.

## Bottom line

1. **Nothing here is evidence that Option 1 can't work.** It does show that "no one on site" can't close every field. Some electrical fields need a qualified person at the equipment (see "What can't be closed without a person").
2. **The cheapest gap closers are documents and account authorization, not sensors.** Bills, interval data, and existing drawings cover the load fields and most of the electrical fields without anyone going to the site. (Inference from the coverage table.)
3. **Phone lidar answers a smaller question than it first appears to.** It measures geometry. The electrical-room gaps that matter most are ratings, labels, and internal condition, and geometry doesn't provide those. (Inference.)
4. **The record needs a "needs qualified person" outcome.** A gap the system can't close remotely should be routed, not left as a bare "missing". (Recommendation.)

## Comparison of methods

Times appear only where a source gives one. "Not found" means I found no sourced time.

| Method | Who captures | Must own or install | Time (sourced only) | Measured or stated accuracy | Hackathon demo? |
|---|---|---|---|---|---|
| Phone lidar / photogrammetry | EQORE engineer, or a trained facility manager (FM) | iPhone or iPad Pro with lidar and an app. [Polycam free tier](https://poly.cam/pricing) exports GLTF only; other exports start at $150/yr | Not found | About 1 to 20 cm across studies, which use different metrics; see "Phone lidar evidence" | Yes, if a teammate owns the device (unknown) |
| Matterport Pro3 | Engineer or scanning contractor | [$5,995 camera](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/) (2022 price) | ["less than 20 seconds per sweep"](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/); whole-site time not found | Vendor: ±20 mm at 10 m. An [academic test of a Matterport Pro camera](https://doaj.org/article/8d01e611018840a386c2145b6a3268d5) found about 1% (excerpt; model unclear) | No: cost |
| Drone capture | Part 107 pilot (inference from [FAA guidance](https://www.faa.gov/blog/clearedfortakeoff/know-rules-operating-drones-over-people); certificate page returned 403) | Drone, pilot, site permission | Not found | Not found for C&I site surveys | No: venue and certification risk |
| Guided photo checklist | FM alone | Their own phone; EQORE supplies the flow | Not found | Depends on photo quality; no benchmark found | Yes |
| Nameplate / panel-schedule reading | Software from FM photos, engineer confirms | Nothing extra | Not found | Lab figures of 99%+; see "Reading photos" | Yes, on labeled synthetic or teammate-shot photos |
| Scanned single-line diagram (SLD) reading | Software, engineer confirms | Needs a scan to exist | Not found | Symbols only: about 95% on small datasets. LLM connectivity is poor; see "Reading SLDs" | Partial: title block and ratings only |
| Remote video walkthrough | FM holds the phone, engineer directs live | Phone, data signal in the room | Not found | Not found | Yes, cheaply, but it demos poorly |
| Customer-supplied drawings | Facility or its contractor | Drawings must exist | Not found | May be out of date; accuracy depends on the document | Yes, if EQORE's plan sets arrive (still missing per context.md) |
| Utility data authorization | Account holder authorizes; EQORE registers as a third party | Third-party registration per utility | PG&E: test within [90 days](https://www.pge.com/en/save-energy-and-money/energy-saving-programs/smartmeter/third-party-companies.html) of notice. National Grid approval 1 to 2 weeks, per [Nectar](https://nectarclimate.com/utilities/massachusetts-electric-national-grid) (excerpt, third party) | Metered data, with caveats below | Files yes, live no |
| PDF bill parsing | Software, engineer confirms | Customer sends bills | Not found | Vendor claims only (95 to 99%); no independent benchmark found | Yes, on labeled synthetic bills |

## Field coverage

**D** = direct, **I** = inferred (needs a person or second source before it is verified), **–** = no.

Columns: **Lidar** phone lidar or photogrammetry; **Drone**; **Photo** guided checklist with nameplate reading; **SLD** scanned diagram reading; **Video** remote walkthrough; **Dwg** customer-supplied drawings; **Util** utility data authorization; **Bill** PDF bill parsing.

All cells are my inference from what each method physically captures. No source publishes this matrix.

| Seed field | Lidar | Drone | Photo | SLD | Video | Dwg | Util | Bill |
|---|---|---|---|---|---|---|---|---|
| **Identity** | | | | | | | | |
| address | – | – | I | I | – | D | D | D |
| parcel ID | – | – | – | – | – | I | – | – |
| owner | – | – | – | – | – | I | I | I |
| occupancy type | – | – | I | – | I | D | – | I |
| AHJ | – | – | – | – | – | I | – | – |
| serving utility | – | – | I | I | – | I | D | D |
| rate schedule | – | – | – | – | – | – | D | D |
| **Geometry** | | | | | | | | |
| parcel boundary | – | I | – | – | – | D | – | – |
| building footprint | I | D | – | – | – | D | – | – |
| building height | I | D | I | – | I | D | – | – |
| setbacks | – | I | – | – | – | D | – | – |
| candidate battery pad location | I | I | I | – | I | I | – | – |
| distance to building openings/exits | D | I | I | – | I | D | – | – |
| distance to lot line | – | I | – | – | – | D | – | – |
| vehicle/fire access | I | I | I | – | I | I | – | – |
| hydrants | I | I | D | – | D | I | – | – |
| overhead obstructions | I | D | D | – | D | I | – | – |
| grade/slope | I | D | – | – | – | I | – | – |
| flood zone | – | – | – | – | – | I | – | – |
| **Electrical** | | | | | | | | |
| service size | – | – | I | D | I | D | – | – |
| voltage/phase | – | – | D | D | I | D | – | I |
| main switchgear location | D | – | D | – | D | D | – | – |
| utility transformer location | I | I | D | I | D | D | – | – |
| meter number/location | – | – | D | I | D | I | D | D (number) |
| existing single-line diagram | – | – | I | D | – | D | – | – |
| existing DER/PV | – | D (roof) | I | D | I | D | I | I |
| tie-in point | – | – | – | I | – | I | – | – |
| conduit run path | I | – | I | I | I | I | – | – |
| **Load** | | | | | | | | |
| 15-minute interval data | – | – | – | – | – | – | D | – |
| peak demand | – | – | – | – | – | – | D | D |
| bill history | – | – | – | – | – | – | D | D |
| **Regulatory** | | | | | | | | |
| adopted code edition and amendments | – | – | – | – | – | – | – | – |
| zoning | – | – | – | – | – | I | – | – |
| feeder hosting capacity | – | – | – | – | – | – | – | – |
| interconnection track | – | – | – | – | – | I | – | – |

**Fields I'd add** (inference; check them against a real plan set when one arrives):
- **Main breaker frame and trip rating:** the service size on paper can differ from what is installed.
- **Working clearance at equipment:** room geometry a phone can screen.
- **Bus rating, spare breaker positions, and tap space:** usually internal, see below.
- **Available fault current:** normally from the utility or a study, not from a photo.
- **Arc-flash label present and its date:** an exterior photo can capture this.
- **Account holder vs. property owner:** a tenant may control the bills and an owner may control the pad location.

**Remote-sensing lane's read (reported by remote-sensing, not checked by me):** it supplies no Electrical seed field directly, so this lane has to cover them. At a Holliston test site it couldn't identify any transformer or switchgear from 15 cm orthos (8 tiles, by eye). That's why drone transformer location stays `I` above: a closer view may do better, but I have no test showing it. It also reports that Google's terms bar storing Street View or deriving content from it, so no capture flow here depends on Street View. Details: [its doc](2026-11-07-option1-remote-sensing.md).

**Plan-set lane's early read (provisional, reported by plan-set-bridge, not checked by me):** checklists demand ratings of existing service equipment, and Woodside and NYSERDA both require "ratings (voltage, ampacity, environmental, etc.) for new and existing service equipment" on the line diagram. That makes nameplate capture the key method. Its list also adds two fields to the ones above:
- **AIC rating, if labeled:** an exterior nameplate photo can capture this (direct); otherwise it is `missing`.
- **Wall construction and openings near a candidate area:** a photo or video can suggest this (inferred); drawings can state it (direct).

The brief's stage 1 already lists "site photos, electrical single-line diagram, equipment nameplates". So these methods speed up an existing request rather than adding a new one.

## Phone lidar evidence

**Measured at room scale, all confirmed unless marked:**

| Study | Device and space | Reference | Result |
|---|---|---|---|
| [Jakovljević et al. 2022](https://doisrpska.nub.rs/index.php/STPG/article/download/8650/8380/19471) | iPhone 13 Pro with SiteScape, 7.7 × 3.9 m furnished room | Faro Focus M70 | Mean absolute cloud-to-cloud 6 cm, SD 10 cm, max 1.29 m (mostly noise, per authors) |
| [Amooshahi et al. 2024](https://civil-ferdowsi.um.ac.ir/article_45986_3f76394ff8a9398b3bf2268fb9ae38aa.pdf) | iPhone 12 Pro, indoor room, with and without gimbal | Total station, photogrammetry | RMSE 15 to 20 cm. Over 35 cm without a gimbal. The abstract and summary disagree on some gimbal figures, so I use only the RMSE and the 35 cm figure |
| [Jabari et al. 2025](https://isprs-archives.copernicus.org/articles/XLVIII-4-W15-2025/71/2025/isprs-archives-XLVIII-4-W15-2025-71-2025.pdf) | iPhone 12 Pro images and lidar on a tripod rig, 8 × 6 × 3 m room | Faro Focus 3D | Relative accuracy about 3.9 to 4.0 cm, after bundle adjustment. This isn't hand-held out-of-the-box. One author works at Modelar |
| Same paper, feature-poor culvert | Modelar scan | Reference cloud | Mean error 17.4 cm unconstrained, 5.8 cm with length constraints, so added length measurements helped substantially in that case |
| Same paper, citing earlier work | iPhone 13 Pro, controlled environment | Trimble S9 | ±3 cm horizontal, ±7 mm vertical (secondary citation) |
| [Hamdan et al., EGU 2026](https://meetingorganizer.copernicus.org/EGU26/EGU26-2752.html) | Modelar, 3D Scanner, SiteScape; objects, corridors, façades | Geodetic network | RMS 1.34 cm (small objects) to 4.6 cm (façades). Conference abstract. Authors advise staying under 5 m and moving slowly to limit drift |
| [Kucak et al. 2023](https://acikerisim.ohu.edu.tr/items/d3d4a920-e7f5-42bf-88a4-5953b585f7a3) | iPad Pro, small office | Leica C10 | ±1 to 1.5 cm RMSE, depending on software (excerpt; page unreachable) |
| [Zaczek-Peplińska and Kowalska 2022](https://www.fig.net/resources/proceedings/fig_proceedings/fig2022/papers/ts03g/TS03G_zaczek-peplinska_kowalska_11458.pdf) | iPhone 13 Pro, building inventory | Z+F 5006h | About 1 cm (excerpt) |

The results span more than a factor of ten, and the operator, stabilization, and software all matter. So one accuracy number shouldn't go in the record. (Inference.)

**Electrical rooms: no test found.** I found no study of phone lidar in electrical rooms, around switchgear, or at working-clearance measurement, in 2 searches aimed at it. The nearest evidence points to trouble but doesn't measure it:

- **Reflective surfaces:** Errors [clustered around glass and similar surfaces](https://meetingorganizer.copernicus.org/EGU26/EGU26-2752.html). Removing those points improved consistency by about 50%.
- **Phone flash lidar and mirrors:** The [MIT Media Lab paper](https://www.media.mit.edu/publications/handheld-mapping-of-specular-surfaces-using-consumer-grade-flash-lidar/) explains why mirror surfaces can read as holes: standard lidar assumes one bounce, and mirrors return multiple bounces.
- **Metals, different sensor:** A [miniature laser scanner](https://strathprints.strath.ac.uk/57971/) on aluminum and stainless steel reached mean RMSE as high as 100.12 mm. This wasn't a phone, so don't transfer the number. It does show that bare metal can be a real problem.
- **Tight spaces:** [Indoor tracking loss and drift](https://isprs-archives.copernicus.org/articles/XLVIII-4-W15-2025/71/2025/isprs-archives-XLVIII-4-W15-2025-71-2025.pdf) are worst where features are few. The sensor's [range is about 5 m](https://magicplan.app/blog/why-apples-lidar-scanner-opens-up-a-brave-new-world-of-indoor-mapping) (vendor statement).

Painted enclosures may behave differently from bare metal. I found no test either way. (Inference.)

**Recommended use (inference):** Treat a phone-lidar clearance as a screen. It can say "probably fine" or "probably tight", and a person has to measure anything near a limit. Store the value as `inferred` with the capture method attached, and ask for one tape-measured reference length in each scan. Jabari et al. support that step. Never let a phone scan set a code-required clearance, per the deterministic-check and human-decision rules in CLAUDE.md.

**RoomPlan:** [Apple's free API](https://developer.apple.com/augmented-reality/roomplan/) produces USD or USDZ room models with dimensions. Its overview page gives no accuracy, room-size, or lighting limits. It needs native iOS development, which likely needs a Mac, while D10 sets this repo up on Windows. (Inference.)

## Reading photos: nameplates and panel schedules

- **Lab figures are high but thin.** [Zhang et al. 2022](https://www.frontiersin.org/articles/10.3389/fenrg.2021.834283) report 99.3% for letters and digits, but on a **test set of 30 images** with no confidence intervals. An [SPIE paper](https://journals.spiedigitallibrary.org/conference-proceedings-of-spie/12941/129412X/End-to-end-OCR-text-recognition-method-for-power-equipment/10.1117/12.3011954.full) reports up to 99.67% (excerpt).
- **Field figures come from weak sources.** A [blog guide](https://convertandedit.com/blog/equipment-nameplate-photo-ocr-service-manual-guide/) gives 90 to 95% with preprocessing and 75 to 85% without, unsourced. A [vendor case study](https://ncircletech.com/case-studies/a-leading-facility-management-firm-reduced-data-errors-by-70-with-ncircle-techs-machine-learning-based-ocr) claims 70% fewer errors than manual copying.
- **No benchmark found** for switchgear or panel schedules specifically.
- **A wrong digit is the failure to design for.** A misread 800 A vs. 600 A looks perfectly plausible. (Inference.) So a person confirms every rating against the photo side by side. Deterministic plausibility checks can flag values outside standard ratings or a voltage that conflicts with the bill, but they don't replace the person.

## Reading SLDs

- **Symbol detection only:** YOLO-based work reaches [about 95%](https://doaj.org/article/d8f4084cb8af4543826da589c01a89ef) (excerpt) on datasets its authors note aren't publicly available. High symbol scores say nothing about how the symbols connect. Complex SLDs have [abundant knotted lines](https://repository.li.mahidol.ac.th/handle/123456789/88836) (excerpt from a Mahidol paper; the direct fetch returned no text, so re-check the citation before quoting it).
- **LLMs recover connectivity poorly on the closest benchmark I found.** [OmniSch (2026)](https://arxiv.org/html/2604.00270v3) tested models including GPT-5.2, Claude Sonnet 4.6, and two Gemini models. Symbol F1 on real schematics ran from 52.76% (GPT-5.2) to 66.36% (Gemini 2.5 Flash), against 96.67% for a human engineer. The best net-detection F1 was 27.44%. These are PCB schematics, not power SLDs, so this is an analog, and clean exports rather than scans. A scan may do worse. (Inference.)
- **Not found:** any LLM benchmark on power single-line diagrams.

**Recommended use (inference):** Extract the title block, date, revision, and printed ratings as drafts, each tied to a page region, and let an engineer confirm. Don't auto-build a connectivity graph, and don't let one drive a decision. An old SLD may also simply be out of date, so its drawing date belongs in the record.

## Utility data

Confirmed: **all three utilities have a Green Button-style route, but they're not equal.**

| | National Grid MA | Eversource MA | PG&E |
|---|---|---|---|
| Automated route | [Green Button Connect via UtilityAPI](https://utilityapi.com/docs/utilities/nationalgrid); register with National Grid, sandbox first, then its review before live | [Green Button OAuth](https://utilityapi.com/docs/utilities/evrsrcma); sandbox, then Eversource review. Describes data for customers **"with smart meters"** | [Share My Data](https://www.pge.com/en/save-energy-and-money/energy-saving-programs/smartmeter/third-party-companies.html), which lists commercial customers as users |
| Works for C&I? | **Unresolved.** The UtilityAPI page mentions only a commercial test account | **Unresolved.** Same, and the smart-meter wording could exclude sites without AMI | **Yes per PG&E**: commercial customers generally at "15-minute interval level" |
| Who authorizes | Customer, by OAuth | Customer, by OAuth with single sign-on | Any customer with an active Service ID; online, or a signed form submitted on their behalf |
| Vendor requirements | Registration and utility review | Registration and utility review | EIN, TLS 1.2 certificate (no self-signed), mutual SSL, passing tests |
| Non-API fallback | [Energy Profiler Online](https://www.nationalgrid.com/us/ma/electric/business/ways-to-save/energy-saving-programs/energy-profiler-online) for accounts with interval meters (excerpt) | Energy Profiler Online, per [Nectar](https://nectarclimate.com/utilities/eversource-ma) (excerpt, third party) | Share My Data signed form |

**Worth knowing**

- **National Grid's data isn't billing quality.** Its [own page](https://www.nationalgrid.com/us/ma/electric/business/ways-to-save/energy-saving-programs/energy-profiler-online) says interval data may not match the monthly bill, and gaps may occur when it can't reach the meter (excerpt). So a mismatch between the bill and the interval peak is an expected state for the record, not automatically an error.
- **A free route exists in Massachusetts.** National Grid's [Massachusetts form](https://www.nationalgridus.com/media/pdfs/bus-ways-to-save/ma-new-customer-interval-data-enrollment-form.pdf) (revised September 2021) says the first 2-week access per account per calendar year has no charge, whether requested by the customer or a third party. After that it lists $165 for two weeks and $243 for a year. The customer signs. It looks like the cheapest first step for a one-time data pull, but confirm the current tariff. (Inference on usefulness; turnaround not found.)
- **AMI is still rolling out,** per [Nectar](https://nectarclimate.com/utilities/massachusetts-electric-national-grid) (excerpt, third party): National Grid 500,000+ of about 1.4 million by April 2026, finishing around end of 2027; Eversource started Western MA in July 2025. Whether large C&I accounts already have separate interval meters, and whether those flow through Green Button Connect, wasn't confirmed. **Ask EQORE this directly.** It already [asks customers](https://www.eqore.com) for bill and interval data, so it knows which route works.
- **Policy status isn't settled.** The [Green Button Alliance](https://www.greenbuttonalliance.org/news/2024-10-leading-edge-energy-data-access-initiatives-progress-in-us) reported in October 2024 that the DPU was reviewing the AMI workgroup report, and I found no later order in 2 searches.
- **Aggregator coverage.** UtilityAPI [lists all three](https://utilityapi.com/docs/utilities). Its [PG&E page](https://utilityapi.com/docs/utilities/pge) still lists username and password as the login, so ask which route it uses. Arcadia [names PG&E](https://www.arcadia.com/blog/1-year-plug-intervals) in its fast-interval tier but not National Grid or Eversource, and [its coverage page](https://docs.arcadia.com/changelog/provider-coverage-page-in-dashboard) sits behind a login. C&I coverage isn't confirmed for either vendor. Pricing wasn't checked.

**kW or kWh?**
- [Green Button XML](https://utilityapi.com/docs/greenbutton/xml) declares its own unit: `uom` 72 is Wh, 38 is W, with `powerOfTenMultiplier`, `intervalLength` in seconds, `flowDirection`, and a per-interval `ReadingQuality`.
- [UtilityAPI JSON](https://utilityapi.com/docs/api/intervals) returns `kwh`, plus demand as a `max` datapoint in kW.
- PG&E's billing data includes "Demand (as applicable)". Its interval unit isn't stated on the page I read.
- **So the normal case is energy per interval, not power.** A 15-minute reading in kWh × 4 equals the average kW over that interval. The parser must read the declared unit and never assume. That is a clean deterministic check, and this CLAUDE.md rule is directly testable. (Inference on the conversion.)

**Estimated values.** Arcadia says its normalized API [fills gaps using a machine-learning model](https://www.arcadia.com/blog/1-year-plug-intervals), with "accuracy typically exceeding 90%" (vendor claim), and that post doesn't describe how estimates are flagged. Peak demand is exactly what a gap-filled series can get wrong. (Inference.) Keep filled values as `inferred`, never as metered, and ask how to tell them apart before relying on the vendor.

**Bill parsing.** Vendors claim [up to 99%](https://klearstack.com/utility-bill-data-extraction) or [95%+](https://getomni.ai/documents/utility-bills), with no method shown. [Docsumo's own docs](https://support.docsumo.com/docs/utility-bill-1) name complex tables and varied layouts as failure points (excerpt). I found no independent benchmark for commercial bills, or for the demand, rate schedule, and meter number fields. Score our own small labeled set if the demo needs a number.

## What can't be closed without a person

Safety rule, confirmed: under [OSHA 1910.333](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.333), "Only qualified persons may work on electric circuit parts or equipment that have not been deenergized", and exposed live parts must generally be deenergized before an employee works on or near them. [NFPA 70E's definition](https://iaeimagazine.org/columns/nfpa-code-talk/keeping-electrical-inspectors-safe-on-the-job-with-planning-and-nfpa-70e/) of a qualified person requires demonstrated skills and safety training. The same IAEI article says that for opening or removing covers "an individual must be a qualified person or accompanied by a qualified person", and that a license alone doesn't make someone qualified. Practitioner [sources](https://www.allumiax.com/blog/should-you-open-energized-panel-covers) report higher arc-flash likelihood when removing a bolted cover from an energized panel (secondary).

**Rule for any guided flow (recommendation):**
- Facility staff photograph only what is visible with **all doors and covers closed**: exterior nameplates, labels, posted schedules, the room, the meter.
- The app's prompts never ask anyone to open, unbolt, or reach into electrical equipment, and warn them not to.
- If a required value is behind a door, the flow ends with "needs qualified person" and the record shows why.
- Whether opening a hinged door with a dead-front in place is acceptable is for the facility's qualified electrician. The sources I found on this are forum posts, not the standard itself.
- Have an EQORE engineer review this wording before any real use. This isn't legal or safety-compliance advice.

**Fields that need a person (inference, confirm with EQORE):**

| Field | Why remote fails | Who |
|---|---|---|
| Bus rating, lug capacity, tap space, spare positions when not on an exterior label | Inside energized gear | Qualified electrician, ideally during a planned outage or under their own procedure |
| Actual conductor sizes and condition | Internal | Qualified electrician |
| Measured load on a service without interval data | Requires instruments on live equipment | Qualified electrician |
| Tie-in point | An engineering decision, even with perfect data | Engineer, per CLAUDE.md |
| Available fault current | Comes from the utility or a study, not a photo | Engineer, utility |
| Final clearance dimensions near a code limit | Phone screening isn't enough | Anyone trained with a tape or laser, then an engineer |
| Pad bearing and underground utilities | Not visible from the surface | Contractor |
| Roof or wall structural capacity | [Remote surveys can't reliably assess it](https://www.surgepv.com/glossary/remote-site-survey) (solar vendor, analog) | Structural engineer |

The same solar source says "full electrical assessment requires on-site verification". That matches this list, though it is a vendor glossary. Its time and percentage claims aren't used here, since they are residential-solar and unsourced.

**Does capture count as "stepping on site"?** The brief says "as much as possible without anyone stepping on site". A facility manager is already there, so I read guided capture as meeting the intent, because no one from EQORE travels. That reading is mine, so **ask EQORE**. Also, the brief says "what facilities send us is often limited". So the flow can't assume full compliance: it has to accept partial capture, and show exactly what's still open. A method that needs a motivated FM is a risk to test, not a solved step.

| Method | Anyone at the site? | Fit with the brief |
|---|---|---|
| Bills, utility data, drawings | No | Full |
| Photo checklist, remote video | Facility staff only, already there | Good, pending EQORE's view |
| Phone lidar by the FM | Facility staff, with a capable device and care | Fair: most FMs may not own one (inference) |
| Phone lidar or Matterport by EQORE | Yes | Doesn't meet the goal, but may shorten a visit |
| Drone | Yes, a pilot | Doesn't meet the goal unless already combined with another trip |

## How it fails, and how the record labels it

Status values come from CLAUDE.md. "Capture method" is a separate attribute, so the record stays standardized "regardless of how the data was collected". This schema sketch is for the schema owner (D5), not a change.

| Failure | Label |
|---|---|
| Photo too blurry, glare over the rating, cropped | `unreadable`, keep the photo, ask for a retake with a specific instruction |
| Value read by vision or OCR, not yet confirmed | `inferred`, with image region and method |
| Person confirmed against the photo | `verified`, naming who and when |
| Nameplate says one thing, SLD another | `conflicting`, keep both, never auto-pick |
| Bill demand vs. interval peak differ | `conflicting` for a person to review. Could be legitimate: ratchets, on-peak windows, non-billing-quality data |
| Interval gap | The gap itself is `missing`. Never silently fill it |
| Vendor-filled intervals | `inferred`, kept separate from metered values |
| Unit undeclared or ambiguous | `unreadable` until a person resolves it. Never assume |
| Phone-lidar distance | `inferred`, with method and a reference-length check if present |
| Old drawing, no date or revision | `inferred`, with date unknown noted |
| Behind a closed door, no qualified visit yet | `missing`, plus a route of "needs qualified person" |
| Authorization refused, or meter not covered | `missing`, with the reason and fallback route |
| Instructions embedded in a document or a photo | Treated as data. Never followed, per CLAUDE.md |

Each value should carry: status, value and unit, source ID, capture method, stated accuracy and its source (null if none is known), captured by (role), captured at, the source region if any, and verified by. A correction adds a new version and never overwrites the original.

Keeping stated accuracy on the value lets a later step reject a dimension that isn't good enough. **No published drafter tolerance was found** (neither this lane nor plan-set-bridge so far), so the rejection threshold can't be set from a source yet. Ask EQORE. Studies report accuracy for a device and setup, not for a given value, so a study figure shouldn't be copied in as that value's stated accuracy without saying so.

## Software vs. hardware read for D9

**Recommendation: software first. No hardware to buy or build for the prototype.**

- **The gaps are mostly document and permission gaps.** The coverage table shows documents, photos, and account authorization covering the load fields and most electrical fields. A sensor adds mainly geometry, and that also overlaps with what the remote-sensing lane may provide at site scale. (Inference.)
- **"Hardware" that matters is already in people's pockets.** A guided phone flow needs no new device. Lidar phones are an optional upgrade, handled as one more capture method in the same record.
- **A measured-hardware story isn't available yet.** With a factor-of-ten spread and no electrical-room test, a hardware pitch would rest on a number we'd have to measure ourselves. If a team member has a device, that's an interesting small experiment: scan a real room next to tape measurements and report only that. It would be new evidence, and it fits "measure only what the prototype demonstrates".
- **Drones and Matterport fit EQORE's already-on-site visits better than its goal of avoiding them.** They could shorten a visit, a separate value proposition. (Inference.)

## Recommendation by method

**Use in demo**

| Method | Why |
|---|---|
| Bills via PDF parsing, as labeled synthetic | Closes rate schedule, meter number, and billing demand, and sets up a bill-vs-interval conflict |
| Green Button sample files and CSV | The unit is declared and testable. Free, with no registration wait |
| Guided photo checklist with deterministic checks | Closes the electrical-room gap as far as safely possible, with a "doors closed" rule that shows domain judgment |
| Nameplate extraction with side-by-side human confirmation | Exactly the demo loop in CLAUDE.md: evidence, issue, human correction, state change |
| Customer-drawing and SLD draft extraction, title block and ratings only | Honest about limits, and creates real conflicts with nameplates |
| "Needs qualified person" routing | Admits the limit openly, which is more credible than claiming to close everything |

**Stretch**

| Method | Why |
|---|---|
| Phone lidar with a tape-reference check | Only if a teammate has the device. Show it as a measured, labeled screen |
| Remote video walkthrough | Useful in practice, weak on stage. Could simply attach as another evidence type |
| UtilityAPI sandbox | The test accounts include a commercial scenario, but registration comes with the utility first. Try only after the core loop works |
| Live PG&E Share My Data | Needs an EIN, a certificate, and testing. Real-world path, not a hackathon one |
| SLD connectivity graph | A research problem on the current evidence. Show only with human redraw, if at all |

**Avoid**

| Method | Why |
|---|---|
| Asking facility staff to open equipment | Safety. Non-negotiable |
| Matterport Pro3 | Cost and little that a phone can't already show in the demo |
| Drone flight | Pilot and venue risk, and it doesn't advance the goal of no one on site |
| Treating vendor gap-filled or LLM-read values as facts | Breaks the source-evidence and deterministic-check rules |
| Claiming a time saving | No sourced time exists for most of these. EQORE must supply the "before" |

## Questions for EQORE

1. Does a facility manager taking photos count as "no one on site"?
2. Which data route works today for National Grid and Eversource C&I accounts, and do these accounts come back through Green Button Connect, Energy Profiler Online, or a customer export?
3. Which electrical fields, on a recent project, could only be closed inside the gear? Who collected them?
4. What photos or nameplates do you request now, and how often do you get usable ones?
5. Can we have a redacted SLD, bill, and interval file? The plan sets would also give ground truth for extraction tests.

## Not found

- Any phone-lidar test in an electrical room or at switchgear (2 searches)
- Sourced capture times for phone lidar, guided checklists, video walkthroughs, or SLD reading
- Any independent benchmark for commercial bill parsing
- Any published benchmark for reading panel schedules or switchgear nameplates in the field
- An LLM benchmark on power single-line diagrams
- Confirmation of C&I coverage in Green Button Connect for National Grid MA or Eversource MA
- PG&E's interval unit on the page read, and turnaround time on National Grid's interval form
- A DPU order after October 2024 on Green Button Connect (2 searches)
- Drone site-survey accuracy at C&I sites (1 search returned only regulations)
