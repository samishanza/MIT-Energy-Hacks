# EQORE Track: MIT Energy & Climate Hack 2026

A prototype for one bottleneck in commercial battery deployment. We are still in ideation, so there is no app to run yet.

## Join the workflow

This project runs natively on Windows. Run these commands in PowerShell.

1. **Get the repo:** `git clone https://github.com/maximozhang/MIT-Energy-Hacks.git`
2. **Install the tools:**

   ```powershell
   npm install -g bun @ast-grep/cli agent-browser
   agent-browser install
   winget install --id jqlang.jq -e
   winget install --id GitHub.cli -e --scope user
   winget install --id Gyan.FFmpeg -e
   gh auth login
   ```

   Open a new terminal afterward so the updated PATH applies.
3. **Open the repo in Claude Code** and accept the prompt to trust the project. Its settings enable Compound Engineering and agent teams. If the plugin does not load, run:

   ```text
   /plugin marketplace add EveryInc/compound-engineering-plugin
   /plugin install compound-engineering
   ```

   Then run `/ce-setup` to check your setup, and `/ce-help` if you are unsure which command comes next.
4. **Read these, in order:**
   - [CLAUDE.md](CLAUDE.md): the rules we all work under
   - [docs/project/context.md](docs/project/context.md): EQORE's Challenge Brief and what we currently know
   - [docs/project/decision.md](docs/project/decision.md): what is decided and what is open
   - [docs/project/eqore-brief.md](docs/project/eqore-brief.md): the earlier working brief, for domain notes
5. **Take a task** from the current plan in `docs/plans/`.

## The loop

`/ce-brainstorm`, then `/ce-plan`, `/ce-work`, `/ce-simplify-code`, `/ce-code-review`, and `/ce-compound`.

Compare two genuinely different approaches with `/ce-bakeoff`, or give both workers the same spec and acceptance checks in separate worktrees.

## Working on a task

Choose how each task runs:

| Use | When |
|---|---|
| `/ce-work` isolated workers | The plan's task can run without your direct steering |
| Named worktree session | You want to steer the work yourself |
| Agent team | Workers need a shared task list or need to talk to each other |
| Subagents | Bounded research, review, or QA |

To start a named worktree session, branch from the plan's baseline commit and open Claude Code there. Run this from the repo root:

```powershell
git worktree add -b <name>/<task> .worktrees/<task> <baseline-commit>
git -C ".worktrees/<task>" rev-parse HEAD
wt -w 0 nt -d "$PWD\.worktrees\<task>" --title <task> claude
```

The second command should print the baseline commit. The third opens a Windows Terminal tab. In VS Code, you can open a new terminal instead and run `cd .worktrees\<task>`, then `claude`.

Agent team teammates run inside your main terminal. Use the up and down arrows to select one, and Enter to view and message it. There are no split panes on Windows, so we don't use tmux.

### See each agent in its own terminal

A true agent team can't do this on native Windows. Instead, run one separate session per terminal, each in its own worktree. Commit the baseline first, because a worktree contains only committed files.

In VS Code, `Ctrl+Shift+5` splits the terminal. From the repo root, run one command per terminal:

```powershell
claude --worktree data --name data
claude --worktree ui --name ui
claude --name lead
```

- `--worktree <name>` creates `.claude/worktrees/<name>/` on a branch named `worktree-<name>`, starting from your current commit. The `lead` session stays in the main checkout.
- Run `/list-agents` to see the other sessions, and message one with a prompt like `Let @ui know the schema changed`.
- These sessions have no shared task list, so track tasks in the plan file.
- A worktree separates files and branches only. Agents still share ports, databases, and environment variables, so assign those per agent.
- Install dependencies in each worktree. To copy gitignored files such as `.env`, list them in a `.worktreeinclude` file.
- Start every session in the same permission mode. Otherwise messages between them can be held for approval.

## Handing off

- Change only your task's allowed files. Ask the shared-contract owner to change shared types or schemas.
- Run your acceptance check before reporting.
- Report your branch or commit, changed files, commands run, results, blockers, and next action in the plan's Handoffs section.
- Save decisions to `decision.md` before `/compact`. For a new session, run `/ce-handoff create` and save it to `docs/handoffs/`.
- The lead integrates in dependency order. Ask before pushing to a shared branch or deploying.
