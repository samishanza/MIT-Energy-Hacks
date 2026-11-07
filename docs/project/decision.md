# Decisions

Open decisions, assumptions, and team choices. EQORE's Challenge Brief and the latest context are in [context.md](context.md).

**Current phase:** Build, under `docs/plans/2026-11-07-0954-feat-site-data-collection-plan.md`. D1 and D2 are decided below at the team's request ("make your best judgement"). The shared contract is committed in `packages/contract`, and the backend and UI lanes build from it.

## Open decisions

| ID | Decision | Status | Owner |
|---|---|---|---|
| D1 | Primary bottleneck (one of the four options in context.md) | Decided: Option 1, aimed at the grid connection application | Team |
| D2 | Stack | Decided: TypeScript on Node 24, React, Vite, MapLibre, Hono, SQLite, Zod. See KTD7 in the plan | Lead |
| D3 | Primary user and the one manual handoff we replace | Assumed: design engineer, assembling site facts for the application. Confirm with EQORE | Team |
| D4 | Source of demo data: redacted from EQORE, public, or labeled synthetic | Open, ask EQORE | Team |
| D5 | Owner of shared types and schemas | Decided: the session on `main`. It also owns dependency additions | Team |
| D6 | Writing-task isolation: Compound Engineering workers or named Git worktrees | Decided: named worktrees, `worktree-backend` and `worktree-ui` | Lead |
| D8 | Lead who coordinates implementation | Decided: the session on `main` runs the shared contract, integration, and the demo | Team |
| D9 | Data collection approach for Option 1: software, hardware, or both, and the repeatable method for populating the database | Decided: software. Physical data from public services and Google Earth Engine, utility-side data from public utility or city services, customer-side data by phone link. Earth Engine is assumed to be what the engineers meant; confirm with them | Team |
| D11 | Demo state: Massachusetts or California | Decided: National Grid site in Worcester, MA, with PG&E in Fremont, CA as the second region. Demo parcel below | Lead |
| D12 | Scope: narrow the target to the interconnection application and the drawings it requires, from signed contract until the application is submitted | Decided at the team's request, not separately reviewed line by line | Team |
| D13 | Direction: least friction. An address produces the site map with no other steps, details appear only on selection, more measurements and public energy data are collected, and the site map feeds an agent and the drawing step | Decided by the team: the drawing agent should build everything from the collected data. NavigateLA isn't used by the product for now, and no Los Angeles region is built. The team keeps it only as a real-world example of technical electrical data published by a city. A 2024 copy of its disclaimer bars download without a sublicensing agreement, and `navigatela.lacity.org` disallows robots. The live wording hasn't been checked. Unchanged: only a named person verifies, and the map keeps its concept-grade note and synthetic labels | Team |
| D14 | How the agent packages join the record | Decided: the teammate's agent layer wins where it overlaps the plan. `packages/sources` stays the only data puller, `packages/contract` stays the schema, and the layer's models are adapted, not replaced. The teammate's sheet and Setback are the drawing agent | Team |
| D15 | Security calls from the UI lane: evidence checked by file signature and served with `nosniff`, confirm must name the observation the person saw, and the engineer API refuses foreign Origin and Host | Decided, see KTD32 to KTD34 in the plan | Lead |
| D16 | Priorities: the data pipeline and the novelty and quality of what it collects come first, and the rest is judged by that. The repo is private, and the sample PDFs stay in it. The concept sheet shows no battery array until an engineer enters a pack and count. The team chose not to pursue the key exposed in old branch history, and won't reuse it | Decided by the team, with the sheet call left to the lead's judgment | Team |
| D19 | What the product is | Decided by the team: a site map and site plan from public records, with every fact traced, to make decisions easier. Customer input, engineer decisions, and the application readiness report aren't required and leave the first view. The code for them stays | Team |
| D18 | Sources whose terms bar or don't clear access | Decided by the lead: Eversource's site terms appear to bar use without written permission, so its addresses get their utility from the territory layer and a person route, and written permission would reopen it. The Esri flood layer is removed until someone reads Esri's product terms, so flood zone is a person route. MassGIS lidar stays, because nothing found bars it, with its unread rules noted on each value | Lead |
| D17 | Where it must work, and the demo | Decided: it should work across Massachusetts. The live phone capture at a venue is dropped, and the demo uses a labeled sample file | Team |

