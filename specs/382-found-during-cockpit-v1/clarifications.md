# Clarifications: Align cockpit review/watch playbooks with CLI vocabulary and PrFeedbackMonitor flow

**Issue**: [generacy-ai/agency#382](https://github.com/generacy-ai/agency/issues/382)
**Branch**: `382-found-during-cockpit-v1`

---

## Batch 1 — 2026-07-07

### Q1: Gate vocabulary set for `/cockpit:review --gate`

**Context**: The spec's US1 acceptance criteria give an example list of gate tokens (`implementation-review`, `plan-review`, `specify-review`, `clarify-review`, `tasks-review`), but `generacy cockpit advance --help-gates` actually emits: `spec-review`, `clarification`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review`, `manual-validation`, `children-complete`, `epic-approval`. The spec's example has two apparent typos (`specify-review` vs actual `spec-review`; `clarify-review` vs actual `clarification-review`), and it doesn't say which of the 9 CLI tokens are in-scope for `/cockpit:review --gate`.

**Question**: Which exact set of CLI tokens should `/cockpit:review --gate` accept, and — for tokens outside that set (e.g. `clarification`, `manual-validation`, `epic-approval`, `children-complete`) — what happens if a user passes one?

**Options**:
- A: Accept only the five artifact/impl review tokens verbatim: `spec-review`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review`. Everything else prints a Usage line and exits non-zero (including the `clarification` answering gate, which is `/cockpit:clarify`'s job).
- B: Same five as A, plus `manual-validation` (the human validation gate the reviewer also drives).
- C: Accept every token `--help-gates` emits and let the CLI reject any it doesn't support; the playbook doesn't gatekeep the list.
- D: Something else — please specify.

**Answer**: *Pending*

---

### Q2: FR-007 — how to surface non-blocking findings on approve

**Context**: FR-007 says "on `approve` with non-blocking findings present, surface findings (in approval review body **OR** as COMMENT-review threads) so they aren't lost." Those two channels are functionally different: a review body is one text blob attached to the approval; COMMENT-review threads are individual, file:line-anchored, monitored by `PrFeedbackMonitorService`. The choice determines whether non-blocking findings become tracked feedback threads or purely informational text.

**Question**: On `approve` with non-blocking findings, which delivery mechanism should the playbook use?

**Options**:
- A: Approval review body only — findings appear as a summary in the APPROVE-event review's body; no inline threads created (nothing for `PrFeedbackMonitorService` to observe, so gate advances cleanly).
- B: Inline COMMENT-review threads only — same anchored-thread mechanism as request-changes, but posted as a separate COMMENT-event review before the APPROVE-event review; author decides per-thread whether to address.
- C: Both — summary in the approval body AND inline COMMENT-review threads (redundant but discoverable both ways).
- D: Something else — please specify.

**Answer**: *Pending*

---

### Q3: PR review body content on `request-changes`

**Context**: FR-004 requires posting a `event: COMMENT` PR review with one inline comment per `/code-review` finding on `request-changes`. The `gh api .../pulls/{n}/reviews` payload also accepts a top-level `body` field. It's unspecified whether that body should carry a summary/tally of findings or stay empty.

**Question**: Should the top-level `body` of the request-changes COMMENT-event review contain anything?

**Options**:
- A: Empty body — inline comments are the entire signal; body left blank so the PR-conversation timeline stays uncluttered.
- B: Short summary line only — e.g. `N blocking finding(s); see inline comments.` (no per-finding recap).
- C: Full recap — reproduce the `/code-review` output verbatim in the body AND post each finding as an inline comment (redundant but self-contained).
- D: Something else — please specify.

**Answer**: *Pending*

---

### Q4: Distinguishing blocking vs non-blocking `/code-review` findings

**Context**: US3 and FR-006 hinge on the playbook classifying each `/code-review` finding as blocking or non-blocking to derive the suggested decision. The Assumptions section states `/code-review` "already produces file:line-anchored findings distinguishable as blocking vs. non-blocking", but the playbook needs a concrete parsing rule (marker, severity field, section header, etc.) to make that judgement deterministic.

**Question**: What signal should the playbook use to classify a finding as blocking vs non-blocking?

**Options**:
- A: Section header — findings under `## Blocking` (or equivalent) are blocking; everything else is non-blocking. The playbook parses by header.
- B: Per-finding severity marker — each finding line carries an explicit `[blocking]` / `[non-blocking]` (or `severity: blocking|nit|suggestion`) prefix; playbook parses per-line.
- C: Keyword heuristic — treat findings mentioning `must`, `bug`, `security`, `breaks` as blocking; everything else non-blocking. (Fragile — flag if this is intended.)
- D: `/code-review`'s existing convention is documented elsewhere — please point to the schema so the playbook can spec its parser to match.
- E: Something else — please specify.

**Answer**: *Pending*

---

### Q5: `watch.md` mapping row for the review gate

**Context**: US1 AC #2 currently reads `waiting-for:<gate>-review → /cockpit:review --gate <gate>-review — or however the mapping resolves to the CLI's exact names`. Read literally, if `<gate>` = `implementation`, the substitution produces `--gate implementation-review` (correct); but the pattern also has to work for `spec-review` and `clarification-review` where the "root" isn't `spec` or `clarification` but the full token. Related: the current `waiting-for:clarification → /cockpit:clarify` row must survive the rewrite, since the answering gate is `/cockpit:clarify`, not `/cockpit:review --gate clarification`.

**Question**: What should the rewritten `watch.md` mapping table look like for the review-family rows and the clarification row?

**Options**:
- A: Enumerate each review token explicitly (one row per gate): `waiting-for:spec-review → /cockpit:review --gate spec-review`, `waiting-for:clarification-review → /cockpit:review --gate clarification-review`, etc. Keep `waiting-for:clarification → /cockpit:clarify` unchanged.
- B: One pattern row using the exact CLI token as the capture group: `waiting-for:<review-token> → /cockpit:review --gate <review-token>` where `<review-token>` ∈ the set from Q1. Keep `waiting-for:clarification → /cockpit:clarify` unchanged.
- C: A + also add rows for `manual-validation` (and any other reviewer-driven gate identified in Q1).
- D: Something else — please specify.

**Answer**: *Pending*

---
