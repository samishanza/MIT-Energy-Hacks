# EQORE Context

Living context for the EQORE track. **Last updated:** 2026-11-07

## How this file updates

- Update it whenever EQORE, a mentor, or the team gives new information that changes what we know.
- Change "Current understanding" and add a line to the "Update log". Label each item as EQORE-stated, team view, or assumption.
- Do not edit the "EQORE Challenge Brief" section. If EQORE issues a new version, add it and log the change.
- Decisions go in [decision.md](decision.md). This file holds what we know, not what we chose.

## Current understanding

**EQORE-stated (from the brief below)**
- EQORE evaluates, designs, and installs behind-the-meter batteries for manufacturers and industrial facilities, mainly in Massachusetts and the Bay Area, with tens to hundreds of projects running at once.
- The four options target pipeline stages 1, 3, 4, and 6.
- EQORE wants an engineer kept in the loop and asks teams to show how long the task takes today and with the tool.
- Site data collection is manual today. EQORE wants to avoid doing it this way and is trying to build in-house methods that reduce the cost of site visits. (Relayed by the team on 2026-11-07, not quoted from EQORE.)

**Team view**
- EQORE mainly wants to automate traditional engineering work, such as site visits and drafting drawings.
- We are leaning toward Option 1, using software or hardware to speed up data collection. This is not final; see D1 and D9 in [decision.md](decision.md).
- We have under 24 hours of build time before the demo.
- The product should both collect the data and aggregate it in our software to create a site map. What the site map must contain is not settled yet.
- The biggest problem is the time it takes to connect to the grid. The product is a data collection and aggregation tool that sets inputs and outputs for each site, so approval to connect comes faster and without mistakes. Software can reduce avoidable rework, but it can't guarantee approval or turnaround.
- The demo will target either Massachusetts or California sites.
- We want a repeatable, novel way to populate the database for any site. We still need to choose it, and the tech stack.
- Collection has two parts: physical data (where batteries can go) and technical electrical specifications (how it can actually be built). From what engineers told the team, physical data would come from Google Earth Engine, and electrical specifications from city-provided resources that map energy delivery and transmission lines, such as NavigateLA in Los Angeles. Neither has been tested yet.

**Still missing**
- The Century Tywood plan set. It is not in this repo, and a filename search of this machine's Documents, Downloads, and Desktop folders did not find it. Two other sample plan sets are now in `provided resources/`.
- The Resources links. They did not survive the paste, except the Holliston URL, which loaded on 2026-11-07.
- How long site data collection takes today. We need this from EQORE for a real before-and-after, and must not invent it.
- The exact submission deadline and the judging criteria.

## How this differs from the earlier brief

[eqore-brief.md](eqore-brief.md) is the team's earlier working brief. **Where the two conflict, the EQORE Challenge Brief below wins.** The challenge areas changed:

| Earlier working brief | EQORE Challenge Brief |
|---|---|
| 01 Reliable site data: reconcile files that facilities send | Option 1 Site data without a site visit: pull mostly public sources into a standardized site record |
| 02 Adaptable site plans | Option 2 Automated plan sets: generate from a site record and standard configurations |
| 03 Review and revisions: track reviewer comments | Option 3 Automated code review: check a plan set against applicable codes |
| 04 Installation coordination: schedules and delays | Option 4 Compliance documentation at scale: track documents, deadlines, and access |

## Update log

- 2026-11-07: Added the EQORE Challenge Brief. Recorded the team's lean toward Option 1 and the differences from the earlier brief.
- 2026-11-07: The team's workflow prompt still names the earlier brief's four areas. Treat the options in the Challenge Brief below as current.
- 2026-11-07: The team reported under 24 hours of build time before the demo.
- 2026-11-07: The team relayed that site data collection is manual today and that EQORE is building in-house methods to reduce site visit costs. We still have no time or cost figure for it.
- 2026-11-07: The team stated that the product collects and aggregates the data to create a site map. Option 1 research lanes reported in `docs/research/`.
- 2026-11-07: The team added two sample Issued for Construction plan sets to `provided resources/` and asked for novelty in how data is collected. Sample 1's site plan says its dimensions come from aerial imagery and public property boundary KMZ data only, not a survey.
- 2026-11-07: The team named time to grid connection as the biggest problem, set the demo in Massachusetts or California, and asked for a repeatable collection method and a tech stack. See D2, D9, and D11 in [decision.md](decision.md).

---

# EQORE Challenge Brief: Getting Batteries Deployed

MIT Energy and Climate Hack 2026 · Context and resources for teams

*Source: pasted by the team on 2026-11-07. The wording is unchanged. Markdown headings, lists, and the NFPA 855 table layout were restored after the paste flattened them, and the stage numbers come from the brief's reference to stages 1, 3, 4, and 6.*

## Why this matters

