# Labeled examples for the electrical-equipment detector (Massachusetts)

Date checked: 2026-11-07. Nothing was signed up for, filed, or bulk-downloaded. Every count below comes from a live read of public data. None of it is synthetic. No accuracy figures are claimed for our detector, because none have been measured yet.

**Evidence labels**
- **C** = confirmed: I read it on the primary page, service, or file today. The link is given.
- **S** = seen only in a search excerpt or a secondary page.
- **I** = my inference.

Related lanes, not repeated here: [electrical equipment public data](2026-11-07-electrical-equipment-public-data.md) (Cambridge permits, Mapillary classes, 3DEP classes), [remote sensing](2026-11-07-option1-remote-sensing.md), and [hard-field sources](2026-11-07-option1-hard-field-sources.md) (Mapillary terms). The machine-readable list is [`fixtures/ma-equipment-label-sources.json`](../../fixtures/ma-equipment-label-sources.json).

## Summary

1. **The lidar has no free labels.** Both Massachusetts 3DEP collections deliver ASPRS classes 1-7, 9, 17, 18, 20 and 22. Classes 13 to 16 (wire guard, wire conductor, transmission tower, wire connector) and any pole class are absent. Class 17 (bridge deck) is the only one in the 13-17 range. This holds for MA_CentralEastern_1_2021 and _2_2021, and for MA_Western_1_B24 (C). A pole, wire, or pad-mounted transformer sits in class 1 (unclassified), or is misfiled as vegetation (class 3-5). The vendor says vegetation "may contain anthropogenic features" (C).
2. **The best labels are town pole inventories.** **Easton** publishes 7,019 pole points, each typed by use: Utility (3,547), Utility with light (1,505), Sign (1,307), Streetlight (592), Signal (62) and Other (6). They come from 2017 planimetry (C). That gives true labels and hard false labels in one layer. **Cambridge** publishes 1,712 `UTILITY-POLE` points and 745 `UNKNOWN` points from a 2018 flight, under a public-domain licence (PDDL), plus separate street-light layers (C). **Newton** publishes 16,744 poles, but the newest install date in the data is 1998 (C).
3. **OpenStreetMap is a positive-only source, and it is thin.** The Overture 2026-10-21.0 release, which carries OpenStreetMap power features, has these Massachusetts counts: 32,359 `power_pole`, 32,779 `power_tower`, 4,561 `power_line`, 2,076 `minor_line`, 957 `transformer`, 728 `substation` and 3,038 `switch` (C, my query). Distribution poles are nearly missing. Easton has 0 OSM poles against 5,052 utility poles in the town layer. Cambridge has 41 against 1,712. Newton has 103 against 13,872 (C counts; the comparison is I). Of the transformers, 538 are tagged `transformer=main` (substation units), and only 12 are tagged `distribution` (C). An absence in OSM is never a negative.
4. **Transformers and switchgear have no public ground truth at scale.** OSM covers substations, not pad-mounted units. Mapillary has no transformer class (C). Permits and environmental filings confirm that a transformer exists at an address, not where it sits. We will have to label transformers and switchgear ourselves from MassGIS 15 cm imagery, with permit evidence attached.
5. **Street-level detections have terms problems.** Mapillary needs a client token. Its terms bar "data mining, robots or similar ... methods not approved by Mapillary" and bar ignoring its robots.txt (§5(a)). `graph.mapillary.com/robots.txt` is `Disallow: /` (C). Coverage in Holliston, Worcester, Somerville and Cambridge could not be sampled without signing up.
6. **Robots findings differ from the brief in one place.** `overpass-api.de/robots.txt` disallows `/api/`, and `planet.openstreetmap.org/robots.txt` blocks everyone except `wget` (C). But `download.geofabrik.de/robots.txt` and `www.geofabrik.de/robots.txt` both return 404, so no robots rule bars Geofabrik today (C). Its Massachusetts extract is 297 MB, ODbL, with data to 2026-11-06T21:21Z (C). The team's rule can stand. A person can download it by hand once.

## Ranked table

Ranked by value for training and evaluating our detector in Massachusetts. "Neg" means the source gives true false labels (confusers or verified absence), not just positives.

