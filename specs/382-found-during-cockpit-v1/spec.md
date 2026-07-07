# Feature Specification: Align cockpit review/watch playbooks with CLI vocabulary and PrFeedbackMonitor flow

**Branch**: `382-found-during-cockpit-v1` | **Date**: 2026-07-07 | **Status**: Draft

**Issue**: [generacy-ai/agency#382](https://github.com/generacy-ai/agency/issues/382)
**Context**: Found during cockpit v1 integration smoke test ([generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88)), findings #12–14, discovered running the first live `/cockpit:review --gate impl`.

## Summary

Three defects in `claude-plugin-cockpit`'s review/watch playbooks caused the smoke-test session agent to self-correct mid-advance, silently drop reviewer findings on the floor, and produce request-changes suggestions for minor findings. This spec fixes the three defects together — they share the same owned files (`packages/claude-plugin-cockpit/{commands/review.md,commands/watch.md,README.md}`) and were surfaced by the same session.

### Defect 1: Gate-token misalignment (three vocabularies for one gate)

The CLI derives gate names from label pairs, so `implementation-review` is the only valid token (verifiable via `generacy cockpit advance --help-gates`). But the playbooks currently document three different tokens:

- `review.md` accepts and documents `--gate impl`
- `review.md`'s header mapping (`waiting-for:<gate>-review → /cockpit:review --gate <gate>`) implies `--gate implementation`
- `watch.md`'s suggestion table emitted BOTH `--gate impl` and `--gate implementation` at different transitions in a single session

Session agent had to self-correct mid-advance.

### Defect 2: request-changes path is a silent no-op

`review.md` step 7: on `request-changes`, "emit no `Labels:` line, mutate no state, exit zero." The reviewer's findings never reach the worker. The session agent improvised by posting a top-level PR comment, but `PrFeedbackMonitorService` triggers on PR review events with unresolved review THREADS — not top-level comments — so the improvised workaround was invisible to the downstream flow.

### Defect 3: Suggested-decision derivation makes every finding blocking

`review.md` step 3: "any blockers → `request-changes`; non-blocking findings only → `request-changes`; no findings → `approve`." The middle rule contradicts the very blocking/non-blocking distinction it depends on. Observed live: two explicitly minor findings produced a `request-changes` suggestion the operator had to override.

## User Stories

### US1: Session agent invokes the review gate with the correct token on the first try

**As a** cockpit session agent (or human operator) reading the review/watch playbooks,
**I want** one consistent gate vocabulary across `review.md`, `watch.md`, and the CLI,
**So that** I can advance a gate without a self-correction mid-run and without reading CLI source to discover the real token.

**Acceptance Criteria**:
- [ ] `review.md`'s accepted `--gate` values match `generacy cockpit advance --help-gates` verbatim (e.g. `implementation-review`, `plan-review`, `specify-review`, `clarify-review`, `tasks-review`)
- [ ] `watch.md`'s suggestion table emits the same tokens (`waiting-for:<gate>-review → /cockpit:review --gate <gate>-review` — or however the mapping resolves to the CLI's exact names)
- [ ] All examples in both playbooks use the CLI vocabulary — no `impl`, no `implementation` bare
- [ ] `README.md` documents the vocabulary once and points to the CLI as the single source of truth
- [ ] If shortening is desired, the alias is added to the CLI (not the markdown)

### US2: Reviewer findings on request-changes reach the worker via the existing feedback flow

**As a** cockpit reviewer selecting `request-changes` at the impl gate,
**I want** my findings to become inline PR review threads,
**So that** `PrFeedbackMonitorService` detects them, applies `waiting-for:address-pr-feedback`, and the worker agent addresses each thread — without any new label or protocol change.

