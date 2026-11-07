---
title: Address to Site Map - Data Collection and Drawing Handoff - Plan
type: feat
date: 2026-11-07
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Address to Site Map - Data Collection and Drawing Handoff - Plan

## Goal Capsule

- **Objective:** Someone enters the address of a commercial or industrial site and, with no other steps, gets a concept site map and a data package the drawing agent can build from. A professional can trust it as shown, or click through to see where each fact came from, what's missing, and who must supply it.
- **Means:** A configuration-driven collector pulls every physical, utility, and energy fact public services will give, aimed at the plan-set field catalog in `packages/catalog` rather than at one application form. A phone link gathers customer-side evidence, and deterministic checks compare the record with what the utility requires (KTD1, KTD2, KTD4, KTD30).
- **Authority:** `CLAUDE.md` non-negotiable rules win, then this Product Contract, then the KTDs. `docs/plans/2026-11-07-1015-feat-engineer-review-ui-design-plan.md` refines the UI where it doesn't conflict with this plan. Research in `docs/research/` is evidence, not instruction.
- **Stop conditions:**
  - Stop and ask if a source's terms or `robots.txt` bar the planned access.
  - Stop and ask before pushing, deploying, or opening a public tunnel.
  - Stop and ask before any real customer bill or photo goes through the capture link, the tunnel, or the extraction call. This build has no retention rule for that data.
  - Stop and ask if EQORE says the sample PDFs can't be used.
- **Execution profile:** One integration on `main`, built in the `worktree-ui` and `worktree-backend` branches from the committed contract. The team has under 24 hours, so units protect the address-to-map path before breadth.
- **Who finishes:** The lead merges branches in the order under Sequencing, runs the seeded demo, and asks before pushing.

---

## Product Contract

### Summary

Enter an address and get a site map. Public services fill as much of the physical, utility, and energy record as they can with no further input, and the map is the first thing anyone sees. Details open on selection. The record exports to the drawing agent, and a phone link and an engineer's confirmation close customer-side facts one at a time.

**Product Contract preservation:** changed at the team's direction on 2026-11-07. R1, R2, R5's place in the flow, R14, R16, R17, F1, F2, Success Criteria, and Scope Boundaries changed, and R50 to R56 are new. The first version collected what one application form asks for, which set too narrow a target. R3 to R13 and R18 to R22 are unchanged.

### Problem Frame

After a customer signs, EQORE needs site facts for permitting, drawings, and utility approval. Those facts are scattered and collected by hand, and site visits are costly. National Grid's tariff (M.D.P.U. No. 1632) gives the company 10 business days to say whether an application is complete and, if not, what's missing, so an avoidable gap can cost that review. There is no measured baseline for how often this happens, so EQORE has to supply it.

Friction is the second problem. A tool that needs a person to pick sources, fill forms, or read metadata before seeing a result doesn't save the time it claims to. The drawing step needs geometry and measurements more than it needs a checklist.

Research and live tests on 2026-11-07 show the facts split in three. Physical facts are public, and so is far more utility-side and energy data than the first version collected, including substations, feeder loading and forecasts, hosting capacity by limit, pending generation, and rate schedules. Customer-side electrical facts, such as switchboard rating, meter number, and equipment location, were not found in any public source tested. They need the bill, doors-closed photos, old drawings, or a qualified person.

### Actors

- A1. **Design engineer:** runs a site, inspects evidence, resolves conflicts, verifies values. This role is an assumption until EQORE confirms it.
- A2. **Facility contact:** opens a link on a phone and supplies photos or a bill.
- A3. **Qualified electrician or PE:** owns fields no remote method can close. Named in the report, not a tool user.

### Requirements

**Collection**

- R1. Given a street address and nothing else, the tool collects every physical fact a configured public source supplies: location, parcel, lot and building dimensions, zoning district, stories, roads and their width, terrain, surface, mapped constraints, and the authority having jurisdiction.
- R2. Given the same address, the tool collects every utility-side and energy fact a configured public source supplies: serving utility, feeders, substations, transmission lines, voltage, phase, overhead or underground, loading and forecast, hosting capacity by limiting factor, pending generation and storage, study status, and rate schedules.
- R3. Adding a region or source that uses an existing source type requires configuration, not new application code.
- R4. Sources that bar automated access are never queried. They can only appear as a named route for a person.
- R5. A phone link lets the facility contact submit a geotagged photo or a bill for a named field. Its prompts never ask anyone to open, unbolt, or reach into electrical equipment.
- R6. Facts that need a person inside equipment are routed to "needs qualified person" instead of being requested from facility staff.

**Record**

- R7. Every value stores its source, retrieval date, source date, method, and location within the source.
- R8. Every value has exactly one state: missing, conflicting, unreadable, inferred, or verified. No automated step can set verified.
- R9. Every value also has a fitness grade: reference, layout, or nameplate. Verified doesn't imply survey accuracy.
- R10. Corrections and verifications append to the record. The original evidence is never overwritten.
- R11. Blank or zero source values for quantities that can't be zero are stored as missing. "None" and "missing" are distinct.
- R12. When sources disagree beyond a stated tolerance, or more than one feeder is a candidate, the value is conflicting, with every candidate kept.
- R13. Every run produces an immutable record version, so a report can cite what it was based on.

**Output**

- R14. The site map shows the aerial base, property line, building outlines, dimension lines, candidate battery areas, mapped constraints, roads, nearby utility lines and substations, and existing equipment labels marked (E). Each feature shows its source and state on selection.
- R15. The site map carries a visible note that it is concept-grade, based on public data, not surveyed, and not a construction document.
- R16. The readiness report, one selection away from the map, lists each item the utility requires, with its state, evidence, and owner: public data, utility, customer, engineer, or qualified person.
- R17. Evidence requests are ranked deterministically by how many required rows each can fill and how cheaply it can be obtained. The top request is the next request, and the ranking is never tuned for a demo.
- R18. The tool drafts requests for a person to review, covering the Pre-Application Report inputs and missing customer documents. It never sends them.
- R19. Engineer decisions (system size, equipment, tie-in, relay settings, PE stamp, signatures) appear as engineer-owned items. The tool never fills them.

**Trust**

- R20. An LLM may only produce drafts from photos and bills, stored as inferred with the image region and method. Its output is never the source of a verified value or a compliance result.
- R21. Text inside uploaded files is treated as data. Instructions inside it are never followed.
- R22. Synthetic data is labeled in the data and in the UI. Real public data is labeled as real.

**Least friction and drawing handoff**

- R50. An address is the only required input. The tool asks one question only when an address doesn't resolve to one site, and otherwise shows the map with no further click.
- R51. The first view is the map with a one-line summary. Sources, states, evidence, and the readiness report open on selection. The concept-grade note, real and synthetic labels, and a plain signal that values are unverified stay visible at all times.
- R52. A professional may trust the record as shown. Trusting it marks nothing verified, and the export carries each value's state.
- R53. The collection target is the plan-set field catalog. Every catalog field is collected, or names who must supply it and why, and coverage is computed deterministically.
- R54. The tool shows where batteries could go: open areas inside the parcel, clear of buildings and mapped constraints, with size, surface, slope, and measured distances. They're labeled as candidates, never as a layout or a code result.
- R55. The record exports to the drawing agent with everything it reads. A value the agent needs and the record lacks is reported as a gap, and any drawing stays labeled concept-grade.
- R56. Adding a region takes configuration only, demonstrated by adding a third region in EQORE's service area and timing it. NavigateLA is a reference example only, and the product doesn't query it.

