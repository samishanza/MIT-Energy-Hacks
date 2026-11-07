# Option 1 research: what the two sample plan sets show

Read on 2026-11-07 from `provided resources/`. All text was extracted with `pdftotext`. Three sheets were also viewed as images: Sample 1 G-100, and Sample 2 E-110 and E-120.

**Labels:** **Read** means it's on the sheet. **Inference** is the lead's reasoning. These files are named "IFC" and were supplied to the team. We have not confirmed that either was stamped, permitted, or accepted by a reviewer. Project names and addresses are blanked or missing, so we can't say which jurisdiction they belong to.

## The two sets

| | Sample 1 | Sample 2 |
|---|---|---|
| System (Read) | 30 kW / 150 kWh, one pad-mounted cabinet, with backup loads panel | 199 kVA / 528 kWh, three battery cabinets and two inverters, no backup |
| Sheets (Read) | T-000, E-000, E-001, G-100, E-110, E-120, E-121, E-200, E-300, E-400, E-500 to E-503 | E-000, E-001, E-110, E-120, E-200, E-300, E-310, E-400, E-500 to E-502 |
| Missing (Read) | No fire or structural sheet in the index | References EB-A1.1, S-2.0, S-2.1, S-3.0, S-3.1, which aren't in the file, so this set is partial |
| Service (Read) | 800A, 208V, 3P, 4W | 480Y/277V, 3000A, 3P, 4W, 65 kAIC |
| Codes named (Read) | 2024 IBC, 2023 NEC, 2024 IFC, UL listings | Not read on the sheets viewed |

## What a finished site map looks like

**Sample 1 G-100 (Read):** a faded aerial photo at 1 in = 20 ft, with these layers:

- Property boundary, building outline, and road labels
- Existing equipment as text callouts on leader lines, marked (E): electrical room, its entrance, 400A panelboards (4), 225A panelboards (2), 800A main switchboards, wall-mounted CT cabinet with utility meter, pad-mounted utility transformer
- New equipment, marked (N), and the point of interconnection
- North arrow, scale, project details table, title block

**Its only sheet note (Read):** "DIMENSIONS SHOWN ARE BASED ON AERIAL IMAGERY AND PUBLICLY AVAILABLE PROPERTY BOUNDARY KMZ DATA ONLY. FOR REFERENCE ONLY. NOT SURVEYED."

**Sample 2 E-110 (Read):** the same pattern at 1 in = 40 ft, with property line, setback, fence, and existing underground lines in the legend.

**Inference:** the base map is mostly what the automatic pull already gets: aerial image, parcel line, building outline. The hard part is placing and labeling the existing electrical equipment. This changes an earlier finding: the bridge doc said public data likely can't finish a permit-grade site plan. A sheet like G-100 is built from public data and says so. Whether a given AHJ accepts that is still unknown, so ask EQORE.

## Other things that change our thinking

- **Site photos are plan set content (Read).** Sample 2 E-120 embeds a "Main Switchboard Photo" and a "Main Breaker Section Photo", annotated with "proposed tap location". The photos show closed equipment, the meter, and the labels. So a capture flow can produce material that goes directly on a sheet.
- **Plan sets carry uncertainty on their face (Read).** Sample 2 uses approximate dimensions (~14'-1", ~18'-8", ~7.5"), lists VIF ("verify in field"), and says of existing conduits "there may not exist a vault, conduits may be capped underground". Both sets say conduit routing is diagrammatic and that the contractor determines the route. Both say equipment dimensions are approximate.
- **Tolerance evidence (Read, not a standard).** These are the first drafter-precision data points from the supplied samples: site plans at 1 in = 20 ft and 1 in = 40 ft, and dimensions marked approximate around the equipment yard. Question 6 to EQORE stays open.
- **Fault current is assumed (Read).** Sample 2 states "assumed available fault current: 65,000 AIC", and leaves service address and meter number blank on the single-line. The site record should be able to hold an assumed value, labeled as assumed.
- **Real internal conflict (Read).** Sample 1 describes the same battery as 208V on G-100 and E-120, and as 480V on T-000, E-300, and other callouts. The single-line shows a 480V to 208V transformer, which may explain it, but the labels disagree. The notes also still say "this PV system" in a battery set, which suggests reused templates (Inference).
- **Exterior equipment matters (Read, two sites only).** In both samples the main service equipment or its parts are outdoors or on an outside wall, near the utility transformer. Sample 1's electrical room is on the ground floor, with its entrance at the same corner.
- **Existing solar is on the sheets (Read).** Sample 2 shows existing rooftop and carport PV on separate permits with application numbers, and its single-line draws them in detail.

## Collection ideas to test

These are hypotheses, and none has been tested. They're aimed at the field that matters most: where the existing electrical equipment is and what it's rated.

| Idea | How it works | Test |
|---|---|---|
| **The map asks** | The site map doubles as the collection tool. A link shows the facility contact the aerial with one pin ("Is this your transformer?") and they confirm, move it, or attach a photo. | Does one tap replace a request list? |
| **Geotagged photo walk** | A phone browser link with no app. Each doors-closed photo carries GPS and compass heading, lands on the map as an (E) callout, and has its nameplate read as a draft for an engineer to confirm. | Measure placement error against the aerial at a real building |
| **Ask for what unlocks the most** | Deterministically rank gaps by how many sheets each one unblocks and how cheap it is to get, using the bridge doc's dependency map. The output is the next question, or the shortest possible visit list. | Compare the ranked list with an engineer's own order |
| **Find equipment from lidar and imagery** | Look for box-shaped non-building returns near the building and match them to the 15 cm aerial. Trace overhead service lines from poles. Store the results as `inferred` candidates for "The map asks" to confirm. | Run on the existing 11 Bartzak Dr point cloud |
| **Physics bounds** | Use bill or interval peak demand, plus voltage, to compute a minimum plausible service size. A nameplate photo that falls below the bound is flagged. | Deterministic check on labeled synthetic data |
| **Own street-level capture** | A phone or dashcam on a public road produces imagery we own, which avoids Google's storage and derivation limits. | One drive-by, then check what's visible |
| **On-demand electrician work order** | The record writes an exact scope for a local qualified electrician, covering only the fields that need one. It replaces a whole visit with a short job. | Generate one and ask EQORE whether it's usable. Don't send it. |
