# BESS siting rules for a behind-the-meter C&I site in Massachusetts

Research date: 2026-11-07. Machine-readable rule set: [`fixtures/bess-siting-rules.json`](../../fixtures/bess-siting-rules.json) (44 rules).

Baseline: 250 kW / 760 kWh Gotion EDGE760 outdoor cabinet on an 11.5 × 14 ft pad, with a 500 kVA isolation transformer, two inverters, and a 400 A disconnect. It connects behind the meter through a new 400 A breaker in the main distribution panel (MDP). In the reference plan set, the pad is about 80 ft of conduit from the MDP, across a private driveway.

## Summary

- **The fire code is NFPA 855 (2020), not the IFC.** Massachusetts' fire code, 527 CMR 1.00, adopts NFPA 1 (2021), whose Chapter 52 points to NFPA 855 (2020). Two Massachusetts code reports confirm this (Code Red for Pembroke, Dec 2025; Fire & Risk Alliance for Worthington, May 2026). IFC 2021 1207.8 has the same distances and is cited only as a cross-reference.
- **10 ft from exposures is the main hard rule.** That means 10 ft from buildings, lot lines, public ways, stored combustibles, and similar exposures (NFPA 855 4.4.3.3), plus 10 ft from means of egress (4.4.3.4). Exceptions reduce it to 3 ft: a 1-hour barrier, a 2-hour wall with no openings, a 2-hour enclosure, or UL 9540A test results the AHJ accepts.
- **A 760 kWh cabinet near exposures needs a permitting exception.** It exceeds the 600 kWh limit for locations near exposures (NFPA 855 4.8) and the 50 kWh grouping (4.6). Within 100 ft of a building, lot line, or public way, the AHJ must approve a hazard mitigation analysis (HMA) and UL 9540A results. Pembroke took that route. A "remote" spot more than 100 ft from all exposures avoids the exception but lengthens the run. The tool should show the trade-off, not pick a side.
- **Voltage drop doesn't limit the run length at this size. Cost does.** At 400 A, one set of 500 kcmil copper loses 1% of 480 V at about 257 ft (computed). The reference 80 ft run loses about 0.23%. The search radius is therefore set by cost: search 250 ft, prefer 150 ft or less.
- **Utility clearances are confirmed for Massachusetts utilities.** Eversource (EMA) keeps 10 ft clear in front of a pad-mount transformer and 4 ft at the sides and back. National Grid keeps 10 ft in front of transformer doors and 10 ft around the pad for most objects. The 3 ft side clearance in the brief belongs to other utilities.
- **No code sets a slope limit for a pad.** The 5% and 10% thresholds below are heuristics and are labeled that way.

**Evidence labels** used in this note and in each rule's `notes`:

- **CONFIRMED:** read on the source page or in a document that quotes it, this session.
- **SECONDARY:** read only in a summary, such as a town page, study guide, or blog.
- **NOT RE-READ:** standard code text cited from knowledge and not reopened this session.
- **INFERENCE:** the author's judgment or arithmetic.

## Rule table

Kinds:

- **X** is a hard exclusion, subtracted from the area.
- **C** is a conditional zone: drawn separately and usable only with a documented exception.
- **P** is a preference, scored.
- **F** is a flag: a permit or person route.

