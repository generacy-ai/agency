# Clarifications: /cockpit:merge command

**Issue**: generacy-ai/agency#355
**Branch**: 355-epic-generacy-ai-tetrad

## Batch 1 — 2026-06-26

### Q1: Fixer subagent invocation
**Context**: FR-004 says the command "spawns a fixer subagent" when checks are red, and the Assumptions note that the fixer contract is delivered separately. The slash command file (`merge.md`) needs a concrete invocation mechanism to be implementable — without it we can't write the prompt body.
**Question**: How does the `/cockpit:merge` command spawn the fixer subagent?
**Options**:
- A: Via the `Task` tool with a specific `subagent_type` (e.g., `cockpit-fixer`) defined elsewhere in the plugin.
- B: By delegating entirely to the `generacy cockpit merge` CLI verb, which spawns the fixer itself; the slash command just shells out and reads the result.
- C: Via an explicit instruction block in `merge.md` that tells the main Claude agent to act as the fixer inline (no subagent boundary).

**Answer**: A.** The slash command spawns the fixer via the `Task`/Agent tool (a `cockpit-fixer` subagent, or a general agent with a fixer prompt). The CLI verb does **not** spawn it — it only reports red + the failing-check JSON (#789).

### Q2: Re-evaluation loop ownership
**Context**: FR-005 says "the command re-evaluates check status before deciding to merge" and FR-007 says it terminates "if checks remain red after the fixer pass." It is unclear whether the slash command re-invokes the CLI verb after the fixer, or whether the CLI verb itself performs the full check→fix→re-check loop internally.
**Question**: Where does the fix/re-evaluate loop live?
**Options**:
- A: Inside the slash command — `merge.md` calls the CLI, sees red, spawns fixer, then calls the CLI again to re-evaluate and merge.
- B: Inside the CLI verb — `generacy cockpit merge` handles check → fix → re-check → merge as one atomic call; the slash command just invokes it once.
- C: Split — CLI returns a structured "red, please fix" result; slash command spawns fixer; slash command calls a separate CLI verb (e.g., `generacy cockpit merge --resume`) to re-evaluate.

**Answer**: A.** The fix/re-evaluate loop lives in the slash command: call the CLI → on red JSON, spawn the fixer → re-call the (idempotent) CLI. No `--resume` verb needed.

### Q3: Behavior for intermediate PR states
**Context**: The spec's success path is "approved + green ⇒ merge" and the failure path is "red ⇒ fixer." It does not specify the behavior for: (a) green checks but no approval, (b) approved but checks still pending/running, (c) PR has merge conflicts, (d) PR is in draft. These will be hit in normal usage.
**Question**: For PR states other than `approved+green` and `red`, what should `/cockpit:merge` do?
**Options**:
- A: All non-green/non-approved states stop the command with a terse report; only `red checks` triggers the fixer; the user must resolve other blockers manually.
- B: Pending checks → wait/poll until they resolve, then proceed; missing approval → stop and report; merge conflicts → route to fixer; draft → stop and report.
- C: All non-mergeable states are delegated to the CLI verb's existing semantics; the slash command makes no distinctions beyond "merged / fixer-spawned / stopped."

**Answer**: A (refined).** Route on #789's JSON `reason`: `checks-failing` (and merge conflicts) → fixer; `missing-label`, **pending** checks, draft, or no-approval → stop with an actionable report. Don't "fix" pending checks — `watch`'s check-run roll-up (#787 Q3) re-triggers merge when they go green (per #789 Q4, merge is fail-fast on pending).

### Q4: Command arguments
**Context**: Slash commands in Claude Code can accept arguments. The spec says the command operates on "the PR associated with the current branch" but does not say whether it accepts arguments to override target PR, merge strategy, or skip the fixer.
**Question**: What arguments, if any, should `/cockpit:merge` accept?
**Options**:
- A: No arguments — always operate on the current branch's PR; merge strategy and other options come from CLI/repo defaults.
- B: Optional PR number override (`/cockpit:merge 123`); no other flags.
- C: PR number override plus `--no-fix` to skip the fixer and stop immediately on red (useful for dry-run/inspection).

**Answer**: C.** Accept an issue/epic ref (resolved via the shared resolver, #788) **plus `--no-fix`** to stop on red instead of spawning the fixer. Operates on the given issue's PR — not "current branch" (the cockpit runs from the orchestrator session, not the PR branch).

### Q5: Fixer retry budget
**Context**: FR-007 says the command terminates "if checks remain red after the fixer pass," implying exactly one fixer attempt. But it's not explicit whether this is a hard "one-shot" rule or whether a configurable/bounded retry budget is intended (e.g., 1–3 attempts before giving up).
**Question**: How many fixer attempts should the command make before terminating with a red-status report?
**Options**:
- A: Exactly one — fixer runs at most once; on second red, stop and report. (Strict reading of FR-007.)
- B: A small fixed cap (e.g., 2 or 3) so a partial-fix attempt isn't wasted; document the cap in the command output.
- C: Configurable via argument (e.g., `--max-fix-attempts=N`, default 1).

**Answer**: C.** `--max-fix-attempts`, default **1** (honors FR-007's one-shot reading; configurable and bounded to avoid runaway fixer cost).
