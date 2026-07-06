# Research: claude-plugin-cockpit six-command rewrite

**Feature**: 372-epic-generacy-ai-tetrad
**Phase**: 0 (research / decisions)
**Date**: 2026-07-06

This document captures the technology / design decisions that inform the rewrite and the alternatives considered. All open questions were resolved during `/clarify` (see [clarifications.md](clarifications.md)); no `NEEDS CLARIFICATION` items remain.

---

## Decision 1: Behavior of `clarify` / `status` / `queue` after the rewrite

**Decision**: Option B (amended) from clarifications Q1. Preserve the current terse-output discipline of `status` and `queue` (including `queue`'s `AskUserQuestion` Confirm/Cancel gate) but strip every `specs/**` reference. `clarify` keeps its full assist loop — that flow *is* the assist step, not incidental logic — but is updated to call the renamed `generacy cockpit context` verb (`clarify-context` no longer exists). `status` stays a thin render but the no-arg `.generacy/epics/` resolution chain is dropped: that directory no longer exists, so with no argument the command prints the usage line.

**Rationale**:
- Stripping `clarify` to a bare wrapper (Option A) would delete the assist loop the rewrite is supposed to preserve — the per-question approval + marked comment posting is the reason `clarify` exists as a slash command instead of a shell alias.
- The `queue` Confirm/Cancel gate is the playbook's mutating "go" trigger; removing it (Option A) removes the safety rail that stops accidental phase queueing.
- The `.generacy/epics/` leg of `status`'s no-arg resolver is dead code — the directory has not existed for several epics — and keeping it invites a "silent no-op" failure mode.

**Alternatives considered**:
- **Option A** — Strip all three to minimal wrappers. Rejected: deletes the assist loop (`clarify`) and the confirmation gate (`queue`) that are load-bearing.
- **Option C** — Custom. Not needed; Option B amended covers every real case.

---

## Decision 2: Source of the "suggested next `/cockpit:*` command" in `watch.md`

**Decision**: Option B from clarifications Q2. `watch.md` embeds a small static mapping table (`waiting-for:clarification` → `/cockpit:clarify` · `waiting-for:<gate>-review` → `/cockpit:review --gate <gate>` · `completed:validate` / green checks → `/cockpit:merge` · error states → no suggestion) and looks up the verb per transition line.

**Rationale**:
- Option A (engine emits `next: /cockpit:<verb>` inline on each transition line) is the better long-term design — the engine that knows the state machine decides, the plugin narrates — but requires a `generacy` CLI change. That is out of scope for this agency-only issue per the one-repo-per-issue rule.
- The mapping table is ~5 rows; SC-004's ~20-line budget for `watch.md` still holds.
- Explicitly forbids policy lookup (FR-007) — the static table is the only allowed source of the suggestion.

**Alternatives considered**:
- **Option A** — Engine emits suggestion inline. Deferred to a future `generacy` CLI issue.
- **Option C** — Different flow. Not needed.

---

## Decision 3: Cross-slash-command invocation policy

**Decision**: Option A from clarifications Q3. `/code-review` invoked from `review.md --gate impl` is the *single* documented exception. All other cross-slash-command invocation is forbidden. `/cockpit:*` invocation from another `/cockpit:*` command is unconditionally forbidden (FR-005).

**Rationale**:
- `/code-review` ships with Claude Code itself, so it is always present in any session where this plugin is installed — invoking it does not add a new install-time dependency.
- Inlining the review prompt (Option C) re-creates the English-state-machine problem the rewrite is designed to eliminate.
- Allowing any non-`/cockpit:*` slash command (Option B) opens the door to marketplace dependencies that may not be installed in a fresh session, violating FR-004 / SC-003.

**Alternatives considered**:
- **Option B** — Any non-`/cockpit:*` slash command allowed. Rejected: violates fresh-session runnability.
- **Option C** — Inline the review prompt. Rejected: re-creates the anti-pattern.

---

## Decision 4: Scope of the merge fixer subagent

**Decision**: Option B from clarifications Q4. The bounded fixer subagent attempts any red check owned by this repo's CI: tests, lint, typecheck, and build. Infrastructure/runner failures are reported and the merge aborts *without* burning an attempt. One "attempt" = one fixer invocation that pushes and triggers a re-check. `--max-fix-attempts` default is 1.

**Rationale**:
- Restricting the fixer to test failures only (Option A) leaves the most common trivially-fixable classes — lint and typecheck errors — unhandled, defeating the point of the subagent.
- Letting the fixer decide (Option C) risks spending the single default attempt on an ephemeral runner flake, which is a waste; the human sees the abort message either way.
- Never merging on red CI is invariant (FR-011) — no CLI flag or subagent policy changes this.

**Alternatives considered**:
- **Option A** — Tests only. Rejected: too narrow.
- **Option C** — Fixer decides. Rejected: wastes attempts on infra flakes.

---

## Decision 5: Physical location of the shared error convention

**Decision**: Option C from clarifications Q5. Inline the three-class convention (`MISSING_BINARY` / `AUTH_FAILURE` / `OTHER`, with the `npm install -g @generacy-ai/cli` and `gh auth login` one-liners) verbatim in each of the six command files. Each inlined block carries a comment naming the plugin README section as canonical source of truth. The canonical copy lives in **this plugin's README** (`packages/claude-plugin-cockpit/README.md`), NOT the `generacy` npm package README.

**Rationale**:
- Slash commands must be self-contained at execution time. Option A (README section referenced by heading) fails because the `generacy` npm README is not readable from a user's Claude Code session — the README is a repository artifact, not a shipped file the plugin can `cat`.
- Option B (`commands/_errors.md`) risks being auto-discovered as `/cockpit:_errors` (Claude Code discovers all `.md` files under `commands/`), adds an indirection hop, and saves only ~6 lines. Not worth the surface area.
- SC-005 (byte-identical inlined blocks) is verifiable by `diff` and is the only enforcement mechanism that survives package-level refactors.

**Alternatives considered**:
- **Option A** — README section referenced by heading. Rejected: README not readable at execution.
- **Option B** — `commands/_errors.md`. Rejected: auto-discovery hazard, indirection.

---

## Decision 6: Deleted verbs

**Decision**: Delete `commands/plan.md`, `commands/breakdown.md`, `commands/file.md`, `commands/bug.md`. Do NOT re-introduce them under the six-command set (FR-001, spec Out of Scope).

**Rationale**:
- `plan` and `breakdown` are `/speckit:*` responsibilities, not cockpit responsibilities. Their presence in cockpit created a bag of overlapping abstractions the rewrite is here to delete.
- `file` and `bug` were nice-to-have verbs that have not survived contact with real epic execution — the epic team files bugs directly with `gh issue create` and files features via `/speckit:specify`.
- The rewrite defines the six-command set as closed. Any future verb requires re-opening the S4 tier discussion, not slipping through a plan phase.

**Alternatives considered**:
- Keep `bug` (nice-to-have). Rejected: fresh-session runnability requires each retained verb to be load-bearing.
- Keep `plan` (compatibility). Rejected: no user relies on `/cockpit:plan` — the parent Epic Cockpit plan explicitly consolidates planning into the `/speckit:*` namespace.

---

## Decision 7: `/cockpit:advance` reference in `review.md`

**Decision**: `review.md` calls `generacy cockpit advance --gate <g>` **directly via the Bash tool** — not `/cockpit:advance`. The `/cockpit:advance` slash command was referenced by the previous `review.md` but never shipped; the rewrite eliminates that broken reference.

**Rationale**:
- FR-005 forbids `/cockpit:*` → `/cockpit:*` invocation.
- The `advance` verb is CLI-native (`generacy cockpit advance --gate <g>`); there is no assist step to wrap.
- Direct CLI invocation is faster, simpler, and keeps the composition rule ("commands compose only via the `generacy` CLI") intact.

**Alternatives considered**:
- Ship a new `/cockpit:advance` slash command in this package. Rejected: pure indirection, no assist value, would blow FR-001's exact-six invariant.
- Leave the broken reference. Rejected: obvious bug — the current `review.md` cites a verb that does not exist.

---

## Decision 8: README updates

**Decision**: Rewrite `packages/claude-plugin-cockpit/README.md` to (a) show the current 6-command table, (b) document the marketplace install via `extraKnownMarketplaces` (already documented in the current README, keep as-is), (c) contain the canonical Error Handling section that each command's inlined block cites, (d) delete the stale "coming in #351–#360" copy from the Overview and Available Commands table.

**Rationale**:
- FR-013 requires the current command table and the marketplace install.
- SC-006 verifies the "coming in #351–#360" copy is gone.
- The canonical Error Handling section belongs in the README (per Decision 5).

**Alternatives considered**:
- Keep the README frozen. Rejected: FR-013 is explicit.

---

## Sources / References

- `spec.md` (this feature) — Functional Requirements FR-001 through FR-013, Success Criteria SC-001 through SC-006, Out of Scope section.
- `clarifications.md` (this feature) — Batch 1 answers to Q1–Q5.
- `packages/claude-plugin-cockpit/commands/watch.md` (current) — Source for the transition-handling shape being simplified.
- `packages/claude-plugin-cockpit/commands/queue.md` and `commands/status.md` (current) — Source for the terse-output pattern and the inlined three-class error convention.
- `packages/claude-plugin-cockpit/README.md` (current) — Source for the marketplace install snippet to preserve.
- Claude Code documentation — built-in `/code-review` slash command availability (referenced but not linked here, per this repo's URL-caution policy).