| ID | Rule | Distance | Kind | Public-data layer | Source | Evidence |
|---|---|---|---|---|---|---|
| fire.exposure_buildings_10ft | ESS ≥ 10 ft from buildings | 10 ft | X | Building footprints | NFPA 855 (2020) 4.4.3.3; IFC 1207.8.3 | CONFIRMED |
| fire.exposure_lot_lines_10ft | ≥ 10 ft from lot lines | 10 ft (+5 ft parcel error) | X | Assessor parcels | same | CONFIRMED; error margin is INFERENCE |
| fire.exposure_public_ways_10ft | ≥ 10 ft from public ways | 10 ft from ROW line | X | Roads and frontage parcel line | same | CONFIRMED; ROW-line choice is INFERENCE |
| fire.exposure_other_hazards_10ft | ≥ 10 ft from stored combustibles, hazmat, high-piled stock | 10 ft | X | Imagery, marked by a person | same | CONFIRMED |
| fire.exposure_absolute_3ft | 3 to 10 ft band usable only with an exception (barrier, 2-hr wall, 2-hr enclosure, 9540A) | 3 ft | X inside 3 ft; C from 3 to 10 ft | same | 4.4.3.3 exceptions; IFC 1207.8.3 Exc. 1-3 | CONFIRMED |
| fire.egress_10ft | ≥ 10 ft from any means of egress; 3 ft with large-scale fire testing | 10 ft | X | Doors and egress paths (not public; marked from Street View) | NFPA 855 4.4.3.4; IFC 1207.5.8 | CONFIRMED |
| fire.remote_outdoor_100ft | More than 100 ft from buildings, buildable lot lines, public ways, and other exposures counts as "remote" | 100 ft | P (bonus) | Buildings, parcels, roads | NFPA 855 4.4.3.1; IFC 1207.8.1 | CONFIRMED |
| fire.max_stored_energy_600kwh | Near exposures: ≤ 600 kWh Li-ion unless the HMA and 9540A are approved | n/a | F | Configuration and zone class | NFPA 855 4.8, Table 4.8; IFC 1207.5.2 | CONFIRMED |
| fire.group_50kwh_3ft | Near exposures: groups ≤ 50 kWh, 3 ft apart, unless 9540A supports otherwise | 3 ft | F | Configuration | NFPA 855 4.6; IFC 1207.5.1 | CONFIRMED |
| fire.max_cabinet_size | Cabinet ≤ 53 × 8.5 × 9.5 ft | n/a | X (product check) | Datasheet | NFPA 855 4.4.3.2 | CONFIRMED |
| fire.vegetation_10ft | Clear combustible vegetation within 10 ft | 10 ft | P | Land cover, tree canopy | NFPA 855 4.4.3.6 | CONFIRMED |
| fire.combustible_storage_3ft | No combustible storage within 3 ft | 3 ft | X | Imagery | NFPA 855 4.1.6 | CONFIRMED |
| fire.access_road_150ft | Fire apparatus access road within 150 ft of all parts of the facility | 150 ft | X | Drivable surfaces ≥ 20 ft wide | NFPA 855 4.4.3.8; NFPA 1 (2021) 18.2.3.2.2 | CONFIRMED |
| fire.access_road_keep_clear | Pad and bollards don't narrow an access road below 20 ft wide or 13 ft 6 in clear height | 20 ft | X | Drive aisles, driveways, fire lanes | NFPA 1 18.2.3.5.1.1, .1.2 | CONFIRMED; "every aisle is an access road" is INFERENCE |
| fire.water_supply | Permanent water supply or AHJ waiver; hydrants accessible | n/a | F | Hydrants (OSM, town GIS) | NFPA 855 4.13 / 4.9; 527 CMR 18.5 | CONFIRMED (section numbers differ between the two reports) |
| fire.vehicle_impact | Impact protection where vehicles could hit the ESS; bollards if within 10 ft of a traveled way with no curb | 10 ft | P (cost and area) | Parking, aisles, curbs | NFPA 855 4.3.7; IFC 1207.4.5 → 312; Eversource C3802; National Grid ESB 759B §11 | CONFIRMED; 10 ft trigger for a BESS is INFERENCE (it comes from the transformer standard) |
| elec.working_space | NEC working space at door sides: 3, 3.5, or 4 ft at 151-600 V to ground; width ≥ 30 in or the equipment width | 4 ft | X (envelope) | Pad layout | NEC 110.26(A), via 527 CMR 12.00 (NEC 2023) | SECONDARY |
| elec.run_preferred_150ft | Prefer routed run ≤ 150 ft | 150 ft | P | Anchor (MDP or service entrance) | Computed; reference plan set | INFERENCE |
| elec.run_search_cap_250ft | Search only within 250 ft straight line | 250 ft | X (search cap) | Anchor | Computed from NEC Ch. 9 Table 9 | INFERENCE |
| elec.voltage_drop | VD = √3·I·Z·L/1000; recommended ≤ 3% for feeders | formula | P | Computed | NEC 215.2(A) informational note | NOT RE-READ |
| elec.poi_120pct | Load-side breaker valid only if 1.25 × I_inv + main OCPD ≤ 1.2 × busbar; otherwise the anchor moves to a supply-side connection | n/a | X (anchor choice) | MDP nameplate (site photo) | NEC 705.12(B)(3)(2), 705.11 | NOT RE-READ |
| elec.trench_crossings | Penalty per aisle or driveway cut | n/a | P | Impervious surface, aisles | — | INFERENCE |
| util.padmount_front_10ft | 10 ft clear in front of the utility transformer's doors | 10 ft | X | Transformer from imagery | Eversource C3802 Fig. 1; National Grid ESB 759B §10 | CONFIRMED |
| util.padmount_sides_4ft | 4 ft clear at sides and back | 4 ft | X | Transformer from imagery | Eversource C3802 Fig. 1 | CONFIRMED (Eversource EMA, 2002) |
| util.padmount_objects_10ft | BESS pad ≥ 10 ft from the utility transformer pad | 10 ft | X | Transformer from imagery | National Grid ESB 759B §9A, by analogy | CONFIRMED for listed objects; applying it to a BESS is INFERENCE |
| util.overhead_line_10ft | ≥ 10 ft horizontally from overhead lines up to 50 kV (crane set) | 10 ft | X | OSM power lines; poles in imagery | 29 CFR 1926.1408 Table A | CONFIRMED |
| util.overhead_line_20ft | Prefer ≥ 20 ft (Option 2, voltage unconfirmed) | 20 ft | P | same | 29 CFR 1926.1408(a)(2) Opt. 2 | CONFIRMED |
| env.wetland_resource_area | Not in a wetland resource area | 0 ft | X | MassDEP Wetlands | 310 CMR 10.02(1) | SECONDARY |
| env.wetland_buffer_100ft | Within 100 ft: Conservation Commission filing (RDA or NOI); local no-disturb zones may apply | 100 ft | P (heavy) + F | MassDEP Wetlands buffered 100 ft | 310 CMR 10.02(2)(b) | SECONDARY |
| env.riverfront_200ft | Riverfront Area: 200 ft, or 25 ft in Boston, Brockton, Cambridge, Chelsea, Everett, Fall River, Lawrence, Lowell, Malden, New Bedford, Somerville, Springfield, Winthrop, Worcester | 200 / 25 ft | X (undeveloped) | MassDEP hydrography, municipality | 310 CMR 10.58(2)(a)3 | CONFIRMED |
| env.riverfront_previously_developed | Pre-1996 degraded (paved) riverfront may be redeveloped if conditions improve | 200 / 25 ft | P (heavy) + F | Impervious surface, historic imagery | 310 CMR 10.58(5) | CONFIRMED |
| env.flood_v_coastal_a | Exclude V/VE and Coastal A | n/a | X | FEMA NFHL, LiMWA | 780 CMR 10th ed. via ASCE 24 | INFERENCE (as an exclusion) |
| env.flood_a_zone | A/AE/AO: elevate equipment ≥ BFE + 2 ft | n/a | P (cost) + F | FEMA NFHL, lidar | 780 CMR 10th ed.; ASCE 24 Table 7-1 | SECONDARY |
| env.slope_preference | Footprint slope: ≤ 2% best, 2-5% minor grading, > 5% flag | n/a | P | MassGIS lidar DEM | — | INFERENCE |
| env.slope_exclusion_10pct | Footprint slope > 10% excluded | n/a | X | Lidar DEM | Analogy to access-road grade ≤ 10% (NFPA 1 18.2.3.5.6.1, MA amendment) | INFERENCE |
| env.noise_massdep | ≤ 10 dB(A) over ambient L90 at the property line and nearest residence; no pure tone | computed | P + F | Residential abutters (assessor use codes), equipment dBA | 310 CMR 7.10; DAQC Policy 90-001 | SECONDARY; a 2026 revision is pending |
| zoning.setbacks | District setbacks and height | town value | X once entered | Zoning layer and by-law table (person route) | Local by-law; NYSERDA model Tier 2 | CONFIRMED for NYSERDA only |
| zoning.screening_front_yard | Prefer screened, not in front of the building | n/a | P | Buildings, roads | NYSERDA model Tier 2 "screening and visibility" | CONFIRMED (NY model); scoring is INFERENCE |
| site.parking_stalls | Penalty per stall lost (about 3-4 for this pad) | n/a | P | Parking polygons | — | INFERENCE |
| site.drive_aisles_loading | Exclude aisles, loading aprons, dumpster enclosures | n/a | X | Imagery, OSM | — | INFERENCE |
| site.existing_pavement | Prefer existing pavement or gravel outside stalls and aisles | n/a | P | MassGIS impervious surface | — | INFERENCE |
| site.underground_utilities | Flag visible manholes, catch basins, valves | n/a | F | Imagery | ESB 759B §9A by analogy; Dig Safe | INFERENCE |
| site.pad_fit | Pad, working space, and bollard ring fit inside the feasible area | n/a | X | Computed | — | algorithm |
| site.same_side_as_service | Tie-breaker: same side as the electrical room | n/a | P | Footprint, service entrance | Reference plan set | INFERENCE |