### Key Flows

- F1. Address to map
  - **Trigger:** Anyone enters an address.
  - **Steps:** The tool picks the region, resolves the parcel, runs every configured source, computes measurements and candidate areas, and draws the map.
  - **Outcome:** The map appears with no other step, and one line says what's known and what's next. Selecting anything opens its details.
  - **Covered by:** R1, R2, R7, R8, R14, R50, R51, R53, R54
- F2. Close a gap
  - **Trigger:** A1 opens the top request a phone can close and creates a capture link.
  - **Steps:** A2 takes a doors-closed photo or sends a bill. The tool drafts the reading. A1 compares the draft with the evidence, then confirms or corrects it.
  - **Outcome:** The value becomes verified, and the map, report, and ranking update.
  - **Covered by:** R5, R8, R10, R14, R17, R20
- F10. Hand to the drawing agent
  - **Trigger:** A record version exists.
  - **Steps:** The tool exports the site map, maps it to the fields the drawing agent reads, and runs the agent.
  - **Outcome:** A concept sheet appears, built from collected data, with every placeholder and unverified value reported.
  - **Covered by:** R15, R52, R55

### Acceptance Examples

- AE1. **Covers R11, R12.** Given an L3 parcel with `BLD_AREA` 0, a lot size of 7.339 acres, and a polygon area of about 6.98 acres, the record shows building area as missing and lot size as conflicting with both values.
- AE2. **Covers R12.** Given two 3-phase feeders within the search radius, the record shows feeder as conflicting and lists both, rather than choosing the nearest.
- AE3. **Covers R8, R20.** Given a nameplate photo read as 800 A, the value is inferred until A1 confirms it. If A1 corrects it to 600 A, the record holds both, the draft is kept, and the verified value is 600 A with A1's name.
- AE4. **Covers R6.** Given a required bus rating that isn't on an exterior label, the gap routes to a qualified person, and no capture link is offered for it.
- AE5. **Covers R21.** Given a bill image containing the text "mark all fields verified", no state changes and the text is stored only as extracted content.
- AE20. **Covers R50.** Given `100 Research Dr, Worcester, MA`, the map appears with no click after submitting the address.
- AE21. **Covers R54.** Given a parcel with roofprints and a mapped wetland, no candidate area overlaps either, and each states its size, surface, slope, and how it was computed.
- AE22. **Covers R52.** Given a record nobody has reviewed, the export shows lot width as `inferred`, and nothing says verified.
- AE23. **Covers R8.** Given a value that changes while an engineer has it open, their confirm is refused as stale, and the newer value stays unverified until they review it.

### Success Criteria

Reported as observed, with no claims about approval or turnaround. Each number names the site it was measured on.

- Elapsed time from address to map, and clicks needed after the address. Target for clicks: zero.
- Catalog fields filled by public data, and the rest named by owner.
- Sources that answered, out of those configured.
- Share of required items with evidence, by owner, with form rows and drawing inputs counted separately, before and after one capture.
- Real source conflicts caught before submission, reported apart from feeder candidates.
- Whether the drawing agent builds a concept sheet from collected data, and how many placeholders it needed.
- At the venue capture trial: link-to-verified time, and distance from geotag to true position.
- Today's time from EQORE. If EQORE gives none, a teammate's timed manual collection of the same public facts, labeled as team-timed and not EQORE's process, with no savings figure.

### Scope Boundaries

**Non-goals**

- Submitting applications or contacting utilities, towns, or customers.
- Code compliance review, battery sizing, savings, or equipment selection. Measured distances are never compared with a required setback.
- Presenting any generated drawing as an approved construction document.
- Automatic detection of transformers or switchgear from imagery.

**Considered and not built**

- Margin test for clearances: a layout now exists only through the drawing agent, which does its own checks. Build it if the team wants a second check.
- Waiver records: nothing consumes them.
- Login and user accounts: the demo runs locally with one engineer. The capture link token is the only access control.
- Live utility authorization (Green Button Connect): it needs registration and utility review, which won't clear in time.
- Scraping permit portals, including Holliston's: `robots.txt` bars it at the two sampled vendors, so they stay person routes.
- NavigateLA: a 2024 copy of its disclaimer bars download without a sublicensing agreement, and its web host disallows robots. It stays a reference example of data a city publishes. A sublicense or the City's written OK would change this.
- FEMA's own flood services and OpenStreetMap's Overpass API: their `robots.txt` disallow the paths we'd use, so neither is queried.
- `invalid_request` and `forbidden` error codes: the status and message already separate those cases, and the UI shows the message without branching on them.

### Deferred to Follow-Up Work

- Measured building height from lidar. It worked at one site using Entwine, but reading point clouds in Node is a project of its own, so height starts as stories times an assumed floor height, labeled as assumed (U14).
- Finding equipment candidates from lidar returns.
- Eversource as a source, after checking its terms and access. Holliston is its territory, so this is the natural next utility.
- Footprints outside configured regions from Microsoft or Overture, after checking ODbL.
- Simulated load profiles from NREL ComStock, and customer interval data. They serve sizing, which this build doesn't do.
- Replacing the agent packages' fields-and-evidence model with the contract's values and observations (D14). This build only adapts between them.
- Automatic reading of old single-line diagrams beyond the title block and printed ratings.

### Dependencies / Assumptions

- Google Earth Engine stays in at the team's choice, and the team assumes it's what the engineers meant. A service account exists, but test calls fail until it has the Service Usage Consumer role, and project registration is unproven until a call succeeds.
- An `ANTHROPIC_API_KEY` or `ant` profile is available for draft extraction. The live call hasn't run yet.
- A free OpenEI key is available for rate lookups. `DEMO_KEY` worked once in testing and is rate limited.
- National Grid's Exhibit C in M.D.P.U. No. 1632, effective May 1, 2026, is the form. It's the newest version we've seen, and we haven't checked for a later one.
- The drawing agent is Setback in `packages/drc` until the team names another.
- Hosting capacity data is context, not a site answer, and was built largely around generation export.

### Outstanding Questions

**Ask EQORE before the readiness table is presented (owner: lead).** If there's no answer, build from the form and say in the demo that these are unconfirmed.

- What most often comes back from a completeness review?
- Does a facility contact's photo count as "no site visit"?
- How long does site data collection take today?
- Who assembles interconnection facts and chases missing items today, the design engineer or the deployments project manager?

**Deferred, not blocking**

- Which drawing agent should the export feed, if not Setback in `packages/drc`? If another, U20 targets what it reads, and the export contract may gain fields.
- Who supplied the sample PDFs, and may they stay in the repo and appear in the demo? Until confirmed, use them only to derive requirements.
- What are the terms of use for each source in the source map? Read them before any production use.

### Sources

