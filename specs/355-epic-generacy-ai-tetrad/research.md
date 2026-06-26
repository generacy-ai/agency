# Research: /cockpit:merge command

**Feature**: 355-epic-generacy-ai-tetrad
**Date**: 2026-06-26

## Decisions

### D1: Fixer is spawned via the Task/Agent tool, not by the CLI

**Decision**: `/cockpit:merge` spawns the fixer subagent inside the slash command using Claude Code's Task/Agent tool. The CLI verb (#789) does **not** spawn the fixer; it only reports a structured red result.

**Rationale**:
- Clarification Q1 chose option A.
- Keeps the CLI verb pure: it observes PR state and reports — it does not orchestrate sub-processes. This makes the CLI testable, scriptable, and reusable outside Claude Code.
- Keeps the agent boundary explicit: a subagent task is visible in the Claude Code UI, its prompt and tool calls are auditable, and it returns control to the main agent on completion.

**Alternatives considered**:
- (B) CLI verb spawns the fixer. Rejected per Q1 — couples CLI ergonomics to Claude Code semantics and hides the agent boundary from the user.
- (C) Inline-fixer in the main agent. Rejected per Q1 — loses the subagent boundary; the main `merge.md` flow gets tangled with check-resolution work.

### D2: The fix/re-evaluate loop lives in the slash command

**Decision**: The slash command body runs the loop `call CLI → on red, spawn fixer → re-call CLI`, bounded by `--max-fix-attempts`. There is no `generacy cockpit merge --resume` verb.