## Demo parcel

**100 Research Dr, Worcester, MA**, MassGIS L3 parcel `F_583026_2925576`. It's real public data and isn't a known EQORE project. Keep owner names out of the demo view.

**How it was chosen:** the rule and the 3% lot-size tolerance were fixed before screening. Take Worcester use-code 4xx parcels by highest assessed value, and use the first that meets all the criteria. It's use code 4040 (research and development), has one L3 address match and a National Grid feeder result, and has 6 roofprints centered on the parcel (5 dated 2011, 1 dated 2023-04). L3 lists 471,558 sq ft of building area, built in 1994.

**What it shows, with nothing planted:**

- **Lot size conflict:** L3 states 29.92 acres and the polygon computes to 30.931, a 3.3% gap. That's only just over the tolerance, so don't present it as a large discrepancy.
- **Feeder candidates:** 4 at the fixed 30 m buffer, reported apart from source conflicts: `05_01_10J323` and `05_01_10J366` (Rena Street, 4.16 kV), `05_01_27W2` and `05_01_27W3` (Bloomingdale, 13.8 kV). The count depends on the buffer: an earlier screen found 3 touching the parcel and 5 at 100 m.

## Hackathon facts we still need

Not in the brief, so do not assume them:

- Submission deadline and required deliverables
- Judging criteria
- Team members and their strengths

## Team choices

| ID | Choice | Date |
|---|---|---|
| D7 | Shared remote: https://github.com/maximozhang/MIT-Energy-Hacks.git | 2026-11-07 |
| D10 | Windows-native development, not WSL. No tmux. Agent team teammates run in-process, and independent sessions use named worktrees in their own terminals. | 2026-11-07 |

## Public statements by EQORE

Checked on 2026-11-07. These are marketing and job-posting claims, not confirmed workflow.