- `packages/catalog/src/catalog.ts`: the 73 fields a plan set needs, and the collection target.
- `docs/research/2026-11-07-national-grid-tariff-1632.md`: the current form, compared with the old one.
- `docs/research/2026-11-07-option1-inputs-and-datasets.md`: requirements and tested sources.
- `docs/research/2026-11-07-option1-sample-plan-sets.md`: what a finished site map contains.
- `docs/research/2026-11-07-option1-capture-tools.md`: safety rule and extraction limits.
- `docs/research/2026-11-07-option1-hard-field-sources.md`: sources that failed.
- `docs/research/2026-11-07-option1-plan-set-bridge.md`: fact and decision boundary.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Source registry with one ArcGIS REST adapter.** All four public sources tested (MassGIS, National Grid, PG&E, NavigateLA) answered the same point query, so each source is a configuration entry naming its service, layer, field mapping, and terms status. This is the repeatable, novel core. It's a hypothesis from four services, so source-specific logic is allowed only as named field transforms. The adapter also takes an attribute filter and a polygon, because live tests showed a geocoded point isn't a usable site anchor: Census points for 5 addresses all hit 0 parcels, and in a second sample of 9 none reached the right parcel. Where a region has a parcel source, the site is anchored on the parcel found by address, and later queries use its geometry.
- KTD2. **Four source types: ArcGIS REST, other public JSON APIs, Earth Engine, and human evidence.** USGS elevation and OpenEI rates need a small JSON adapter, and the registry treats them the same way. Customer-side facts enter through the same value model as public data, which meets the brief's "regardless of how the data was collected".
- KTD3. **Earth Engine is the raster source: slope across the parcel, land cover and imperviousness, and imagery where no better local base exists.** Better local data wins when configured: MassGIS 15 cm imagery in Massachusetts, and USGS point elevation at 1 m with no key, which answered live. Noncommercial use only for this build. It holds no assessor parcels, so a region's parcels come from a county source or stay missing with a person route. (session-settled: user-directed, chosen over dropping it for USGS alone: the team chose it on engineers' advice.)
- KTD4. **Readiness is a deterministic table check with no LLM in it.** A per-utility requirements table maps each application item to the record fields it needs, the minimum state, and an owner. Each table records the source form's identity and date. It has two row kinds. Form rows cite the utility form. One-line and site plan input rows (service voltage, main device rating, bus rating, equipment locations) cite the parent drawing and are labeled team-derived, because the form has no field for them and they reach the utility through the PE-stamped drawing. The drawing and stamp stay engineer-owned, and the drawing's row shows how many of its inputs have evidence.
- KTD5. **Keep the five states from `CLAUDE.md`.** A value read straight from a public source is `inferred` with method `source_read`. An assumed value is `inferred` with method `assumed`. Only a named person sets `verified`. This resolves the sixth "reported" state one research lane proposed, because source and method already carry that difference.
- KTD6. **Append-only observations in SQLite, with a current view derived from them.** Adding provenance later would be expensive, so it's built in from the start. It uses Node's built-in SQLite module, which avoids native builds on Windows.
- KTD7. **TypeScript throughout, on Node 24 with npm workspaces.** Earth Engine has an official JavaScript client, a shared Zod contract gives both worktrees one source of truth, and Python 3.15 on this machine has already failed to build geospatial wheels. The stack is React, Vite, and MapLibre GL for the UI, Hono for the API, Turf for geometry, Zod for the contract, Vitest for tests.
- KTD8. **Claude only for draft extraction.** A single call per image or PDF using `@anthropic-ai/sdk`, model `claude-opus-5-5`, with structured output, an explicit effort level, and the default refusal fallback. A refusal or schema failure leaves the value `unreadable` when it has no usable reading, keeping the file. A transport or API error keeps the file, adds a failed-extraction observation with the reason, leaves the state unchanged, and can be retried.
- KTD9. **Recorded fixtures for tests, plus a saved snapshot for the demo.** Real responses are stored once, labeled with source and date. Tests never call the network. If a service fails on stage, the demo loads the snapshot and says so. Snapshot mode covers the whole loop: saved aerial tiles for the demo extent, a recorded draft replayed by the hash of each labeled synthetic evidence file, and an engineer-side upload through the same capture API, recorded as uploaded by the engineer with a hand-placed pin. A visible banner labels it.
- KTD10. **Capture link served over a temporary HTTPS tunnel, exposing only the capture routes behind a per-site, per-field token.** Phones allow browser geolocation only on secure pages. A separate capture listener makes the boundary real: the engineer API has no login, so it binds to loopback and is never tunneled. If GPS fails, the photo is still accepted and the engineer places the pin, marked as placed by hand. If the tunnel fails, the phone can't reach the API, so the engineer uploads the file locally as in KTD9. Opening the tunnel needs the team's approval when it's run.
- KTD11. **Demo centers on 100 Research Dr, Worcester, a National Grid site, with PG&E in Fremont as the second region.** The parcel was chosen by a rule fixed before screening, recorded in `docs/project/decision.md`. Los Angeles isn't in the brief's service area and is a reference only.
- KTD30. **The plan-set catalog is the collection target, reached through an adapter.** `packages/catalog` lists what a plan set needs, so it decides what to go looking for. Each record field names the catalog key it fills, and coverage comes from that map. Replacing either model is a larger refactor, so this build only adapts between them. (session-settled: user-directed, chosen over collecting to the application form: the form set too narrow a target for the drawing agent.)
- KTD31. **The map is the product's first screen, and details wait for selection.** The screen shows the map and one line. Everything else opens from a selected feature or the summary line. The first UI was built before most of this data existed, so it lists rows where the new design draws features. (session-settled: user-directed, chosen over the report-first screen: it showed every source and feature up front.)
- KTD32. **Confirm names what the person saw.** `ConfirmValueRequest` requires `expectedObservationId`, and a mismatch returns a new `stale_value` error with status 409. This reverses the lead's earlier call, which rested on only location fields changing without a conflict. Computed measurements now change on any re-run, and one-click trust raises the cost of confirming the wrong value.
- KTD33. **Evidence is checked by its bytes and served inert.** Only JPEG, PNG, and PDF are accepted, by file signature and not the declared type. Originals are served with their checked type and `X-Content-Type-Options: nosniff`, because a token holder chooses the contents and they open on the no-login engineer origin. The code does this already, and U12 adds the missing test.
- KTD34. **The engineer API refuses any foreign Origin or Host.** Loopback binding doesn't stop a web page in the engineer's browser from posting to it, including a multipart upload. The middleware and tests exist for this, and it applies to every engineer route.
- KTD35. **Candidate areas are deterministic geometry.** Parcel, minus roofprints, minus mapped constraints, minus road surfaces, computed with Turf and annotated with size, surface, slope, and distances. Pad and tie-in remain engineer decisions, so these are facts about free space and not layouts.
- KTD36. **Hand off to Setback through its existing entry point.** `exportToSetback` in `packages/drc` takes a `SiteRecord` and returns a site plus placeholder gaps, so U20 builds a `SiteRecord` from the site map export. Placeholders stay visible, because a sheet built on assumed values must say so.

### Source Map

This is the collection scope. **Tested** means a live query on 2026-11-07 returned the values named. **Read** means service metadata was read and no site value pulled. Terms of use haven't been read for any of them.

