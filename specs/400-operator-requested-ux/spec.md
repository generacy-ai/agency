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

### US1: [Primary User Story]

**As a** [user type],
**I want** [capability],
**So that** [benefit].

**Acceptance Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | [Description] | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | [Metric] | [Target] | [How to measure] |

## Assumptions

- [Assumption 1]

## Out of Scope

- [Exclusion 1]

---

*Generated by speckit*
