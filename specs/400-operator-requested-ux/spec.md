# Feature Specification: Operator-requested UX improvement from the cockpit v1

**Branch**: `400-operator-requested-ux` | **Date**: 2026-07-10 | **Status**: Draft

## Summary

Operator-requested UX improvement from the cockpit v1.5 auto-mode smoke test arc (generacy-ai/tetrad-development#92). Applies to both clarification surfaces in `packages/claude-plugin-cockpit`: `commands/clarify.md` (steps 4–5) and `commands/auto.md` (D.1 step 3, § Gate contract G.1, SB.1 return schema).

## Current behavior

Both surfaces approve clarification answers **one question at a time**, and the presentation omits the question's own context:

- **auto.md D.1/G.1**: presentation block shows only `### Q<n>` + drafted answer + provenance, then fires `ceil(N/4)` `AskUserQuestion` calls — one per open clarification, options `Approve draft (Recommended)` / `Skip this question`. A 6-question batch = 6 individual approval prompts across 2 tool calls.
- **clarify.md step 5**: a per-question `AskUserQuestion` loop (`Approve` / `Edit` / `Skip`), then a pre-confirm tally.

Neither surface shows the operator what the workflow agent actually asked — the question's context or the lettered options it proposed — so judging a draft means cross-reading the GitHub issue in another window. During the T-S4 runs the operator and assistant converged on a different manual format (recommendation + why-over-alternatives, approved as one batch), which is what this issue formalizes.

## Requested behavior

**1. Per-question presentation shows five elements**, rendered in the presentation block for every open question:

```markdown
### Q<n> — <question title/summary>
**Context:** <the framing the workflow agent posted with the question, verbatim/condensed>
**Question:** <the question verbatim>
**Options:** <the lettered options as posted (A — …, B — …); or "(free-form — no options posted)">
**Recommendation:** <the chosen letter + its text, or the drafted free-form response>
**Why:** <1–3 sentences justifying the recommendation over the other options>
_provenance: <citation>_
```

Context, question, and options come verbatim from the `generacy cockpit context` payload (already fetched in step 1 of both flows); recommendation, justification, and provenance come from the drafter.

**2. One approval decision for the whole batch**, replacing per-question prompts. Exactly one `AskUserQuestion` per batch:

- Question: `Post all <N> drafted answers to <issue-ref>?` · header `Clarify` · `multiSelect: false`
- Options:
  1. `Approve all & post (Recommended)` — post every drafted answer as-is
  2. `Make changes` — collect per-question change directives (e.g. `Q2: B instead — <reason>; Q4: skip`), apply them, re-present only the changed questions plus the same batch gate; loop until approved or skipped
  3. `Skip this batch` — post nothing, do not advance, ledger line
- The built-in "Other" free-text remains the one-turn change path: directives typed there are applied directly (edited answers posted verbatim / individual questions skipped) without the extra `Make changes` round-trip.

Note on the G.1 rationale text: G.1 currently rejects a listed "Edit" option citing the #388 turn-split. That concern was about splitting a gate's *presentation from its decision* (decay into auto-proceed); a change-collection turn that follows an explicit operator selection of `Make changes` cannot auto-proceed and is not the same risk. Keep "Other" documented as the no-extra-turn path.

**3. Unchanged semantics** (explicitly out of scope to change):

- Posted comment format: `<!-- generacy-cockpit:clarification-answers -->` marker + one `### Q<n>` block per posted answer, `--body-file` only. The posted body per question is the recommendation + its justification (the five-element display is presentation-only; context/question/options are already on the issue and are not re-posted).
- Advance rule: advance the clarification gate only when every open question has a posted answer; per-question skips → post the approved subset, don't advance, ledger `posted <k>/<N>, skipped <s>`.
- Ledger line shapes (auto.md D.1), error handling, and the drafter-subagent isolation contract (no slash commands, JSON-only return).

**4. SB.1 return schema** (auto.md) extends from `{question_id, drafted_answer, provenance}` to `{question_id, recommendation, justification, provenance}` — the posted body is assembled from recommendation + justification, so the display and the posted answer cannot drift apart. `clarify.md` step 4's drafting contract mirrors the same fields.

## Acceptance criteria

- [ ] A 6-question batch presents all six five-element blocks and exactly **one** `AskUserQuestion` (not six).
- [ ] Each block shows context, question, and the workflow agent's own options verbatim from the context payload; free-form questions render the no-options placeholder rather than omitting the element.
- [ ] `Approve all & post` posts one marked comment with all N answers and advances the gate.
- [ ] `Make changes` → directives applied → only changed questions re-presented → batch gate re-fires; an edit directive's text is posted verbatim; a skip directive excludes that question and blocks advance (partial ledger line).
- [ ] "Other" free-text directives on the batch gate apply in one turn.
- [ ] Both `clarify.md` and `auto.md` (D.1, G.1, SB.1) specify the identical presentation block and batch-gate contract.


## User Stories

### US1: Batch-level approval with full per-question context (Primary)

**As an** operator running the cockpit clarify or auto-mode workflow,
**I want** to see the workflow agent's original context, question, and lettered options alongside the drafted recommendation and its justification, and approve the entire batch with one decision,
**So that** I can judge each draft in place without cross-reading the GitHub issue in another window, and I don't waste turns on N sequential `AskUserQuestion` prompts for a single logical batch.

**Acceptance Criteria**:
- [ ] Every open question in the batch renders a five-element presentation block: context, question, options (or free-form placeholder), recommendation, why (+ provenance).
- [ ] Exactly one `AskUserQuestion` fires per batch, regardless of question count (6-question batch → 1 prompt, not 6).
- [ ] Selecting `Approve all & post` posts one marked comment containing all N drafted answers and advances the clarification gate.

### US2: Targeted per-question changes without losing batch context

**As an** operator reviewing a batch where a few drafts need adjustment,
**I want** a `Make changes` path that collects per-question directives (e.g. `Q2: B instead — <reason>; Q4: skip`), applies them, and re-presents only the changed questions plus the same batch gate,
**So that** I can correct specific drafts without re-drafting the whole batch or reverting to per-question approval.

**Acceptance Criteria**:
- [ ] `Make changes` collects change directives keyed by question id.
- [ ] After applying directives, only the changed questions re-present, followed by the same batch gate; the loop continues until Approve or Skip.
- [ ] Edit directives post the operator's text verbatim; skip directives exclude that question from the posted comment and block gate advance (partial ledger line).

### US3: One-turn free-text directives via built-in "Other"

**As an** operator who already knows the change I want,
**I want** to type directives directly into the batch gate's built-in "Other" free-text field and have them applied in the same turn,
**So that** the fast path costs one turn instead of two, without splitting the gate's presentation from its decision.

**Acceptance Criteria**:
- [ ] Directives typed into "Other" are parsed and applied directly (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip.
- [ ] "Other" remains documented as the one-turn change path in both surfaces' gate contracts.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Presentation block for every open question renders five elements: `Context`, `Question`, `Options`, `Recommendation`, `Why` + `provenance` line. | P1 | Context/question/options verbatim from `generacy cockpit context` payload. |
| FR-002 | Free-form questions (no options posted) render the placeholder `(free-form — no options posted)` for the Options element rather than omitting it. | P1 | Keeps block shape consistent across question types. |
| FR-003 | Exactly one `AskUserQuestion` fires per batch, with question `Post all <N> drafted answers to <issue-ref>?`, header `Clarify`, `multiSelect: false`. | P1 | Replaces `ceil(N/4)` per-question calls (auto.md) and per-question loop (clarify.md). |
| FR-004 | Batch gate options: `Approve all & post (Recommended)`, `Make changes`, `Skip this batch`. | P1 | Fixed option set, in this order. |
| FR-005 | `Make changes` collects per-question directives, applies them, and re-presents only changed questions plus the same batch gate; loops until Approve or Skip. | P1 | Explicit operator selection precedes the directive-collection turn — not a #388 auto-proceed risk. |
| FR-006 | Built-in "Other" free-text on the batch gate applies directives directly in one turn (edited answers posted verbatim, individual questions skipped). | P1 | The no-extra-turn path; documented in both gate contracts. |
| FR-007 | Both `commands/clarify.md` (steps 4–5) and `commands/auto.md` (D.1 step 3, § Gate contract G.1, SB.1) specify the identical presentation block and batch-gate contract. | P1 | Single source of truth to prevent drift. |
| FR-008 | SB.1 return schema (auto.md) extends from `{question_id, drafted_answer, provenance}` to `{question_id, recommendation, justification, provenance}`; `clarify.md` step 4's drafting contract mirrors the same fields. | P1 | Posted body = recommendation + justification, so display and posted answer cannot drift. |
| FR-009 | Posted comment format unchanged: `<!-- generacy-cockpit:clarification-answers -->` marker + one `### Q<n>` block per posted answer, `--body-file` only. Per-question posted body = recommendation + justification. | P1 | Context/question/options already on the issue, not re-posted. |
| FR-010 | Advance rule unchanged: gate advances only when every open question has a posted answer; per-question skips → post approved subset, don't advance, ledger `posted <k>/<N>, skipped <s>`. | P1 | Skip semantics preserved from current behavior. |
| FR-011 | Ledger line shapes (auto.md D.1), error handling, and drafter-subagent isolation contract (no slash commands, JSON-only return) unchanged. | P2 | Out of scope for this change. |
| FR-012 | G.1 rationale text updated to reflect that a change-collection turn following an explicit `Make changes` selection is not the #388 turn-split risk (which was about splitting presentation from decision). | P2 | Documentation clarification only. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | `AskUserQuestion` calls per clarification batch. | Exactly 1 per batch, independent of N. | Instrument or observe a 6-question batch run; count gate prompts. |
| SC-002 | Operator context-switching to GitHub during batch review. | 0 tab-switches needed to judge any draft. | Present block contains all information the operator needed from the issue (context + options); confirm with operator on next auto-mode arc. |
| SC-003 | Drift between presented answer and posted answer. | 0 divergences. | Posted comment body per question is assembled from the same `{recommendation, justification}` fields shown in the presentation block. |
| SC-004 | Parity between `clarify.md` and `auto.md` gate contracts. | Identical presentation block and batch-gate contract in both surfaces. | Side-by-side diff of the two commands' clarification sections. |
| SC-005 | `Make changes` round-trip success. | Directives applied → only changed questions re-presented → batch gate re-fires; loop terminates on Approve/Skip. | Manual walk-through with an edit + a skip directive against a mixed batch. |

## Assumptions

- The `generacy cockpit context` payload (already fetched in step 1 of both flows) contains per-question `context`, `question`, and `options` fields verbatim from what the workflow agent posted to the issue.
- The drafter subagent can produce `{question_id, recommendation, justification, provenance}` per open question within its existing isolation contract (no slash commands, JSON-only return).
- Free-form (no-options) questions are distinguishable in the context payload so the presentation block can render the placeholder rather than an empty Options element.
- `AskUserQuestion`'s built-in "Other" free-text field is available on batch gates and its text is delivered to the command in the same turn.

## Out of Scope

- Changes to the posted comment marker (`<!-- generacy-cockpit:clarification-answers -->`), block format, or the fact that context/question/options are not re-posted.
- Changes to the gate advance rule or partial-post ledger semantics.
- Changes to the drafter-subagent isolation contract (no slash commands, JSON-only return).
- Changes to ledger line shapes (auto.md D.1) or clarify error-handling paths.
- Any other cockpit gate (specify/plan/tasks/review/merge) — this issue scopes to the clarification gate only.

---

*Generated by speckit*