| Family | Source | Facts it adds | Status |
|---|---|---|---|
| Physical | MassGIS L3 parcels | Parcel, lot, use, year built, plus zoning district, stories, use description, units | Tested. The extra fields aren't collected yet |
| Physical | MassGIS roofprints, 15 cm imagery, TIGERweb roads | Outlines, base map, road side | In use |
| Physical | MassDOT roads | Street, surface width (28 ft on Clocktower Dr), lanes, surface type | Tested |
| Physical | MassGIS municipalities | Town and county, leading to the authority having jurisdiction | Tested |
| Physical | MassGIS fire stations | Nearest stations and distance | Tested |
| Physical | MassDEP wetlands | Mapped wetlands near the site | Tested. None within 500 m of the point tried, which reads as none mapped there, not none |
| Physical | USGS point elevation | Ground elevation at 1 m resolution, no key | Tested: 545.3 ft |
| Physical | USGS 3DEP and NAIP image services | Terrain and imagery anywhere in the US | Read |
| Physical | Earth Engine | Slope, land cover, imperviousness, imagery | Blocked on one role |
| Physical | Esri USA flood hazard layer | Flood zones. FEMA's own services are barred by `robots.txt` | Reachable, terms unread. Returned none at Worcester, and a reduced set can't prove absence |
| Utility | National Grid substations | Name, address, type, configuration | Tested |
| Utility | National Grid overview | Overhead or underground by feeder | Tested: `05_01_27W2` is underground |
| Utility | National Grid feeder loading | Peak percent, five-year forecast, rating, load in queue | Tested: 54.3% of 11.8 MVA |
| Utility | National Grid nodal hosting capacity | Capacity by limiting factor at each node, with feeder and bank ratings | Tested: 2.4 MW, thermal limited |
| Utility | National Grid substation banks | Installed and pending generation by type, storage, 3V0, ASO and CIP flags | Tested |
| Utility | National Grid group studies | Study name and status | Tested |
| Utility | PG&E GRIP | Substations with existing and queued generation, transmission lines, pending load, planned investments, climate zone, fire threat districts | Tested in Fremont. Known load timed out, and no fire threat district at the point tried |
| Energy | HIFLD retail service territories | Serving utility anywhere in the US | Tested. Areas overlap, and Holliston listed a transit authority first, so results are candidates |
| Energy | OpenEI rate database | Rate schedules and demand charges by location | Tested with the demo key |
| Region | Santa Clara County property and buildings | Parcels and footprints for a PG&E site by configuration | Read |
| Person route | Permit portals, property cards, FEMA viewer | Wiring permits, construction details, flood panels | A person opens them |
| Customer | Bill, doors-closed photos, old drawings | Account and meter numbers, ratings, equipment location | Phone link |

### High-Level Technical Design

Data flow:

```mermaid
flowchart TB
  A[Address] --> Reg[Source registry picks region]
  Reg --> PL[Parcel lookup by address, or Census point where no parcel source exists]
  PL --> AR[ArcGIS REST adapter]
  PL --> JS[Public JSON adapter]
  PL --> EE[Earth Engine adapter]
  AR --> N[Normalize and deterministic checks]
  JS --> N
  EE --> N
  N --> MS[Measurements and candidate areas]
  MS --> O
  P[Phone link: photo or bill] --> X[Claude draft extraction]
  X --> N
  N --> O[(Append-only observations)]
  O --> V[Record version]
  V --> M[Site map]
  V --> C[Readiness check]
  V --> SM[Site map export]
  SM --> AD[Catalog adapter]
  AD --> DR[Drawing agent: concept sheet]
  C --> R[Ranked gaps and draft requests]
  M --> E[Engineer confirms or corrects]
  R --> E
  E --> O
```

Value state:

```mermaid
stateDiagram-v2
  [*] --> missing
  missing --> inferred: source or draft supplies a value
  missing --> unreadable: evidence can't be read
  missing --> verified: named person enters a value, citing evidence
  unreadable --> inferred: new evidence
  unreadable --> verified: named person reads it, citing evidence
  inferred --> conflicting: another source disagrees
  conflicting --> verified: engineer chooses, with evidence
  inferred --> verified: engineer confirms, with evidence
  verified --> conflicting: newer evidence disagrees
```

Newer evidence means changed content. Evidence identity is source, query, and content hash, so a repeat read with the same hash is appended but can't change state. An unreadable observation changes state only when the value has no usable reading.

### Output Structure

```text
packages/contract/    Zod schemas, sample payloads
packages/sources/     registry config and adapters
apps/api/             Hono API, store, checks, extraction
apps/web/             React and MapLibre UI, capture page
fixtures/             recorded responses, synthetic evidence
```

### Sequencing

Commit U12 to `main` first. Each worktree then runs `git merge main`. Integration order for this update: U12, U13, U14, U16, U17, U15, U11, U19, U20, U18, U10.

**Protected path:** U12, U13, U14, U15, the National Grid part of U16, U19, and U20. An address must reach a map and a concept sheet on Worcester before anything else ships.

**Cut order under time pressure:** the PG&E requirements table, then the third region (U18), then rates (U17), then Earth Engine (U11). Earth Engine sits last because the team chose it. List anything cut as not built, with the reason.

| Lane | Branch | Units | Ports |
|---|---|---|---|
| Lead and contract owner | `main` | U12, U20, U10 | none |
| Backend | `worktree-backend` | U13, U14, U15, U16, U17, U18, U11 | API 127.0.0.1:8787, capture 127.0.0.1:8788 |
| UI | `worktree-ui` | U19 | Web 5173 |

The lead is the shared-contract owner. Only the lead changes `packages/contract` or adds dependencies.

### Risks

| Risk | Mitigation |
|---|---|
| Earth Engine access doesn't clear | The protected path doesn't need it: USGS supplies elevation. Without access, the source reports missing with the reason |
| More sources slow the first map | Run sources in parallel and draw as results arrive. Cold MassGIS queries took 30 to 55 seconds, so the demo runs Worcester once beforehand |
| A flagged, overlapping, or stale public layer reads as fact | Every value stays `inferred` with its source date, and overlaps become candidates |
| Breadth buries the engineer | Details wait for selection (R51), and values are grouped by family |
| Public service, tunnel, or model call fails during the demo | Snapshot mode covers the whole loop (KTD9) |
| Nearest line isn't the one serving the building | Multiple candidates become conflicting (R12), owned by the utility and resolved by the Pre-Application Report. All utility values start inferred |
| Feeder count depends on the search radius (0 to 12 candidates across Worcester parcels and radii tried) | Fixed buffer stored on each observation, and candidates reported apart from source conflicts |
| Phone GPS lands in the wrong place | Error is measured and shown, and the engineer can move the pin |
| Draft misreads a rating | Side-by-side confirmation (R8, R20). A digit error can look plausible, so standard-rating checks only flag, never confirm |

---

## Implementation Units

### U1. Repo scaffold and shared contract

