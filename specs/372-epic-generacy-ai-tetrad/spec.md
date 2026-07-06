# Feature Specification: Epic: generacy-ai/tetrad-development#85 | Phase: S4 | Tier: v1-simplification | Issue: A-S1

Rewrite claude-plugin-cockpit to exactly six commands per plan rev 3: watch, status, queue, clarify, review, merge — all assist-mode, each self-contained (contract = the CLI verb's --help + the @generacy-ai/cockpit README; no references to specs/** contracts, no invoking other slash commands)

**Branch**: `372-epic-generacy-ai-tetrad` | **Date**: 2026-07-06 | **Status**: Draft

## Summary

Epic: generacy-ai/tetrad-development#85 | Phase: S4 | Tier: v1-simplification | Issue: A-S1

Rewrite claude-plugin-cockpit to exactly six commands per plan rev 3: watch, status, queue, clarify, review, merge — all assist-mode, each self-contained (contract = the CLI verb's --help + the @generacy-ai/cockpit README; no references to specs/** contracts, no invoking other slash commands). watch: Monitor runs `generacy cockpit watch <epic-ref>`; per transition line print one notification with the suggested next /cockpit:* command; no policy lookup, no dedupe/baseline handling, no PushNotification; on watcher exit report and stop (~20 lines). review: runs /code-review for --gate impl, summarizes the artifact otherwise, and on approval calls `generacy cockpit advance --gate <g>` directly (fixes the unshipped /cockpit:advance reference). merge: keeps the bounded fixer subagent (--max-fix-attempts default 1; never merges on red). Delete plan.md, breakdown.md, file.md, bug.md. One short shared error convention (missing binary / gh auth / other). README: current command table + marketplace install via extraKnownMarketplaces; remove the stale "coming in #351–#360" copy.

Owns (isolation): packages/claude-plugin-cockpit/**

Acceptance: six command files only; no reference to autonomy policy, transition/policy schemas, feature-branch specs, or unshipped verbs; each command runnable in a fresh session with only the plugin + gh auth + generacy CLI installed.

Depends on: G-S2, G-S3 (context verb, epic-body discovery, queue signature) (see the epic checklist for issue numbers)

---
Part of the Epic Cockpit. Plan: docs/epic-cockpit-plan.md in tetrad-development (S4 / A-S1).


## User Stories

### US1: Watch epic transitions

**As a** cockpit operator driving an epic,
**I want** `/cockpit:watch <epic-ref>` to stream transition lines and suggest the next `/cockpit:*` command per transition,
**So that** I always know the next assist step without reading policy schemas.

**Acceptance Criteria**:
- [ ] Runs `generacy cockpit watch <epic-ref>` and renders its output.
- [ ] For each transition line, prints one notification with the suggested next `/cockpit:*` command via a small static mapping table in `watch.md` (`waiting-for:clarification` → `/cockpit:clarify` · `waiting-for:<gate>-review` → `/cockpit:review --gate <gate>` · `completed:validate` / green checks → `/cockpit:merge` · error states → no suggestion).
- [ ] No policy lookup, no dedupe/baseline handling, no `PushNotification`.
- [ ] On watcher exit, reports and stops.
- [ ] `watch.md` fits in ~20 lines.

### US2: Terse status/queue renders

**As a** cockpit operator,
**I want** `/cockpit:status` and `/cockpit:queue` to render CLI output with the shared error convention,
**So that** I get consistent, terse output without slash commands duplicating engine logic.

**Acceptance Criteria**:
- [ ] `status.md` renders `generacy cockpit status <args>` output; with no argument, prints the usage line (no `.generacy/epics/` resolution chain).
- [ ] `queue.md` renders `generacy cockpit queue <args>` output and keeps its `AskUserQuestion` Confirm/Cancel gate as the playbook's mutating "go" trigger.
- [ ] Neither command references `specs/**` contracts.

### US3: Review gates

**As a** cockpit operator,
**I want** `/cockpit:review --gate <g>` to run `/code-review` for the `impl` gate, summarize the artifact for other gates, and on approval call `generacy cockpit advance --gate <g>`,
**So that** review + advancement is a single command instead of an English state-machine spread across files.

**Acceptance Criteria**:
- [ ] For `--gate impl`, invokes the Claude-Code-native `/code-review` slash command (the single documented cross-slash-command exception).
- [ ] For other gates, summarizes the review artifact.
- [ ] On approval, calls `generacy cockpit advance --gate <g>` directly (replaces the unshipped `/cockpit:advance` reference).

### US4: Clarify assist loop

**As a** cockpit operator answering clarification questions,
**I want** `/cockpit:clarify` to run the full assist loop (context → draft grounded answers → per-question approval → post marked comment → `generacy cockpit advance`),
**So that** the answer flow is a bounded assist step, not a bag of per-repo shell.

**Acceptance Criteria**:
- [ ] Calls `generacy cockpit context` (the renamed successor to `clarify-context`) for grounded context.
- [ ] Drafts answers per question, gets per-question approval, posts a marked comment, then calls `generacy cockpit advance`.
- [ ] Contains no `specs/**` (feature-branch) contract references.

### US5: Shared error convention

**As a** cockpit operator,
**I want** every command to classify failures the same way (missing binary / `gh` auth / other),
**So that** identical error paths render identically across commands.

**Acceptance Criteria**:
- [ ] The three-class convention (missing binary / `gh` auth / other, with install+auth one-liners) is inlined verbatim into each of the six command files.
- [ ] Each command marks its inlined block with a comment naming the plugin README as canonical source of truth.
- [ ] The canonical copy lives in this plugin's README (not the `generacy` repo/npm package).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Exactly six command files exist after the rewrite: `watch.md`, `status.md`, `queue.md`, `clarify.md`, `review.md`, `merge.md`. | P1 | Delete `plan.md`, `breakdown.md`, `file.md`, `bug.md`. |
| FR-002 | Every command is assist-mode and self-contained: its contract is the CLI verb's `--help` plus the `@generacy-ai/cockpit` README. | P1 | No `specs/**` references. |
| FR-003 | No command references autonomy policy, transition/policy schemas, feature-branch specs, or unshipped verbs. | P1 | |
| FR-004 | Each command is runnable in a fresh Claude Code session with only the plugin + `gh` auth + `generacy` CLI installed. | P1 | |
| FR-005 | No command invokes another `/cockpit:*` slash command; commands compose only via the `generacy` CLI. | P1 | `/code-review` (Claude-Code-native) is the single documented exception, permitted only in `review.md --gate impl`. |
| FR-006 | `watch.md` runs `generacy cockpit watch <epic-ref>`, and for each transition line prints one notification with the suggested next `/cockpit:*` command derived from a small static mapping table in the command body. | P1 | See US1 AC for the mapping. |
| FR-007 | `watch.md` performs no policy lookup, no dedupe/baseline handling, no `PushNotification`. On watcher exit, reports and stops. | P1 | |
| FR-008 | `status.md` renders `generacy cockpit status`; with no argument, prints the usage line (no `.generacy/epics/` resolution chain). | P1 | |
| FR-009 | `queue.md` renders `generacy cockpit queue` and keeps its `AskUserQuestion` Confirm/Cancel gate. | P1 | |
| FR-010 | `clarify.md` runs the full assist loop: `generacy cockpit context` → draft grounded answers → per-question approval → post marked comment → `generacy cockpit advance`. | P1 | Uses renamed `context` verb (`clarify-context` no longer exists). |
| FR-011 | `merge.md` never merges on red CI, supports `--max-fix-attempts` (default 1), and uses a bounded fixer subagent that attempts any red check owned by this repo's CI (tests, lint, typecheck, build). | P1 | Infrastructure/runner failures are reported and merge aborts without burning an attempt. One "attempt" = one fixer invocation that pushes and triggers a re-check. |
| FR-012 | Every command inlines the shared error convention (missing binary / `gh` auth / other) verbatim, with a comment naming the plugin README section as canonical. | P1 | Canonical copy in this plugin's README. |
| FR-013 | Plugin README documents the current command table and the marketplace install via `extraKnownMarketplaces`; the stale "coming in #351–#360" copy is removed. | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Command file count | Exactly 6 files in `packages/claude-plugin-cockpit/commands/`. | `ls packages/claude-plugin-cockpit/commands/*.md \| wc -l` returns 6. |
| SC-002 | No forbidden references | Zero occurrences of `specs/`, autonomy-policy, transition/policy schemas, or unshipped verbs (`/cockpit:advance`) inside command files. | `grep -r` against the six files finds none. |
| SC-003 | Fresh-session runnability | Each of the six commands executes successfully in a fresh Claude Code session with only the plugin + `gh` auth + `generacy` CLI. | Manual smoke test on a clean session. |
| SC-004 | `watch.md` size | ~20 lines. | Line count of `watch.md`. |
| SC-005 | Shared error convention consistency | The three-class inlined block is byte-identical across all six commands. | Diff each pair of inlined blocks; expect no differences. |
| SC-006 | Plugin README currency | README shows the current 6-command table and marketplace install; contains no "coming in #351–#360" copy. | Read + grep the README. |

## Assumptions

- The `generacy` CLI exposes `cockpit watch`, `cockpit status`, `cockpit queue`, `cockpit context`, `cockpit advance`, and the epic-body discovery + queue signature verbs that G-S2 / G-S3 ship.
- The Claude-Code-native `/code-review` slash command is always available in any session where this plugin is installed.
- Transition lines emitted by `generacy cockpit watch` are sufficient to key the static next-command mapping in `watch.md` without additional decoration.

## Out of Scope

- Modifying `generacy cockpit watch` to emit a `next: /cockpit:<verb>` field inline (the long-term-preferred design, deferred per the one-repo-per-issue rule; would live in the `generacy` repo).
- Reintroducing `/cockpit:advance`, `/cockpit:plan`, `/cockpit:breakdown`, `/cockpit:file`, `/cockpit:bug`, or any other verb outside the six-command set.
- Cross-slash-command invocation beyond the single `/code-review` exception in `review.md --gate impl`.
- Extracting the shared error convention to a standalone snippet file (`commands/_errors.md`) or referencing a README that is not readable at execution time.
- Fixer-subagent handling of infrastructure/runner failures in `merge.md`.

---

*Generated by speckit*
