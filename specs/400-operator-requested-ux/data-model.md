# Data Model: Batched clarification gate + five-element presentation

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-07-10

Phase-1 record of the types, validation rules, § Directive grammar spec, five-element renderer rules, and pre/post structural changes at each playbook edit site. This is not a runtime schema — the runtime is Claude interpreting the playbook prose. It IS the machine-checkable definition the test suite exercises against fixtures via `lib/clarification-batch-parser.ts`.

## Entities

### `ParsedQuestion`

One open question extracted from `clarificationComment.body`.

```typescript
export interface ParsedQuestion {
  /**
   * The `n` in `### Q<n>` — 1-indexed, monotonically increasing within a batch.
   */
  readonly questionId: number;

  /**
   * The title substring following the colon in `### Q<n>: <title>`.
   * `null` when the batch comment header lacks a title (fallback path,
   * exercised by fixture `400-batch-comment-no-title.md`). The five-element
   * renderer substitutes a first-line truncation of `question` when
   * `title === null`.
   */
  readonly title: string | null;

  /**
   * The verbatim content of the `**Context**:` field. Multi-line context
   * preserves internal newlines. Trailing whitespace stripped; leading
   * whitespace on the first line stripped. Never `null` — the batch template
   * always emits `**Context**:` even when the framing is a single line.
   */
  readonly context: string;

  /**
   * The verbatim content of the `**Question**:` field. Same normalization as
   * `context`. Never `null`.
   */
  readonly question: string;

  /**
   * The lettered options as posted, parsed from bullets matching `/^[A-Z][:)]\s+/`.
   * The order of entries preserves the batch comment's order (A, B, C, …).
   * `null` when the question is free-form (no `**Options**:` label) — the
   * renderer emits `**Options:** (free-form — no options posted)` for that
   * question, rather than dropping the line (spec acceptance-criterion anchor).
   */
  readonly options: ReadonlyArray<{ letter: string; text: string }> | null;
}
```

**Validation rules**:

- `questionId` is a positive integer.
- `title`, when non-null, is trimmed and contains at least one non-whitespace character.
- `context` and `question` are non-empty (a batch with an empty `**Context**:` or `**Question**:` field is a malformed batch — the parser rejects it and the playbook applies the drafter-subagent's `{"error": "…"}` failure mode).
- `options`, when non-null, is a non-empty array of `{letter, text}` entries. Each `letter` matches `/^[A-Z]$/`. Each `text` is trimmed and non-empty.
- Letters in `options` are unique within a question (a batch with duplicate letters is malformed — parser rejects).

### `ParsedBatch`

The parsed representation of an entire clarification batch comment.

```typescript
export interface ParsedBatch {
  /**
   * The parsed open questions, in the order they appear in the batch comment.
   * Length ≥ 1 (an empty batch is a "no open clarifications" case and the
   * playbook's step-3 fetch already handles that path — the parser is never
   * called with an empty batch).
   */
  readonly questions: ReadonlyArray<ParsedQuestion>;
}
```

**Validation rules**:

- `questions.length ≥ 1`.
- `questions[i].questionId` values are 1-indexed and monotonically increasing (not necessarily contiguous — a batch may skip numbers if the engine dropped a question, but the ordering must be ascending).

### `DrafterReturn`

The drafter subagent's return-schema shape (SB.1 update). One entry per open question.

```typescript
export interface DrafterEntry {
  /**
   * Matches a `ParsedQuestion.questionId` in the same batch.
   */
  readonly question_id: number;

  /**
   * The chosen letter's option text (for questions with options), OR the
   * free-form drafted answer (for free-form questions). Rendered under
   * `**Recommendation:**` in the presentation block and posted as
   * `**Answer:** <recommendation>` in the marker comment.
   */
  readonly recommendation: string;

  /**
   * 1–3 sentences justifying the recommendation over the other options.
   * Rendered under `**Why:**` in the presentation block and posted as
   * `**Rationale:** <justification>` in the marker comment.
   */
  readonly justification: string;

