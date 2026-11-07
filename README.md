# EQORE Track: MIT Energy & Climate Hack 2026

A prototype for one bottleneck in commercial battery deployment. We are still in ideation, so there is no app to run yet.

## Join the workflow

1. **Get the repo:** `git clone https://github.com/maximozhang/MIT-Energy-Hacks.git`
2. **Install Compound Engineering in Claude Code:**

   ```text
   /plugin marketplace add EveryInc/compound-engineering-plugin
   /plugin install compound-engineering
   /ce-setup
   ```

3. **Read these, in order:**
   - [CLAUDE.md](CLAUDE.md): the rules we all work under
   - [docs/project/decision.md](docs/project/decision.md): what is decided and what is open
   - [docs/project/eqore-brief.md](docs/project/eqore-brief.md): the full EQORE brief
4. **Take a task** from the current plan in `docs/plans/`. New plans start from [TEMPLATE.md](docs/plans/TEMPLATE.md).

## Working on a task

Start each writing task from the plan's baseline commit, in its own worktree or isolated worker:

```bash
git worktree add ../eqore-<task> -b <name>/<task> <baseline-commit>
```

- Change only your task's allowed files. Ask the shared-contract owner to change shared types or schemas.
- Run your acceptance check before reporting.
- Report your branch or commit, check results, blockers, and next action in the plan's Handoffs section.
- Save decisions to `decision.md` before `/compact` or handing off.
- The lead integrates in dependency order. Ask before pushing to a shared branch or deploying.
