# Plan: <name>

Copy to `docs/plans/<yyyy-mm-dd>-<name>.md`. Delete any section that does not apply.

- **Status:** Draft | Agreed | In progress | Integrated
- **Lead:** <one person coordinating>
- **Shared-contract owner:** <one person; the only one who changes shared types and schemas>
- **Baseline commit:** <sha all worktrees start from>
- **Decision link:** `docs/project/decision.md` <decision IDs>

## Demo path

| Step | What happens | Evidence the step worked |
|---|---|---|
| Ingest | | |
| Show issue or artifact | | |
| Human inspects and corrects | | |
| State change | | |

## Non-goals

- <what this plan will not do>

## Data model

<entities, fields, and the states a record moves through>

## Synthetic fixture

- **Path:** <location>
- **Labeled synthetic in:** <data field and UI location>
- **Expected result:** <exact, checkable output>

## Shared interfaces

Agree on and commit these before parallel work starts.

| Interface | Path | Sample payload | Owner |
|---|---|---|---|
| | | | |

## Checks that prove the workflow works

| Check | Exact command or action | Expected result |
|---|---|---|
| | | |

## Tasks

| ID | Objective (one) | Owner (one) | Depends on | Allowed files | Acceptance check and expected result | Handoff destination | Blockers | Status |
|---|---|---|---|---|---|---|---|---|
| T1 | | | none | | | | | Not started |

Integration order: <T1, then T2, ...>

## Worker lanes

| Lane | Scope | Runs as (ce-work worker, agent teammate, worktree session, or subagent) | Worktree | Backend environment |
|---|---|---|---|---|
| Domain/data | Input handling, provenance, deterministic rules | | | |
| Product UI | Inspect, correct, and verify flow against the shared contract | | | |
| Lead/integration | Shared interfaces, merge order, deployment, demo QA | | | |

## Worker brief

Give each worker the plan path and only the context its task needs.

```text
Plan path:
Task:
Branch or worktree:
Start from baseline:
Allowed files:
Shared contract (paths):
Code examples (paths):
Sample data (paths):
Acceptance check and expected result:
Handoff destination:
Do not:
```

## Handoffs

One entry per finished or paused task.

```text
Task:
Branch or commit:
Changed files:
Commands run:
Results:
Blockers:
Next action:
Decisions to record in decision.md:
```

## Integration report

- **Combined diff reviewed by:**
- **Fresh reviewer's result against the acceptance criteria:**
- **Full seeded demo result:**
- **Human can inspect evidence, correct, and see the state change:**
- **Checks run:**
- **Remaining issues:**
- **Deployment and smoke-test steps (ask before pushing or deploying):**
- **Seed data:**
- **Fallback if an external service fails:**