  /**
   * Provenance citation — `spec.md § Section`, `plan.md § Section`, or
   * `<path>:<line>`. Rendered as `_provenance: <citation>_` in the presentation
   * block but NOT posted (presentation-only).
   */
  readonly provenance: string;
}

export type DrafterResult =
  | ReadonlyArray<DrafterEntry>
  | { error: string };
```

**Validation rules**:

- On the success path (array), `entries.length === parsedBatch.questions.length` and each `question_id` matches exactly one `ParsedQuestion.questionId`.
- `recommendation`, `justification`, `provenance` are non-empty trimmed strings.
- For questions with `options`, the drafter is instructed to have `recommendation` begin with the chosen letter (`A — <text>` or similar) — but the parser does NOT enforce this shape; the drafter's prose fidelity is the playbook's runtime responsibility, and the presentation-block renderer treats the whole `recommendation` field as opaque text.
- On the failure path (`{error}`), the playbook's D.1 / step-5 failure-mode branch applies (Error handling class `OTHER`; do not post; do not advance; ledger line).

### `Directive`

One parsed operator directive from a `Make changes` turn or "Other" free-text.

```typescript
export type Directive =
  | { readonly kind: "edit"; readonly questionId: number; readonly answer: string; readonly rationale: string | null }
  | { readonly kind: "skip"; readonly questionId: number };
```

**Validation rules**:

- `questionId` matches a `ParsedQuestion.questionId` in the same batch. Directives targeting an unknown Q-number are dropped with a ledger note (`ignored directive: Q<n> not in batch`) rather than treated as fatal — an operator typo shouldn't blow up the loop.
- For `kind: "edit"`, `answer` is non-empty trimmed string.
- For `kind: "edit"` with `rationale === null` (bare-letter case), the assembly step emits NO `**Rationale:**` line in the posted body. This is the load-bearing correctness constraint from Q1 — never retain the draft's justification under an operator-overridden answer.
- Directive order in the parsed array preserves input order; if the operator specifies two directives for the same Q-number, the last one wins (again, ledger note but not fatal — matches "last write wins" for typed input).

## Parsers

### `parseBatchComment(body: string): ParsedBatch`

Parses the engine-authored batch comment template into structured questions.

**Input**: the raw `clarificationComment.body` string from `generacy cockpit context <issue>` payload.

**Rules**:

1. Split `body` on lines matching `/^###\s+Q(\d+)(?::\s*(.+))?$/` — each match starts a new question block. Capture `questionId` from group 1 and `title` from group 2 (may be `undefined` → parser sets `title: null`).
2. Within a question block, walk lines until the next `### Q<n>` header or end of input. Identify field labels by their leading `**<Label>**:` prefix:
   - `**Context**:` → capture content until the next label or block end.
   - `**Question**:` → capture content until the next label or block end.
   - `**Options**:` → capture bullet lines until the next label or block end; each bullet matches `/^\s*([A-Z])[:)]\s+(.+)$/` (tolerance for `A:` vs `A)`, per Q2 anchor).
3. If no `**Options**:` label appears in the block, `options: null` (free-form question).
4. Multi-line field content: preserve internal newlines; strip leading whitespace on the first line and all trailing whitespace.
5. Bail on malformed input (missing `**Context**:` or `**Question**:` in a question block; duplicate letters in options; duplicate `question_id` across blocks) by throwing a specific error the test file asserts against.

**Output**: `ParsedBatch`.

**Failure modes**: Throws `ParseError` with a specific message for each malformed-input class. The playbook's runtime handles these by applying the `{"error": "…"}` failure mode from the drafter contract (Error handling class `OTHER`, ledger line, no post, no advance).

**Fixtures**: `400-batch-comment-a-colon.md`, `400-batch-comment-a-paren.md`, `400-batch-comment-no-title.md`, `400-batch-comment-free-form.md`, `400-batch-comment-mixed.md`.

See [contracts/batch-comment-parser.md](./contracts/batch-comment-parser.md).

### `parseDirectives(input: string, batch: ParsedBatch): Directive[]`

Parses operator directives from `Make changes` or "Other" free-text input.

