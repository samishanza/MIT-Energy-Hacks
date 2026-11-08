# Massachusetts demo sites with public electrical service specs

Date checked: 2026-11-07. Everything here is **real public data, not synthetic**. Nothing was filed, requested, or signed up for. No personal names are recorded. Machine-readable copy: [`fixtures/demo-electrical-specs.json`](../../fixtures/demo-electrical-specs.json).

**Evidence labels:** **C** = I read it today on the linked page or file. **S** = seen only in a search-result excerpt. **I** = my inference.

Related: [electrical equipment public data](2026-11-07-electrical-equipment-public-data.md) covers the Cambridge and Somerville datasets in general. This file picks specific sites.

## Summary

I found 10 non-residential Massachusetts sites where the existing service voltage and ampere rating are on a public page, with the source for each value. Seven come from city permit data (Cambridge and Somerville), and three from public school reports (Needham, Montague, Andover).

- **Service voltage and service amps:** all 10 sites (C).
- **Main breaker rating stated outright:** 1 site, 22 Kent St, Somerville (2500 A) (C). Elsewhere the source gives the service or switchboard rating, and I have not relabelled it as the main breaker.
- **Switchboard or switchgear rating (used as bus rating):** 5 sites, each marked I where the source does not say "bus".
- **Utility transformer kVA:** 1 site, 24 Dane St, Somerville ("Eversource to upgrade transformer to 1500 KVA", 2015) (C).
- **Meter number:** 1 site, Broadmeadow Elementary, Needham (08503030, from a 2012 audit) (C).
- **Available fault current:** none found. Eversource's service guide says to ask its New Customer Connect Tech Center for this per location (S).
- **Panel or meter photos:** the Needham audit has photos of the main panels, the meter, and the pad-mounted transformer (C, captions read; images not downloaded). The Montague report has an electrical photo page whose images I did not view.

Several sites carry **conflicts or stale values**, which suit the demo's "a person inspects and corrects" step: 125 Sixth St has 2000 A in 2026 and 4000 A in 2019; 491 Broadway changed from 400 A to 3000 A in a renovation; the Needham table calls the transformer "Delta" next to text that says 480/277 V four-wire.

Access notes. Cambridge data is PDDL (public domain). Somerville data is ODbL, which requires attribution to the City of Somerville. Both robots.txt files set crawl-delay 1 and do not bar the API; I made a few small queries spaced at least a second apart. The Cambridge ViewPoint permit portal's robots.txt disallows everything, so I did not open permit detail pages there. Brookline's and mass.gov's documents returned 403 (Cloudflare or bot blocking), so the leads below are unverified.

## Table

V = volts, A = amperes. "Service A" is the service size the source gives. "—" = not found.