## Recommended algorithm

All steps are deterministic geometry on projected coordinates (EPSG:26986, Massachusetts State Plane, meters, converted to feet). Every output zone records which rules produced it, and the result is a draft for an engineer, never an approved location.

**1. Anchor.** Use the point of interconnection: the inferred MDP or electrical-room wall point. If that is unknown, fall back in this order, recording the confidence:

1. The service entrance (meter or service conductors entering the building).
2. The building wall nearest the utility pad-mount transformer or service pole.

If `elec.poi_120pct` fails once the panel nameplate is known, move the anchor to the service entrance.

**2. Search area.** Use a disc of 250 ft (straight line) around the anchor, intersected with the parcel polygon.

- **Why 250 ft:** at the full 400 A rating, one set of 500 kcmil Cu reaches 1% voltage drop at about 257 ft, so no voltage-drop upsizing is needed anywhere inside the disc.
- **Preferred ring:** 150 ft routed, about twice the reference project's 80 ft.
- **Disc too small:** if the disc minus exclusions is empty, report "no zone within 250 ft" and stop. Don't widen the disc silently.

**3. Subtract hard exclusions.** Apply each buffer to its layer and take the union:

| Layer | Buffer |
|---|---|
| Buildings | 10 ft |
| Lot lines | 10 ft, plus a 5 ft parcel-error margin |
| Public right-of-way | 10 ft |
| Other marked exposures | 10 ft |
| Known egress doors and paths | 10 ft |
| Utility transformer | 10 ft in front and 4 ft at the sides, or 10 ft all round if the door side is unknown |
| Overhead lines | 10 ft |
| Wetland resource areas | 0 ft |
| Undeveloped Riverfront Area | 200 ft, or 25 ft in listed cities |
| FEMA V/VE and Coastal A zones | whole zone |
| Footprint slope | cells over 10% |
| Drive aisles, fire lanes, loading aprons | whole surface |
| Zoning setbacks | once a person enters them |