**Acceptance Criteria**:
- [ ] On `request-changes`, `review.md` posts a PR review with `event: COMMENT` via `gh api repos/{owner}/{repo}/pulls/{n}/reviews`
- [ ] Each `/code-review` finding becomes one inline comment anchored to its `file:line` (anchors are already carried in `/code-review` output)
- [ ] The COMMENT-event review path works on single-credential clusters (only APPROVE/REQUEST_CHANGES are blocked on one's own PR; COMMENT is permitted)
- [ ] `PrFeedbackMonitorService` observes the unresolved review threads and drives the existing address-pr-feedback flow — no new label, no new state, no monitor change
- [ ] Explicit `changes-requested` label is NOT introduced (thread-based signal already exists and is the intended handler)

### US3: Suggested decision reflects blocking severity, not finding count

**As a** cockpit reviewer running `/cockpit:review --gate implementation-review`,
**I want** non-blocking findings to suggest `approve`,
**So that** minor findings don't force me to override the suggestion and don't stall the gate on essentially-clean reviews.

**Acceptance Criteria**:
- [ ] `review.md` step 3 rewritten: `any blockers → request-changes`; `non-blocking findings only → approve`; `no findings → approve`
- [ ] Non-blocking findings surfaced on approval — either in the approval review-comment body OR carried as COMMENT-review threads that do not block the gate
- [ ] The two-minor-findings smoke-test scenario now yields `Suggested decision: approve` without operator override

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `review.md` accepted `--gate` values match `generacy cockpit advance --help-gates` verbatim; all examples use those tokens | P1 | Defect 1 |
| FR-002 | `watch.md` suggestion table emits the same CLI tokens; no `impl` or bare `implementation` anywhere | P1 | Defect 1 |
| FR-003 | `README.md` documents gate vocabulary once and names the CLI as source of truth; if a short alias is desired, add it to the CLI | P2 | Defect 1 |
| FR-004 | On `request-changes` at impl gate, post PR review with `event: COMMENT` including one inline comment per `/code-review` finding, anchored to `file:line` | P1 | Defect 2 |
| FR-005 | Do NOT introduce a `changes-requested` label; the existing PR review-thread signal drives `PrFeedbackMonitorService` → `waiting-for:address-pr-feedback` | P1 | Defect 2 (rejected alternative) |
| FR-006 | Suggested-decision derivation: `blockers → request-changes`; `non-blocking only → approve`; `none → approve` | P1 | Defect 3 |
| FR-007 | On `approve` with non-blocking findings present, surface findings (in approval review body OR as COMMENT-review threads) so they aren't lost | P2 | Defect 3 |
| FR-008 | Non-impl gates (`specify`, `clarify`, `plan`, `tasks`) preserve current three-section terse-summary format; only the accepted token names change | P2 | Backward-compat within playbook |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Session agent successfully advances impl gate without any token self-correction | 100% of runs | Re-run cockpit v1 smoke test; count self-corrections in transcript |
| SC-002 | Reviewer `request-changes` results in `waiting-for:address-pr-feedback` being applied by `PrFeedbackMonitorService` | 100% of runs | Observe label transition on the test PR after posting request-changes |
| SC-003 | A review producing only non-blocking findings yields `Suggested decision: approve` | 100% of runs | Craft `/code-review` output with only non-blocking findings; verify final line |
| SC-004 | Gate vocabulary appears identically in `review.md`, `watch.md`, and `generacy cockpit advance --help-gates` | Zero divergence | `diff` of the three sources of tokens |

## Assumptions

- The Claude Code `/code-review` slash command already produces file:line-anchored findings distinguishable as blocking vs. non-blocking — no changes to `/code-review` itself are required.
- `PrFeedbackMonitorService` already exists and reacts to unresolved PR review threads by applying `waiting-for:address-pr-feedback` and enqueuing the fix work; this spec relies on that behavior unchanged.
- GitHub's PR review API permits `event: COMMENT` reviews on one's own PR (only `APPROVE` and `REQUEST_CHANGES` are blocked in that case), so the request-changes path works on single-credential clusters.
- The rev 3 catalog's `--gate impl` shorthand (origin of vocabulary #1) is corrected in `tetrad-development`'s plan doc separately — this spec covers only the plugin-owned files.

## Out of Scope

- Any change to the `generacy` CLI's gate-name vocabulary or `--help-gates` output. Alignment is one-directional: the playbook adopts the CLI's names. (A CLI-side short alias would live in a separate CLI-repo issue.)
- Any change to `PrFeedbackMonitorService` or the `waiting-for:address-pr-feedback` state machine — this spec relies on existing behavior.
- Any change to Claude Code's built-in `/code-review` slash command.
- The rev 3 catalog doc in `tetrad-development` (owned separately; noted in the issue).
- Introducing a `changes-requested` label or any new label — explicitly rejected in the issue.

## Owned Files

- `packages/claude-plugin-cockpit/commands/review.md`
- `packages/claude-plugin-cockpit/commands/watch.md`
- `packages/claude-plugin-cockpit/README.md`

---

*Generated by speckit*
