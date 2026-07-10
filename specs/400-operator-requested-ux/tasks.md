# Tasks: Batched clarification gate + five-element presentation

**Input**: Design documents from `/specs/400-operator-requested-ux/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Single-story UX fix — [US1] covers the batch-gate + five-element presentation across both playbooks + the parser reference implementation + the five parser assertions

## Phase 1: Setup & baseline

- [X] T001 Run the baseline test suite `pnpm --filter @generacy-ai/claude-plugin-cockpit test` and confirm the existing 394 (2 tests), 396 (3 tests), and 398 (2 tests) assertions pass unmodified. Record the baseline count (expected: 7 passing). Any pre-existing failure here is out of scope and must be triaged before proceeding — the 400 additions add on top of a green baseline.
- [X] T002 Confirm the target files exist at the paths the plan names (`packages/claude-plugin-cockpit/commands/clarify.md`, `commands/auto.md`, `tests/playbook-verification.test.ts`) and confirm `packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts` does NOT yet exist. Sanity check against the plan's file-layout table (plan.md § Project Structure → Source Code).

## Phase 2: Parser reference implementation + fixtures

- [X] T010 [US1] Create `packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts` per contracts/batch-comment-parser.md and contracts/directive-parser.md, with exports:
  - `interface ParsedQuestion` — `{questionId, title, context, question, options}` per data-model.md § ParsedQuestion.
  - `interface ParsedBatch` — `{questions: ReadonlyArray<ParsedQuestion>}` per data-model.md § ParsedBatch.
  - `type Directive` — union of `{kind:"edit", questionId, answer, rationale}` and `{kind:"skip", questionId}` per data-model.md § Directive.
  - `class ParseError extends Error` — thrown on malformed input (missing `**Context**:` or `**Question**:`, duplicate letters, duplicate `questionId`).
  - `function parseBatchComment(body: string): ParsedBatch` — walks `body` line-by-line; each `/^###\s+Q(\d+)(?::\s*(.+))?$/` header opens a question block; within a block, `**Context**:`, `**Question**:`, `**Options**:` label lines mark fields; option bullets match `/^\s*([A-Z])[:)]\s+(.+)$/` (tolerance for `A:` vs `A)`); free-form questions (no `**Options**:` label) yield `options: null`. Preserve multi-line field content verbatim; strip leading whitespace on first line, all trailing whitespace.
  - `function parseDirectives(input: string, batch: ParsedBatch): Directive[]` — trims input; if empty returns `[]`; splits at `/(?=Q\d+:)/` lookahead; per-segment: extract `questionId`, then classify payload as `skip` / `letter (with optional — reason)` / `verbatim`; letter is resolved against `batch.questions[i].options` — miss falls through to verbatim. Bare-letter directives set `rationale: null` (load-bearing — never carry the draft's justification). Drop directives whose `questionId` isn't in the batch; last-write-wins for duplicate `questionId`.
  Pure functions — no I/O, no async, no external state. Contracts: contracts/batch-comment-parser.md, contracts/directive-parser.md. Must exist BEFORE Phase 4 test assertions.
- [X] T011 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-batch-comment-a-colon.md` per data-model.md § Fixture shapes → Batch-comment fixtures. Reproduces this issue's own clarification-comment shape: 5 questions with titles, `A:`/`B:`/`C:`/`D:` option bullets, `**Context**:` / `**Question**:` / `**Options**:` labels per question. Canonical shape — the parser's success path on the real wire format.
- [X] T012 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-batch-comment-a-paren.md`. Same semantic content as `400-batch-comment-a-colon.md` but with `A)`/`B)`/`C)`/`D)` bullets. Q2-tolerance anchor — both fixtures must parse to `ParsedBatch` values that compare equal after normalization (test 400-1).
- [X] T013 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-batch-comment-no-title.md`. Synthetic: `### Q1` (no colon-title) instead of `### Q1: <title>`. Exercises fallback path — parser sets `title: null`, renderer substitutes first-line truncation of `question` (test 400-2).
- [X] T014 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-batch-comment-free-form.md`. One question, no `**Options**:` label; the field is free-form prose. Exercises free-form parsing (`options: null`) and the placeholder rendering rule (test 400-3).
- [X] T015 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-batch-comment-mixed.md`. Three questions: Q1 with options (`A:`/`B:`/`C:`), Q2 free-form (no `**Options**:`), Q3 with options (`A)`/`B)`). Exercises mixed-shape path.
- [X] T016 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-directives-bare-letter.txt` — content `Q2: B` exactly. Expected parse: `[{kind:"edit", questionId:2, answer:<option-B-text>, rationale:null}]`. Load-bearing: no rationale line under override (Q1 anchor).
- [X] T017 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-directives-letter-reason.txt` — content `Q2: B — because it's mildly tolerant`. Expected: `[{kind:"edit", questionId:2, answer:<option-B-text>, rationale:"because it's mildly tolerant"}]`.
- [X] T018 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-directives-skip.txt` — content `Q2: skip`. Expected: `[{kind:"skip", questionId:2}]`.
- [X] T019 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-directives-verbatim-with-semicolon.txt` — content `Q2: We should defer this; the tradeoff is unclear and a follow-up is the right shape.` Expected: single `{kind:"edit"}` directive whose `answer` contains the semicolon (not mis-split). Load-bearing: token-anchored rule doesn't devolve to naive semicolon-split (Q1 rationale).
- [X] T01A [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-directives-newline.txt` — content `Q2: B\nQ4: skip` (canonical newline-separated form). Expected: two directives — one edit, one skip. Pairs with T01B for test 400-5.
- [X] T01B [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/400-directives-semicolon-inline.txt` — content `Q2: B; Q4: skip` (single-line semicolon form on ONE line, no trailing newline in the split). Expected: byte-identical `Directive[]` output as `400-directives-newline.txt` under the token rule (test 400-5: one rule, two documented forms).

## Phase 3: Playbook edits (load-bearing prose)

- [X] T020 [US1] Edit `packages/claude-plugin-cockpit/commands/clarify.md` in a single coherent pass covering all four sub-surfaces from plan.md § Summary and data-model.md § Pre/post structural changes:
  - **Step 4 (drafting contract)**: change the drafter's return-schema documented shape from `{question_id, drafted_answer, provenance}` to `{question_id, recommendation, justification, provenance}`. Field-rename in prose.
  - **Step 5 (approval)**: full rewrite from per-question `AskUserQuestion` loop (`Approve` / `Edit` / `Skip`) + pre-confirm tally into the single batched gate. Presentation-block header `Drafted answers for <issue-ref> (<N> open questions):` (pre-confirm tally lives at the header, not a separate step); one five-element `### Q<n>` block per open question (title + `**Context:**` + `**Question:**` + `**Options:**` + `**Recommendation:**` + `**Why:**` + `_provenance: <citation>_`); single `AskUserQuestion` with header `Clarify`, `multiSelect: false`, and exactly three options in order: `Approve all & post (Recommended)` / `Make changes` / `Skip this batch`; built-in "Other" free-text is the one-turn edit path; `Make changes` runs the re-present loop (parse directives, apply, re-present only changed questions + same batch gate, loop until Approve or Skip; zero directives = no-op re-present); reference § Directive grammar for the parse rule. See data-model.md § Batch-gate shape + § Five-element presentation block for the verbatim block.
  - **Step 6 (post comment)**: field-name update — assembly step reads `recommendation` + `justification` instead of `drafted_answer`; emits `### Q<n>` + `**Answer:** <recommendation>` + `**Rationale:** <justification>` per posted answer; for bare-letter operator overrides emit NO `**Rationale:**` line (load-bearing correctness constraint from Q1). Marker + `--body-file` invocation shape unchanged.
  - **New § Directive grammar subsection** (append after step 5, before step 6): byte-identical block per data-model.md § Directive grammar. The `Q<n>:` token-anchored rule; newline-separated canonical form + single-line semicolon form; four payload forms (`Q<n>: <letter>` → no rationale; `Q<n>: <letter> — <reason>` → reason replaces justification; `Q<n>: skip` → excluded, blocks advance; anything else → verbatim). Applied identically in `Make changes` and "Other" free-text paths. Zero directives is no-op re-present.
  - Step 7 (advance gate) — UNCHANGED. Do not touch.
  Contracts: contracts/batch-gate-shape.md, contracts/five-element-presentation.md, contracts/sb1-return-schema.md, contracts/directive-parser.md.
- [X] T021 [P] [US1] Edit `packages/claude-plugin-cockpit/commands/auto.md` in a single coherent pass covering all four sub-surfaces:
  - **D.1 step 2 (drafter subagent)**: same field-rename as clarify.md step 4 — SB.1 return contract from `{question_id, drafted_answer, provenance}` to `{question_id, recommendation, justification, provenance}`. Drafter isolation contract (no slash commands, JSON-only return) unchanged; only the return-schema shape changes.
  - **D.1 step 3 (present fused batch gate)**: full rewrite of the presentation-and-approval prose block. Presentation: five-element `### Q<n>` block per open question (byte-identical to clarify.md's step-5 block). Approval: single `AskUserQuestion` call per batch (never `ceil(N/4)`); header `Clarify`; three options in the same order (`Approve all & post (Recommended)` / `Make changes` / `Skip this batch`); `multiSelect: false`. `Make changes` loop shape and "Other" one-turn edit path both reference § Directive grammar. Include the concession noted in plan.md § Pre/post structural changes: extend the pre-existing #388-turn-split rationale with the observation that a change-collection turn following an explicit `Make changes` selection cannot auto-proceed and is not the same risk.
  - **D.1 step 4 (assemble comment body)**: field-name update — reads `recommendation` + `justification`; emits `**Answer:**` + `**Rationale:**` labeled fields; bare-letter overrides omit `**Rationale:**` line entirely.
  - **§ Gate contract G.1 (Clarification batch)**: table row updated to reflect the three-option batch shape; presentation-shape section rewritten to specify the five-element block verbatim; the `Approve draft (Recommended)` / `Skip this question` pair replaced with the three-option list; edit-path prose rewritten to reference § Directive grammar; post-gate behavior list preserved verbatim (advance rule unchanged — post approved subset, don't advance on skips). Update any Example-2 (N=6) prose that referenced `ceil(6/4) = 2` fan-out to reflect the new one-call shape.
  - **New § Directive grammar subsection** (append after § Gate contract G.1): byte-identical to clarify.md's § Directive grammar block. This is FR-006's byte-identical-block invariant — the block MUST be produced by verbatim copy from data-model.md § Directive grammar, then dropped into both files identically. A `diff` check in Phase 5 will catch drift.
  - **§ Invariants** — UNCHANGED (no new §8). Do not touch this section.
  - **D.1 ledger line shapes** — UNCHANGED. The existing vocabulary (`advanced` / `posted <k>/<N>, skipped <s>` / `all answers skipped` / `error: <description>`) already covers the batched shape.
  Contracts: contracts/batch-gate-shape.md, contracts/five-element-presentation.md, contracts/sb1-return-schema.md, contracts/directive-parser.md.

## Phase 4: Test suite extension

- [X] T030 [US1] Extend `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` with a new `describe("400 — clarification batch parser + directive grammar", () => …)` block appended below the existing 398 block. Use the same `resolve(__dirname, "fixtures", …)` + `readFileSync(..., "utf-8")` fixture-load idiom the 394/396/398 blocks already use. Import `parseBatchComment`, `parseDirectives`, `ParsedBatch`, `Directive` from `../lib/clarification-batch-parser`. Do NOT modify the 394 / 396 / 398 describe blocks. Add all five assertions:
  - **400-1 — batch-comment parse tolerates option-bullet variations**: load `400-batch-comment-a-colon.md` and `400-batch-comment-a-paren.md`; run both through `parseBatchComment`; assert both produce equal `ParsedBatch` values after normalization (title, context, question, options match position-for-position and byte-for-byte on trimmed field content). Q2 spec anchor.
  - **400-2 — title fallback fires only when the batch header lacks a title**: load `400-batch-comment-no-title.md` → assert `parseBatchComment(...).questions[0].title === null`; load `400-batch-comment-a-colon.md` → assert `.questions[0].title` equals the verbatim header title substring (not a truncated question). Q5 spec anchor.
  - **400-3 — free-form question renders the no-options placeholder rather than omitting the element**: load `400-batch-comment-free-form.md` → assert `parseBatchComment(...).questions[0].options === null`. Also assert that the five-element renderer (or a small in-test renderer helper mirroring the rule from data-model.md § Renderer rules) emits `**Options:** (free-form — no options posted)` for a `ParsedQuestion` whose `options` is null, rather than dropping the line. Spec acceptance-criterion anchor.
  - **400-4 — directive payload shapes**: use `400-batch-comment-a-colon.md` as the batch context; feed `400-directives-bare-letter.txt`, `400-directives-letter-reason.txt`, `400-directives-skip.txt`, `400-directives-verbatim-with-semicolon.txt` through `parseDirectives(input, batch)`; assert each returns the shape from data-model.md § Directive validation rules — bare-letter case must have `rationale: null` (never the draft's justification); letter + reason must have `rationale: "<reason>"`; skip must be `{kind:"skip"}`; the semicolon-embedded verbatim case must produce a single `{kind:"edit"}` directive whose `answer` contains the semicolon. Load-bearing Q1 and Q3 correctness assertion.
  - **400-5 — single-line semicolon form parses identically to newline-separated form**: use the same batch; feed `400-directives-newline.txt` and `400-directives-semicolon-inline.txt` through `parseDirectives`; assert byte-identical `Directive[]` output (deep-equal, same length, same fields, same order). Q1 spec anchor: one rule, two documented forms.
  Contracts: all five parser assertions map to their respective contracts under `contracts/`. On any assertion failure, the message must include the offending fixture path + expected vs observed shapes.

## Phase 5: Verify + static checks

- [X] T040 Run `pnpm --filter @generacy-ai/claude-plugin-cockpit test`. Expected: 12 passing tests (2 from #394's block, 3 from #396's block, 2 from #398's block, 5 new from #400's block). If a 400-* assertion fails, revisit T010 (parser logic) and Phase 2 fixtures. If a 394 / 396 / 398 assertion regressed, the 400 changes have leaked outside their scope — revert and re-diagnose.
- [X] T041 Run every static grep from quickstart.md § Static checks in order. Positive anchors — each returns ≥ 1: `**Context:**`, `**Question:**`, `**Options:**`, `**Recommendation:**`, `**Why:**` in both `clarify.md` and `auto.md`; `Approve all & post (Recommended)`, `Make changes`, `Skip this batch` in both files; `recommendation` and `justification` in both files. Negative anchors — each returns 0: `Approve draft (Recommended)` in both files (smoking-gun); `drafted_answer` in both files (SB.1 rename).
- [X] T042 Run the § Directive grammar byte-identity check from quickstart.md: `diff <(sed -n '/^### Directive grammar/,/^\(##\|###\) /p' packages/claude-plugin-cockpit/commands/clarify.md | sed '$d') <(sed -n '/^### Directive grammar/,/^\(##\|###\) /p' packages/claude-plugin-cockpit/commands/auto.md | sed '$d')`. Expected: exit 0 with no output. Any diff output is a drift bug — fix in-branch, re-copy the block verbatim from data-model.md § Directive grammar.
- [X] T043 Run the parser-module presence checks from quickstart.md: `test -f packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts` and grep for `export function parseBatchComment`, `export function parseDirectives`, `export interface ParsedBatch`, `export interface ParsedQuestion`, `export type Directive` — each returns ≥ 1.
- [X] T044 Run the auto.md § Invariants unchanged check: `grep -c '^## Invariants' packages/claude-plugin-cockpit/commands/auto.md` returns 1 (unchanged), and `awk '/^## Invariants/,/^## /' packages/claude-plugin-cockpit/commands/auto.md | grep -c '^[0-9]\+\. \*\*'` returns the same count as `origin/develop`. If the count changed, some prose edit accidentally touched § Invariants — undo it.
- [X] T045 Verify historical spec directories are byte-identical against `origin/develop`: `git diff --stat origin/develop -- 'specs/384-*' 'specs/388-*' 'specs/390-*' 'specs/394-*' 'specs/396-*' 'specs/398-*'` returns empty. Any diff is a scope-creep bug.
- [X] T046 Verify sibling playbook files are byte-identical against `origin/develop`: `git diff --stat origin/develop -- packages/claude-plugin-cockpit/commands/{merge,queue,review,status,watch}.md` returns empty. The clarification-gate change touches `clarify.md` and `auto.md` only.
- [X] T047 Verify sibling library files are byte-identical against `origin/develop`: `git diff --stat origin/develop -- packages/claude-plugin-cockpit/lib/reference-consumption.ts packages/claude-plugin-cockpit/lib/gate-vocabulary.ts` returns empty. #394 / #396 modules untouched by this change.

## Dependencies & Execution Order

**Sequential phase boundaries**:
- Phase 1 (T001, T002) must complete first — establishes green baseline + confirms file layout.
- Phase 2 (T010–T01B) must complete before Phase 4 — parser assertions (T030) import from the parser module and read the fixtures. T010 must land before T030 for the imports to resolve; T011–T01B must land before T030 for the `readFileSync` calls to find their fixtures.
- Phase 3 (T020, T021) can run in parallel with Phase 2 — different files, no data dependencies. Phase 3 is required for T041 / T042 / T044 in Phase 5.
- Phase 4 (T030) depends on Phase 2 completing.
- Phase 5 (T040–T047) is the final verification gate — nothing after this.

**Parallel opportunities within phases**:
- Phase 2: T011–T01B (11 fixture files) are all independent, each `[P]`. T010 (parser module) is independent of the fixtures and can run in parallel with them, but is called out separately because Phase 4 depends on its exports resolving.
- Phase 3: T020 (`clarify.md`) and T021 (`auto.md`) are different files — `[P]` for the file boundary. But they SHARE the byte-identical § Directive grammar block; T042 checks the invariant post-hoc. Write the block once (from data-model.md § Directive grammar), then copy verbatim into both files.
- Phase 4: T030 is a single test-file edit — sequential.
- Phase 5: T041–T047 are all independent read-only checks — all `[P]`. T040 is the primary green-check and can run in parallel with the greps.

**Load-bearing tasks** (a bug here reproduces the T-S4 finding or leaves the fix vacuous):
- T010 — parser reference implementation (the machine-checkable definition of the rule)
- T020 — `clarify.md` playbook edits (the runtime instruction the clarify session follows)
- T021 — `auto.md` playbook edits (the runtime instruction the auto D.1 dispatch follows)
- T030 — parser assertions 400-1 through 400-5 (the build-time backstop against silent regression)

**Completeness-hygiene tasks** (a bug here fails at build time, not at runtime):
- T011–T01B (fixture files) — test inputs
- T041–T047 (static checks) — anti-drift greps + scope-creep detection

## Task Group Summary

- **Total tasks**: 25 (T001, T002, T010–T01B, T020, T021, T030, T040–T047)
- **Phases**: 5 (Setup, Parser + fixtures, Playbook edits, Test extension, Verification)
- **Parallel opportunities**: T011–T01B (11 fixtures) all `[P]`; T020‖T021 (two playbook edits, different files, byte-identical grammar block copied to both); T041–T047 (7 static + git-diff checks) all `[P]` — up to ~15 tasks parallelizable in one wave
- **Mode**: Standard (fine-grained)
- **Story coverage**: Single-story UX fix (US1 = batched clarification gate + five-element presentation + shared directive grammar); [US1] tag applied to all load-bearing tasks

## Next Step

Run `/speckit:implement` to begin execution.