Commercial and industrial (C&I) sites use more than 60% of U.S. electricity but account for roughly 1% of recent U.S. battery deployments. The batteries themselves are proven technology. What slows adoption is the site-by-site work of taking a project from first conversation to a commissioned system.

EQORE evaluates, designs, and installs behind-the-meter battery storage for manufacturers and industrial facilities, mainly in Massachusetts and the Bay Area. We run tens to hundreds of projects at once, and every one goes through the same pipeline. Your job is to make one stage of that pipeline faster or more reliable.

## How a C&I battery makes money

**Demand charges.** Commercial bills include a charge based on the site's highest short-interval demand in the month, often a single 15-minute window. When several machines start at once, that spike can add thousands of dollars to a bill. A battery discharges during the spike so the grid sees a lower peak.

**Time-of-use shifting.** Charge when electricity is cheap, discharge when it is expensive.

**Grid programs.** In Massachusetts, ConnectedSolutions pays batteries to discharge during summer grid-peak events, and the Clean Peak Standard creates certificates for energy delivered during peak hours.

## The deployment pipeline

Each project moves through roughly these stages. The four challenge options target stages 1, 3, 4 and 6.

1. **Site intake:** utility bills, interval (15-minute) load data, site photos, electrical single-line diagram, equipment nameplates.
2. **Sizing and economics:** choose battery power and energy, model savings and incentives.
3. **Design:** site plan, electrical drawings, equipment layout, structural and fire details.
4. **Reviews:** property owner, HOA where relevant, building and fire permits from the local authority (AHJ), and utility interconnection approval.
5. **Procurement and installation:** deliveries, contractors, inspections.
6. **Commissioning and operations:** testing, utility permission to operate, program enrollment, monitoring.

## The four options

### Option 1: Site data without a site visit

**Problem:** going on site takes a lot of time and is an unreliable way to gather data, and what facilities send us is often limited. Much of what we need is already public: building department records and old plan sets, satellite and street-level imagery, property records and utility rate schedules. The hard part is bringing it all together.

**Build:** a system of record for each site that pulls these sources together, tracks where every value came from and how confident we are in it, and flags what is still missing. The output should be a standardized site record, regardless of how the data was collected, that the later steps can use. Aim to get as much as possible without anyone stepping on site.

**Tips:** look at what a plan set requires first, then figure out where each of those pieces of information lives. Utilize the final plan sets as well as the checklists below to understand what information is required per site.

### Option 2: Automated plan sets

**Problem:** every plan set is different because every site is different, but most of each one is built from a small number of standard equipment configurations. Drawing each set by hand, and redrawing it whenever the layout changes, takes a lot of time.

**Build:** a tool that automatically generates a plan set from a site record and our standard configurations, and lets an engineer change it quickly (swap a configuration, move or resize the equipment) while every sheet stays consistent and the changes are easy to review.

**Tips:** use the Century Tywood plan set and the other plan sets we uploaded to see how they look and what they have in common.

### Option 3: Automated code review

**Problem:** every area adopts different codes and local amendments, and the review process with permitting authorities and utilities takes a lot of time. Each comment leads to a revision and another round of review.

**Build:** a tool that checks a plan set against the codes that apply where the site is and returns a list of likely violations and required changes, each tied to the code section and the sheet it affects. Bonus points for redlining the drawing.

**Tips:** start with one jurisdiction and a small set of rules you can check reliably, then expand. The codes listed under Resources are the place to start.

### Option 4: Compliance documentation at scale

**Problem:** every project generates documents that have to be organized from the initial application through the life of the system: the interconnection application and approval, building, electrical and fire permits with inspection sign-offs, the utility's permission to operate (PTO), required signage and labels, commissioning plans and reports, operations and maintenance manuals and logs, emergency operations plans, maintenance records, performance reports and decommissioning plans. Many have deadlines, and many must be updated whenever something at the site changes. First responders, the permitting authority, facility staff and EQORE each need access to different parts of it. For one large project this is manageable. For thousands of small ones it is a nightmare.

**Build:** a system that tracks the documents, schedules and compliance status for every site, flags anything that is missing, out of date or coming due, and gives each party access to what they need.

**Tips:** read the fire code (NFPA 855) to find every document that has to be kept up to date. As a quick starter, see “Documents NFPA 855 requires for every site” under Resources.

## Resources

### Codes and rule books

These define what a plan set has to show and what reviewers check. Massachusetts adopts model codes with state amendments, so check both.

- **NFPA 855:** the installation standard for stationary energy storage systems (spacing, size limits, fire protection, signage). NFPA offers free read-only access.
- **International Fire Code (Section 1207) and International Building Code:** the model codes most jurisdictions adopt. IFC Section 1207 covers energy storage and largely aligns with NFPA 855. Read-only versions are on ICC Digital Codes.
- **Massachusetts State Building Code (780 CMR, 10th Edition):** based on the 2021 IBC with Massachusetts amendments.
- **Massachusetts Comprehensive Fire Safety Code (527 CMR 1.00):** based on NFPA 1, with Massachusetts amendments.
- **Massachusetts Electrical Code (527 CMR 12.00):** the National Electrical Code (NFPA 70) with state amendments. NEC Article 706 covers energy storage systems.