**Rationale**:
- Clarification Q2 chose option A.
- The CLI verb is required to be idempotent (clarification Q2 + #789), so re-calling it post-fix is the natural primitive — no special "resume" state is needed.
- Keeps the CLI's state model trivial: each call observes-and-acts on the live PR state; no checkpoint or session resumption complexity.

**Alternatives considered**:
- (B) CLI-internal loop. Rejected per Q2 — would re-introduce the subagent-spawn coupling rejected in D1.
- (C) Split with a `--resume` verb. Rejected per Q2 — extra surface area for no benefit when the existing call is already idempotent.

### D3: Route on the CLI's `reason` field; only `checks-failing` (+ merge conflicts) goes to the fixer

**Decision**: The decision tree branches on the typed `reason` returned by the CLI. The fixer is spawned only when `reason ∈ { "checks-failing", "merge-conflict" }`. All other non-green/non-approved states (`missing-label`, `pending`, `draft`, `missing-approval`) terminate the command with an actionable terse report.

**Rationale**:
- Clarification Q3 chose option A (refined).
- `pending` checks resolving to red is a future state — the right re-trigger is `cockpit:watch`'s check-run roll-up (#787 Q3), not a poll-and-wait inside `merge.md`. The user already opted into `watch` for that lifecycle; merging poll behavior into `merge` would duplicate it.
- `missing-approval` and `draft` are policy decisions belonging to the human reviewer; a fixer subagent cannot resolve them.
- `missing-label` is a workflow-protocol gap (e.g., the epic-cockpit label is missing); fixing it from a subagent would be a workflow violation.
- Merge conflicts are mechanical and well-suited to a subagent fix.

**Alternatives considered**:
- (B) Poll-then-proceed on pending; route conflicts to fixer; stop on others. Rejected per Q3 — duplicates `cockpit:watch`; per #789 Q4, the CLI is fail-fast on pending and the watch loop re-triggers when checks go green.
- (C) Delegate all distinctions to the CLI. Rejected per Q3 — the slash command needs to surface actionable reports for non-mergeable states; an opaque "stopped" signal forces the user to context-switch back to the CLI.

### D4: Accepts an issue/epic ref + `--no-fix`; default `--max-fix-attempts=1`

**Decision**: Positional argument is an issue/epic ref (resolved via #788). Flags: `--no-fix` (skip the fixer and stop on red), `--max-fix-attempts=N` (default `1`).

**Rationale**:
- Clarification Q4 chose option C; Q5 chose option C with default `1`.
- Default `1` honors FR-007's strict one-shot reading; making it configurable defends against the case where a partial fix is provably progress (configurable up to a small `N`).
- Operating on a resolved issue's PR (not "current branch") matches the cockpit's actual usage: the orchestrator session is not on the PR branch.
- `--no-fix` enables a dry-run / inspection workflow: see why a PR is red without spending fixer-tokens.

**Alternatives considered**:
- (A) No arguments. Rejected per Q4 — incompatible with the orchestrator-session model.
- (B) PR-number override only. Rejected per Q4 — `--no-fix` is needed for inspection workflows.
- (Q5/A) Hard one-shot. Rejected per Q5 — too rigid for cases where a partial fix is progress.
- (Q5/B) Small fixed cap. Rejected per Q5 — strictly less flexible than (C).

### D5: Fall back to a general agent with an embedded fixer prompt if no named `cockpit-fixer` subagent exists

**Decision**: Prefer a named `cockpit-fixer` subagent when one is registered. If none exists at install time, spawn a general agent via the Task tool with an embedded fixer prompt that takes the failing-check JSON as context.

**Rationale**:
- Clarification Q1 explicitly allowed either form.
- A named subagent is easier for users to reason about ("the fixer ran") and easier to evolve in isolation, so it's the preferred form.
- The fallback ensures `merge.md` is implementable today even if the dedicated subagent hasn't landed.

**Alternatives considered**:
- Hard-require a named subagent. Rejected — would block this issue on an out-of-scope dependency.
- Always inline. Rejected — loses the auditability of the named-subagent form once it's available.

### D6: Output discipline — terse status lines, no chatty summaries

**Decision**: The command emits short status lines for each phase (`Resolved <ref> → PR #123`, `CLI: red (checks-failing)`, `Spawning fixer (attempt 1/1)`, `Re-evaluating…`, `Merged ✓` or `Stopped: missing-approval`). No trailing summaries, no narration of internal deliberation.

**Rationale**:
- Matches the project-wide tone-and-style guidance in CLAUDE.md.
- Cockpit verbs run inside orchestrator sessions; verbose output pollutes the parent agent's context.

**Alternatives considered**:
- Verbose log mode. Rejected — out of scope for this issue; add later via `--verbose` if a real need surfaces.

## Implementation Patterns

### P1: Slash-command frontmatter mirrors sibling commands

- Use the YAML frontmatter convention from `packages/claude-plugin-agency-spec-kit/commands/specify.md`: `description`, `arguments[]` with `name`, `description`, `required`.
- Declare one positional argument (`ref`) and document the two flags (`--no-fix`, `--max-fix-attempts`) in the description and prompt body.

### P2: Idempotent CLI invocation

- Each `generacy cockpit merge <ref>` call must observe live state and act fresh. The slash command MUST NOT cache state between attempts.
- The fixer subagent is the only thing that mutates state between calls; the CLI is the observer.

### P3: Bounded loop with explicit attempt accounting

- Track `attempts` starting at `0`. Each fixer pass increments it. Exit on `attempts >= max-fix-attempts`.
- On exit-via-cap, the report MUST include the attempt count and the most recent failing-check summary so the user can decide next steps.

### P4: Reason → action mapping is a closed enum

- `checks-failing`, `merge-conflict` → fixer (or stop on `--no-fix`).
- `missing-label`, `missing-approval`, `draft`, `pending` → stop + actionable report.
- Unknown reasons → stop with a "report this" error rather than silently merging or guessing.

## Key Sources / References

- `specs/355-epic-generacy-ai-tetrad/spec.md` — feature requirements and acceptance criteria.
- `specs/355-epic-generacy-ai-tetrad/clarifications.md` — answered questions Q1–Q5.
- `packages/claude-plugin-agency-spec-kit/commands/specify.md` — frontmatter + command-body pattern reference.
- `packages/claude-plugin-cockpit/` — scaffold landed in #350; provides the namespace and `commands/` directory.
- Issue #789 — `generacy cockpit merge` CLI verb (returns the JSON this command consumes).
- Issue #788 — shared issue/epic resolver (resolves the positional `ref` argument).
- Issue #787 — `/cockpit:watch` (owns the pending-checks re-trigger that this command intentionally defers to).
- `docs/epic-cockpit-plan.md` in `tetrad-development` (P2 / A2.5) — parent epic context.