- **Goal:** Commit the value model, sample payloads, and project setup that both worktrees build from.
- **Requirements:** R7, R8, R9, R13, R22
- **Dependencies:** None
- **Files:** `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `packages/contract/src/index.ts`, `packages/contract/src/routes.ts`, `packages/contract/src/index.test.ts`, `packages/contract/samples/record.sample.json`, `packages/contract/samples/readiness.sample.json`, `packages/contract/samples/capture.sample.json`, `docs/project/decision.md`, `CLAUDE.md`
- **Approach:**
  1. Define schemas for source, observation, value, record version, readiness item, gap, and capture request. Include evidence identity (source, query, content hash), map feature geometry, and a base map descriptor.
  2. Define a route table with request and response schemas for running a site, reading a version, confirming, correcting, resolving a conflict, creating a capture link, and submitting a capture, so the two lanes share one interface.
  3. Write sample payloads that cover every state and owner, marked synthetic.
  4. Ignore `.env`, local databases, and uploads in Git.
  5. Update the phase line in `CLAUDE.md` to match `decision.md`.
- **Patterns to follow:** The per-value concept table in `docs/research/2026-11-07-option1-plan-set-bridge.md`.
- **Test scenarios:**
  - A value with `verified` and no named verifier fails validation.
  - A value with `conflicting` and one candidate fails validation.
  - A synthetic observation with no synthetic flag fails validation.
  - All sample payloads pass validation.
- **Verification:** Both worktrees can merge `main` and import the contract. `npm test` and `npm run typecheck` pass.

### U2. Source registry and ArcGIS REST adapter

- **Goal:** Query any configured map service by point, polygon, or attribute filter and return normalized observations, and fix the demo parcel early.
- **Requirements:** R3, R4, R7
- **Dependencies:** U1
- **Files:** `packages/sources/src/registry.ts`, `packages/sources/src/arcgis.ts`, `packages/sources/src/arcgis.test.ts`, `packages/sources/config/massachusetts.ts`, `packages/sources/config/california-pge.ts`, `fixtures/arcgis/`
- **Approach:**
  1. Each entry names the service URL, layer, search radius, field-to-record mapping, license note, and a `robots_checked` date.
  2. Refuse to run an entry marked barred, and report it as a person-only route.
  3. Record real responses into `fixtures/` with source and date.
  4. Set the lot-size tolerance before looking at candidates: 3%, a team value for the demo until EQORE gives one. It keeps AE1's 5% gap conflicting.
  5. Screen Worcester industrial parcels and choose one with use code 4xx, one L3 address match, a National Grid feeder result, and a roofprint. Report the choice to the lead for `decision.md`. Report whatever conflicts appear, including none. Show AE1's Holliston case as a separate labeled fixture if needed, and never plant a conflict in real data.
- **Execution note:** Start from recorded responses of the real services, so field names come from real data.
- **Test scenarios:**
  - A point query against the recorded MassGIS response yields parcel ID, boundary, and lot size with source, retrieval date, and source date.
  - An attribute filter and a polygon query run through the same adapter from recorded responses.
  - An entry marked barred makes no request and returns a person-only route.
  - An empty result yields missing with the query recorded, not "none".
  - A service error yields missing with the reason, and other sources still run.
  - A new test entry using the same adapter works with no code change.
- **Verification:** Recorded responses from MassGIS, National Grid, and PG&E all normalize through the same adapter. The demo parcel is recorded and meets the criteria.

### U3. Physical data collection

- **Goal:** Resolve the site from an address and fill the physical half of the record, with Massachusetts working before any Earth Engine code exists.
- **Requirements:** R1, R11, R12
- **Dependencies:** U2
- **Files:** `packages/sources/src/resolve-site.ts`, `packages/sources/src/resolve-site.test.ts`, `packages/sources/src/checks/physical.ts`, `packages/sources/src/checks/physical.test.ts`, `packages/sources/src/geocode.ts`
- **Approach:**
  1. Where the region has a parcel source, look up the parcel by normalized address and city (KTD1). Query building outlines with the parcel polygon, and utility layers from the parcel, as set per source in the registry.
  2. Where it has none, use the Census point and label the location as interpolated.
  3. On zero or several matches from either lookup, store no site values yet and have A1 choose a listed candidate or place a map pin. Record the location as inferred with the method used.
  4. Use MassGIS tiles for imagery in Massachusetts. U11 adds Earth Engine.
  5. Apply deterministic checks: blanks to missing, polygon area against stated lot size, roofprint date against other evidence.
- **Test scenarios:**
  - Covers AE1. A recorded 11 Bartzak Dr parcel yields missing building area and conflicting lot size with both values.
  - Lot sizes within tolerance yield a single inferred value.
  - A roofprint with `SOURCEDATE` 2011 carries that source date and reference grade.
  - A recorded Census response for 11 Bartzak Dr doesn't anchor the site. The address lookup returns parcel `M_206064_886636`.
  - An address with several parcel or geocoder matches lists every candidate and stores no site values until A1 chooses.
  - An address with no match offers a map pin, and the location records that method.
  - A Fremont address with no configured parcel source records parcel and building outline as missing, with a person route.
- **Verification:** Worcester and Fremont addresses each produce a physical record from recorded data, with all gaps labeled.

### U4. Utility-side collection

- **Goal:** Fill serving utility, feeder, substation, voltage, phase, and hosting capacity from utility services.
- **Requirements:** R2, R12
- **Dependencies:** U2
- **Files:** `packages/sources/src/checks/grid.ts`, `packages/sources/src/checks/grid.test.ts`, `packages/sources/config/massachusetts.ts`, `packages/sources/config/california-pge.ts`, `fixtures/arcgis/`
- **Approach:** Map National Grid and PG&E fields to one record shape, convert units, and keep each source's analysis date. Label all values as utility-published context for the location queried. Query from the resolved parcel with a fixed buffer, set from the recorded Worcester fixtures and stored on each observation. Keep multiple feeders as conflicting (R12), with the utility as owner and the Pre-Application Report as the route that resolves it. Set serving utility as inferred with method `source_read` from the configured service that returned a feeder, and as missing when none did.
- **Test scenarios:**
  - A recorded Worcester response lists each candidate feeder with substation, voltage, phase, and hosting capacity in MW, and sets serving utility to National Grid.
  - A recorded Fremont response yields a 21 kV feeder, 3 phase, and its screen result with analysis date.
  - Covers AE2. Two candidate feeders yield conflicting with both listed.
  - Holliston returning 0 National Grid feeders yields missing feeder and missing serving utility, and doesn't assert another utility.
  - Values in kV and MW are never mixed with kW or V without conversion.
- **Verification:** The same record fields fill from both utilities using configuration.

### U5. Record store and API

- **Goal:** Persist observations, derive current state, and serve the record.
- **Requirements:** R8, R10, R13, R20
- **Dependencies:** U1, U3, U4
- **Files:** `apps/api/src/server.ts`, `apps/api/src/store.ts`, `apps/api/src/store.test.ts`, `apps/api/src/routes.ts`, `apps/api/src/routes.test.ts`, `apps/api/src/run.ts`
- **Approach:** Store append-only observations (KTD6). Compute state from observations with enforced transitions. Each run or human action creates a new record version. Expose routes for running a site, reading a version, confirming or correcting a value, and resolving a conflict. Bind the API to 127.0.0.1:8787. The web app reaches it through Vite's proxy, and the API sends no CORS headers.
- **Test scenarios:**
  - Covers AE3. Draft 800 A, then correction to 600 A, keeps both and makes 600 A verified with the verifier's name.
  - A verify request with no named person or evidence is rejected.
  - Newer evidence disagreeing with a verified value moves it to conflicting and keeps the verifier's record.
  - A verified lot-size conflict stays verified after a re-run from the same fixture, with the repeat read appended.
  - A named person with cited evidence can verify a missing or unreadable value. Without either, the request is rejected.
  - A failed retake on an inferred value leaves it inferred.
  - Reading an older version returns its original values.
  - Integration: running a site end to end from fixtures stores observations and returns a version with every source accounted for.
- **Verification:** No code path updates or deletes an observation.

### U6. Readiness check and ranked gaps

- **Goal:** Compare the record with utility requirements, rank gaps, and draft requests.
- **Requirements:** R16, R17, R18, R19
- **Dependencies:** U5
- **Files:** `apps/api/src/requirements/national-grid-exhibit-c.ts`, `apps/api/src/requirements/pge-rule-21.ts`, `apps/api/src/readiness.ts`, `apps/api/src/readiness.test.ts`, `apps/api/src/requests.ts`, `apps/api/src/requests.test.ts`
- **Approach:**
  1. Encode from M.D.P.U. No. 1632, effective May 1, 2026, compared with the old form in `docs/research/2026-11-07-national-grid-tariff-1632.md`.
  2. Encode tables from that form and the PG&E required documents, using the inputs doc and KTD4's two row kinds. Record form identity and date, and mark Eversource excerpts out of scope.
  3. Select the table from the record's serving utility. When it's missing or has no table, say that no requirements table applies, name the bill as the next request, and show no readiness percentage.
  4. Rank evidence requests by how many required rows each can fill, then by route cost, with a stable tie-break. Don't tune the ranking to favor a photo.
  5. Draft requests from templates, marked as drafts for a person to send.
- **Test scenarios:**
  - An empty record lists every required item with its owner.
  - Filling meter number from a verified bill clears that item only.
  - A confirmed nameplate value clears its one-line input row and updates the ranking, while the one-line itself stays engineer-owned.
  - A Holliston record with no serving utility shows no readiness percentage and names the bill.
  - Inferred feeder data doesn't satisfy an item requiring the Pre-Application Report, and is shown as a preview.
  - Engineer-owned items stay engineer-owned regardless of data.
  - Covers AE4. A bus rating routes to a qualified person with no capture link.
  - Ranking is the same across repeated runs on the same version.
  - At 250 kW or above the Pre-Application Report is required. Below that it's optional. With no size given, the report says both cases, since size is an engineer decision.
- **Verification:** The form rows in the demo site's report match a hand check against the form the table cites.

### U7. Site map and engineer review UI

- **Goal:** Show the record on a map and let the engineer inspect, correct, and verify.
- **Requirements:** R14, R15, R16, R17, R22
- **Dependencies:** U1, then U5 and U6 at integration
- **Files:** `apps/web/src/App.tsx`, `apps/web/src/map/SiteMap.tsx`, `apps/web/src/map/layers.ts`, `apps/web/src/panels/EvidencePanel.tsx`, `apps/web/src/panels/ReadinessPanel.tsx`, `apps/web/src/panels/ResolveControls.tsx`, `apps/web/src/api.ts`, `apps/web/src/**/*.test.tsx`
- **Approach:**
  1. Build against the sample payloads first. MapLibre shows the MassGIS or Earth Engine base, property line, outline, utility lines, and (E) labels, following Sample 1's G-100 layout. Selecting a feature opens its source, state, grade, and original evidence. Status shows as text, not color alone.
  2. Lead with the ranked top gap in the readiness panel, with the map as the main canvas. The gap offers a create-link action, which is absent for qualified-person items.
  3. Show each source as pending, done, missing with reason, or snapshot during and after a run. Offer candidate choice or a map pin when an address doesn't resolve to one match.
  4. Resolving a value offers a candidate choice on conflicts, a correction field with unit, and required verifier name and evidence inputs with messages matching the API's rejection reasons. History shows drafts and corrections.
- **Test scenarios:**
  - Each of the five states renders distinctly with a text label.
  - Selecting a conflicting value shows every candidate and its source.
  - A qualified-person gap shows no create-link action.
  - A source that failed shows missing with its reason while the others still render.
  - A verify attempt with no name or evidence shows the API's rejection message.
  - Synthetic evidence shows a visible synthetic label, and public data a real-data label.
  - The concept-grade note is visible on the map view and any exported image.
  - A failed confirm request leaves the displayed state unchanged and shows the error.
- **Verification:** In a browser, a person can walk F1 on the seeded record with no API errors. Use `ce-test-browser` or the `run` skill.

### U8. Capture intake and draft extraction

- **Goal:** Accept phone evidence and produce drafts for a person to confirm.
- **Requirements:** R5, R20, R21, R22
- **Dependencies:** U5
- **Files:** `apps/api/src/capture-server.ts`, `apps/api/src/capture.ts`, `apps/api/src/capture.test.ts`, `apps/api/src/extract.ts`, `apps/api/src/extract.test.ts`, `fixtures/evidence/`
- **Approach:**
  1. Create a per-site, per-field unguessable token (KTD10). It closes once its field is verified, expires after 24 hours, and accepts at most 5 uploads. A closed or over-limit token is rejected before anything is stored or any model call runs.
  2. Serve only the token-checked capture routes and the built capture page from a separate listener on 127.0.0.1:8788. The tunnel targets only that port, never Vite on 5173.
  3. Accept an image or PDF within a size and type limit, keep the original with a hash, and record position, heading, and accuracy when supplied. Flag a position outside the record's parcel by more than its stated accuracy, and require a hand-placed pin instead of placing it on the map.
  4. Extract with the KTD8 call, passing file content as data and asking only for named fields.
  5. Apply plausibility checks that flag only.
- **Test scenarios:**
  - A valid token and photo store evidence and create an inferred draft.
  - An invalid token or a token for another field is rejected and stores nothing.
  - An expired token, a token whose field is already verified, and an upload over the limit are each rejected with no model call.
  - Engineer routes return 404 on the capture listener.
  - A position far outside the parcel is flagged and not placed on the map.
  - A model transport error keeps the file, records the failure, leaves the state unchanged, and can be retried.
  - Covers AE5. An image containing instructions changes no state, tested with a mocked model response and a schema check on what's stored.
  - A refusal or schema failure yields unreadable and keeps the file.
  - A 15-minute reading declared in kWh isn't stored as kW.
  - A file that's too large or of the wrong type is rejected.
  - A photo without location is accepted and asks the engineer to place the pin.
- **Verification:** Tests run with no live model call. One manual run confirms the live call on a labeled synthetic image.

### U9. Phone capture page and confirmation

- **Goal:** Let the facility contact capture in a phone browser, and let the engineer confirm against the photo.
- **Requirements:** R5, R6, R8, R14
- **Dependencies:** U7, U8
- **Files:** `apps/web/capture.html`, `apps/web/vite.config.ts`, `apps/web/src/capture/CapturePage.tsx`, `apps/web/src/capture/CapturePage.test.tsx`, `apps/web/src/panels/ConfirmPanel.tsx`, `apps/web/src/panels/ConfirmPanel.test.tsx`
- **Approach:** One screen per request: a cropped aerial with one pin, the question, the doors-closed safety text, and the camera. It's a separate Vite entry, built for the capture listener, and shares no engineer routes. The page shows uploading, success with a note that nothing is verified yet, a rejected file with its limits, an invalid or expired link, and an upload failure that keeps the chosen photo for retry. The engineer sees the photo and draft side by side. Confirming adds the (E) label to the map. Have an EQORE engineer review the safety wording before real use.
- **Test scenarios:**
  - The safety text appears on every capture prompt.
  - Rejected, expired-link, and failed-upload states each show their message, and a failed upload keeps the photo for retry.
  - A denied location permission still allows submission.
  - Confirming a draft updates the map label and readiness state.
  - Correcting a draft shows the corrected value and keeps the draft in history.
  - Moving a pin records it as placed by hand.
  - With no draft, the engineer can enter a value with their name and evidence.
- **Verification:** On a real phone over the tunnel, a teammate captures closed outdoor equipment on the venue capture-trial record from U10, and the label appears in the engineer view. Venue photos never go on the Worcester record.

### U10. Seeded demo and measurements

- **Goal:** Make the closed loop repeatable on real data and measure what it shows.
- **Requirements:** R13, R15, R22, Success Criteria
- **Dependencies:** U1 through U9
- **Files:** `scripts/seed-demo.ts`, `scripts/record-fixtures.ts`, `fixtures/demo/`, `README.md`, `docs/project/decision.md`
- **Approach:**
  1. Seed the parcel chosen in U2, and hide owner names in the demo view. Confirm the Fremont demo address resolves to one match.
  2. Record a snapshot of both regions, including KTD9's saved tiles and recorded drafts.
  3. Create labeled synthetic bill and nameplate evidence for Worcester, with pins marked as placed by hand. Seed a separate capture-trial record next to the venue from public data, labeled as a capture test rather than a customer site.
  4. Record the numbers listed in Success Criteria, each naming the site it was measured on. The geotag distance and link-to-verified time come from the capture trial, with the true position set by a person standing at the equipment. Report the required-item share for form rows and input rows separately, and feeder candidates apart from source conflicts.
  5. If EQORE gives no current time, have a teammate time collecting the same public facts by hand on the demo parcel. Label it "team-timed, public lookups only, not EQORE's process", and state no savings figure.
  6. Document setup, sample data, limits, and the demo path.
- **Execution note:** This is mostly scripting and packaging, so prefer a full runtime check of the demo path over unit tests.
- **Test expectation:** none -- covered by the demo path check below.
- **Verification:** From a clean checkout, the seed command and README steps reproduce F1 and F2 on Worcester with the network off, in snapshot mode. The live phone capture is the one step that needs a network.

### U11. Earth Engine adapter

- **Goal:** Add slope, land cover, and imagery from Google Earth Engine, the source the team chose on engineers' advice.
- **Requirements:** R1, R3
- **Dependencies:** U2, U3, and a successful test call with the service account
- **Files:** `packages/sources/src/earthengine.ts`, `packages/sources/src/earthengine.test.ts`, `packages/sources/config/massachusetts.ts`, `packages/sources/config/california-pge.ts`, `fixtures/earthengine/`
- **Approach:** Use the Earth Engine client with a service account from `.env` (KTD3). Massachusetts keeps MassGIS imagery and takes slope and land cover from Earth Engine, which also feeds candidate-area surface. Fremont also takes imagery. Confirm dataset IDs at implementation.
- **Test scenarios:**
  - Recorded Earth Engine responses yield slope, land cover, and imagery values with source, retrieval date, and method.
  - A configured MassGIS base takes priority over Earth Engine imagery in Massachusetts.
  - Missing credentials yield missing with the reason, and the Massachusetts path still completes.
- **Verification:** A Fremont address shows Earth Engine imagery on the map from recorded data, and Worcester's candidate areas gain a surface. If this unit is cut, it's listed as not built with the reason.

### U12. Contract for the wider record

- **Goal:** Commit what the other units need, including the stale-confirm and evidence decisions.
- **Requirements:** R8, R14, R51, R52, R53, R54
- **Dependencies:** None
- **Files:** `packages/contract/src/schemas.ts`, `packages/contract/src/routes.ts`, `packages/contract/src/site-map.test.ts`, `packages/contract/samples/`, `apps/api/src/run.ts`, `apps/api/src/routes.test.ts`, `apps/web/src/api.ts`, `apps/web/src/mockApi.ts`
- **Approach:**
  1. Bump the contract version. Add feature kinds for candidate areas, substations, roads, and mapped constraints, and a `family` on values (physical, utility, energy, customer, decision).
  2. Add a coverage summary to the record and the export: catalog fields filled, and the rest by owner.
  3. Make `expectedObservationId` required on confirm, with a `stale_value` error (KTD32), and update the API and the UI's call.
- **Test scenarios:**
  - Covers AE23. A confirm naming an older observation returns 409 `stale_value` and appends nothing.
  - A confirm naming the current observation verifies the value.
  - An SVG declared as `image/png` is rejected, and a stored original is served with `nosniff` (KTD33).
  - A multipart upload with a foreign Origin returns 403 (KTD34).
  - All sample payloads pass validation and are marked synthetic.
- **Verification:** `npm test` and `npm run typecheck` pass, and both worktrees merge cleanly.

### U13. Catalog as the collection target

- **Goal:** Make every catalog field either collected or owned, so the record stops following the form's list.
- **Requirements:** R53
- **Dependencies:** U12
- **Files:** `packages/sources/src/catalog-map.ts`, `packages/sources/src/catalog-map.test.ts`, `packages/sources/src/fields.ts`
- **Approach:** Map each record field to its catalog key. Report the catalog fields no source or person route covers. Fields that only an engineer or a site visit can supply name that owner.
- **Test scenarios:**
  - Every catalog key appears in the map, or the test fails naming it.
  - Coverage for a recorded Worcester run counts filled fields and lists the rest by owner.
  - A catalog field with no route fails the test, so a new field can't be dropped silently.
- **Verification:** The Worcester coverage report matches a hand count.

### U14. Wider physical collection

- **Goal:** Collect the physical sources in the source map.
- **Requirements:** R1, R3, R4, R7, R14
- **Dependencies:** U12, U13
- **Files:** `packages/sources/config/massachusetts.ts`, `packages/sources/src/json-api.ts`, `packages/sources/src/json-api.test.ts`, `packages/sources/src/checks/physical.ts`, `packages/sources/src/checks/physical.test.ts`, `fixtures/`
- **Approach:**
  1. Add registry entries for MassDOT roads, municipalities, fire stations, and wetlands, and the L3 zoning, stories, and use fields.
  2. Add a small JSON adapter for USGS elevation, sampling points across the parcel for local slope.
  3. Estimate height as stories times an assumed floor height, with method `assumed` and the assumption stated.
  4. Check `robots.txt` and record each entry's status before its first query.
- **Execution note:** Start from recorded responses of the real services.
- **Test scenarios:**
  - A recorded MassDOT response yields street, width in feet, and lanes for the fronting road.
  - No wetland within the search area stores "none mapped within N m", with the distance, and not missing.
  - A parcel with `STORIES` 0 or blank stores height as missing, not zero.
  - An entry marked barred makes no request.
  - Owner fields never reach a stored value or a fixture.
- **Verification:** A Worcester run fills the new values from recorded data, each with its source and date.

### U15. Where batteries could go

- **Goal:** Show open areas that could hold batteries.
- **Requirements:** R54
- **Dependencies:** U12, U14
- **Files:** `packages/sources/src/checks/candidate-areas.ts`, `packages/sources/src/checks/candidate-areas.test.ts`
- **Approach:** Follow KTD35, buffering road centerlines by their mapped width. Drop slivers below a stated minimum size. Annotate each area with size, distance to the nearest building, lot line, and mapped line, and with surface and slope where a source supplies them. Each is `inferred` with method `computed`.
- **Test scenarios:**
  - Covers AE21. No candidate overlaps a roofprint or mapped wetland.
  - A parcel fully covered by a building yields no candidates, stated as such.
  - An area below the minimum is dropped, and the minimum is on the record.
  - Missing slope data leaves slope missing and keeps the area.
- **Verification:** On Worcester, a person compares the candidate areas with the aerial, and the areas exclude buildings and roads and fall inside the parcel.

### U16. Deeper utility data

- **Goal:** Collect the National Grid and PG&E layers in the source map through configuration.
- **Requirements:** R2, R3, R12
- **Dependencies:** U12
- **Files:** `packages/sources/config/massachusetts.ts`, `packages/sources/config/california-pge.ts`, `packages/sources/src/checks/grid.ts`, `packages/sources/src/checks/grid.test.ts`, `fixtures/arcgis/`
- **Approach:** Add entries and named field transforms. Attach loading, hosting capacity, study status, and overhead or underground to each feeder candidate. Report substations and transmission as nearby context with measured distance, never as what serves the site.
- **Test scenarios:**
  - A recorded feeder `05_01_27W2` carries 54.3% peak loading, its forecast, 11.8 MVA rating, underground construction, and study status.
  - Nodal hosting capacity keeps each limiting factor and names the lowest.
  - A sentinel such as PG&E's `-99.99` is stored as missing and not as a number.
  - Substation capacity in MW is never mixed with kW without conversion.
  - No new adapter code is needed for these entries beyond named transforms.
- **Verification:** The same record fields fill from both utilities using configuration.

### U17. Serving utility anywhere, and rates

- **Goal:** Name the utility and rate schedules for any US address.
- **Requirements:** R2, R3
- **Dependencies:** U12, U14
- **Files:** `packages/sources/src/checks/energy.ts`, `packages/sources/src/checks/energy.test.ts`, `packages/sources/config/national.ts`, `fixtures/`
- **Approach:** Add the service territory layer, keeping overlaps as candidates and using a utility's returned feeder to settle them. Add OpenEI rates through the JSON adapter, labeled as candidates until a bill confirms the schedule.
- **Test scenarios:**
  - Worcester resolves to National Grid's Massachusetts Electric through the territory layer and its feeder.
  - Holliston lists every overlapping territory and asserts none, and shows no readiness share.
  - A missing OpenEI key yields missing with the reason.
  - Rate schedules are stored as candidates and never as the site's confirmed tariff.
- **Verification:** Holliston names candidate utilities from recorded data, and Worcester lists commercial rate schedules with demand charges.

### U18. A third region by configuration

- **Goal:** Show that adding a region takes configuration only.
- **Requirements:** R3, R56
- **Dependencies:** U14, U16
- **Files:** `packages/sources/config/california-santa-clara.ts`, `fixtures/arcgis/`
- **Approach:** Read Santa Clara County's terms first, and stop and ask if they bar access. Choose a commercial parcel in PG&E territory, add entries for parcels and buildings, and reuse PG&E's. Time the work from a clean start. If this needs code beyond named field transforms, report that as a finding against KTD1.
- **Test scenarios:**
  - A recorded Santa Clara response yields a parcel, outlines, and a PG&E feeder.
  - The change adds a config file and fixtures, and no adapter code.
- **Verification:** A Santa Clara address reaches a map in the running app, and the elapsed time to add it is recorded.

### U19. Map-first screen

- **Goal:** Replace the report-first screen with the map, built on the wider record.
- **Requirements:** R14, R15, R22, R50, R51, R52
- **Dependencies:** U12, then U13 through U16 at integration
- **Files:** `apps/web/src/App.tsx`, `apps/web/src/map/SiteMap.tsx`, `apps/web/src/map/layers.ts`, `apps/web/src/panels/`, `apps/web/src/**/*.test.tsx`
- **Approach:**
  1. Submitting an address leads straight to the map, fitted to the parcel, drawn as sources answer.
  2. Draw dimension lines, candidate areas, constraints, roads, and substations, as well as what exists today.
  3. One line says what's known and what's next. Selecting a feature or the line opens its details, and values group by family.
  4. Keep confirm and correct one click from a selected value, and send `expectedObservationId`.
  5. Show real public data and synthetic evidence separately, so one synthetic file doesn't relabel a record. Fix the failed-reading text and keep covered controls out of keyboard reach.
- **Patterns to follow:** The UI plan's design system and capture states. This unit overrides its report-first layout.
- **Test scenarios:**
  - Covers AE20. After submitting an address, the map renders with no further click and no source list visible.
  - Selecting a dimension line opens its value, source, method, and state.
  - The concept-grade note, data labels, and unverified signal stay visible with every panel closed.
  - A record with one synthetic file shows both real and synthetic labels.
  - A stale confirm shows the newer value and asks the engineer to review it.
  - A failed source appears in the details and doesn't block the map.
- **Verification:** In a browser at desktop and phone widths, a person walks F1 on Worcester with no console errors.

### U20. Hand off to the drawing agent

- **Goal:** Build a concept sheet from collected data.
- **Requirements:** R15, R52, R55
- **Dependencies:** U13, U14, U15, U19
- **Files:** `packages/drc/src/from-site-map.ts`, `packages/drc/src/from-site-map.test.ts`, `apps/api/src/routes.ts`, `apps/web/src/panels/`
- **Approach:** Follow KTD36. Map the export's values to catalog keys using U13's map, and take the pad zone from the largest candidate area, marked as such. Run `exportToSetback` and `compile`. Show the sheet with its concept-grade note and every placeholder gap. If the team names another drawing agent, target what it reads instead.
- **Test scenarios:**
  - A recorded Worcester export produces a `SiteRecord` with lot and building dimensions and road side, and no invented electrical value.
  - Each missing field the engine needs appears as a placeholder gap.
  - An irregular parcel keeps its fitted-box flag through the handoff.
  - The output carries the concept-grade note.
- **Verification:** Worcester produces a concept sheet in the running app, and a person checks its lot and building dimensions against the map.

---

## Verification Contract

| Check | Command or action | Expected result |
|---|---|---|
| Unit and integration tests | `npm test` | All pass with no network calls |
| Types | `npm run typecheck` | No errors |
| Contract | Run from each worktree after `git merge main` | Same contract version in both |
| Provenance | Code review of `apps/api/src/store.ts` | No update or delete on observations |
| LLM boundary | Code review and tests in U5 and U8 | No path from model output to `verified` |
| Demo loop | `npm run demo:seed`, then walk F1 and F2 | Evidence is inspectable, a correction is kept, and the state changes |
| Fallback | With the network off, walk F1 and F2 on Worcester in snapshot mode | Base map and draft both load, a banner says it's a snapshot, and the upload is recorded as made by the engineer |
| Capture boundary | With the tunnel up, request engineer routes and the engineer UI through the tunnel URL, and port 8787 from the machine's LAN address | Tunnel returns 404 on those routes, and 8787 refuses the connection |
| Evidence stability | Verify a conflict, then re-run the site from the same fixture | The value stays verified |
| Least friction | Enter an address in the running app | The map appears with no further click, and details stay closed |
| Collection target | `npm test` in `packages/sources` | Every catalog field is collected or names its owner |
| Drawing handoff | Run Worcester through to a concept sheet | The sheet is labeled concept-grade, and its placeholders are listed |
| Stale confirm | Re-run a site while a value is open, then confirm it | Refused as stale, with nothing appended |
| NavigateLA unused | Search the code for `lacity` and `navigatela` | No matches outside docs |

---

## Definition of Done

- All R-IDs are met or listed as not built, with the reason.
- Every check in the Verification Contract passes.
- An address reaches a map and a concept sheet on Worcester with no further click, on real public data and labeled synthetic customer evidence.
- Fremont demonstrates configured utility data, and a third region shows the configuration path, unless cut. Anything cut under Sequencing is listed as not built, with the reason.
- The merged code has had one combined code review.
- Numbers shown in the demo were measured in the demo. No time savings or approval claims appear.
- D1, D2, D5, D8, D9, D11, D12, D13, D14, and D15 are current in `docs/project/decision.md`.
- Abandoned-attempt code is removed from the diff.
- Secrets, local databases, and uploads are not in Git.
