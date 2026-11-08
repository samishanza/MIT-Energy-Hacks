# The review agent and the feedback loop

How collection, the review agent, people, and the detector improve each other. Everything below the agent is
deterministic; the agent only proposes, and a person decides.

```
address → collection (public sources, lidar, imagery; fixed code)
        → record version → site plan (fixed code)
        → review agent (Claude, tool use)  ── proposes pins, conflict picks, questions
        → a person accepts or rejects, with a reason
             accepted pin / pick → new record version through the ordinary pin and conflict paths → site plan redraws
             accepted transformer pin → private/eval/labels.json (an answer key)
             every decision → shown to the agent at its next review
        → scripts/eval scores the detector on traced drawing sets plus confirmed labels
        → scripts/eval/tune.ts (optionally with Claude proposing) finds better thresholds, kept only if the score rises
        → a person adopts them in DEFAULT_PARAMS → the next collection is better
```

## The agent (`apps/api/src/site-agent.ts`)

- Tools: `read_site`, `list_equipment`, `check_site_plan`, `past_decisions` (all read-only) and `propose`.
- A proposal is checked before it is stored: pins only for `switchboard_location`, `meter_location`, or
  `utility_transformer_location`, within 120 m of the building; conflict picks only for a conflicting value and one of
  its candidates. Refusals go back to the agent with the reason.
- Record text is treated as data; the agent is told never to follow instructions inside it.
- Proposals and decisions are append-only tables beside the record. Accepting needs a person's name and reason, and
  applies the proposal in that person's name with the proposal cited as evidence. A model never verifies a value.
- Without `ANTHROPIC_API_KEY` a review reports itself unavailable; nothing else changes.

## Endpoints (not yet in the shared contract)

| Method | Path | Body |
|---|---|---|
| POST | `/api/sites/:siteId/agent-review` | none |
| GET | `/api/sites/:siteId/agent-proposals` | none |
| POST | `/api/agent-proposals/:proposalId/accept` | `{ verifierName, reason }` |
| POST | `/api/agent-proposals/:proposalId/reject` | `{ verifierName, reason }` |

## What changes in the drawing

The battery zone is measured from a placed switchboard, then a detected service entrance, then a transformer a person
placed or drawn on a plan set (`building wall nearest the utility transformer`), then the lidar's likeliest box, then the nearest supply. So
an accepted transformer or switchboard pin moves the zone and the site plan at the next version.

## Running the detector loop

```
node scripts/eval/run-eval.ts                 # score the current thresholds
node scripts/eval/tune.ts --rounds 3 --claude # search, with Claude proposals when ANTHROPIC_API_KEY is set
```

The site list is `private/eval/sites.json` (untracked) plus every site in `private/eval/labels.json`.
