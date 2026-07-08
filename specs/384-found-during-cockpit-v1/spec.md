# Feature Specification: Fix cockpit review approve path (422 on own PR) and enforce approval gate terminal check

**Branch**: `384-found-during-cockpit-v1` | **Date**: 2026-07-08 | **Status**: Draft
**Source**: [generacy-ai/agency#384](https://github.com/generacy-ai/agency/issues/384) | **Origin**: cockpit v1 integration smoke test finding #16 (generacy-ai/tetrad-development#88)

## Summary

Two defects observed in `packages/claude-plugin-cockpit/commands/review.md` on the first post-#382 live run of `/cockpit:review 2 --gate implementation-review` (christrudelpw/sniplink):

1. **Approve path 422s on single-credential clusters.** Step 6 (added by #382) posts an `event: APPROVE` PR review. GitHub rejects self-approval with HTTP 422 ("Can not approve your own pull request"). On single-credential clusters — the primary deployment shape today — this makes approve-with-findings structurally broken: the error-handling branch fires and the command exits without advancing the gate.

2. **Approval gate is skippable in practice.** The observed session ran step 3's `/code-review`, printed findings as raw JSON (not the required summary table), and terminated — never invoking step 5's `AskUserQuestion`, never advancing. The playbook text is correct, but there is no structural backstop against instruction decay after a long sub-invocation.

Both fixes are localized to `packages/claude-plugin-cockpit/commands/review.md` (and its inlined examples). The test project was unblocked manually via `generacy cockpit advance --gate implementation-review` (safe post-#845).

## User Stories

### US1: Approve-with-findings advances the gate on single-credential clusters

**As a** cockpit operator running `/cockpit:review` on a single-credential cluster,
**I want** the approve path to post a PR review that GitHub accepts,
**So that** the gate advances and the epic can proceed to the next phase without manual intervention.

**Acceptance Criteria**:
- [ ] Step 6 posts `event: COMMENT` with body-only text (no `comments[]` array).
- [ ] GitHub accepts the review on a self-authored PR (no 422).
- [ ] `PrFeedbackMonitorService` observes zero new inline threads (body-only review creates no threads).
- [ ] The #382 Q2 semantic is preserved: inline threads mean "actionable"; body text means "information".
- [ ] The gate advances after the review is posted; a `Labels:` line is printed.

### US2: Approval gate cannot be silently skipped

**As a** cockpit operator running `/cockpit:review`,
**I want** the command to fail closed if none of the three terminal outcomes have occurred,
**So that** a long `/code-review` sub-invocation cannot cause the approval prompt to be skipped and the gate to be left un-advanced.

**Acceptance Criteria**:
- [ ] A terminal **Post-Command Check** block is present at the bottom of `review.md`, matching the shape of the block used in `clarify.md`.
- [ ] The check enumerates the three valid terminal outcomes: (a) approve → step 6 executed and `Labels:` line printed; (b) request-changes → step 7's COMMENT review posted; (c) abort → `Aborted:` line printed.
- [ ] If none has occurred, the command must return to step 5 rather than exiting.
- [ ] The command restates that step-3 findings are presented via the required summary table, never as raw JSON.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Step 6 of `review.md` MUST post a PR review with `event: COMMENT` (not `APPROVE`) and a body-only payload (no `comments[]`). | P1 | Fixes 422 on single-credential clusters. |
| FR-002 | The step-6 body text MUST continue to list the non-blocking findings, preserving the current information payload. | P1 | GitHub's approve semantics are meaningless on a self-PR; the body is the payload. |
| FR-003 | `review.md` MUST end with a terminal **Post-Command Check** block that enumerates the three valid terminal outcomes and instructs the operator to return to step 5 if none has occurred. | P1 | Mirrors the pattern used in `clarify.md`. |
| FR-004 | `review.md` MUST restate — inside the Post-Command Check or an adjacent block — that step-3 findings are presented via the required summary table, never as raw JSON. | P1 | Addresses the observed regression where findings printed as raw JSON. |
| FR-005 | Inlined examples inside `review.md` MUST be updated to reflect the `COMMENT`-event payload. | P2 | Prevents documentation drift. |
| FR-006 | No other command files (`clarify.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) require changes for this fix. | P3 | Scope guard. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | `/cockpit:review` approve path succeeds on single-credential clusters | 100% (no 422) | Re-run the failing scenario (`/cockpit:review 2 --gate implementation-review` on a single-credential cluster) and confirm the gate advances with a `Labels:` line printed. |
| SC-002 | `PrFeedbackMonitorService` observes no new inline threads from the approve-path review | 0 new threads | Inspect PR after approve; confirm review body is present and `comments[]` is empty. |
| SC-003 | Approval gate cannot terminate without a recognized outcome | 100% of sessions end in (approve \| request-changes \| abort) | Dogfood `/cockpit:review` including a long `/code-review` sub-invocation; verify the Post-Command Check routes control back to step 5 if no outcome has been reached. |
| SC-004 | Step-3 findings render as the summary table | 100% of sessions | Visual inspection of command output during dogfooding. |

## Assumptions

- The `#382` Q2 semantic (inline threads = actionable, body = information) remains the intended contract for `PrFeedbackMonitorService`.
- Single-credential clusters remain the primary deployment shape; multi-credential clusters are not required to preserve the `APPROVE` event.
- The `clarify.md` Post-Command Check pattern is the canonical shape to mirror.
- `generacy cockpit advance --gate implementation-review` continues to be a safe manual escape hatch (post-#845).

## Out of Scope

- Any change to `PrFeedbackMonitorService` or the way it distinguishes actionable vs informational feedback.
- Changes to other cockpit command files (`clarify.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`).
- Introducing a multi-credential approval mode or delegating the `APPROVE` event to a distinct actor.
- Modifying `generacy cockpit advance` or the CLI-level gate-advancement path.
- Retroactive fixes to already-merged PRs that hit the 422.

---

*Generated by speckit*
