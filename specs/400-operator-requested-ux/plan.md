# Implementation Plan: Batched clarification gate + five-element presentation

**Feature**: Replace per-question clarification approval in `packages/claude-plugin-cockpit/commands/clarify.md` (step 5) and `commands/auto.md` (D.1 step 3, § Gate contract G.1, SB.1 return schema) with a single batch-gate `AskUserQuestion` whose presentation renders every open question with five elements — title, context, question, options, recommendation + why + provenance — parsed from `clarificationComment.body` (the engine-authored batch-comment template) already returned by `generacy cockpit context`. Collect operator change directives via a shared `Q<n>:` token-anchored grammar, applied identically from both the `Make changes` re-loop and the built-in "Other" free-text channel.
**Branch**: `400-operator-requested-ux`
**Date**: 2026-07-10
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Close the T-S4 operator-requested UX finding from the cockpit v1.5 auto-mode smoke test arc (generacy-ai/tetrad-development#92). Both clarification surfaces today approve answers one question at a time and show the operator only the drafted answer — not the question's own context or the workflow agent's lettered options — forcing a cross-window read of the GitHub issue on every gate fire. The T-S4 runs converged on a different manual format (recommendation + why-over-alternatives, one batch approval), and this fix formalizes it in the two playbooks.

Two playbook prose edits, applied in the same PR:

1. **Edit `clarify.md` step 4 and step 5.** Step 4's drafting contract changes: for each open question the drafter returns `{question_id, recommendation, justification, provenance}` (was: `drafted_answer`). Step 5 rewrites from a per-question `AskUserQuestion` loop (`Approve` / `Edit` / `Skip`) into a single batched gate: presentation block with the five-element `### Q<n>` block per open question; one `AskUserQuestion` with options `Approve all & post (Recommended)` / `Make changes` / `Skip this batch`; the built-in "Other" free-text is the one-turn edit path. The `Make changes` path collects per-question directives, applies them, re-presents only the changed questions plus the same batch gate, and loops until Approve or Skip; zero directives is a no-op re-present.

2. **Edit `auto.md` D.1 step 3, § Gate contract G.1, and the SB.1 return schema.** Same shape: replace the "presentation block + `ceil(N/4)` `AskUserQuestion` calls, one per open question, options `Approve draft (Recommended)` / `Skip this question`" with the single-batch gate above. Update SB.1's return-schema documented shape from `{question_id, drafted_answer, provenance}` to `{question_id, recommendation, justification, provenance}` so the posted body (`**Answer:**` + `**Rationale:**`) maps one-to-one onto the drafter return and displayed content cannot drift from posted content.

Both edits share a **five-element presentation block** rendered per open question:

```markdown
### Q<n> — <title from batch comment>
**Context:** <framing from batch comment, verbatim/condensed>
**Question:** <question verbatim>
**Options:** <lettered options as posted; or "(free-form — no options posted)">
**Recommendation:** <chosen letter + text, or free-form response>
**Why:** <1–3 sentences justifying over alternatives>
_provenance: <citation>_
```

Title, context, question, and options come from parsing `clarificationComment.body` (the engine-authored batch template `### Q<n>: <title>` / `**Context**:` / `**Question**:` / `**Options**:` — the payload's `clarificationComment` is the raw comment; both surfaces parse their own engine wire format, not scrape GitHub). Parse is mildly tolerant of option-bullet variations (`A:` vs `A)`). The title is reused verbatim from the batch header; first-line truncation of the question is a fallback only when a batch arrives without titles. Recommendation, justification, and provenance come from the drafter (SB.1 return).

Both edits share a **`Q<n>:` token-anchored directive grammar** implemented identically in the `Make changes` and "Other" paths:

- A new directive begins at each `Q<n>:` token. Split the input at `Q<n>:` occurrences; each directive's payload runs to the next token or end of input. Newline-separated is the canonical documented form; the single-line semicolon form parses identically under the same rule (a verbatim replacement's text may contain semicolons, and the token rule doesn't mis-split it).
- Payload forms:
  - `Q<n>: <letter>` — bare letter resolves to that option's text from the parsed batch comment; the answer posts with **no rationale line** (never retain the draft's justification under an operator-overridden answer — it would argue for a different choice).
  - `Q<n>: <letter> — <reason>` — letter resolves to option text and `<reason>` replaces the justification.
  - `Q<n>: skip` — excludes that question from the posted batch and blocks advance.
  - Anything else — verbatim replacement text for the answer.

Both edits share an **unchanged posted-body shape**: `<!-- generacy-cockpit:clarification-answers -->` marker + one `### Q<n>` block per posted answer, each block two labeled fields — `**Answer:** <recommendation>` on one line and `**Rationale:** <justification>` on the next — mapping one-to-one onto SB.1's fields. `--body-file` only. Context/question/options are already on the issue and are not re-posted (the five-element display is presentation-only).

**Advance rule is unchanged**: advance the clarification gate only when every open question has a posted answer; per-question skips → post the approved subset, don't advance, ledger `posted <k>/<N>, skipped <s>`. Ledger line shapes (auto.md D.1), error handling, and the drafter-subagent isolation contract (no slash commands, JSON-only return) are all unchanged.

This is a **playbook prose + one shared parser** fix — no new CLI verb, no engine-side change, no runtime code change to `cockpit watch`, `cockpit status`, or the reference-consumption module. The parser is small enough that it will live inline in a new `lib/clarification-batch-parser.ts` module (called out by both playbook prose blocks as "parse per the shared rule specified in § Gate contract G.1 / § Directive grammar") and is testable independently via Vitest — matching the #394/#396 pattern of "small reference implementation of the parser rule + test against fixtures."

Also ship:
- **`packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts`** — the reference implementation of two pure parsers: (1) `parseBatchComment(body: string): ParsedBatch` — extracts per-question `{title, context, question, options}` from the batch-comment template; (2) `parseDirectives(input: string, batch: ParsedBatch): Directive[]` — extracts `Q<n>:` token-anchored directives and resolves letter references to option text. Pure functions, no I/O, no CLI shell-out — matches the #394 `reference-consumption.ts` shape.
- **`packages/claude-plugin-cockpit/tests/fixtures/400-batch-comment-*.md`** fixtures covering: the current issue's own batch comment (option-bullet style `A:`), a variant using `A)` bullets, a batch without titles (fallback path), a batch with a free-form question (no options), and a batch with mixed option/free-form questions.
- **`packages/claude-plugin-cockpit/tests/fixtures/400-directives-*.txt`** fixtures covering: newline-separated bare letter (no rationale line under override), letter + `— <reason>` (rationale replaced), `skip` (excluded), verbatim replacement text with an embedded semicolon (no mis-split), and single-line semicolon form (parses identically under the token rule).
- **`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`** — extended with a new `describe("400 — clarification batch parser + directive grammar", () => …)` block containing five new assertions (400-1 through 400-5, matching FR/SC anchors in `data-model.md`). Uses the same `resolve(__dirname, "fixtures", …)` idiom the 394/396/398 blocks already use.

The playbook edits themselves are:
- **`auto.md` D.1 step 3**: prose block rewritten — presentation shape (five elements per question), single `AskUserQuestion` invocation with three options, directive grammar reference, `Make changes` loop shape (re-present only changed questions + same batch gate; zero-directive no-op; loop until Approve or Skip), "Other" free-text is the one-turn edit path.
- **`auto.md` § Gate contract G.1**: table row updated; presentation-shape section rewritten to specify the five-element block verbatim; `Approve draft` / `Skip this question` option list replaced with the three-option batch gate; edit-path prose rewritten to reflect the directive grammar (built-in "Other" is one-turn; explicit `Make changes` is the loop path); post-gate behavior list updated (unchanged semantics — post approved subset, don't advance on skips).
- **`auto.md` D.1 SB.1 return schema block**: prose block updated — return shape `{question_id, recommendation, justification, provenance}`.
- **`clarify.md` step 4**: same drafting contract update — drafter returns `{recommendation, justification}` instead of `{drafted_answer}`.
- **`clarify.md` step 5**: prose block rewritten — same batch-gate shape as `auto.md` D.1 step 3 / G.1. Pre-confirm tally lives at the presentation block header (`Drafted answers for <issue-ref> (<N> open questions)`), not as a separate step. The three-option gate's outcomes replace the tri-verdict per-question tally.
- **`clarify.md` step 6 (post comment)**: unchanged — the posted body shape (marker + per-question `### Q<n>` block with `**Answer:**` + `**Rationale:**`) was already correct in prose; the SB.1 rename means the assembly step reads `recommendation` + `justification` instead of `drafted_answer` (a mechanical field-name change in step 6's assembly prose).
- **`clarify.md` step 7 (advance gate)**: unchanged.
- **`auto.md` D.1 ledger line shapes**: unchanged — the batch-gate outcomes (`advanced` / `posted <k>/<N>, skipped <s>` / `all answers skipped` / `error: <description>`) already cover the batched shape; no vocabulary edit needed.
- **Both playbooks' § Directive grammar**: new subsection (added to `clarify.md` after step 5 and to `auto.md` after § Gate contract G.1) specifying the `Q<n>:` token-anchored grammar verbatim, with a canonical example and the four payload forms. Both blocks are byte-identical (drift-prone across two playbooks — see FR-006 spec anchor for the identical-shape invariant).

**No new invariant number.** Consistent with #394's SC-007, #396's no-§8 rule, and #398's audit-lives-in-the-assertion pattern. The batch-gate contract's guarantees live inside G.1's prose and the parser's tests, not at the `auto.md` § Invariants surface. If a future audit shows the two playbooks' § Directive grammar has drifted, a follow-up finding adds a drift-audit assertion of the same shape as the 398 audit (comparing byte-hashes of the two grammar blocks) — that's a follow-up, not this fix's shape.

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime; also parsed by the parser module for test fixtures); TypeScript (Vitest) for the parser + assertions. No runtime code change to the plugin's `lib/reference-consumption.ts` (created by #394) or `lib/gate-vocabulary.ts` (created by #396).
**Primary Dependencies**: None new on the runtime side. Existing runtime: Claude Code slash-command executor + `AskUserQuestion` tool. `generacy cockpit context`, `generacy cockpit advance`, `gh issue comment` remain the authoritative CLI verbs (contract unchanged — the payload's `clarificationComment.body` is already returned raw by `clarification-comment-finder.ts` on generacy `develop`, verified in the Q2 clarification). On the test side: Vitest — already a dev-dep in `packages/claude-plugin-cockpit/package.json` (#394 introduced, #396 and #398 extended).
**Storage**: Filesystem — two playbook files edited (`packages/claude-plugin-cockpit/commands/clarify.md`, `commands/auto.md`); one new library module (`packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts`); one file extended (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, adding the `400 —` describe block); five new fixtures under `packages/claude-plugin-cockpit/tests/fixtures/` (batch-comment shapes + directive shapes).
**Testing**:
- **Static** (necessary but proven insufficient by the #384–#398 arc — static-only fails at behavioral drift): greps for the presence of the five-element headers (`**Context:**`, `**Question:**`, `**Options:**`, `**Recommendation:**`, `**Why:**`) in both playbook files' presentation blocks (positive signal); a grep asserting the old `Approve draft (Recommended) / Skip this question` two-option pair does NOT appear in either file (negative signal — the smoking-gun anchor for this finding); a grep on both files' SB.1 (or step-4) return schema for `recommendation` and `justification` (positive), and a grep asserting `drafted_answer` does NOT appear in either file's drafter contract (negative). See [quickstart.md](./quickstart.md) § Static checks.
- **Behavioral**: five new assertions appended to `tests/playbook-verification.test.ts` in a new `describe("400 — clarification batch parser + directive grammar", …)` block:
  - **(400-1) — batch-comment parse tolerates option-bullet variations**: feed `400-batch-comment-a-colon.md` and `400-batch-comment-a-paren.md` (identical semantic content, `A:` vs `A)` bullets) through `parseBatchComment`; assert both produce the same `ParsedBatch` structure (title, context, question, options match byte-for-byte after normalization). Q2 spec anchor: "the two live clarification comments on this very issue differ in option bullet style" — the parser must not care.
  - **(400-2) — title fallback fires only when the batch header lacks a title**: feed `400-batch-comment-no-title.md` (a synthetic batch with `### Q1` instead of `### Q1: <title>`); assert the parser falls back to first-line truncation of the question field; feed `400-batch-comment-a-colon.md` (has titles); assert the parser uses the header title verbatim, not the truncation fallback. Q5 spec anchor.
  - **(400-3) — free-form question renders the no-options placeholder rather than omitting the element**: feed `400-batch-comment-free-form.md` (Q1 has no `**Options**:` field); assert the parser returns `options: null` and the five-element renderer emits `**Options:** (free-form — no options posted)` for that question rather than dropping the line. Spec acceptance-criterion anchor.
  - **(400-4) — directive grammar: bare letter → option text; letter + reason → replacement rationale; skip → excluded; verbatim text → posted as-is; embedded semicolon does not mis-split**: feed `400-directives-bare-letter.txt`, `400-directives-letter-reason.txt`, `400-directives-skip.txt`, `400-directives-verbatim-with-semicolon.txt` through `parseDirectives(input, batch)`; assert each returns the shape documented in `data-model.md § Directive` — including that bare-letter directives return `null` for the rationale field (never the draft's justification — Q1 spec anchor). Semicolon-embedded verbatim assertion is the load-bearing check that the token-anchored rule doesn't devolve to naive semicolon-split (Q1 rationale).
  - **(400-5) — single-line semicolon form parses identically to newline-separated form under the token rule**: feed `400-directives-semicolon-inline.txt` (`Q2: B; Q4: skip` on one line) and `400-directives-newline.txt` (`Q2: B\nQ4: skip`); assert `parseDirectives` returns byte-identical `Directive[]` for both. Q1 spec anchor — one rule, two documented forms.
- **True verifier**: a re-run of the cockpit v1.5 auto-mode smoke test on a corpus where at least one epic enters `waiting-for:clarification` with N ≥ 4 open questions. The auto (or clarify) session invokes exactly **one** `AskUserQuestion` per batch (not `ceil(N/4)` and not N); each question renders all five elements; the operator can approve, edit via "Other" in one turn, or explicitly select `Make changes` and iterate. Empirical confirmation is the true verifier — the parser tests are the machine-checkable backstop against silent regression.

**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed). Vitest runs in Node.js (repository-standard).

**Project Type**: Single-package playbook edits + one new library module + one suite extension. No cross-package changes. No cross-repo changes to `tetrad-development` or `generacy` in this branch — the upstream `generacy cockpit context` payload change to emit per-question structured fields (as an alternative to parsing our own wire format) is the eventual hardening path if parse fragility shows up in practice, but is a generacy-side schema change that does not gate this playbook improvement (Q2 clarification, explicit § Out of Scope in the spec).

**Performance Goals**: N/A (playbook adherence + parser correctness, not throughput). Adherence targets: 0 per-question `AskUserQuestion` calls in a clarification batch after the fix; 100% of open questions rendered with all five elements (context, question, options, recommendation, why); 0 cases of the parser mis-splitting a verbatim replacement text containing a semicolon; the batch parser handles both live `A:` and `A)` bullet styles observed on this very issue's clarification comment.

**Constraints**:
- **Both playbooks specify the identical presentation block and batch-gate contract** (spec acceptance-criterion FR-006). The prose is intentionally duplicated across two files rather than DRY'd into a shared include, because the playbooks are Markdown files consumed by Claude at runtime and there's no include mechanism; drift between the two blocks is the failure mode a future audit-assertion (out of scope here) would catch. In this fix, the two blocks are byte-identical at commit time and a static-grep in the quickstart-runbook verifies both files contain the same five-element header sequence.
- **The parser is a pure reference implementation, not the runtime** (matches #394 `reference-consumption.ts` shape). The runtime execution path is Claude following the playbook prose; the parser exists so the parser rule has a machine-checkable definition against fixtures. This mirrors the #394 pattern where `readStream` in the test-file is the reference for how the parent loop should consume the watch stream — the actual consumer is Claude's interpretation of the prose.
- **The parser is mildly tolerant of option-bullet variation** (`A:` vs `A)`) — verified from live comments on this issue. Q2 clarification anchor. The parser regex accepts `^[A-Z][:)]\s` (letter + colon or paren + space), not a strict format lock. Fixture `400-batch-comment-a-paren.md` guards the tolerance in perpetuity.
- **Bare-letter directives NEVER retain the draft's justification** (Q1 clarification). If the operator overrides the recommendation to a different letter with no reason attached, the posted body has **no `**Rationale:**` line at all** — a rationale that argues for a different choice is worse than no rationale. This is a load-bearing correctness constraint, tested in 400-4.
- **Zero-directive `Make changes` is a no-op re-present** (Q4 clarification). Empty input must never trigger publish-and-advance — the irreversible-ish verb never fires on ambiguity. Also never trigger implicit-skip — the operator explicitly selected "make changes", so discarding the batch would discard their stated intent. The loop reuses the one existing gate (one mechanism per job); every iteration requires an explicit operator choice, so it is an idle loop with an exit on every face. Not tested at the parser level (it's a playbook-prose loop-shape rule, not a parser output shape); documented in the playbook prose block for both files, and cross-checked by the static-grep in the quickstart.
- **The batch-comment header title is reused verbatim, not truncated** (Q5 clarification). The engine emits `### Q<n>: <title>` in every batch comment (verified on this issue's own clarification comment); the parser extracts the title verbatim. First-line truncation of the question field is the fallback only when a batch comment arrives without titles (defense-in-depth against future engine-side batch templates that might not include titles). Fixture `400-batch-comment-no-title.md` exercises the fallback path.
- **The posted body shape is unchanged** — `<!-- generacy-cockpit:clarification-answers -->` marker + per-question `### Q<n>` block with `**Answer:** <recommendation>` on one line and `**Rationale:** <justification>` on the next. The five-element display is presentation-only; context/question/options are already on the issue and are not re-posted. The SB.1 field rename (`drafted_answer` → `recommendation` + `justification`) is what makes the display-vs-posted symmetry mechanically enforceable — assembly reads the same fields shown to the operator.
- **The advance rule is unchanged** — advance only when every open question has a posted answer; per-question skips → post the approved subset, don't advance, ledger `posted <k>/<N>, skipped <s>`. Consistent with the current playbook prose and explicitly out of scope to change (spec § Out of Scope).
- **Drafter-subagent isolation contract is unchanged** — no slash commands, JSON-only return. Only the return-schema shape changes (SB.1 field rename). Consistent with the #388 / #390 / #398 pattern where subagent contracts return strict JSON and the parent renders it as a table / list / block; never restates the JSON verbatim.
- **Scope boundary**: `commands/clarify.md` (steps 4, 5, 6, plus a new § Directive grammar subsection), `commands/auto.md` (D.1 step 3, § Gate contract G.1, SB.1 return schema, plus the new § Directive grammar subsection), `lib/clarification-batch-parser.ts` (new), `tests/playbook-verification.test.ts` (extended), five new fixture files under `tests/fixtures/`. Sibling playbook files (`review.md`, `queue.md`, `watch.md`, `status.md`, `merge.md`) untouched (they don't drive clarification gates). Sibling library files (`lib/gate-vocabulary.ts`, `lib/reference-consumption.ts` proxy in tests) untouched. Historical spec directories untouched.
- **No new invariant number**. Consistent with #394's SC-007, #396's no-§8 rule, and #398's audit-lives-in-the-assertion pattern. If a future finding needs a numbered invariant at the `auto.md` § Invariants surface for the batch-gate contract, that's its own finding.

**Scale/Scope**: Two files edited: `clarify.md` (~35-50 net added lines — step 5 rewritten from ~6 lines to ~20; step 4 + step 6 SB-field renames; new § Directive grammar subsection ~15 lines); `auto.md` (~40-60 net added lines — D.1 step 3 rewritten, § Gate contract G.1 rewritten, SB.1 field rename; new § Directive grammar subsection ~15 lines, byte-identical to `clarify.md`'s). One new library file: `lib/clarification-batch-parser.ts` (~100-150 lines of TS — two parsers, the `ParsedBatch` and `Directive` types, and the letter-resolution helper). One file extended: `tests/playbook-verification.test.ts` (~150-200 net added lines — one new `describe` block with five assertions + fixture reads). Five new fixture files under `tests/fixtures/` (each ~20-60 lines). Zero files deleted, zero files renamed. No changes to `lib/reference-consumption.ts` (#394) or `lib/gate-vocabulary.ts` (#396).

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #384 through #398 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/400-operator-requested-ux/
├── spec.md                                # Feature spec (read-only)
├── clarifications.md                      # Q1–Q5 with resolved answers (read-only)
├── plan.md                                # THIS FILE
├── research.md                            # Design decisions and rationale (Phase 0)
├── data-model.md                          # Types: ParsedBatch, ParsedQuestion, Directive, SB.1 return shape; validation rules; five-element rendering rules; § Directive grammar spec
├── quickstart.md                          # Verification runbook (static grep + Vitest suite + operator smoke-test one-liner)
├── contracts/
│   ├── batch-comment-parser.md            # Contract: parseBatchComment(body) → ParsedBatch; tolerance rules; title fallback
│   ├── directive-parser.md                # Contract: parseDirectives(input, batch) → Directive[]; token-anchored rule; four payload forms; bare-letter no-rationale rule
│   ├── five-element-presentation.md       # Contract: presentation block layout; free-form no-options placeholder; provenance formatting
│   ├── batch-gate-shape.md                # Contract: one AskUserQuestion, three options, Make changes loop shape, zero-directive no-op, Other free-text one-turn edit path
│   └── sb1-return-schema.md               # Contract: drafter return {question_id, recommendation, justification, provenance}; assembly rule for posted body
├── checklists/                            # (empty — reserved for /checklist skill)
└── tasks.md                               # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   ├── clarify.md                         # MODIFIED — step 4 return schema, step 5 batch-gate rewrite, step 6 assembly-field rename, new § Directive grammar subsection
│   └── auto.md                            # MODIFIED — D.1 step 3 rewrite, § Gate contract G.1 rewrite, SB.1 return-schema rename, new § Directive grammar subsection (byte-identical to clarify.md's)
├── lib/
│   ├── reference-consumption.ts           # UNCHANGED — created by #394
│   ├── gate-vocabulary.ts                 # UNCHANGED — created by #396
│   └── clarification-batch-parser.ts      # NEW — pure reference parsers (parseBatchComment, parseDirectives) + types (ParsedBatch, ParsedQuestion, Directive)
├── scripts/
│   └── refresh-help-snapshots.sh          # UNCHANGED — created by #398
└── tests/
    ├── playbook-verification.test.ts      # EXTENDED — new describe("400 — …") block with 400-1 through 400-5
    └── fixtures/
        ├── 394-mixed-event-shapes.ndjson         # UNCHANGED — created by #394
        ├── 394-actionable-live-state.json        # UNCHANGED — created by #394
        ├── 396-merge-conflicts-live-state.json   # UNCHANGED — created by #396
        ├── 396-someday-gate-live-state.json      # UNCHANGED — created by #396
        ├── 398-drift-auto.md                     # UNCHANGED — created by #398
        ├── help-snapshots/                       # UNCHANGED — created by #398
        ├── 400-batch-comment-a-colon.md          # NEW — batch comment with `A:` option bullets (this issue's own clarification comment shape)
        ├── 400-batch-comment-a-paren.md          # NEW — batch comment with `A)` option bullets (Q2 tolerance anchor)
        ├── 400-batch-comment-no-title.md         # NEW — batch comment without `### Q<n>: <title>` (Q5 fallback anchor)
        ├── 400-batch-comment-free-form.md        # NEW — one free-form question (no `**Options**:` field)
        ├── 400-batch-comment-mixed.md            # NEW — mixed option-and-free-form questions in one batch
        ├── 400-directives-bare-letter.txt        # NEW — `Q2: B` (no rationale line under override — Q1 anchor)
        ├── 400-directives-letter-reason.txt      # NEW — `Q2: B — <reason>`
        ├── 400-directives-skip.txt               # NEW — `Q2: skip`
        ├── 400-directives-verbatim-with-semicolon.txt # NEW — verbatim replacement text containing a `;` (must not mis-split)
        ├── 400-directives-newline.txt            # NEW — newline-separated canonical form
        └── 400-directives-semicolon-inline.txt   # NEW — single-line semicolon form (parses identically under the token rule — Q1 anchor)
```

Sibling files (untouched — byte-identical across this branch):

```text
packages/claude-plugin-cockpit/commands/
├── merge.md      # No clarification gate — untouched
├── queue.md      # No clarification gate — untouched
├── review.md     # No clarification gate — untouched
├── status.md     # No clarification gate — untouched
└── watch.md      # No clarification gate — untouched
```

Historical artifacts (deliberately untouched):

```text
specs/384-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/388-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/390-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/394-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/396-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/398-found-during-cockpit-v1/           # Status: Complete; byte-identical
```

**Structure Decision**: Single-package playbook edits + one new library module + one suite extension. The "structure" is the internal layout of `clarify.md` (steps 4/5/6 + new § Directive grammar subsection) and `auto.md` (D.1 step 3 + G.1 + SB.1 + new § Directive grammar subsection, byte-identical to `clarify.md`'s) — see [data-model.md](./data-model.md) for the pre/post structural changes at each surface and the parser's type shapes — plus the five contract files — see [contracts/](./contracts/) for the batch-comment parser, directive parser, five-element presentation, batch-gate shape, and SB.1 return-schema contracts.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (two playbook prose rewrites in three sections each, one small pure-function TS module, five parser assertions, ten fixture files) and matches the fix scope named in the spec (batched approval, five-element presentation, shared directive grammar). The design explicitly rejects:

- **Semicolon-only directive parsing** (Q1=A rejected). Naive semicolon-split corrupts verbatim replacement text that itself contains a semicolon; the observed T-S4 arc found this exact failure mode. Token-anchored rule (`Q<n>:` as the delimiter) admits both A's and B's syntax as documented forms without corrupting semicolon-embedded text. Fixture `400-directives-verbatim-with-semicolon.txt` locks the constraint.
- **Loose-natural-language directive parsing routed back through a drafter subagent** (Q1=C rejected). Adds a subagent round-trip per edit and lets two playbooks' model interpretations diverge — the exact decay surface this grammar exists to prevent. C is the failure mode the token grammar is defined against.
- **Structured JSON/YAML directive input** (Q1=D rejected). Operator-hostile in a free-text `AskUserQuestion` "Other" channel; nobody types valid JSON into a chat prompt. D would drive operators to abandon the "Other" one-turn edit path and go straight to the `Make changes` re-loop for every edit.
- **Assuming the payload already exposes per-question structured fields** (Q2=A rejected). Verified false against generacy `origin/develop` in the Q2 clarification — the payload's `clarificationComment` field is the raw comment (`clarification-comment-finder.ts` returns the first comment after the `waiting-for:clarification` label event; `context.ts` emits it unparsed). The spec's Assumptions line was wrong; the fix corrects it in-branch. A's premise is false.
- **Adding an upstream schema change in `generacy cockpit` to emit structured per-question fields** (Q2=B rejected). Eventual hardening path if parse fragility shows up in practice, but a generacy-side change that does not gate this playbook improvement. Explicitly out of scope (spec § Out of Scope).
- **Scraping the GitHub issue body via `gh api` inside the playbooks** (Q2=C initial reading rejected in mechanical form). No `gh api` call is needed — the payload's `clarificationComment.body` IS the engine-authored batch template, so the playbooks parse their own wire format. C's spirit is right (parse from what we have); the mechanical form was wrong (no fetch needed).
- **Posting a single blob per question** (Q3=A/C rejected). Ambiguous when the answer is free-form prose rather than a letter (A); re-fuses into a blob what the schema deliberately separated (C). Labeled fields (`**Answer:**` + `**Rationale:**`) make the operative choice extractable without prose-reading, which matters to the workflow agent resuming from clarification (the real downstream reader).
- **Discarding the rationale from the posted body** (Q3=D rejected). The tetrad-development#92 runs showed the rationale is load-bearing — implementing agents used the why to make aligned micro-decisions. D discards signal for no compression benefit.
- **Treating a zero-directive `Make changes` as implicit Approve** (Q4=B rejected). Disqualified on principle: empty input must never trigger the publish-and-advance action — an accidental submit would post to GitHub (the irreversible-ish verb never fires on ambiguity).
- **Treating a zero-directive `Make changes` as implicit Skip** (Q4=C rejected). Silently converts "Make changes" into its opposite — the operator explicitly signaled they want something different, so discarding the batch discards their stated intent.
- **Adding an inner retry-loop within the change-collection turn** (Q4=D rejected). Adds a second prompting mechanism for marginal benefit; A (re-present + re-fire the same gate) reuses the one existing gate (one mechanism per job), keeps the full batch in view for the decision the operator was trying to make, and cannot stall — every iteration requires an explicit operator choice, so it is an idle loop with an exit on every face.
- **Drafter-generated title in the SB.1 schema** (Q5=A rejected). "Names that lie" — a drafter-invented title creates a second name for a question that already has one on the GitHub issue, and the operator cross-reads both surfaces; divergent titles would make Q-numbers the only common key. A's flaw is a durable UX defect at every future batch gate.
- **Dropping the title entirely** (Q5=C rejected). Throws away a genuinely useful scanning affordance in a six-question batch. C over-corrects for A's flaw.
- **DRY'ing the two playbooks' § Directive grammar into a shared include**. Markdown playbooks consumed by Claude at runtime have no include mechanism; a shared include would require a preprocessor step, adding infrastructure for a two-file drift surface that a static grep in the quickstart runbook catches for free. If future findings show the two grammar blocks have drifted despite the static grep, an audit assertion (byte-hash comparison) is a follow-up finding of the #396/#398 shape.
- **Running the parser inline inside the playbook prose as a shell one-liner or a subagent call**. The parser is complex enough (token-anchored splitting + letter resolution + tolerance-regex) that inlining it as prose would defeat the point — the runtime is Claude interpreting the prose, and the prose is the parser rule. The `lib/clarification-batch-parser.ts` module exists as a *reference implementation* against fixtures (matching the #394 `reference-consumption.ts` shape), not as a runtime dependency.
- **Adding invariant §8 "Every clarification gate is one batch"**. Rejected as scope creep. The rule already lives in the § Gate contract G.1 prose and the parser's assertions; a numbered invariant would be a belt-and-suspenders duplicate — same anti-pattern SC-007 of #394 rejected for step-4/step-5 changes, #396 rejected for the D.10 tightening, and #398 rejected for the `--help` audit. If future drift shows the invariants surface is needed, that's a follow-up finding.

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — Q1–Q5 decisions with rationale (resolved in `clarifications.md`; `research.md` restates them as design decisions with alternatives-rejected + implementation patterns).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (types + validation rules + § Directive grammar spec + five-element renderer spec + pre/post surface changes at each playbook edit site), [contracts/](./contracts/) (five contract files: batch-comment parser, directive parser, five-element presentation, batch-gate shape, SB.1 return schema), [quickstart.md](./quickstart.md) (verification runbook — static greps + Vitest suite + operator smoke-test one-liner).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **Directive grammar is a `Q<n>:` token-anchored split; both `Make changes` and "Other" free-text paths use the identical parser.** Payload forms: `Q<n>: <letter>` (letter → option text, no rationale line — never argue with the draft's justification); `Q<n>: <letter> — <reason>` (letter → option text, `<reason>` replaces justification); `Q<n>: skip` (excludes, blocks advance); anything else → verbatim replacement text. Newline-separated is canonical; single-line semicolon form parses identically. Rejected: semicolon-only (Q1=A — corrupts verbatim text with embedded `;`), loose natural language (Q1=C — decay surface), JSON/YAML (Q1=D — operator-hostile). | Q1=B, generalized |
| D2 | **The playbooks parse the five elements from `clarificationComment.body` (the engine-authored batch template) already returned by `generacy cockpit context`.** No `gh api` fetch needed; no upstream schema change gates this fix. The parse is mildly tolerant of option-bullet variation (`A:` vs `A)`) observed on live clarification comments. The spec's Assumptions line about the payload exposing structured fields is corrected in-branch (payload returns the raw comment). Rejected: payload-already-structured (Q2=A — verified false), upstream schema change to emit structured per-question fields (Q2=B — out of scope; eventual hardening path if parse fragility shows up). | Q2=C, corrected |
| D3 | **Posted body per question is `### Q<n>` header + two labeled fields: `**Answer:** <recommendation>` and `**Rationale:** <justification>`.** Maps one-to-one onto the SB.1 return schema so displayed and posted content cannot drift. The labeled `**Answer:**` line makes the operative choice extractable without prose-reading — matters to the workflow agent resuming from clarification. Rejected: unlabeled paragraph + `**Why:**` (Q3=A — ambiguous when answer is free-form), single-blob paragraph with em-dash (Q3=C — re-fuses what schema separated), recommendation only, no rationale (Q3=D — rationale is load-bearing per T-S4 evidence). | Q3=B |
| D4 | **Zero-directive `Make changes` is a no-op: re-present the entire batch and fire the same gate again.** Empty input never triggers publish-and-advance (irreversible-ish verb never fires on ambiguity) and never triggers implicit skip (operator explicitly selected "make changes"). Loop reuses one gate (one mechanism per job); every iteration requires an explicit operator choice; cannot stall. Rejected: implicit Approve (Q4=B — accidental publish), implicit Skip (Q4=C — discards operator intent), inner retry-loop (Q4=D — second prompting mechanism for marginal benefit). | Q4=A |
| D5 | **The presentation-block title is reused verbatim from the batch comment's `### Q<n>: <title>` header.** First-line truncation of the question field is the fallback only when a batch arrives without titles (defense-in-depth; not the primary path). Rejected: drafter-invented title in SB.1 (Q5=A — names-that-lie; two names for one question across surfaces), drop the title (Q5=C — throws away a scanning affordance in a six-question batch). | Q5=B, amended |

## Verification Layering

Static (necessary but not sufficient — the #384–#398 experience proved static-only fails at behavioral defects):

- `commands/clarify.md` step 5 contains the exact substrings `**Context:**`, `**Question:**`, `**Options:**`, `**Recommendation:**`, `**Why:**` (positive greppable anchors for the five-element block).
- `commands/auto.md` § Gate contract G.1 contains the same five substrings (positive anchors; also the byte-identical-block cross-check with `clarify.md`).
- Neither file contains the string `Approve draft (Recommended)` (negative anchor — the smoking-gun for the per-question option pair this fix replaces).
- Neither file contains `Skip this question` in the vicinity of a clarification-gate `AskUserQuestion` (negative anchor for the per-question skip pair; note the token is fine when it appears in operator-facing explanatory prose elsewhere — the grep asserts absence in the option-list positions specifically).
- Both files contain `Approve all & post (Recommended)` (positive anchor — the new batch-gate primary option) exactly once in the clarification-gate context.
- Both files contain `recommendation` AND `justification` in the drafter return-schema description (positive anchors for the SB.1 field rename); neither contains `drafted_answer` in the drafter contract (negative anchor for the rename).
- Both files contain the § Directive grammar subsection; the block is byte-identical between the two files (compared by a shell one-liner: `diff <(sed -n '/^### Directive grammar/,/^###/p' clarify.md) <(sed -n '/^### Directive grammar/,/^###/p' auto.md)` returns exit 0).
- `lib/clarification-batch-parser.ts` exists, exports `parseBatchComment` and `parseDirectives`, and its type exports match the shapes documented in `data-model.md`.
- Historical spec directories show zero changes on this branch.
- `auto.md` § Invariants section shows zero changes (no new §8).

Behavioral (evidence, not proof — five assertions appended to `tests/playbook-verification.test.ts`):

- **400-1 (option-bullet tolerance)**: `parseBatchComment` produces the same `ParsedBatch` from `A:` and `A)` fixtures. Guards against a future regex tightening that would silently start dropping questions.
- **400-2 (title fallback)**: header title used verbatim when present; first-line truncation used when absent. Guards against the drafter-invented-title anti-pattern (Q5=A) sneaking back in via a "let's compute a title" refactor.
- **400-3 (free-form no-options placeholder)**: `parseBatchComment` returns `options: null` for questions with no `**Options**:` field; the five-element renderer emits the placeholder rather than dropping the line. Spec acceptance-criterion anchor.
- **400-4 (directive payload shapes)**: bare letter → `{answer: <optionText>, rationale: null}` (never the draft's justification); letter + reason → `{answer: <optionText>, rationale: <reason>}`; `skip` → `{skip: true}`; verbatim text with embedded `;` → `{answer: <verbatimText>, rationale: null}` (not mis-split). The load-bearing correctness assertion for Q1 and Q3.
- **400-5 (single-line ≡ newline directive equivalence)**: `parseDirectives` returns byte-identical output for `Q2: B; Q4: skip` and `Q2: B\nQ4: skip`. One rule, two documented forms.

True verifier:

- A re-run of the cockpit v1.5 auto-mode smoke test on a corpus where at least one epic enters `waiting-for:clarification` with N ≥ 4 open questions. The auto (or clarify) session invokes exactly **one** `AskUserQuestion` per batch (not `ceil(N/4)` and not N); each open question renders all five elements (context, question, options, recommendation, why); the operator can approve all in one turn, edit via "Other" free-text in one turn, or explicitly select `Make changes` and iterate through the re-present loop with zero-directive turns as no-op re-presents. Adherence is probabilistic; the corrected prose + parser tests + regression fixtures remove the class of failure by construction. Empirical confirmation across a variety of runs (SC pattern parallel to #394's SC-001, #396's 0-silent-stalls, and #398's 0 CLI-contract-drift diagnosis-round-burns) is the true verifier.
