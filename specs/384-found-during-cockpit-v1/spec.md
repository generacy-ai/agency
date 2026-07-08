# Feature Specification: Fix cockpit review approve path (422 on own PR) and enforce approval gate terminal check

**Branch**: `384-found-during-cockpit-v1` | **Date**: 2026-07-08 | **Status**: Clarified

## Summary

Found during the cockpit v1 integration smoke test (generacy-ai/tetrad-development#88), finding #16 — two defects in `packages/claude-plugin-cockpit/commands/review.md` observed on the first post-#382 live run (`/cockpit:review 2 --gate implementation-review` on `christrudelpw/sniplink`):

**1. The approve path posts an APPROVE-event PR review — which GitHub forbids on your own PR.** Step 6 (added by #382) posts `event: APPROVE` with a body listing non-blocking findings. On single-credential clusters — the primary deployment shape — the API returns 422 ("Can not approve your own pull request"), the error-handling block fires, and the command exits WITHOUT advancing: approve-with-findings is structurally broken on exactly the clusters that exist today. **Fix**: post `event: COMMENT` with body-only text instead. It is permitted on one's own PR, and with no `comments[]` it creates zero threads, so `PrFeedbackMonitorService` stays quiet — the #382 Q2 semantic (inline threads = actionable, body = information) is preserved verbatim. GitHub's approve semantics are meaningless on a self-PR anyway; the body text is the payload.

**2. The approval gate is skippable in practice.** The observed session ran step 3's `/code-review`, presented findings (as raw JSON rather than the required summary table), and ended — never invoking step 5's `AskUserQuestion`, never advancing. The playbook text is correct but has no structural backstop against instruction decay after a long sub-invocation. **Fix**: add a terminal Post-Command Check block that fail-closes on missing terminal outcomes, plus tighten step 3 to prevent the raw-JSON regression at the source.

Both changes are to `packages/claude-plugin-cockpit/commands/review.md` (plus its inlined examples). Manual unblock applied on the test project: `generacy cockpit advance --gate implementation-review` run directly (safe post-#845).

## User Stories

### US1: Approve path succeeds on single-credential clusters

**As a** cockpit operator running `/cockpit:review` on a self-authored PR (single-credential cluster),
**I want** the approve-with-findings path to advance the gate without hitting GitHub's self-approve 422,
**So that** approve is a real outcome on the deployment shape I actually run.

**Acceptance Criteria**:
- [ ] Step 6 posts a PR review with `event: COMMENT` (not `APPROVE`) on all clusters. Uniform behavior — no cluster-shape detection branch.
- [ ] The step 6 body payload preserves the #382 semantic contract: a body listing non-blocking findings, no `comments[]` array, so `PrFeedbackMonitorService` stays quiet.
- [ ] An inline comment adjacent to the event choice records the rationale: "self-APPROVE is forbidden by GitHub and semantically empty; revisit if multi-credential reviewer identities ever ship."
- [ ] On the single-credential smoke-test scenario (`/cockpit:review 2 --gate implementation-review` on a self-authored PR), the command posts the review, advances the gate, and emits the `Labels:` line — no 422, no error-handling detour.

### US2: Approval gate has a structural terminal-outcome backstop

**As a** cockpit operator whose `/code-review` sub-invocation was long and context-heavy,
**I want** `review.md` to fail-closed if none of the three valid terminal outcomes has been emitted,
**So that** instruction decay after a long sub-invocation cannot silently skip the approval gate.

**Acceptance Criteria**:
- [ ] `review.md` ends with a new `## Terminal Outcome Check` block wrapped in fence markers (`<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->`) following the existing `error-conv` convention, so the block is greppable across command files.
- [ ] The block enumerates "exactly one of the following MUST have occurred": (a) approve → step 6 executed and a `Labels:` line printed; (b) request-changes → step 7's COMMENT review posted and a `Feedback posted: N inline comment(s) on PR #<n>` line printed; (c) abort → an `Aborted:` line printed.
- [ ] Step 8's abort branch is updated to emit a literal `Aborted:` line on abort (currently emits nothing). Emission still occurs after any state mutation, so absence of the line implies absence of the outcome.
- [ ] Detection is text-emission-only. No `gh api` or `generacy cockpit status` probes are added to the check. Each marker (`Labels:`, `Feedback posted:`, `Aborted:`) is emitted by its own step only after that step's real side effect succeeds, so verifying the emission verifies the outcome transitively.
- [ ] If none of the three markers appears, the check instructs the command to return to step 5 only (re-invoke `AskUserQuestion`), unbounded. The findings-summary table from step 3 is re-shown from session context; `/code-review` is not re-invoked.
- [ ] The block includes a passive prose reminder that step-3 findings are presented via the required summary table, never as raw JSON. It does not self-introspect prior output — the raw-JSON regression is enforced upstream (see US3).

### US3: Step 3 prevents raw-JSON findings at the source

**As a** cockpit operator running the approval gate,
**I want** step 3 to structurally forbid raw-JSON output from `/code-review`,
**So that** the operator never sees `{"findings": …}` before the summary table and the terminal check never has to detect that regression.

**Acceptance Criteria**:
- [ ] Step 3's instructions are strengthened to state: "MUST NOT print raw JSON under any circumstance; if `/code-review` returns JSON, parse it and render the required summary table before printing anything else."
- [ ] The Post-Command Check block's mention of the table-not-JSON rule remains a passive reminder for the operator; no active self-introspection of prior output is added.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Step 6 in `review.md` MUST post `event: COMMENT` (not `APPROVE`) on all clusters, with body-only text and no `comments[]`. | P1 | Fixes the 422 on single-credential clusters. Uniform, per Q3. |
| FR-002 | An inline rationale comment MUST accompany the event choice in the playbook: "self-APPROVE is forbidden by GitHub and semantically empty; revisit if multi-credential reviewer identities ever ship." | P1 | Q3 rationale — inline comment travels with the code; no separate tracking issue. |
| FR-003 | `review.md` MUST end with a `## Terminal Outcome Check` block, wrapped in `<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->` fence markers per the existing `error-conv` convention. | P1 | Q1 — new block shape, greppable across command files. |
| FR-004 | The Terminal Outcome Check block MUST enumerate the three valid terminal outcomes keyed to text-emission markers (`Labels: …`, `Feedback posted: …`, `Aborted:`) and fail-close by returning to step 5 (only) if none has been emitted. | P1 | Q2/Q4 — text-emission-only detection; unbounded re-invocation of step 5. |
| FR-005 | Step 8's abort branch MUST emit a literal `Aborted:` line (currently emits none). | P1 | Required for FR-004's abort marker to be detectable. |
| FR-006 | Step 3 MUST forbid raw-JSON output: "MUST NOT print raw JSON under any circumstance; if `/code-review` returns JSON, parse it and render the required summary table before printing anything else." | P1 | Q5 — upstream enforcement; the Terminal Outcome Check's table-not-JSON note is a passive reminder only. |
| FR-007 | The Terminal Outcome Check block MUST include a passive prose reminder that step-3 findings are rendered via the summary table, never as raw JSON. | P2 | Q5 — passive documentation, no self-introspection. |
| FR-008 | The Terminal Outcome Check MUST NOT invoke `gh api`, `generacy cockpit status`, or any other state probe. | P1 | Q2 — text-emission-only; avoids per-run network calls and concurrent-actor false positives. |
| FR-009 | The Terminal Outcome Check MUST NOT re-invoke `/code-review` when routing back to step 5. | P1 | Q4 — the findings table is rebuilt from session context; re-running the sub-invocation would re-introduce the very decay the check exists to catch. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Approve path on self-authored PR (single-credential cluster) | Gate advances without 422 | Re-run `/cockpit:review 2 --gate implementation-review` on `christrudelpw/sniplink`; observe COMMENT event posted, `Labels:` line printed, gate advanced. |
| SC-002 | Approval gate is not silently skippable after a long `/code-review` sub-invocation | Session cannot end without emitting one of `Labels:`, `Feedback posted:`, or `Aborted:` | Replay the smoke-test scenario; verify the Terminal Outcome Check routes back to step 5 if no marker was emitted. |
| SC-003 | Raw-JSON findings do not appear in step 3 output | Zero raw-JSON `/code-review` outputs printed | Inspect step 3 output during smoke test; findings render as the required summary table only. |
| SC-004 | Discoverability of the Terminal Outcome Check across command files | `grep -r 'BEGIN terminal-check' packages/claude-plugin-cockpit/commands/` returns the review.md occurrence | Static check on the repo. |

## Assumptions

- Single-credential clusters remain the primary deployment shape. Multi-credential clusters are not required to preserve the `APPROVE` event — Q3 confirmed uniform `COMMENT` for all clusters, with an inline rationale comment instead of a tracking issue.
- The Terminal Outcome Check pattern is *new to this repo*: the spec's original "mirror `clarify.md`" premise was wrong (Q1). No prior canonical form exists. `clarify.md` may retroactively adopt this same block in a follow-up, out of scope here.
- Text-emission markers (`Labels:`, `Feedback posted:`, `Aborted:`) are emitted by their respective steps only *after* the corresponding side effect succeeds. This makes emission a reliable proxy for outcome and lets FR-004 avoid network probes.
- Operators driving `AskUserQuestion` are trusted to eventually pick an outcome; unbounded re-invocation of step 5 has no runaway risk because each iteration blocks on a human answer (Q4).
- The existing `<!-- BEGIN error-conv -->` / `<!-- END error-conv -->` fence-marker convention in `packages/claude-plugin-cockpit/commands/*.md` is the correct pattern to follow for FR-003's new block markers.

## Out of Scope

- Retroactively adopting the `## Terminal Outcome Check` block in `packages/claude-plugin-cockpit/commands/clarify.md` (or elsewhere). Sensible follow-up per Q1, not this PR.
- Cluster-shape detection or a `COMMENT`-vs-`APPROVE` conditional branch (Q3 rejected).
- Retry caps on the step 5 loop-back (Q4 rejected — bounded caps convert operator hesitation into a silent non-outcome).
- Self-introspection of prior session output to detect raw-JSON findings (Q5 rejected — upstream enforcement in step 3 instead).
- End-of-session `gh api` / `generacy cockpit status` state probes (Q2 rejected in favor of text-emission-only detection).
- Filing a follow-up tracking issue for multi-credential detection (Q3 rejected — inline rationale comment instead of a dead issue).

---

*Generated by speckit*