Keep the 3-10 ft band around buildings, lot lines, and public ways as a separate **conditional** layer. Drop it from the default result, and draw it when the user says an exception applies.

**4. Classify what remains.**

- **Remote:** every point more than 100 ft from buildings, buildable lot lines, and public ways.
- **Near exposures:** everything else. For the 760 kWh EDGE760, tag these zones "needs HMA + UL 9540A + AHJ approval" (NFPA 855 4.6 and 4.8).

Also attach these flags:

- Wetland buffer (100 ft): Conservation Commission filing.
- Previously developed riverfront: needs a Notice of Intent.
- FEMA A, AE, or AO zone: elevate to BFE + 2 ft.
- Residential abutter within the noise screening distance: noise study.

**5. Fit the pad.** The envelope is the 11.5 × 14 ft pad, plus 4 ft of working space on door sides (confirm against the pad drawing; skip it if the pad already includes it), plus about 3 ft for a bollard ring on any side within 10 ft of a traveled way or parking.

- **Rotations:** test the nearest building wall's angle, the parking grid's angle, and 15° steps.
- **Feasible positions:** erode the feasible polygon by the envelope (a Minkowski difference), or test envelope containment on a 2 ft grid of candidate centers.

**6. Score each feasible placement.** Higher is better. Default weights are INFERENCE and tunable.

| Term | Measure | Default |
|---|---|---|
| Run length | routed = 1.25 × straight-line + 20 ft | −1 per ft over 0; −0.5 extra per ft over 150 |
| Pavement | share of envelope on existing pavement or gravel | +60 × share |
| Vegetation | trees within 10 ft (canopy area) | −2 per 10 ft² of canopy |
| Parking | stalls taken | −15 per stall |
| Crossings | aisles or driveways the trench cuts | −20 per crossing |
| Slope | footprint slope s | 0 if s ≤ 2%; −10 per % from 2 to 5; −25 per % over 5 |
| Bollards | needed on any side | −15 |
| Overhead line | 10-20 ft band | −20 |
| Screening | in front of the street-facing wall | −30 |
| Remote class | all points > 100 ft from exposures | +40 for a configuration over 600 kWh; 0 otherwise |
| Noise | predicted Lp at the residential lot line exceeds ambient + 10 | −50 and flag |
| Same side as service | tie-breaker | +5 |
| Flags (wetland buffer, flood A, riverfront redevelopment) | — | −40 each |

**7. Place the pad.** Return the top placement plus two runners-up at least 30 ft apart. For each, give:

- the score terms that produced it;
- every rule that bound it, with its citation;
- every check that couldn't run for lack of data: door locations, the fire lane plan, the panel nameplate, zoning setbacks, buried utilities, ambient noise.

## Check against the reference project (INFERENCE, not compared with the plan set's sheets)

An 80 ft run beside the electrical room places the pad well within 100 ft of the building, so it is **near exposures**. Under the rules above, that spot is acceptable only if:

- it is at least 10 ft from the building and from egress doors, or the drawings document a 3 ft exception;
- the 760 kWh cabinet carries an HMA and UL 9540A approval;
- it keeps the driveway at 20 ft clear, if the driveway serves as fire access;
- it has bollards if it's within 10 ft of the driveway.

The driveway crossing counts as one trench crossing.

The demo should check these against the real plan set's site sheet before claiming agreement.

## Source notes

### Confirmed

- **Massachusetts adoption chain.** Code Red Consultants, *Pembroke ESS Code Compliance Report*, Dec 3 2025, says "527 CMR 1.00 … adopts an amended version of the 2021 Edition of NFPA 1 … relies on … the 2020 Edition of NFPA 855." The electrical code is 527 CMR 12.00, NEC 2023 with amendments. Source: https://www.pembroke-ma.gov/DocumentCenter/View/7662/Palmer-Capital---Pembroke-ESS-Code-Complaince-Report
- **NFPA 855 (2020) section numbers.** Fire & Risk Alliance, *Worthington BESS Draft HMA Rev B*, 2026, quotes these sections. Source: https://worthington-ma.us/wp-content/uploads/2026/05/2026-5-12-26-0417-MA-Worthington-Ridge-Rd-BESS-HMA-mjd.pdf

  | Section | Topic |
  |---|---|
  | 4.4.3.1 | Remote vs. near exposures |
  | 4.4.3.2 | Maximum cabinet size |
  | 4.4.3.3 | Clearance to exposures, 10 ft |
  | 4.4.3.4 | Egress, 10 ft, or 3 ft with testing |
  | 4.4.3.6 | Vegetation, 10 ft |
  | 4.4.3.7 | Enclosures |
  | 4.4.3.8 | Access roads |
  | 4.1.6 | Combustible storage, 3 ft |
  | 4.3.7 | Impact protection |
  | 4.6 | 50 kWh groups, 3 ft apart |
  | 4.8 | 600 kWh near exposures |
  | 4.13 | Water supply |

  The same report quotes NFPA 1 (2021) 18.2.3.2.2 (150 ft), 18.2.3.5.1.1 and .1.2 (20 ft wide, 13 ft 6 in clear height), 18.2.3.5.3.1 (25 ft inside turning radius, MA amendment), and 18.2.3.5.6.1 (10% grade, MA amendment). The Pembroke report gives the 4.4.3.3 exceptions in full and shows a Massachusetts project above 600 kWh taking the HMA route.
- **IFC 2021 1207.8 cross-reference.** The 2022 California Fire Code text based on IFC 2021, via gocodebook, gives:

  | Section | Rule |
  |---|---|
  | 1207.8.1 | Remote: more than 100 ft |
  | 1207.8.3 | 10 ft, with three 3 ft exceptions |
  | 1207.8.4 | Exterior-wall units ≤ 20 kWh, 5 ft from openings |
  | 1207.5.8 | Egress ≥ 10 ft |
  | 1207.4.5 | Vehicle impact → IFC 312 |
  | Table 1207.5 | Li-ion 600 kWh |

  Washington's certified WAC 51-54A-1207 confirms Table 1207.5 (600 kWh) and 1207.5.1 (50 kWh, 3 ft). Sources: https://gocodebook.com/library/us/ca/ca-fire-code/chapter-12-energy-systems/section-1207-electrical-energy-storage-systems-ess and https://lawfilesext.leg.wa.gov/Law/WACArchive/2024/pdf/WAC%20%2051%20-%2054A%20CHAPTER/WAC%20%2051%20-%2054A-1207.pdf. Massachusetts doesn't adopt the IFC as its fire code.
- **Eversource (NSTAR) C3802, 20 Mar 2002**, "Recommended minimum clearances from three-phase distribution transformer foundation…": https://www.eversource.com/Content/docs/default-source/ema---pdfs/c3802.pdf?sfvrsn=0
  - 10 ft clear in front and 4 ft at the sides and back.
  - Vehicle posts if there's no curb or the transformer is within 10 ft of a traveled way: 4 in pipe, 42 in above and below grade.
  - No transformer within 20 ft outward and 10 ft to either side of a door, or 10 ft outward and 3 ft to either side of a window.
  - Above 100 kVA against a combustible wall: 10 ft from the wall.
  - 20 ft from fire escapes.