| # | Address | Building type | Service voltage | Main breaker or switch A | Bus A | Transformer kVA | Other values | Source | Date | Photo |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 125 Sixth St, Cambridge, MA 02142 | Municipal: police HQ | 480 V (phase and wye not given) | — (service 2000 A; 4000 A in 2019, conflict) | — | — | Underground, 1 meter. Separate 200 A 208 V EV service (2024) | [permit 1209035](https://data.cambridgema.gov/resource/hvtc-3ab9.json?id=1209035), [54091](https://data.cambridgema.gov/resource/hvtc-3ab9.json?id=54091), [263778](https://data.cambridgema.gov/resource/hvtc-3ab9.json?id=263778) | 2026-05-05; 2019-08-28; 2024-04-02 | — |
| 2 | 147 Hampshire St, Cambridge, MA 02139 | Municipal: DPW Simard and Frazier buildings | 208 V | — (service 1200 A) | — | — | Underground, 1 meter. 86.4 kW DC / 84.6 kW AC PV. Separate 200 A 480 V EV service (2024) | [permit 213772](https://data.cambridgema.gov/resource/hvtc-3ab9.json?id=213772), [187174](https://data.cambridgema.gov/resource/hvtc-3ab9.json?id=187174), [260040](https://data.cambridgema.gov/resource/hvtc-3ab9.json?id=260040) | 2023-03-10; 2022-08-02; 2024-03-04 | — |
| 3 | 491 Broadway, Cambridge, MA 02138 | Municipal: fire HQ (under reconstruction) | 208 V | — (new service 3000 A; old 400 A) | — | — | Underground, 1 meter new (2 old). PV 85 panels, generator, 5 EV stations | [permit 275471](https://data.cambridgema.gov/resource/hvtc-3ab9.json?id=275471), [254693](https://data.cambridgema.gov/resource/hvtc-3ab9.json?id=254693) | 2025-11-20; 2024-01-19 | — |
| 4 | 1100 Massachusetts Ave, Cambridge, MA 02138 | Commercial | 480/277 V (recorded "480277") | — (service 1600 A) | — | — | Underground, 2 meters, adding 2 | [permit 1214957](https://data.cambridgema.gov/resource/hvtc-3ab9.json?id=1214957) | 2026-06-11 | — |
| 5 | 24 Dane St, Somerville, MA (ZIP 02143 is I) | Commercial | 277/480 V, 3-phase | — (service 1200 A) | — | **1500** (planned Eversource upgrade) | 800 A 277/480 V tenant sub panel | [E15-000414](https://data.somervillema.gov/resource/nneb-s3f7.json?application_number=E15-000414), [E15-000649](https://data.somervillema.gov/resource/nneb-s3f7.json?application_number=E15-000649) | 2015-04-15; 2015-05-27 | — |
| 6 | 22 Kent St, Somerville, MA 02143 | Commercial with lab space | 277/480 V | **2500** (main breaker) | 2500 (I, "distribution panel") | — | 600 A panelboard, 225 A 120/208 V panel, 2 x 75 kVA step-down transformers | [E26-001231](https://data.somervillema.gov/resource/nneb-s3f7.json?application_number=E26-001231) | 2026-08-19 (issued 2026-09-08) | — |
| 7 | 779 McGrath Hwy, Somerville, MA 02145 | Commercial: EV charging site | 480 V | — (service 1200 A) | 1200 (I, switchgear) | — | Service from pole to transformer; 2 x 400 A charging cabinets | [E21-001155](https://data.somervillema.gov/resource/nneb-s3f7.json?application_number=E21-001155) | 2021-08-17 | — |
| 8 | 120 Broad Meadow Rd, Needham, MA 02492 | Public school: Broadmeadow Elementary | 480/277 V, 3-phase, 4-wire | — (service 2000 A) | — | — (pad-mounted, kVA not given) | **Meter 08503030**. 750 kVA generator | [EMG energy audit](https://needhamma.gov/DocumentCenter/View/7775), PDF pp. 17-18 | 2012-02-12 | [Same PDF, p. 41](https://needhamma.gov/DocumentCenter/View/7775) (photos #13, #14, #17) |
| 9 | 39 Crocker Ave, Turners Falls (Montague), MA | Public school: Sheffield gym/auditorium, fed from Sheffield Elementary | 208Y/120 V, 3-phase, 4-wire | — | 1200 (I, Siemens main switchboard) | — | 400 A breaker feeds the gym building. Eversource transformer at SW corner | [Property Condition Assessment](https://montague-ma.gov/files/Sheffield_Gym-Auditorium_Final_PCA_-_110520.pdf), pp. 3, 22-23 | 2020-10-21 | [Same PDF, p. 37](https://montague-ma.gov/files/Sheffield_Gym-Auditorium_Final_PCA_-_110520.pdf) (not viewed) |
| 10 | 58 Beacon St, Andover, MA | Public school: West Elementary | 277/480 V, 3-phase, 4-wire | — (service 1200 A) | 1200 (I, main switchboard) | — | Proposed 2500 A replacement with new pad-mounted transformer | [SMMA Preferred Schematic Report](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/4617/Aps/457a15b6-3143-423a-8e91-62d1cbe4866f/Revised_Preferred_Schematic_Report__no_mechani.pdf?disposition=inline), PDF pp. 22-23, 35 | 2020-07-09 | — |

## Site notes

**1. 125 Sixth St, Cambridge (police headquarters).** Permit 263778 (2024) describes the work as "Cambridge Police Headquaters - Install new 208 underground service and install two new EV car charger stations" (C), so the site has at least two services: the main 480 V service and a 200 A 208 V EV service. The main service's amps conflict. Permit 1209035 (2026, UPS replacement) records an existing 2000 A, 480 V underground service with 1 meter (C). Permit 54091 (2019, new 800 A ATS) records 4000 A, 480 V (C). The dataset has no phase field. Its `kva` value of 160 belongs to the UPS work, not the utility transformer (I). Good demo of a person resolving a conflict.

**2. 147 Hampshire St, Cambridge (DPW, Simard and Frazier buildings).** The 2022 renovation permit set up a new 1200 A, 208 V underground service (C), and the 2023 PV permit records it as the existing service with 1 meter, alongside an 86.4 kW DC / 84.6 kW AC rooftop array (C). A 2024 permit added a separate 200 A, 480 V service for two EV chargers (C). The DPW link comes from the city's project page, seen in search results (S). A battery here would sit next to existing PV, and on a 208 V service.

**3. 491 Broadway, Cambridge (fire headquarters).** Before the renovation, the existing service was 400 A, 208 V, 2 meters, underground (permit 254693, 2024) (C). The reconstruction permit (275471, issued 2025-11-20) sets up a new 3000 A, 208 V underground service with 1 meter, plus PV (85 panels), a generator, and 5 EV stations (C). A June 2026 city update says an electric substation has been installed (S). Whether the new service is energized is not confirmed.

**4. 1100 Massachusetts Ave, Cambridge.** A 2026 meter-addition permit records an existing 1600 A underground service with 2 meters (C). Volts are recorded as "480277", which I read as 480/277 V (I). The utility authorization number 27075623 is in the record (C); it is not a meter number.

**5. 24 Dane St, Somerville.** The 2015 permit reads: "Install new 1200 amp 277/480 volt 3 phase Electrical Service from existing transformer pad, Eversource to upgrade transformer to 1500 KVA" (C). This is the only site with a utility transformer size, and it is a planned value from 2015. Other permits here wire 480 V motors of 100 and 150 hp, consistent with industrial use (C for the permits; I for the use). ODbL attribution applies.

**6. 22 Kent St, Somerville.** The 2026 permit reads: "Furnish and install new 2500A 277/480V main breaker & meter section with 2500A distribution panel, 600A panelboard, (1) 225A 120/208V panel with (2) 75KVA step-down transformers" (C). Issued 2026-09-08, so the gear may still be going in. A related building permit enlarges the electrical room (C). The only site with a main breaker rating stated outright, which the NEC 705.12 busbar check needs. I mapped "2500A distribution panel" to the bus rating (I).

**7. 779 McGrath Hwy, Somerville.** The 2021 permit installs a "1200 480 volt service [from] pole to transformer. Transformer to feed 1200 Amp switchgear" feeding two 400 A charging cabinets for 8 dispensers (C). An EV charging site rather than a building, but a clean example of a 480 V, 1200 A service with a pole-fed transformer.

**8. 120 Broad Meadow Rd, Needham (Broadmeadow Elementary School).** A 2012 energy audit for the town states, in section 5.7 on PDF p. 17: "The main electrical service size is 2,000 amps, 480/277-volt, three-phase, four-wire alternating current (AC)", fed underground from a pad-mounted transformer, master-metered (C). The table on p. 18 gives "Main meter number 08503030" in the electric room (C), a 750 kVA natural-gas generator (C), and a transformer type "Delta" with "Primary Volts 480 V, Secondary Volts 277 V" (C), which contradicts the text. The p. 41 photo page has captions for the electrical room main panels (#13), the main electric meter (#14), and the pad-mounted transformer (#17) (C), plus a "Kohler diesel generator" (#18), which conflicts with the natural-gas text. The values are 14 years old.

**9. 39 Crocker Ave, Turners Falls (Montague).** A 2020 property condition assessment for the school district covers the Sheffield gym/auditorium. On p. 3 and in section 5.11 (p. 22): Eversource feeds an exterior surface-mounted transformer at the southwest corner, which feeds the main switchboard in Sheffield Elementary School. "The main switchboard is a 1,200 amp, 208Y/120 volt, three phase, 4 wire panel manufactured by Siemens", with a 400 A breaker feeding the gym building (C). P. 23 says the main breaker sits in that switchboard, which was 32 years old (C); its rating is not given. The only 208Y/120 school in the set. The address is the gym building's; the report does not give the elementary school's street number.

**10. 58 Beacon St, Andover (West Elementary School).** The 2020 Preferred Schematic Report, PDF p. 22: "The existing 1200-amp, 277/480 volt, 3Ø, 4W electrical service ... The 1200-amp, 277/480 volt, 3Ø, 4W main switchboard (MSB) ... were replaced approximately 10 years ago" (C). P. 23 says the main breaker needs ground-fault protection (C). P. 35 proposes a new 2500 A service and utility pad-mounted transformer (C). Check whether that replacement happened before using this site in the demo.

## Leads not verified

- **Brookline Town Hall, 333 Washington St (address I).** A 2023 RFQ is described in search excerpts as listing a 1200 A GE AV-Line switchboard, a 2000 A, 277/480 V main service, and a 1000/1333 kVA 13.8 kV to 480Y/277 V transformer (S). The PDF returned 403 from Cloudflare. A person opening [the RFQ](https://brooklinema.gov/DocumentCenter/View/46185/RFQ-for-HVAC-Design-and-Electrical-Services-9-27-2023) in a browser could confirm it. It would be the best site in this set for transformer kVA.
- **Holden water facility.** A search excerpt describes a 600 A, 277/480 V three-phase service (S). The [mass.gov PDF](https://www.mass.gov/doc/final-study/download) returned 403.
- **Needham Hillside School switchgear upgrade (bid 22DPW287B).** [Addendum 1](https://needhamma.gov/DocumentCenter/View/25884/22DPW287B-Hillside-Electrical-Switchgear-Upgrade-Addendum-1?bidId=) (2022-05-23) gives an 800 A CT cabinet and an Eversource work order number, but no voltage (C). The full bid drawings might give more.
- Other large Cambridge 480 V services in the dataset: 400 Main St (4000 A), 85 Oxford St (2000 A), 1 Science Park (4000 A and 2000 A in different permits), 290 Binney St (4000 A and 8000 A) (C). These are good for testing conflicts.
