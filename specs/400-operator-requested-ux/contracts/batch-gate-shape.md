# Contract: batch-gate shape

**Surface**: `packages/claude-plugin-cockpit/commands/clarify.md` (step 5) and `packages/claude-plugin-cockpit/commands/auto.md` (D.1 step 3, § Gate contract G.1).
**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md § Batch-gate shape](../data-model.md#batch-gate-shape-automd--gate-contract-g1--clarifymd-step-5)

## AskUserQuestion invocation

Exactly **one** `AskUserQuestion` per batch, fired in the same assistant response as the five-element presentation block (fused presentation-plus-decision, per the #388 pattern; per the load-bearing "one prompt per batch" rule replacing the pre-fix `ceil(N/4)` fan-out).

**Parameters**:

| Field | Value |
|-------|-------|
| Question text | `Post all <N> drafted answers to <issue-ref>?` |
| Header | `Clarify` (≤ 12 chars) |
| `multiSelect` | `false` |
| Options | See § Options below (exactly three, in order) |

## Options

Exactly three discrete options, in this order:

| # | Label | Behavior |
|---|-------|----------|
| 1 | `Approve all & post (Recommended)` | Post every drafted answer as-is; run advance gate if every question posted. |
| 2 | `Make changes` | Collect per-question directives; apply them; re-present only the changed questions plus the same batch gate; loop until Approve or Skip. |
| 3 | `Skip this batch` | Post nothing; do not advance; ledger line noting the skip. |

The built-in `"Other"` free-text channel is the **one-turn edit path**: directives typed there are parsed via `parseDirectives` (same parser as `Make changes`), applied directly to the drafted answers, and posted verbatim in the same turn — no extra `Make changes` round-trip.

## Post-gate behavior

**`Approve all & post`**:
1. Assemble the marker comment body from `DrafterResult` (see [sb1-return-schema.md § Assembly rule](./sb1-return-schema.md#assembly-rule)) with all N answers. `**Answer:** <recommendation>` + `**Rationale:** <justification>` per `### Q<n>` block.
2. Write the body to `/tmp/cockpit-{clarify,auto-clarify}-<issue>-<unix_ts>.md`.
3. Post via `gh issue comment "$ISSUE" --body-file <tmpfile>` (never `-b` / `--body`; per canonical rule preserved from pre-fix step 6).
4. Run `generacy cockpit advance --gate clarification <issue-ref>` (all N posted → advance).
5. Ledger line: `<issue-ref> · waiting-for:clarification · clarification-batch · advanced` (auto.md D.1 vocabulary, unchanged).

**`Make changes`**:
1. Collect operator input (via a follow-up prompt whose text is `Type directives (Q<n>: <letter|skip|verbatim text>; one per line or semicolon-separated). Empty input re-presents the batch.`).
2. Parse input via `parseDirectives(input, batch)`.
3. **If `Directive[]` is empty**: re-present the entire batch (no changes applied) and re-fire the same three-option gate. Do NOT auto-approve, do NOT auto-skip (Q4 anchor).
4. **If `Directive[]` is non-empty**: apply directives to the internal state:
   - `kind: "edit"` with `rationale !== null` → set the question's staged answer to the directive's `answer`, staged rationale to `rationale`.
   - `kind: "edit"` with `rationale === null` → set staged answer, mark rationale as `null` (assembly will omit the `**Rationale:**` line).
   - `kind: "skip"` → mark the question as skipped (excluded from post).
5. Re-present the batch per the [Re-present flow in five-element-presentation.md](./five-element-presentation.md#re-present-flow-only-changed-questions) — only changed questions render as full five-element blocks; unchanged questions render as one-line references.
6. Re-fire the same three-option batch gate.
7. Loop steps 1–6 until the operator selects `Approve all & post` or `Skip this batch`.

**`Skip this batch`**:
1. Do NOT post any comment.
2. Do NOT advance the gate.
3. Ledger line: `<issue-ref> · waiting-for:clarification · clarification-batch · all answers skipped` (auto.md D.1 vocabulary, unchanged).

**"Other" free-text (one-turn edit path)**:
1. Parse operator's typed text via `parseDirectives(input, batch)`.
2. Apply directives to the drafted answers (same rules as `Make changes` step 4).
3. Post the resulting subset immediately (no re-present, no re-fire).
4. Advance or ledger-partial per the same rules as `Approve all & post` (see § Post-gate behavior sub-rules below).

**Partial posts** (some skipped, some approved):
- If any question was marked skipped (via any path), do NOT advance the gate.
- Post the approved subset only (marker + `### Q<n>` blocks for the approved / edited questions).
- Ledger line: `<issue-ref> · waiting-for:clarification · clarification-batch · posted <k>/<N>, skipped <s>` (unchanged vocabulary).

## Zero-question-approved edge case

If every question was skipped (via `Skip this batch` OR via all-questions-marked-skip directives in `Make changes` / "Other"):
- Do NOT post any comment.
- Do NOT advance the gate.
- Ledger line: `<issue-ref> · waiting-for:clarification · clarification-batch · all answers skipped` (unchanged vocabulary).

## Rationale text for #388 concession

`auto.md` § Gate contract G.1 currently justifies rejecting a listed "Edit" option by citing the #388 turn-split concern. That concern was about splitting a gate's presentation from its decision, which would let the loop auto-proceed on an implicit-approve default.

The `Make changes` re-loop introduced here is NOT the same risk:
- The change-collection turn follows an **explicit operator selection** of `Make changes` (not an implicit default).
- The loop cannot auto-proceed: zero-directive input triggers a no-op re-present, not an implicit approve or skip.
- Every iteration of the loop requires an explicit operator choice; the loop has an exit on every face (Approve or Skip).

The playbook prose adds this concession explicitly:

> The listed `Make changes` option is not the same risk as the #388 turn-split concern. Splitting a gate's presentation from its decision (the #388 concern) allowed the loop to auto-proceed on an implicit-approve default. A change-collection turn that follows an explicit operator selection of `Make changes` cannot auto-proceed — zero directives is a no-op re-present, not an implicit approve or skip. Every iteration requires an explicit operator choice. Keep "Other" documented as the no-extra-turn path.

## Byte-identity requirement

The batch-gate shape (question text, header, options list, `multiSelect`) MUST be byte-identical between `clarify.md` step 5 and `auto.md` § Gate contract G.1. Verified by static-grep in [../quickstart.md § Static checks](../quickstart.md#static-checks) (the `Approve all & post (Recommended)` positive anchor and `Approve draft (Recommended)` negative anchor cover both files).

## Rejected alternatives

- **`ceil(N/4)` `AskUserQuestion` fan-out** (pre-fix shape) — forces the operator to answer N questions individually; the T-S4 arc found this creates a per-question decision fatigue that's unnecessary when the drafter has already done the analysis. Batched approval is what the operator asked for.
- **Two-option `Approve batch` / `Skip batch`** — no path for per-question override without a second turn; would push all edits through the "Other" one-turn path OR abandon the batch entirely. Three options preserves the one-turn "Other" path AND provides an explicit multi-turn `Make changes` path for operators who want a more structured directive collection.
- **`Make changes` as a two-turn split (turn 1: select `Make changes`; turn 2: type directives)** — that's the exact #388 turn-split concern. This design keeps `Make changes` as one-selection; the follow-up prompt for directives is a legitimate operator-driven continuation (not an implicit auto-proceed default).
- **Auto-advance on partial post** — silently advances even when some questions weren't answered; violates the spec's Advance rule (advance only when every open question has a posted answer).

## Relationship to other contracts

- The presentation block above the `AskUserQuestion` follows [five-element-presentation.md](./five-element-presentation.md).
- The "Other" and `Make changes` paths both parse via [directive-parser.md](./directive-parser.md).
- The `Approve all & post` path assembles the comment body per [sb1-return-schema.md § Assembly rule](./sb1-return-schema.md#assembly-rule).
- The `Make changes` re-loop's re-present shape is defined in [five-element-presentation.md § Re-present flow](./five-element-presentation.md#re-present-flow-only-changed-questions).