**Input**:
- `input`: raw operator-typed text.
- `batch`: the current `ParsedBatch`, used for letter → option-text resolution and unknown-questionId detection.

**Rules**:

1. Trim leading/trailing whitespace on `input`. If empty, return `[]` (empty result — the playbook's `Make changes` step applies the zero-directive no-op re-present rule at the prose level; the parser doesn't try to infer intent).
2. Split `input` at each `Q<n>:` token (regex lookahead `/(?=Q\d+:)/`, `n ≥ 1`). Each segment is a raw directive payload starting with `Q<n>:`.
3. For each segment:
   - Extract `questionId` from the leading `Q<n>:` token.
   - Extract `payload` = the remaining text after the token, trimmed.
   - If `payload === "skip"` (case-insensitive, after trim): emit `{kind: "skip", questionId}`.
   - Else if `payload` matches `/^([A-Z])(?:\s*—\s*(.+))?$/` (single letter, optionally followed by `— <reason>`):
     - Look up the letter in `batch.questions[questionId - 1].options` (or by scanning for matching `questionId`; the parser is defensive against non-contiguous questionIds).
     - If the letter is not in the options array (or the question has `options: null`): treat as verbatim text (fallthrough to the next rule).
     - If matched and no reason: emit `{kind: "edit", questionId, answer: option.text, rationale: null}`.
     - If matched and reason present: emit `{kind: "edit", questionId, answer: option.text, rationale: reason.trim()}`.
   - Else: emit `{kind: "edit", questionId, answer: payload, rationale: null}` (verbatim replacement — includes cases like `Q2: Yes but only when …` where the payload isn't a letter or `skip`).
4. Drop directives whose `questionId` isn't in `batch.questions` (with a ledger note at the playbook prose level; the parser silently drops).
5. If two directives target the same `questionId`, the last one wins.

**Output**: `Directive[]`.

**Load-bearing correctness cases** (tested by 400-4 and 400-5):
- Bare letter → `rationale: null` (never carry the draft's justification under an operator override).
- Letter + `— <reason>` → `rationale: <reason>` (replaces the draft's).
- `skip` → `kind: "skip"` (excluded from post, blocks advance).
- Verbatim text with embedded `;` → single `{kind: "edit"}` directive, `answer` contains the semicolon (not mis-split).
- Single-line `Q2: B; Q4: skip` produces the same `Directive[]` as newline-separated `Q2: B\nQ4: skip` (one rule, two documented forms).

**Fixtures**: `400-directives-bare-letter.txt`, `400-directives-letter-reason.txt`, `400-directives-skip.txt`, `400-directives-verbatim-with-semicolon.txt`, `400-directives-newline.txt`, `400-directives-semicolon-inline.txt`.

See [contracts/directive-parser.md](./contracts/directive-parser.md).

## § Directive grammar (byte-identical block in both playbooks)

This is the prose block appended to both `clarify.md` (after step 5) and `auto.md` (after § Gate contract G.1). It is byte-identical across the two files; a static grep in [quickstart.md](./quickstart.md) verifies the byte-hash equivalence.

```markdown
### Directive grammar

Both `Make changes` and the "Other" free-text path parse per-question directives identically, using a `Q<n>:` token-anchored rule.

**Rule**: A new directive begins at each `Q<n>:` token. Split the input at `Q<n>:` occurrences; each directive's payload runs from the token to the next token or end of input.

**Documented forms** (both parse identically under the rule):

- Newline-separated (canonical):
  ```
  Q2: B
  Q4: skip
  ```
- Single-line semicolon (a verbatim replacement's text may itself contain semicolons; the token rule doesn't mis-split it):
  ```
  Q2: B; Q4: skip
  ```

**Payload forms**:

- `Q<n>: <letter>` — bare letter (matching an option from the parsed batch comment) resolves to that option's text. The answer posts with **no rationale line** — never retain the draft's justification under an operator-overridden answer, because it would argue for a different choice.
- `Q<n>: <letter> — <reason>` — letter resolves to option text, and `<reason>` replaces the justification.
- `Q<n>: skip` — excludes that question from the posted batch and blocks advance.
- Anything else — treated as verbatim replacement text for the answer, posted as-is.

**Applied identically in two paths**:

- **`Make changes` re-loop** — the operator's turn collects directives typed in a follow-up prompt or in the initial `AskUserQuestion` "Other" field; the loop re-presents only changed questions plus the same batch gate; loops until Approve or Skip.
- **"Other" free-text on the batch gate** — the operator's replacement text is applied directly (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip.

Zero directives from a `Make changes` turn is a no-op: re-present the entire batch and fire the same gate again (never auto-approve or auto-skip on empty input).
```

## Five-element presentation block (byte-identical in both playbooks)

The presentation block appears in `clarify.md` step 5 and `auto.md` D.1 step 3 / § Gate contract G.1, byte-identical.

```markdown
Drafted answers for <issue-ref> (<N> open questions):

### Q<n> — <title from batch comment>
**Context:** <framing from batch comment, verbatim/condensed>
**Question:** <question verbatim>
**Options:** <lettered options as posted (A — …, B — …); or "(free-form — no options posted)">
**Recommendation:** <chosen letter + its text, or the drafted free-form response>
**Why:** <1–3 sentences justifying the recommendation over the other options>
_provenance: <citation>_

(repeat per open question — one block per Q, separated by a blank line)
```

**Renderer rules**:

- `<title from batch comment>` = `ParsedQuestion.title` when non-null; otherwise `question.split('\n')[0].slice(0, 80)` (fallback truncation, only when the batch header lacks a title).
- `<framing from batch comment>` = `ParsedQuestion.context` verbatim (preserve internal newlines).
- `<question verbatim>` = `ParsedQuestion.question` verbatim.
- `<lettered options>` = `ParsedQuestion.options.map(o => \`${o.letter} — ${o.text}\`).join(', ')` when `options` is non-null; the literal string `(free-form — no options posted)` when `options` is null.
- `<chosen letter + its text>` = `DrafterEntry.recommendation` verbatim (drafter is instructed to produce a self-describing string like `A — <option text>` for lettered questions; the renderer treats the whole field as opaque text).
- `<1–3 sentences justifying>` = `DrafterEntry.justification` verbatim.
- `<citation>` = `DrafterEntry.provenance` verbatim.

**Free-form no-options placeholder** (spec acceptance-criterion anchor): when `options` is null, the renderer MUST emit `**Options:** (free-form — no options posted)` rather than dropping the `**Options:**` line entirely. The five-element structure is a fixed shape; the placeholder makes the absence explicit.

## SB.1 return schema (`auto.md` D.1 step 3 + `clarify.md` step 4)

**Pre-fix shape** (both playbooks currently document):
```json
{"question_id": 1, "drafted_answer": "…", "provenance": "…"}
```

**Post-fix shape** (both playbooks documented in this branch):
```json
{"question_id": 1, "recommendation": "…", "justification": "…", "provenance": "…"}
```

The field rename splits the answer into two independently-queryable fields so the display and the posted body cannot drift — the assembly step in `clarify.md` step 6 (and the equivalent in `auto.md` D.1 step 4) reads `recommendation` and `justification` and emits `**Answer:** <recommendation>` and `**Rationale:** <justification>`. Bare-letter operator overrides skip the `**Rationale:**` line.

See [contracts/sb1-return-schema.md](./contracts/sb1-return-schema.md).

## Batch-gate shape (auto.md § Gate contract G.1 + clarify.md step 5)

**Pre-fix shape**:
- `ceil(N/4)` `AskUserQuestion` calls, one per open clarification.
- Options: `Approve draft (Recommended)` / `Skip this question`.
- Header: `Q<n>` (≤ 12 chars).
- `multiSelect: false`.
- Edit path: built-in "Other" free-text = operator's replacement text posted verbatim.

**Post-fix shape**:
- **Exactly one** `AskUserQuestion` call per batch (never per question).
- Question text: `Post all <N> drafted answers to <issue-ref>?`.
- Header: `Clarify` (≤ 12 chars).
- Options (exactly three, discrete, in this order):
  1. `Approve all & post (Recommended)` — post every drafted answer as-is.
  2. `Make changes` — enter the re-loop (see § Directive grammar); parse directives from the operator's follow-up input; apply; re-present only changed questions plus the same batch gate; loop until Approve or Skip. Zero directives is a no-op re-present.
  3. `Skip this batch` — post nothing, do not advance, ledger line.
- `multiSelect: false`.
- Built-in "Other" free-text = one-turn edit path: directives typed there are parsed and applied directly (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip.

See [contracts/batch-gate-shape.md](./contracts/batch-gate-shape.md).

## Pre/post structural changes at each edit site

| Site | Pre-fix shape | Post-fix shape | Change scope |
|------|---------------|----------------|--------------|
| `clarify.md` step 4 (drafting contract) | Returns `{question_id, drafted_answer, provenance}` | Returns `{question_id, recommendation, justification, provenance}` | Field-rename in prose |
| `clarify.md` step 5 (approval) | Per-question `AskUserQuestion` loop `Approve` / `Edit` / `Skip`; pre-confirm tally | Single batch gate with five-element blocks + three options + § Directive grammar | Full section rewrite (~20 lines) |
| `clarify.md` step 6 (assembly) | Reads `drafted_answer` per question | Reads `recommendation` + `justification` per question; emits `**Answer:**` + `**Rationale:**` labeled fields (bare-letter overrides omit `**Rationale:**`) | Field-rename + assembly-rule prose update |
| `clarify.md` new § Directive grammar subsection | (absent) | Byte-identical block per § Directive grammar spec above | ~15 line addition |
| `auto.md` D.1 step 2 (drafter subagent) | Return contract: `{question_id, drafted_answer, provenance}` | Return contract: `{question_id, recommendation, justification, provenance}` | Field-rename in prose |
| `auto.md` D.1 step 3 (present fused batch gate) | Presentation: `### Q<n>` + drafted answer + provenance; `ceil(N/4)` `AskUserQuestion` calls, `Approve draft` / `Skip this question` per question | Presentation: five-element `### Q<n>` block per open question; single `AskUserQuestion` with three options; § Directive grammar reference | Full section rewrite (~30 lines) |
| `auto.md` D.1 step 4 (assemble comment body) | Reads `drafted_answer` | Reads `recommendation` + `justification`; emits `**Answer:**` + `**Rationale:**` labeled fields (bare-letter overrides omit `**Rationale:**`) | Field-rename + assembly-rule prose update |
| `auto.md` § Gate contract G.1 (Clarification batch) | Two-option per-question presentation; edit path via "Other" verbatim; `ceil(N/4)` calls | Single batch gate with five-element presentation, three options, `Make changes` loop shape, "Other" one-turn edit; edit path clarified with § Directive grammar reference | Full section rewrite (~40 lines) |
| `auto.md` new § Directive grammar subsection | (absent) | Byte-identical block per § Directive grammar spec above | ~15 line addition |
| `auto.md` § Gate contract G.1 rationale-text about #388 | Cites #388 turn-split for rejecting listed "Edit" option; unchanged shape | Extended with the concession that a change-collection turn following an explicit `Make changes` selection cannot auto-proceed (per Q4 rationale in spec) — the #388 concern (splitting a gate's presentation from its decision) doesn't apply here | Additive prose clarification |
| `auto.md` D.1 ledger line shapes | `advanced` / `posted <k>/<N>, skipped <s>` / `all answers skipped` / `error: <description>` | Unchanged — the batch-gate outcomes already cover the same vocabulary | Zero changes |
| `auto.md` D.1 failure modes | Subagent error; all skipped; post fails; advance fails | Unchanged | Zero changes |

Both playbooks' new § Directive grammar subsections are byte-identical (verified by a static grep + `diff` cross-check in [quickstart.md](./quickstart.md)).

## Fixture shapes

### Batch-comment fixtures (`400-batch-comment-*.md`)

Each fixture is a Markdown file whose content is a verbatim `clarificationComment.body` string as returned by `generacy cockpit context <issue>` — the engine-authored batch template. Files:

- **`400-batch-comment-a-colon.md`** — Reproduces this issue's own clarification-comment shape: 5 questions with `A:` / `B:` / `C:` / `D:` option bullets, all questions have titles. This is the canonical shape.
- **`400-batch-comment-a-paren.md`** — Same semantic content as the above but with `A)` / `B)` / `C)` / `D)` bullets. Guards the Q2 tolerance requirement; both fixtures must parse to `ParsedBatch` values that compare equal after normalization (test 400-1).
- **`400-batch-comment-no-title.md`** — Synthetic: `### Q1` (no colon-title) instead of `### Q1: <title>`. Exercises the fallback path (test 400-2): parser sets `title: null`, renderer substitutes first-line truncation of `question`.
- **`400-batch-comment-free-form.md`** — One question, no `**Options**:` label; the field is free-form prose. Exercises free-form parsing (`options: null`) and the placeholder rendering rule (test 400-3).
- **`400-batch-comment-mixed.md`** — Three questions: Q1 with options (A: / B: / C:), Q2 free-form, Q3 with options (A) / B)). Exercises the mixed-shape path — the parser handles each question's options field independently.

### Directive-input fixtures (`400-directives-*.txt`)

Each fixture is a plain-text file containing verbatim operator input as would appear in a `Make changes` follow-up prompt or an "Other" free-text field. Files:

- **`400-directives-bare-letter.txt`** — `Q2: B` (single directive, bare letter). Expects `[{kind: "edit", questionId: 2, answer: <option-B-text>, rationale: null}]`. Load-bearing: no rationale line (Q1 anchor).
- **`400-directives-letter-reason.txt`** — `Q2: B — because it's mildly tolerant` (single directive, letter + reason). Expects `[{kind: "edit", questionId: 2, answer: <option-B-text>, rationale: "because it's mildly tolerant"}]`.
- **`400-directives-skip.txt`** — `Q2: skip`. Expects `[{kind: "skip", questionId: 2}]`.
- **`400-directives-verbatim-with-semicolon.txt`** — `Q2: We should defer this; the tradeoff is unclear and a follow-up is the right shape.` (verbatim replacement text containing a semicolon). Expects a single `{kind: "edit"}` directive whose `answer` contains the semicolon (not mis-split). Load-bearing: token rule doesn't devolve to naive semicolon-split (Q1 rationale).
- **`400-directives-newline.txt`** — `Q2: B\nQ4: skip` (canonical newline-separated form). Expects two directives.
- **`400-directives-semicolon-inline.txt`** — `Q2: B; Q4: skip` (single-line semicolon form). Expects the byte-identical `Directive[]` as `400-directives-newline.txt` (test 400-5: one rule, two documented forms).

## Relationships between entities

```text
generacy cockpit context <issue>
                │
                │  returns
                ▼
clarificationComment.body (raw text)
                │
                │  parseBatchComment
                ▼
        ParsedBatch
        (questions: ParsedQuestion[])
                │
                │  drafter subagent (per question)
                ▼
        DrafterResult
        (DrafterEntry[])
                │
                │  five-element renderer merges
                │  ParsedQuestion + DrafterEntry
                ▼
        Presentation block
        (5 elements per question,
         one AskUserQuestion at the end)
                │
                │  operator selects Approve/Make changes/Skip;
                │  Make changes and "Other" free-text feed input to
                │  parseDirectives(input, ParsedBatch)
                ▼
        Directive[]
                │
                │  applied to per-question payload:
                │  - kind:"edit"       → override recommendation/justification
                │  - kind:"skip"       → exclude from post
                │  - unchanged         → post as-is
                ▼
        Assembled comment body
        (marker + ### Q<n> + **Answer:** + **Rationale:** per posted answer)
                │
                │  gh issue comment --body-file
                ▼
        Posted to GitHub issue
                │
                │  if all questions posted:
                │    generacy cockpit advance --gate clarification
                │  else:
                │    do not advance, ledger partial
                ▼
        Advance gate decision
```