### Documents NFPA 855 requires for every site

NFPA 855 requires every installed system to have the documents below, kept current and available to the right people. Together they are the starting data model for Option 4. The operations record may be kept electronically (7.1.6.2), which opens the door to a shared online system instead of paper binders on site.

| Document (NFPA 855 sections) | Must include | When it is created or updated | Who needs access |
|---|---|---|---|
| Commissioning plan and report (6.1) | Commissioning process and roles, test procedures for fire detection, suppression and ventilation, checklists and logs, staff training, qualified service personnel, issues found and how they were resolved, as-built plans | Plan before commissioning. Report goes to the owner and AHJ before final inspection and is added to the O&M manual | AHJ, facility, EQORE |
| Operations and maintenance manual and operations record (4.1.2.3, 6.3, 7.1 to 7.3) | System size and components, manufacturer manuals, service contacts, intended operation and set points, startup and safety-system procedures, which changes need re-permitting, maintenance schedule, service log (action, date, who, result), test and training records | Manual before the system goes into operation. Logs updated after every maintenance action, test, repair or training | AHJ, first responders, facility, EQORE |
| Emergency operations plan (4.1.3.2.1) | Safe shutdown and isolation, responses to battery management system alarms, procedures for fire, explosion or release, SDS-style response information, handling damaged equipment, drill procedures and schedule | Kept on site at occupied facilities. Updated whenever conditions that affect emergency response change | Facility, EQORE |
| Decommissioning plan and report (8.1 to 8.3) | Process and roles, as-built and as-maintained plans, activity schedule, checklists and logs, protection of adjacent systems, issues found and how they were resolved | Plan before decommissioning, AHJ notified beforehand, report afterward | AHJ, facility, EQORE (at decommissioning) |

Beyond these, each site needs its required signage and labels (hazard markings, disconnect and system labels, and safety data sheets posted within sight of the disconnect, 7.1.3) and its approval record: the interconnection application and approval, building, electrical and fire permits with inspection sign-offs, and the utility's permission to operate (PTO). One approach we are considering is a QR code at each site: scanning it shows first responders the public operations and emergency information, and a login unlocks the rest for the AHJ, facility staff and EQORE.

### Municipal permit requirements and plan set examples

Cities publish submittal checklists that spell out what a permit plan set must contain, which makes them a good spec for Options 2 and 3. Most local building departments post their own forms, and many have public permit portals where you can see real submissions.

- **NYSERDA Battery Energy Storage System Model Permit:** a model permit application with an inspection checklist, used by many New York municipalities.
- **NYC Department of Buildings battery application checklist:** what a large city asks for.
- **Redmond, WA energy storage fire permit requirements:** cut sheets, layouts and listings required at application.
- **Woodside, CA energy storage submittal requirements:** a Bay Area example.
- **SolarAPP+:** automated permit review for residential solar and storage. Commercial projects are out of its scope, but it shows how code checks can be turned into software.
- **Town of Holliston Plans:** https://www.mapsonline.net/hollistonma/public_permit_reports.html.php

### Interconnection tariffs

A behind-the-meter battery still needs utility approval to connect. The interconnection tariff sets the application process, review tracks, timelines and technical requirements. It is a major source of review comments (Option 3) and schedule dependencies (Option 4).

- **Massachusetts interconnection overview:** how the state's standard interconnection process works, with links to each utility.
- **National Grid (MA) Standards for Interconnection of Distributed Generation:** the tariff is revised regularly, so check National Grid's tariff page for the current M.D.P.U. number.
- **Eversource (MA) interconnection resources:** tariff, technical requirements and application guides.
- **PG&E Electric Rule 21:** California's interconnection tariff (the same rule applies at SCE and SDG&E).

### Energy data

- **OpenEI Utility Rate Database:** detailed U.S. utility rate structures, including demand charges, with a free API.
- **NREL ComStock:** simulated 15-minute load profiles for U.S. commercial buildings, a good stand-in for real interval data.
- **Green Button:** the standard format utilities use to export customer usage data, with developer docs and sample files.

### Programs and modeling

- **ConnectedSolutions Daily Dispatch (National Grid MA):** the demand response program commercial batteries enroll in.
- **Massachusetts Clean Peak Energy Standard:** regulations and program guidelines from DOER.

## Tips for scoping your project

- Pick one bottleneck and go deep. A narrow tool that works end to end beats a broad mockup.
- Use realistic inputs. Synthetic data is fine, but make it messy the way real projects are: missing fields, conflicting values, scanned documents.
- Keep an engineer in the loop. Tools that make a person's review faster and safer are more useful than tools that try to remove the review.
- Show the before and after. Tell us how long the task takes today and how long it takes with your tool.
