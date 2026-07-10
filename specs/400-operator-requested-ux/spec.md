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
### Q<n> — <question title from batch comment>
**Context:** <the framing the workflow agent posted with the question, verbatim/condensed>
**Question:** <the question verbatim>
**Options:** <the lettered options as posted (A — …, B — …); or "(free-form — no options posted)">
**Recommendation:** <the chosen letter + its text, or the drafted free-form response>
**Why:** <1–3 sentences justifying the recommendation over the other options>
_provenance: <citation>_
```

Title, context, question, and options are parsed from the `clarificationComment.body` field of the `generacy cockpit context` payload (already fetched in step 1 of both flows) — the body is the engine-authored batch template (`### Q<n>: <title>` / `**Context**:` / `**Question**:` / `**Options**:`), so the playbooks parse their own wire format. The parse must be mildly tolerant of option-bullet variations (`A:` vs `A)`). The title is reused verbatim from the batch comment header. First-line truncation of `question` is a fallback only when a batch comment arrives without titles. Recommendation, justification, and provenance come from the drafter.

**2. One approval decision for the whole batch**, replacing per-question prompts. Exactly one `AskUserQuestion` per batch:

- Question: `Post all <N> drafted answers to <issue-ref>?` · header `Clarify` · `multiSelect: false`
- Options:
  1. `Approve all & post (Recommended)` — post every drafted answer as-is
  2. `Make changes` — collect per-question change directives, apply them, re-present only the changed questions plus the same batch gate; loop until approved or skipped. Zero directives is a no-op: re-present the entire batch and fire the same gate again (never auto-approve or auto-skip on empty input)
  3. `Skip this batch` — post nothing, do not advance, ledger line
- The built-in "Other" free-text remains the one-turn change path: directives typed there are applied directly (edited answers posted verbatim / individual questions skipped) without the extra `Make changes` round-trip.

**Directive grammar** (identical parser in both `Make changes` and "Other" paths):

- Token-anchored rule: a new directive begins at each `Q<n>:` token. Split the input at `Q<n>:` occurrences; each directive's payload runs to the next token or end of input.
- Canonical documented form is newline-separated (`Q2: B\nQ4: skip`); the single-line semicolon form (`Q2: B; Q4: skip`) parses identically under the same rule — a verbatim replacement's text may itself contain semicolons, and the token rule doesn't mis-split it.
- Payload forms:
  - `Q<n>: <letter>` — bare letter resolves to that option's text from the parsed batch comment; the answer posts with **no rationale line** (never retain the draft's justification under an operator-overridden answer — it would argue for a different choice).
  - `Q<n>: <letter> — <reason>` — letter resolves to option text and `<reason>` replaces the justification.
  - `Q<n>: skip` — excludes that question from the posted batch and blocks advance.
  - Anything else — treated as verbatim replacement text for the answer.

Note on the G.1 rationale text: G.1 currently rejects a listed "Edit" option citing the #388 turn-split. That concern was about splitting a gate's *presentation from its decision* (decay into auto-proceed); a change-collection turn that follows an explicit operator selection of `Make changes` cannot auto-proceed and is not the same risk. Keep "Other" documented as the no-extra-turn path.

**3. Unchanged semantics** (explicitly out of scope to change):

- Posted comment format: `<!-- generacy-cockpit:clarification-answers -->` marker + one `### Q<n>` block per posted answer, `--body-file` only. Each block is two labeled fields — `**Answer:** <recommendation>` on one line and `**Rationale:** <justification>` on the next — mapping one-to-one onto the SB.1 fields so displayed and posted content cannot drift. The five-element display is presentation-only; context/question/options are already on the issue and are not re-posted.
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

- The `generacy cockpit context` payload exposes the raw clarification comment as `clarificationComment.body` (returned unparsed by `clarification-comment-finder.ts` / `context.ts` on generacy `develop`). The playbooks parse the per-question title, context, question, and options from that body — parsing our own engine-authored wire format, not scraping GitHub.
- The parse must tolerate minor variation in option-bullet style (`A:` vs `A)`) observed across live clarification comments.
- Every batch comment header carries `### Q<n>: <title>`; first-line truncation of the question is the fallback only if a batch ever arrives without titles.

## Out of Scope

- Upstream schema change in `generacy cockpit` to emit structured per-question fields alongside the raw comment. This is the eventual hardening path if parse fragility shows up in practice, but is a generacy-side change that does not gate this playbook improvement.
- Changes to the drafter subagent isolation contract (no slash commands, JSON-only return), ledger line shapes, error handling, or the advance rule (advance only when every open question has a posted answer).

---

*Generated by speckit*