- **National Grid ESB 759B, July 2010**: https://www.nationalgridus.com/media/pronet/shared_constr_esb759b.pdf
  - §9A: 10 ft from the pad free of buried lines, hydrants, and enclosed generators.
  - §9B: 25 ft free of fuel tanks and open-conductor lines. A barrier reduces either to 5-10 ft.
  - §10: within 10 ft of a vehicular way, with 10 ft clear in front of doors.
  - §11: bollards of 6 in minimum, 5 ft above and 4 ft below grade.
  - The §8 building-clearance figure is an image, and its numbers weren't extracted.
- **OSHA 29 CFR 1926.1408**: Option 2 is a flat 20 ft. Table A sets 10 ft up to 50 kV and 15 ft over 50 to 200 kV. https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.1408
- **310 CMR 10.58(2)(a)3 and (5)**: Riverfront Area of 200 ft, or 25 ft in 14 listed cities including Worcester. Pre-1996 degraded areas may be redeveloped. Amended effective 10/24/2014. https://www.law.cornell.edu/regulations/massachusetts/310-CMR-10-58
- **NYSERDA BESS Model Local Law** (April 2022 training copy):
  - Tier 1 is 600 kWh or less; Tier 2 is over 600 kWh.
  - Tier 2 uses the district's setbacks for principal structures, a 7 ft fence, and minimized views.
  - Noise: 60 dB, 1-hour average, at the outside wall of a non-participating occupancy.

  This is New York's model, cited only as industry practice. https://www.broomecountyny.gov/sites/default/files/dept/planning/pdfs/Training/NYSERDA-BESS-Model-Local-Law-April2022.pdf

### Secondary

- **NEC 110.26** working-space depths: 3, 3.5, and 4 ft at 151-600 V; 30 in width. Source: IAEI and study guides. https://iaeimagazine.org/2013/julyaugust-2013/working-space-for-electrical-equipment/
- **MassDEP noise policy.** DAQC 90-001 sets no more than 10 dB(A) over ambient L90 at the property line and nearest inhabited residence, and no pure tone. Sources: summaries such as https://nonoise.org/lawlib/states/mass/mass.htm and EBC slides. A 2026 MassDEP proposal would move compliance to receptors (Foley Hoag, Mar 2026); its adoption is unconfirmed.
- **Massachusetts flood elevations.** SGH topic brief (Oct 2024): the 10th edition of 780 CMR sets BFE + 2 ft for non-coastal A Zones, classes 1-3. The table's columns are garbled, so the value is SECONDARY. FEMA's ASCE 24-05 highlights give BFE + 1 ft or the DFE for utilities.
- **310 CMR 10.02 Buffer Zone** of 100 ft and the RDA or NOI route: town summaries (Upton, Barnstable). The regulation text wasn't read.
- **Massachusetts zoning.** A Duxbury Land Court decision (2025) reportedly extended c.40A §3 solar protection to standalone BESS. Sources are commentary only. The DOER draft BESS model bylaw (Oct 2025) exists at mass.gov but couldn't be fetched, because mass.gov returns 403 to automated requests.
- **Massachusetts amendment for sprinklered buildings**, 250 ft (NFPA 1 18.2.3.2.2.1): Braintree memo, Oct 2019, on the 2015 base code.
- **Gotion 760 kWh cabinet**: about 2400 × 1400 × 2500 mm, about 7 t, with UL 9540A in its certification list. Source: the enf datasheet aggregator.

### Not found, or left to people

- **NESC Table 234-1** clearances from the finished cabinet to existing lines weren't confirmed. Leave them to the utility.
- **Current Eversource MA and National Grid MA (ESB 750) service books.** The rules above come from the 2002 and 2010 supplements. Each utility says its online version governs.
- **A code slope limit for pads.** None found, so the thresholds are heuristics.
- **EDGE760 installation-manual clearances and its UL 9540A spacing.** Not public in the sources searched.
- **Facts not in public data:** door locations, designated fire lanes, panel nameplate ratings, buried utilities, ambient sound, and town setback numbers. Each stays an explicit "unchecked" item in the output.
- **The NFPA 855 and NEC text itself.** Free access at nfpa.org requires an account, so no sign-up was made.