- [eqore.com](https://www.eqore.com): "Turnkey systems for commercial and industrial facilities." "One team handles design, permitting, installation and operation." "3–6 months" typically from contract to a live system. Built for facilities spending $10K+ a month on electricity. Assessment follows up for "your bill and interval data."
- [Project Manager, Deployments](https://www.eqore.com/careers): owns projects "from signed contract through commissioning," covering "schedule, permits, interconnection, field verification, and the customer."
- [Energy Markets & Pricing Engineer](https://www.eqore.com/careers): works "from raw interval data and tariffs to a system size and savings estimate we can stand behind."

## Assumptions to validate with EQORE

From the brief's working context. None of these are confirmed:

- EQORE is early-stage.
- Its internal workflows may still be evolving.
- Deployment templates and historical datasets may be limited.

## Challenge area comparison

**Superseded on 2026-11-07.** This comparison scores the earlier brief's four areas, not the four options in [context.md](context.md). Only 01 maps closely to a current option, and its demo and data access scores need redoing for public sources. Keep it for its research links, and do not use it to decide D1.

Scores are judgment calls from 1 to 5, where higher is better. For build effort, higher means less work. We found no source that measures delay or rework in C&I storage, so every pain score is an inference from analogs and qualitative sources. "Not found" below means not found in about 10 searches per research pass, not proven absent.

| Area | User pain | Data access | Build effort | Demo strength | Main risk |
|---|---|---|---|---|---|
| 01 Site data | 4 | 3 | 4 | 4 | Readiness rules are ours, so planted conflicts can look rigged |
| 03 Review and revisions | 3 | 2 | 4 | 4 | Reads as an issue tracker with attachments |
| 02 Site plans | 2 | 2 | 2 | 4 | Consistency across toy drawings proves little about real ones |
| 04 Installation | 2 | 2 | 3 | 3 | Reads as a generic scheduler, and its pain needs concurrency EQORE may not have yet |

### Evidence by area

**01 Site data**
- Pain: EQORE says it asks for the bill and interval data at assessment, so this step likely recurs on every project. [Pure Power](https://www.purepower.com/video-blogs/bridging-the-information-gap-in-commercial-pv-projects) says missing inputs can delay commercial PV by weeks or months, which is an unmeasured opinion from an analog.
- Data: real load shapes ([ComStock](https://registry.opendata.aws/nrel-pds-building-stock/), simulated) and tariffs ([OpenEI URDB](https://openei.org/wiki/Utility_Rate_Database)). Bills, forms, photos, and drawings must be synthetic.
- Existing tools: [Energy Toolbase](https://www.energytoolbase.com/blog/general-interest/the-value-of-interval-data-for-modeling-solar-and-energy-storage/) handles interval upload and cleanup. Hypothesis: cross-document conflict detection with field-level provenance is underserved. Only this one tool was reviewed.

**03 Review and revisions**
- Pain: permitting coordination is linked to rework ([Burns & McDonnell](https://blog.burnsmcd.com/10-insights-for-navigating-bess-codes-constructability-and-safety), qualitative). No commercial resubmittal rates were found.
- Data: [CT Siting Council Petition 1607](https://portal.ct.gov/csc/3_petitions/petition-nos-1601-1700/pe1607) lists regulator interrogatories and revised plans for a 4 MW project (index read, contents unopened). No AHJ or utility correction letters were found, so comments must be synthetic.
- Existing tools: [Procore Submittals](https://support.procore.com/products/online/user-guide/project-level/submittals) has status, ball-in-court, and revisions. Test any gap against it first.

**02 Site plans**
- Utility-scale layout tools exist ([RE STACK](https://restack.pvfarm.io/), [RatedPower](https://ratedpower.com/blog/pre-defined-bess-layouts-reduce-risk/)). No editable C&I plan sets or C&I cabinet spec sheets were found, and drawing templates are unknown.

**04 Installation**
- Only vendor assertions on pain, and aggregate lead times for data ([POWER](https://www.powermag.com/transformers-in-2026-shortage-scramble-or-self-inflicted-crisis)). All project state must be synthetic.

### Option A (recommended): 01 Site data

- **User:** Energy Markets & Pricing Engineer (role from EQORE's careers page; that this person does the reconciliation is an assumption).
- **Manual handoff:** reconciling a customer's bill, interval export, intake form, and drawing into one trusted record before sizing.
- **Demo (all data synthetic and labeled):**
  1. Ingest a warehouse bundle: bill PDF, 15-minute interval CSV, intake form, one-line drawing.
  2. The site shows Blocked with three flags: the CSV's "kW" column peaks at a quarter of the bill's demand (likely kWh per 15 minutes), main service size differs between form and drawing, and the interval data has a gap.
  3. The engineer opens each field's source, confirms the unit correction, and marks service size unverified. Originals are preserved.
  4. The system drafts a request to the facilities manager. The engineer edits and approves it.
  5. A synthetic nameplate photo arrives, the engineer verifies the value, and the site moves to "Ready for engineering review", which does not mean feasible.
- **Deterministic:** unit checks, timestamp coverage, duplicates, required fields, peak reconciliation against a stated tolerance, status transitions.
- **AI:** extraction with source references, drafting the request.
- **Caution:** billing demand can legitimately differ from the interval peak (for example ratchets or on-peak windows), so a mismatch raises a flag for a person and never auto-corrects.
- **Validate with EQORE:** On a recent delayed project, which missing or conflicting fields held up sizing or engineering?

### Option B: 03 Review and revisions

- **User:** Project Manager, Deployments (role from EQORE's careers page).
- **Manual handoff:** turning a reviewer's comment letter into tracked items and a response package.
- **Demo (all data synthetic and labeled):**
  1. Ingest a permitting comment letter and a utility email, both written against drawing Rev B.
  2. Items appear, each linked to its source comment and drawing version. One, on a missing clearance dimension, is flagged for having no owner or evidence.
  3. The PM corrects a misparsed comment and assigns an owner.
  4. Rev C arrives and the item moves to Change made. Internally verified is rejected until a named verifier and evidence are attached.
  5. Generate the response package and move the item to Submitted. It reaches Accepted only on a synthetic reviewer reply, and a rejection reopens it.
- **Deterministic:** status transitions and preconditions, version identifiers, required owner and evidence.
- **AI:** splitting and interpreting comments, suggesting evidence, drafting responses. It never determines compliance or acceptance.
- **Validate with EQORE:** Can you walk us through one recent comment cycle and show where tracking broke down or caused rework?

### Why not the others

- **02:** the most visual option, but the highest build risk, with no templates and discouraged CAD integration.
- **04:** the weakest evidence and the closest to the generic dashboard the brief warns against.
