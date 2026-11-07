# Status and how data is pulled

One place for what exists, how data gets in, and what's left. Written 2026-11-07. The plan is `docs/plans/2026-11-07-0954-feat-site-data-collection-plan.md`, and it's still being corrected after review.

## How data is pulled today

These are REST API calls to public map services, with no web scraping. An address is the only input, and none of these calls needs a key.

| Step | Source | How it's asked | Result at 100 Research Dr, Worcester |
|---|---|---|---|
| 1. Pick the region | Address text | Split into street, city, and state, and match a region's config | Massachusetts (National Grid) |
| 2. Find the parcel | MassGIS L3 parcels | Filter on street and city | `F_583026_2925576`, use code 4040, built 1994. Stated 29.92 acres, polygon 30.93 |
| 3. Find buildings | MassGIS roofprints | Everything inside the parcel polygon | 6 roofprints, the largest 115,615 sq ft (2011) |
| 4. Get the base map | MassGIS 2025 imagery | Map tiles, 15 cm | Aerial image |
| 5. Get grid data | National Grid portal | Hosting capacity and feeder lines within 30 m of the parcel | 4 candidate feeders, on Rena Street and Bloomingdale |
| 6. Find the road side | Census TIGERweb roads | Roads near the parcel | East |
| 7. Measure | Computed here, no call | Geometry on the results above | Lot about 1,571 by 1,636 ft, main building 284 by 670 ft, 100 ft to the lot line, 93 ft to the nearest line |
| 8. Save | Local SQLite | Append only, with source, date, query, and a content hash | Values marked inferred or conflicting. Nothing is verified until a named person says so |

**If an address doesn't find one parcel,** or the region has no parcel source, the Census geocoder gives a street-level point, and the tool asks the person to choose only when it can't tell.

**California:** Fremont uses that Census point and queries PG&E's GRIP map, because no county parcel source is configured yet.

**Customer-side facts** have no public source we found. A phone link takes a doors-closed photo or a bill, Claude drafts a reading, and an engineer confirms or corrects it. The live Claude call hasn't run yet, because no API key is set.

**Earth Engine:** the credential works, and a test call returned 166.13 m at the demo site. No adapter uses it yet.

**Slope:** the app takes it from the agent layer's MassGIS lidar sampler.

## Massachusetts coverage

`scripts/massachusetts-coverage.ts` runs 27 public addresses, all city and town halls apart from the two demo sites, through live collection. These numbers come from its run on 2026-11-07, and they're the ones to quote. 27 addresses is still a small sample of the state.

| Measure | Result |
|---|---|
| Reached a map | 23 of 27 |
| Reached a map or offered a choice of parcels and a pin | 27 of 27 |
| Got a parcel | 23 of 27 |
| Named one utility | 14 of 27 |
| Named the utility or its candidates | 23 of 27 |
| Got grid data | 10 of 27, all National Grid |

- **Choices:** Springfield, Fall River, Cambridge, and Chicopee each offer parcels to choose from, because the assessor wrote the address differently. Springfield's parcel has no house number, for example, and Fall River's is spelled `1 GOVERNMENT CEN TER`. The app always offers a pin as well.
- **Villages:** Hyannis resolves to its Barnstable parcel.
- **Utilities:** the service territory layer names a utility everywhere it has an answer. Territories overlap, so several are candidates until a utility's own map returns a feeder, or the bill names one.
- **Grid data:** this comes only from National Grid. Eversource's map isn't read, because its terms bar reuse without written permission (D18), so Eversource sites get the utility's name and a person route. Municipal utilities, such as Holyoke and Hudson, have none.
- **Downtown Worcester:** no feeder is mapped within 30 m of 455 Main St. The search now widens to 150 m and says so on the value.

## What happens after collection

Both paths start from the same collector, `packages/sources`.

```text
                                  ┌─> apps/api: store, readiness ─> apps/web: map and review (the running demo)
Address ─> packages/sources ──────┤
                                  └─> packages/agents ─> gatekeeper ─> drc: reconcile ─> Setback layout
                                      (not connected to the app yet)
```

`@eqore/sheets` draws a concept site plan from the record, with real polygons, in the app's sheet tab.

## Who's working on what

| Stream | Where | State |
|---|---|---|
| Lead | `main`, this checkout | Plan, contract, merges, demo |
| Backend | `worktree-backend` | Waiting for the final plan |
| UI | `worktree-ui` | Built on the first contract, waiting for the final plan |
| Agent layer, a teammate | Commits straight to GitHub `main` | Added agents, live adapter, slope, pad candidates, contract converter. Now owns battery areas and the drawing handoff in the plan |

## Overlaps, decided

The team decided the agent layer wins where it overlaps the plan (KTD37).

| Thing | Use | Plan adds |
|---|---|---|
| Battery areas | `derivePadCandidates` in `packages/drc` | Every roofprint, constraints, and roads as inputs |
| Slope | MassGIS lidar in `packages/agents` | Earth Engine slope outside Massachusetts |
| Record conversion | `toRecordVersion` | Coverage built on its missing values |
| Drawing route | `makeLiveSources`, `reconcile`, `exportToSetback`, `compile` | Reuses collected data, takes engineer values, keeps only placement, and adds a renderer |

## To do, in order

1. Backend: collect to the plan-set catalog, a general registry, wider physical sources, coverage across Massachusetts including Eversource, serving utility, deeper utility data, cross-checks, Earth Engine, rates, then a third region.
2. Agent layer: battery areas, and the sheet and drawing handoff.
3. UI: map-first screen on the wider record.
4. Lead: seeded demo and snapshot, merges, combined code review.

## Needed from the team

- Add a new Anthropic API key to `.env` for draft readings.
- Pass the plan to the teammate running the agent layer.