| # | Source | Objects labeled | Neg | MA coverage | Access | Licence / terms | Train | Per site |
|---|---|---|---|---|---|---|---|---|
| 1 | [Easton poles](https://services2.arcgis.com/G6TP4SnXQoFs2r0T/arcgis/rest/services/Poles/FeatureServer/0) | Utility pole, utility pole with light, sign pole, streetlight, signal pole | **Yes** (sign, streetlight, signal) | Easton, 7,019 points, planimetry 2017 (C) | ArcGIS REST API, no key | No licence. Disclaimer: "For planning purposes only", no warranty (C, via Hub `licenseInfo`) | **Yes** | Yes, as `inferred` with attribution. Confirm with the town for commercial reuse |
| 2 | [Cambridge Utility Poles](https://github.com/cambridgegis/cambridgegis_data_infra/tree/master/Utility_Poles), [Street Lights](https://github.com/cambridgegis/cambridgegis_data_infra/tree/master/Street_Lights) | `UTILITY-POLE` 1,712, `UNKNOWN` 745, from the 2018 flight. City street lights 6,117 | **Yes** (street lights; `UNKNOWN` held out) | Cambridge (C) | GeoJSON on GitHub | PDDL, public domain (C) | **Yes** | **Yes** |
| 3 | [Overture base / infrastructure](https://docs.overturemaps.org/guides/base/) (OSM-derived) | power_pole, power_tower, power_line, minor_line, cable, transformer, substation, switch, portal, generator | No | Statewide but sparse (counts above) | Bulk GeoParquet on S3/Azure, no account. Range reads by bbox | ODbL (C) | Positives only | Yes, with ODbL attribution. Keep per-site extracts small |
| 4 | [Newton Utility Poles](https://gisweb.newtonma.gov/server/rest/services/Data/MapServer/1) | 16,744 points. `POINT_SUBT`: P 13,872, RP 1,677, SL 1,064, HS 99, GS 32 (C). Codes undocumented; SL is likely streetlight (I) | Partly (SL, if confirmed) | Newton. Latest `INSTALLDT` 1998-10-05 (C) | ArcGIS REST API, no key | No licence or terms on the service (C). The Harvard copy is marked restricted (S) | Yes, after a spot check for moved poles | Yes as `inferred`, age noted |
| 5 | Our own labels on MassGIS 15 cm orthos plus 3DEP | Pad-mounted transformer, switchgear, pole-top transformer, service drop, meter bank, and "nothing here" | **Yes** | Any site we pick | Manual, in our tool | Our own work. Imagery is MassGIS public data | **Yes**, the only transformer source | **Yes** |
| 6 | [Duke ETDII](https://doi.org/10.6084/m9.figshare.6931088.v1) (Bradbury et al.) | Transmission towers, distribution towers (poles), substations, lines (S, team slides; GridTracer paper says boxes and line segments) | Implicit (unlabeled pixels) | None in MA. **Hartford, CT** is closest. Also Tucson, Colwich KS, Clyde and Wilmington NC, and others abroad (C) | figshare, 28.1 GB. Automated download returned 403, so download by hand | CC BY 4.0 (C) | Yes, for an image model (Hartford tiles) | No (not MA) |
| 7 | [Cambridge Electrical Permits](https://data.cambridgema.gov/d/hvtc-3ab9) | Existing service amps and volts, overhead or underground, kVA, at an address (C, prior lane) | No | Cambridge | Socrata API, no key | PDDL (C, prior lane) | Weak (site-level "service exists" and OH/UG) | **Yes** |
| 8 | [National Grid MA System Data Portal feeders](https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP/MASDP_Feeders/MapServer) | Feeder polylines with `Phases` (layer "1 and 2 Phase") (C) | No | National Grid MA territory | ArcGIS REST, no key | No terms found on the service. Portal terms not read | No (not equipment) | Context only, `inferred` |
| 9 | [Mapillary map features](https://www.mapillary.com/developer/api-documentation) | `object--support--utility-pole`, `object--support--pole`, `object--street-light`, `object--junction-box`, `object--manhole`. **No transformer or wire** (C) | No (machine detections) | Untested (token needed) | API with client token. Search bbox under 0.01 deg² | CC BY-SA content. §5(a) bars unapproved mining and ignoring robots.txt. §11 attribution. §12 allows commercial training with safeguards (C) | Not until legal review | Not until legal review |
| 10 | [DCR Streetlights](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/DCR/Streetlights_NoEdits_Public/FeatureServer/0) | 10,346 DCR streetlights (C) | **Yes** (confusers) | DCR parkways statewide | ArcGIS REST | Hub shows licence "none" (C) | Yes, as hard negatives | No |
| 11 | MassDEP release records (pad-mounted transformer oil releases) | Transformer at an address, by release tracking number. Example: RTN cited for a pad-mounted unit at 131 Morse St, Foxborough (S) | No | Statewide | mass.gov returned 403 to my reads. A person downloads the site lists | State public record | Weak positives | Yes, as evidence a unit existed |
| 12 | [EPA PCB Transformer Registration DB](https://www.epa.gov/pcbs/registering-transformers-containing-polychlorinated-biphenyls-pcbs) | Registered PCB transformers by location (C: "most recent active ... by location") | No | National, old units only | 2.06 MB PDF | US government work (I) | Weak | Rarely |
| 13 | [RMLD poles, North Reading](https://services5.arcgis.com/HrhX0iZc4Ri8HVtK/arcgis/rest/services/Utility_Poles/FeatureServer/0) | 4,150 poles with owner and pole number. Described as "geocoded" (C) | No | North Reading | ArcGIS REST | None stated (C) | Counts only. Geocoded positions are not survey positions (I) | Context |
| 14 | USGS 3DEP MA 2021 and Western MA B24 | No wire, tower, or pole classes (C) | No | Statewide | EPT on AWS | Public domain | Input data, not labels | Yes (our derived values) |
| 15 | OSM via Overpass, planet.openstreetmap.org, Daylight | Same as #3 | No | Same | **Overpass `/api/` barred by robots. Planet server bars all but wget.** Daylight ended at v1.58, November 2024 (S) | ODbL | Use #3 instead | Use #3 instead |
| 16 | TTPLA, DALES, Toronto-3D | TTPLA: cable, lattice, steel or concrete, and wooden towers, from UAV video in two unnamed US states (C). DALES: poles and power lines in aerial lidar (S). Toronto-3D: utility line and pole, mobile lidar (C) | Implicit | None in MA | Google Drive, form or OneDrive | TTPLA repo Apache-2.0, image terms unclear (C). DALES unconfirmed (S). Toronto-3D **CC BY-NC 4.0** (C) | Research only. Toronto-3D is not usable commercially | No |
| 17 | Eversource maps and data | n/a | n/a | Eversource territory | Not used | Terms bar use, per the [prior lane](2026-11-07-electrical-equipment-public-data.md) (C there) | **No** | **No** |
| 18 | KartaView | No pole or transformer detections found. Detections are traffic signs (S) | No | Unknown | Web app. API not reached | Images CC BY-SA 4.0 (S). Terms page is a client-side app I could not read | No | No |

## Recommended training plan

### Where positives and negatives come from

| Object | Positives | Negatives (true false labels) | Notes |
|---|---|---|---|
| Utility pole | Easton `Utility` and `Utility with light`. Cambridge `UTILITY-POLE`. Newton `P` after a spot check | Easton `Sign`, `Signal`, `Streetlight`. Cambridge street lights farther than 1.5 m from any utility pole. DCR streetlights. Trees from lidar class 5 with a crown | A streetlight bracket on a utility pole is a positive. Drop any negative within 1.5 m of a mapped utility pole |
| Pole absence | Inside a **census area** only: a full town layer believed complete (Easton, Cambridge) | Any detector candidate farther than r from every mapped pole of any type, after a human check of the 15 cm ortho | Never use OSM or Mapillary absence as a negative |
| Overhead conductor | Overture `power_line` and `minor_line`. Pole-to-pole spans inferred from the town layers (I) | Streets in a census area with no mapped poles (likely underground; I) | National Grid feeder lines show a feeder on the street, not overhead vs underground |
| Pole-top transformer | Our labels on the ortho and lidar. 73 OSM poles carry a `transformer` tag statewide (C) | Our labels: poles checked and found to have no can | Too few public labels. Label it ourselves |
| Pad-mounted transformer, switchgear | Our labels at commercial sites, backed by evidence (Cambridge permit kVA, MassDEP release, site plan) | Our labels: candidate boxes that are HVAC units, dumpsters, or generators | This is the main gap. Plan for 100-200 hand-labeled commercial sites (I) |
| Substation | Overture `substation` (728 in MA). Cambridge Utility Facilities (4 transformer stations) | n/a | Easy and less relevant to C&I service |

### Building true and false examples around the detector's candidates

1. **Pick census areas.** Use Easton (2017), Cambridge (2018) and Newton (1990s, test separately because of age). Lidar is 2021, so poles placed or removed between the label date and 2021 will show up as disagreements. Send those to a human, and do not count them as detector errors automatically.
2. **Run the detector** over each census area and keep every candidate with its score, lidar tile ID, and features (height, verticality, point count, intensity).
3. **Match** candidates to inventory points one to one. Use greedy matching by distance, nearest first, within radius r. Use r = 2.5 m for poles. This allows about 0.2 m lidar horizontal error (C, 3DEP report) and an unknown town planimetry error (I).
   - Matched to a utility pole → **true positive**.
   - Matched to a sign, signal, or standalone streetlight → **hard false positive**, labeled with its confuser type.
   - No match within r → **candidate false positive**. Queue for a human check on the 15 cm ortho. Keep it as false only after the check, because inventories are incomplete.
   - Inventory pole with no candidate → **false negative**.
4. **Store each example** with `label_source` (dataset ID and URL), `label_date`, `review_state` (`unreviewed`, `human_verified`, `human_corrected`), and the confuser class. Keep the original inventory record. A human correction is a new record, not an overwrite.
5. **Split by town**, not by random point. For example, tune on Cambridge and Newton and test on Easton, then rotate. Nearby poles are correlated, so a random split would overstate accuracy (I).
6. **Transformers and switchgear:** label 100-200 commercial sites by hand in the same tool. Two people label each site, and disagreements go to a third (I). Each label records which evidence it rests on: ortho, lidar, permit, release record, site plan, or street-level photo viewed by a person.

### Evaluation metric

- **Object level, inside census areas only:** precision = TP / (TP + verified FP). Recall = TP / (TP + FN). Report both per class and per town.
  - Poles: match within **2.5 m**.
  - Pad-mounted transformers and switchgear: match within **3 m** of the centroid. Pole-top transformers: match the **host pole** within 2.5 m.
  - Report a 95% interval by resampling 500 m tiles (I).
- **Site level, for the qualification record:** does the site have a pole within 30 m of the building? A pad-mounted transformer on the parcel? Overhead service? Report precision and recall over labeled sites. This is the number a project developer feels.
- **Confusion table** by confuser type (sign, streetlight, tree, HVAC unit, dumpster) shows which rule to tune.
- Do not compare against OSM as ground truth. OSM recall for distribution poles is near zero in all three census towns.

## Storing results per site

Each detection in a site's qualification record should carry: object class, position, detector version, lidar tile and imagery IDs, score, state (`inferred` until a person verifies it), and any matched label with its source URL and licence.

- **Cambridge (PDDL) and USGS (public domain):** store freely, with credit.
- **Easton, Newton, RMLD, DCR:** no licence is stated. Storing a derived "pole present within 30 m" fact with attribution seems low risk, but copying the layers into our product is not covered. Ask each town before commercial reuse (I).
- **Overture and OSM (ODbL):** attribute "© OpenStreetMap contributors" and Overture. Per-site extracts should stay insubstantial. If we build and redistribute a merged pole database, share-alike may apply (I).
- **Mapillary:** do not store until someone reads the terms and decides. The robots.txt clause in §5(a) is the sticking point.

## Notes per source

### USGS 3DEP Massachusetts (no labels)
- MA_CentralEastern_1_2021 LPC report, "Classification values used": (1) 3,960 tiles, (2), (3), (4), (5), (6), (7), (9), (17) Bridge Deck 1,553 tiles, (18), (20), (22). There are no classes 13-16 ([report txt](https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/metadata/MA_CentralEastern_2021_B21/MA_CentralEastern_1_2021/reports/USGS_MA_CentralEastern_1_2021_FINAL_LPC_Report.txt), [vendor XML](https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/metadata/MA_CentralEastern_2021_B21/MA_CentralEastern_1_2021/reports/vendor_provided_xml/01_USGS_MA_CentralEastern_ClassifiedPointCloud.xml), C). The XML also says vegetation "may contain anthropogenic features" (C).
- MA_CentralEastern_2_2021: same class list, per Table 8 of its [report](https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/metadata/MA_CentralEastern_2021_B21/MA_CentralEastern_2_2021/reports/Central_East_MA_NIR_lidar_Report_Final_Signed.pdf) (C, prior lane).
- MA_Western_1_B24: (1)-(7), (9), (17), (18), (20), (22) ([LPC report](https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/metadata/MA_Western_B24/MA_Western_1_B24/reports/USGS_MA_Western_1_B24_FINAL_LPC_Report.txt), C).
- These are the only MA projects in the USGS staged metadata folder (C). MassGIS's lidar page returned 403 to my reads. MassGIS redistributes the 3DEP collections (I), so the class lists apply.
- Some projects elsewhere do classify wires (ASPRS 13-16 exist in the spec), but I found no public US project I could confirm with populated class 14 (S).

### Easton poles
- [FeatureServer layer 0](https://services2.arcgis.com/G6TP4SnXQoFs2r0T/arcgis/rest/services/Poles/FeatureServer/0), titled "Easton Utility and Sign poles" on ArcGIS Hub. Fields: `POLEUSE`, `POLENUM`, `SOURCE` (6,562 `PLANIMETRY`, 451 `HEADSUP_DIG`), `SOURCEDATE` (6,809 at 20170412, 203 at 20140420) (C).
- `POLEUSE` counts: Utility 3,547, Utility with light 1,505, Sign 1,307, Streetlight 592, Signal 62, Other 6 (C).
- Hub licence text: "For planning purposes only. The Town of Easton makes no warranty..." (C). Hub robots sets crawl-delay 60 for site pages. The REST service is on ArcGIS Online.
- Strongest single training source, because the confusers are in the same survey.

### Cambridge
- Utility Poles README: from the "April 12 & April 22, 2018 flyover", 1" = 40' scale, NSSDA procedures, last modified 2020-06-10 (C). `TYPE`: 1,712 `UTILITY-POLE`, 745 `UNKNOWN` (C, counted from the GeoJSON).
- Street Lights (city-owned, 6,117 points, C) came from NSTAR's records through 2005 and are being revised for the LED project (C, README). Street Lights Not City Owned came from a 2010 flight and are "NOT FIELD VERIFIED" (C).
- Repo licence: PDDL 1.0 (C).
- Treat `UNKNOWN` as unlabeled. It may be poles of unknown owner (I).

### Overture and OpenStreetMap
- Overture says the base theme's infrastructure features "are pulled from OpenStreetMap" and the theme "is published under the ODbL license" ([docs](https://docs.overturemaps.org/guides/base/), C).
- Method: I read Parquet footers from `s3://overturemaps-us-west-2/release/2026-10-21.0/theme=base/type=infrastructure/` over HTTPS. I then read only the `subtype`, `class`, `bbox` and `source_tags` columns for the 30 row groups that intersect Massachusetts, and clipped to the Census TIGERweb state outline by bbox centroid (C). This is a small range read, not a bulk download.
- Statewide counts (subtype `power`): substation 728, cable 404, generator 3,834, plant 1,086, power_tower 32,779, power_line 4,561, switch 3,038, transformer 957, minor_line 2,076, power_pole 32,359, portal 1,433, connection 110, terminal 28 (C).
- Town counts of `power_pole` / `transformer`: Holliston 51 / 1, Worcester 79 / 17, Cambridge 41 / 18, Somerville 4 / 0, Easton 0 / 2, Newton 103 / 4, North Reading 0 / 2 (C). Centroid-in-outline on a generalized boundary, so counts near town edges may shift slightly (I).
- Transformer tags: `transformer=main` 538 (5 on roofs), untagged 358, `distribution` 12 (C). On poles, `transformer=*` appears 73 times and `material` 6,574 times (C).
- Other routes: the [OSM on AWS](https://registry.opendata.aws/osm/) buckets (`osm-planet-us-west-2`, no account) carry the planet and are licensed under OSM's copyright page (C). [Daylight](https://daylightmap.org/2024/05/03/sunsetting-daylight.html) was sunset in 2024 (S). A Geofabrik MA extract (297 MB) can be downloaded by hand ([page](https://download.geofabrik.de/north-america/us/massachusetts.html), C).

### Newton
- [Layer 1](https://gisweb.newtonma.gov/server/rest/services/Data/MapServer/1): "Utility Poles - Newton, Massachusetts", summary "Base Mapping, Maintenance, Street Lighting". Fields include `RID`, `POLENUM`, `LAMPTYPE`, `POLETYPE`, `INSTALLDT`. 16,744 records. Maximum `INSTALLDT` is 1998-10-05 (C). No licence text (C).
- A [Harvard/MIT catalog record](https://geodata.libraries.mit.edu/record/gisogm:edu.harvard:41bc531ec491) describes Boston Edison (NSTAR) poles and marks access restricted (S). Ask the city before storing or redistributing it.

### Duke ETDII and GridTracer
- ETDII: CC BY 4.0, about 321 km² across 14 cities. US cities are Tucson AZ, Hartford CT, Colwich KS, Clyde NC and Wilmington NC. Sources are CT DEEP and USGS imagery for the US cities (C, [figshare API](https://api.figshare.com/v2/articles/6931088)). Hartford alone is 6.18 GB (C).
- The [GridTracer dataset](https://doi.org/10.6084/m9.figshare.14935434.v2) is a separate CC BY 4.0 set, about 264 km², covering Tucson, Colwich and 5 NZ cities (C). Its paper describes tower boxes and line segments (S, [arXiv 2101.06390](https://arxiv.org/abs/2101.06390)).
- Useful for pretraining an imagery pole detector on New England-style distribution (Hartford). It does not cover pad-mounted transformers (I).

### Mapillary
- Classes from the [points docs](https://www.mapillary.com/developer/api-documentation/points) (C). Map feature fields include `object_value`, `geometry`, `first_seen_at`, `last_seen_at`, and `images`. Limits: search bbox under 0.01 deg², 10,000 search requests per minute, 50,000 tiles per day (C).
- [Terms](https://www.mapillary.com/terms): §3(b) CC BY-SA. §5(a) bars unapproved data mining or robots and ignoring robots.txt. §11 requires registering a client and visible attribution for extracted data. §12 allows commercial "training, and development" with safeguards against reidentification (C).
- `graph.mapillary.com/robots.txt` is `User-agent: * / Disallow: /` (C). Whether a registered API client counts as "approved" needs a legal reading.
- Coverage in Holliston, Worcester, Somerville and Cambridge is **not tested**: a token needs a sign-up. A person can browse mapillary.com by hand to judge coverage.

### Other ground truth for transformers and switchgear
- Cambridge permits (`kva`, overhead or underground) and Somerville permit text ("Eversource to upgrade transformer to 1500 KVA") show that a transformer or service exists at an address (C, prior lane). Neither gives a position. Use them as evidence on a hand label.
- MassDEP site lists include source and chemical tables, per search excerpts (S). mass.gov returns 403 to automated reads (C), so a person must download them. A Foxborough report cites a pad-mounted transformer oil release at 131 Morse St (S).
- Town planning filings sometimes include site plans and one-lines with the transformer pad (C, hard-field lane, Holliston). These are person-read.
- West Boylston Municipal Light Plant is GPS-mapping poles and transformers internally (S). No municipal light plant publishes an asset layer that I found. Asking an MLP for a data share is a real option (I).

### Not usable or not worth it now
- Overpass (`/api/` disallowed), the planet server (wget only), taginfo (`/api` and `/tags` disallowed) (C).
- Toronto-3D is CC BY-NC 4.0 (C). DALES (Surrey, BC) licence is unconfirmed (S). TTPLA is UAV oblique transmission imagery from unnamed US states (C). None of these resemble MA nadir aerials or 3DEP density.
- Chicopee's consultant-hosted "Poles" layer is 5,068 `POST` points with no description or terms (C). It is unclear whether they are utility poles.
- Wayland lists a 2016 DPW "Poles" layer available as shapefiles (S). Not checked.

## Not done
- No Mapillary or KartaView coverage sample (would need a sign-up or an unread terms page).
- Easton's and Newton's terms were not confirmed with the towns.
- No detector run against these labels yet. No precision or recall exists.
- Scratch files: Overture range-read scripts and two TIGERweb outlines in the session scratchpad. No downloaded label data was kept.
