# Implementation Plan: Add `AskUserQuestion invocation contract` section to `auto.md` + fusion-drift audit

**Feature**: Add a new top-level `§ AskUserQuestion invocation contract` section to `packages/claude-plugin-cockpit/commands/auto.md` stating the general rules governing every gate — default single-item `questions` array, ≤4-items-per-call harness ceiling, one call per gate under multi-gate fusion — then shorten each gate contract (G.1–G.5) to reference the new section (removing the inline `never ceil(N/4)` / `never per-question` prose from G.1); add a `402-1` structural drift audit + `402-2` positive-signal regression assertion to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` following the `398-1`/`398-2` shape (checked-in fixture `402-drift-auto.md`, structural check over prose-sniffing).
**Branch**: `402-found-during-cockpit-v1`
**Date**: 2026-07-11
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Close the finding #57 diagnosis-round-burn observed on the cockpit v1.5 auto-mode integration smoke test (generacy-ai/tetrad-development#92). When P3's five issues hit `waiting-for:clarification` simultaneously, the auto session correctly fused all five clarification batch gates into one assistant response — but concatenated them into **a single `AskUserQuestion` call carrying 5 items in the `questions` array**. The harness rejected it (`InputValidationError: Too big: expected array to have <=4 items (questions)`), then the session recovered by splitting into a 4-question call plus a separate 1-question call — burning a retry round-trip, duplicating the presentation block in the transcript, and lagging the fifth gate by ~15 minutes.

Root cause: `auto.md` D.1/G.1 (post-#400) specifies one batch-approval question per issue's batch, and multiple gates may be fused into one response — but it never states the harness constraint that a single `AskUserQuestion` **call** accepts at most 4 items in the `questions` array. "Fused gate = one response" was read as "one call". The pre-#400 text had `ceil(N/4)` phrasing that encoded the harness ceiling implicitly at G.1; the #400 rewrite (single-item `questions` array per batch) removed the arithmetic and lost the ceiling with it.

Three edits, applied in the same PR:

1. **Add `§ AskUserQuestion invocation contract` to `auto.md`.** New top-level section (adjacent to the existing `## Gate contract` section — same header depth `##`) stating the three general rules that govern every `AskUserQuestion` invocation the playbook fires:
   - **Default gate shape**: `AskUserQuestion.questions` is a single-item array (one call per gate/batch). Every gate contract G.1–G.5 emits exactly one item — this is the load-bearing structural default.
   - **Harness ceiling**: `AskUserQuestion.questions` array MUST NOT exceed **4 items** per call. This is the harness's hard input-validation bound (`InputValidationError: Too big: expected array to have <=4 items (questions)`); exceeding it forces a retry round-trip that costs correctness signal (duplicated presentation block, laggy last item).
   - **Multi-gate fanout**: When several gates fuse into one assistant response (5 issues hitting a `waiting-for:*` label simultaneously, or a fused verdict gate at phase boundary), fire **multiple `AskUserQuestion` calls** in that one response — one call per gate — never a single fused call. The ceiling applies to each call independently; the fanout dimension is the *number of calls*, not the length of the `questions` array.

   The three rules compose transitively: default 1 item per call + ≤4 items per call → fanout is per-call not per-array. This is a **structural contract**, not a stylistic guideline — the harness enforces the ceiling at input validation, and the playbook's job is to never write shape that violates it.

2. **Shorten G.1–G.5 to reference the contract section.** Each of the five gate contracts currently states its own gate-invocation shape inline. Post-fix, the inline "Exactly one … per batch / never `ceil(N/4)` / never per-question" prose in G.1 (line 372's `**Gate invocation**` paragraph) is replaced with a single-sentence pointer: "Per § AskUserQuestion invocation contract: one `AskUserQuestion` call per batch (single-item `questions` array); if multiple clarification gates fuse into one response, fire one call per gate — see the contract section for the harness ≤4 ceiling and multi-gate fanout rule." G.2, G.3, G.4a/b/c/d, and G.5 similarly add a one-sentence "Per § AskUserQuestion invocation contract" reference next to their gate-invocation paragraph. The **Options** / **Question text** / **Header** / **multiSelect** parameters (the gate-specific fields) stay inline in each gate contract — only the invocation-shape prose (call count, ceiling, fanout) is factored out.

3. **Add drift audit `402-1` + regression `402-2` to `playbook-verification.test.ts`.** One new `describe("402 — …")` block appended to the existing suite, following the `398-1`/`398-2` structural-audit pattern:
   - **`402-1` (positive drift audit — FR-004 shape)**: Parse the current `auto.md` and assert that (a) the file contains exactly one heading at depth `##` matching `AskUserQuestion invocation contract` (case-insensitive substring on the header line — the section EXISTS at the declared depth); (b) within that section, the assertion `≤ ?4 ?items? ?per ?call` regex matches OR the literal token `"4 items"` and `"per call"` both appear on the same line or in adjacent lines (structural check — the BOUND is present); (c) each of the five gate contracts G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.5 (headers matching `### G\.\d(a|b|c|d)? — `) contains at least one reference to the contract section (substring `AskUserQuestion invocation contract` in the section body). Fails loudly with the offending gate(s) and specific check that failed. This is a **structural assertion**, not a prose-sniff — the audit never regexes the phrasing of "fusion" or "fanout" (Q3=C rejects prose-sniffing as dialect-pinned).
   - **`402-2` (negative-fixture regression — FR-005 shape)**: Feed `tests/fixtures/402-drift-auto.md` (a checked-in minimal fixture missing the contract section, OR missing the reference from one of the gate contracts) through the same audit and assert the specific expected failure is reported — e.g., `{file: "402-drift-auto.md", failure: "missing-contract-section"}` or `{file, failure: "missing-reference-from-G.1"}`. Positive-signal check that the audit's structural logic isn't vacuous.

Also ship:

- **`packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md`** — minimal markdown fixture reproducing the pre-fix drift (Q2=A shape). Contains the top-level `## Gate contract` heading + G.1's original `**Gate invocation**` paragraph (with the old `never ceil(N/4)` phrasing) + no `AskUserQuestion invocation contract` section. Feeding this file through `402-1`'s audit MUST report `missing-contract-section` (or the equivalent structural failure). Follows the `398-drift-auto.md` shape (~15-25 lines, minimum context to parse, dropped into the same fixtures directory with the `<finding>-drift-<command>.md` naming pattern).

This is **playbook prose only + one test extension + one fixture** — no new CLI verb, no engine-side change, no runtime code change to `cockpit watch`, `cockpit status`, or any `lib/*.ts` module in the plugin, no changes to `clarify.md`/`review.md`/`merge.md`/`queue.md`/`status.md`/`watch.md`. The scope explicitly excludes sibling playbooks (`clarify.md` handles one issue per invocation and never fuses across issues — Q1 confirmed; `review.md`/`merge.md`/`queue.md`/`status.md`/`watch.md` have single-question gates so the ≤4 bound is vacuous — Q1 confirmed).

This is the **harness-contract analogue** of #398's CLI-contract audit at a different invocation surface:

- **#398** closed a CLI-contract gap: the playbook's argument-kind token (`<pr-ref>`) drifted from the CLI's `--help` usage-string token (`<issue>`); the audit compares every playbook invocation against a checked-in `--help` snapshot.
- **#402** closes a harness-contract gap: the playbook's implicit call-shape (concat all fused-gate items into one `AskUserQuestion.questions` array) drifted from the harness's input-validation ceiling (≤4 items per call); the audit checks that the top-level contract section exists, states the bound, and is referenced from every gate contract.

Same instruction-drift class (#384/#388/#390/#394/#396/#398/#400), same fix shape (pin the rule at a single load-bearing surface + backstop with a structural audit the model cannot silently regress).

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime; also parsed as text by the audit). TypeScript (Vitest) for the two new assertions.
**Primary Dependencies**: None new. Existing runtime: Claude Code slash-command executor + `AskUserQuestion` harness tool. On the test side: Vitest — already a dev-dep in `packages/claude-plugin-cockpit/package.json` (introduced by #394, extended by #396/#398/#400).
**Storage**: Filesystem — one file edited (`packages/claude-plugin-cockpit/commands/auto.md`); one file extended (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — appending a new `describe("402 — …")` block); one new fixture file (`packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md`).
**Testing**:
- **Static** (necessary but proven insufficient by the #384–#400 arc — static-only fails at behavioral drift): grep for the exact substring `## AskUserQuestion invocation contract` in `auto.md` (positive greppable anchor for the section header); grep for `4 items` AND `per call` within that section's body (positive anchors for the harness ceiling); grep asserting `never ceil(N/4)` does NOT appear in the file (negative anchor — the pre-fix wording that Q4=C removes); grep asserting each `### G.<n>` gate-contract section contains the substring `AskUserQuestion invocation contract` (positive anchor for the cross-references). See [quickstart.md](./quickstart.md) § Static checks.
- **Behavioral**: two new assertions appended to `tests/playbook-verification.test.ts` in a new `describe("402 — playbook AskUserQuestion invocation contract audit", …)` block:
  - **(402-1) — structural drift audit**: read `commands/auto.md`, assert the contract section exists at the declared depth, assert the ≤4 bound is present within it, assert each gate contract G.1/G.2/G.3/G.4a/G.4b/G.4c/G.4d/G.5 references it. Structural — never regexes the fusion vocabulary (Q3=C explicitly rejects prose-sniffing).
  - **(402-2) — negative-fixture regression**: feed `tests/fixtures/402-drift-auto.md` through the same audit and assert the specific `missing-contract-section` (or `missing-reference-from-G.<n>`) failure is reported. Guards against the audit degrading to no-op via a regex-scope bug or an unnoticed refactor.
- **True verifier**: a re-run of the cockpit v1.5 auto-mode integration smoke test on a corpus where ≥5 issues enter the same `waiting-for:*` transition class simultaneously (the exact shape of the finding #57 P3 event burst). The auto session fires one `AskUserQuestion` call per gate under fusion — never a single call carrying `questions.length ≥ 5` — and the harness never returns `InputValidationError: Too big`. Adherence is probabilistic; the corrected prose + audit backstop remove the class of failure by construction. Empirical confirmation across a variety of P-scale fanout events is the true verifier (SC pattern parallel to #398's 0 CLI-contract-drift diagnosis-round-burns and #400's 0 mid-batch-splits).

**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed). Vitest runs in Node.js (repository-standard).

**Project Type**: Single-package playbook edit + suite extension + one fixture (one plugin package touched; no cross-package changes; no cross-repo changes to `tetrad-development` or `generacy` in this branch — the harness's ≤4-items-per-call ceiling is a Claude Code SDK contract we consume, not one we can change from here).

**Performance Goals**: N/A (playbook adherence, not throughput). Adherence targets: 0 harness-`InputValidationError: Too big (questions)` retries under P-scale gate fanout on the T-S12 corpus; 100% of `AskUserQuestion` calls in the auto loop have `questions.length ≤ 4`; every gate contract G.1–G.5 references the contract section day one.

**Constraints**:

- **The contract section lives at `##` (H2) depth**, sibling to the existing `## Gate contract` heading — not nested inside `## Gate contract`. Q1=B's decision was explicit: a *top-level* contract section is the shared home for the ≤4 ceiling because the ceiling governs `AskUserQuestion` invocation *in general* (D.1's clarification fanout, D.2/D.3's verdict fanout at phase boundary, D.4's manual-validation, D.7/D.11's escalation, D.8's phase-queue). Placing it inside `## Gate contract` conflates the invocation surface with the gate-specific parameter shapes; placing it under a specific gate (e.g., inside G.1) hides it from G.2–G.5 authors who need to reference it.
- **Structural assertion over prose-sniffing** (Q3=C). The audit checks: (a) the section header exists at the declared depth, (b) the ≤4 bound is present as a numeric bound within the section's body, (c) each gate contract references the section by header substring. It NEVER regexes the fusion vocabulary ("fused", "fanout", "in the same response", "simultaneously"). Q3=B was rejected because dialect-pinning regex checks false-negative on unanticipated wording — the exact failure mode generacy#909 instanced. Q3=C's architectural assertion composes with Q1=B (the audit checks the exact architecture the fix creates).
- **G.1 loses the `never ceil(N/4)` inline phrasing** (Q4=C). The pre-#400 text had `ceil(N/4)` encoding the ≤4 ceiling implicitly; the #400 rewrite removed the arithmetic in favor of "single-item `questions` array per batch" and lost the ceiling as a side effect. Q4=C says: don't reintroduce the `ceil(N/4)` prose. Move the ≤4 bound to the contract section, shorten G.1 to reference it. Rationale: `ceil(N/4)` mixed two concepts (fanout dimension = calls; ceiling = 4) and G.2–G.5 never carried it. Factoring out the ceiling makes it visible from every gate contract.
- **Q3=C rejects both A (per-section repetition) and B (fusion-phrase regex) and D (HTML comment annotations)**. Per-section repetition creates five copies of the same rule that can drift independently; fusion-phrase regex is content-sniffing (the failure mode this fix exists to avoid); HTML-comment annotations are drift-prone surfaces of their own. Q3=C is the architectural equivalent of #396's "declare the vocabulary" fix (declare the contract at one home, reference it from each site).
- **`clarify.md` is out of scope** (Q1 confirmed). It handles one issue per invocation and never fuses across issues — its `AskUserQuestion` calls are single-gate, so the ≤4 ceiling is vacuous at that surface. The clarify batch gate itself is already a single-item `questions` array per the #400 shape. Editing `clarify.md` to reference the contract section would add prose that never fires; Q1=B rejected this as scope creep.
- **`review.md`, `merge.md`, `queue.md`, `status.md`, `watch.md` are out of scope**. Their gates fire zero or one `AskUserQuestion` per session and never fuse across issues. The ≤4 bound is vacuous at those surfaces; adding references would be belt-and-suspenders duplication for no reader benefit (Q1=D's failure mode).
- **The regression fixture is a checked-in markdown file** (Q2=A, matching #398's Q4=A). Feeding `tests/fixtures/402-drift-auto.md` through the audit exercises the actual ingestion path (markdown file → text parser → structural check). Future drift regressions follow the `<finding>-drift-<command>.md` naming pattern and drop into the same fixtures directory without any test-file schema change.
- **Scope boundary**: `auto.md` (one new `##` section ~30-40 lines + one-sentence reference edits in G.1's Gate invocation paragraph and G.2–G.5's gate-invocation paragraphs, ~5-8 net added lines across those), `tests/playbook-verification.test.ts` (~80-120 net added lines for `402-1` + `402-2` + parser helpers), `tests/fixtures/402-drift-auto.md` (~15-25 lines). Sibling playbook files (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) untouched. Sibling library files (`lib/reference-consumption.ts`, `lib/gate-vocabulary.ts`, `lib/clarification-batch-parser.ts`) untouched. Historical spec directories untouched.
- **No new invariant number**. Consistent with #394's SC-007, #396's no-§8 rule, #398's audit-lives-in-the-assertion pattern, and #400's no-§8-batch-gate-invariant. The contract section is a `## AskUserQuestion invocation contract` heading, not an entry in the `## Invariants` numbered list. If a future finding shows the invariants surface needs `8. Every AskUserQuestion call has ≤4 items in questions`, that's a follow-up finding — this fix's shape is the top-level contract section + cross-references.

**Scale/Scope**: One file edited: `auto.md` (~30-40 net added lines for the new `## AskUserQuestion invocation contract` section, ~5-8 net edited lines across G.1 and G.2–G.5 gate-invocation paragraphs replacing inline `ceil(N/4)` / `Exactly one` / `never per-question` phrasing with one-sentence references). One file extended: `tests/playbook-verification.test.ts` (~80-120 net added lines for one new `describe("402 — …")` block with two assertions + fixture reads + section-parsing helpers). One new fixture file: `tests/fixtures/402-drift-auto.md` (~15-25 lines — pre-fix G.1 paragraph + missing contract section). Zero files deleted, zero files renamed. No changes to `lib/reference-consumption.ts` (#394), `lib/gate-vocabulary.ts` (#396), `lib/clarification-batch-parser.ts` (#400), or `scripts/refresh-help-snapshots.sh` (#398).

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #384 through #400 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/402-found-during-cockpit-v1/
├── spec.md                                   # Feature spec (read-only)
├── clarifications.md                         # Q1–Q4 with resolved answers (read-only)
├── plan.md                                   # THIS FILE
├── research.md                               # Design decisions and rationale (Phase 0)
├── data-model.md                             # Structural model: contract section shape; gate-contract reference shape; auto.md pre/post layout; audit input/output; fixture shape
├── quickstart.md                             # Verification runbook (static grep + Vitest suite + operator smoke-test one-liner)
├── contracts/
│   ├── contract-section-shape.md             # Contract: `## AskUserQuestion invocation contract` header + three-rule body (default 1 item, ≤4 ceiling, multi-gate fanout)
│   ├── gate-contract-references.md           # Contract: each of G.1–G.5's gate-invocation paragraph carries one-sentence "Per § AskUserQuestion invocation contract" reference
│   ├── drift-audit-assertion.md              # Contract: 402-1 structural audit (section-exists + bound-present + gate-references) + 402-2 negative-fixture regression check
│   └── negative-fixture-shape.md             # Contract: tests/fixtures/402-drift-auto.md — minimal pre-fix G.1 excerpt with no contract section
├── checklists/                               # (empty — reserved for /checklist skill)
└── tasks.md                                  # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   ├── auto.md                               # MODIFIED — new `## AskUserQuestion invocation contract` section (sibling to `## Gate contract`) + one-sentence reference edits in G.1–G.5's gate-invocation paragraphs
│   ├── clarify.md                            # UNCHANGED — single-issue invocation, never fuses (Q1 out of scope)
│   ├── merge.md                              # UNCHANGED — single-question gate (Q1 out of scope)
│   ├── queue.md                              # UNCHANGED — single-question gate (Q1 out of scope)
│   ├── review.md                             # UNCHANGED — single-question gate (Q1 out of scope)
│   ├── status.md                             # UNCHANGED — no interactive gate (Q1 out of scope)
│   └── watch.md                              # UNCHANGED — no interactive gate (Q1 out of scope)
├── lib/
│   ├── reference-consumption.ts              # UNCHANGED — created by #394
│   ├── gate-vocabulary.ts                    # UNCHANGED — created by #396
│   └── clarification-batch-parser.ts         # UNCHANGED — created by #400
├── scripts/
│   └── refresh-help-snapshots.sh             # UNCHANGED — created by #398
└── tests/
    ├── playbook-verification.test.ts         # EXTENDED — new describe("402 — …") block with 402-1 (structural drift audit) + 402-2 (negative-fixture regression)
    └── fixtures/
        ├── 394-*                             # UNCHANGED — created by #394
        ├── 396-*                             # UNCHANGED — created by #396
        ├── 398-drift-auto.md                 # UNCHANGED — created by #398
        ├── help-snapshots/                   # UNCHANGED — created by #398
        ├── 400-*                             # UNCHANGED — created by #400
        └── 402-drift-auto.md                 # NEW — minimal markdown fixture reproducing pre-fix drift (no contract section)
```

Sibling files (untouched — byte-identical across this branch):

```text
packages/claude-plugin-cockpit/commands/
├── clarify.md      # Single-issue clarification session — no cross-issue fusion; ≤4 ceiling vacuous
├── merge.md        # Single-question gate — no fusion; ceiling vacuous
├── queue.md        # Single-question gate — no fusion; ceiling vacuous
├── review.md       # Single-question gate — no fusion; ceiling vacuous
├── status.md       # Read-only reporter — no gates
└── watch.md        # Stream reader — no gates
```

Historical artifacts (deliberately untouched):

```text
specs/384-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/388-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/390-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/394-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/396-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/398-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/400-operator-requested-ux/             # Status: Complete; byte-identical
```

**Structure Decision**: Single-package playbook edit + suite extension + one fixture. The "structure" is the internal layout of `auto.md` (one new top-level `## AskUserQuestion invocation contract` section + one-sentence reference lines in G.1–G.5) — see [data-model.md](./data-model.md) for the pre/post structural changes at each surface, the contract section's rule shape, and the audit-parser's input/output — plus the four contract files — see [contracts/](./contracts/) for the section shape, the gate-contract reference shape, the audit assertion, and the negative-fixture shape.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (one new `##` section, ~8 one-sentence reference edits across G.1–G.5, one new test describe block with two assertions, one minimal fixture) and matches the fix scope named in the spec (add contract section + reference from each gate + audit). The design explicitly rejects:

- **Per-section repetition of the ≤4 ceiling in G.1–G.5** (Q1=C rejected). Would create five copies of the same rule that drift independently. The exact anti-pattern #396's declared-vocabulary fix avoided at the transition surface, and #398's snapshot-driven audit avoided at the CLI-invocation surface. Q1=B (one contract section, referenced from each gate) is the same architectural pattern: single home for the rule, cross-references from each site.
- **Adding the ≤4 ceiling to `clarify.md`/`review.md`/`merge.md`/`queue.md`/`status.md`/`watch.md` too** (Q1=D rejected). Their gates are single-question and never fuse; the ceiling is vacuous at those surfaces. Adding references would be belt-and-suspenders duplication for no reader benefit and would blur which playbooks actually fanout gates.
- **Fusion-phrase regex in the audit** (Q3=B rejected). Content-sniffing on prose. Dialect-pinned to today's wording (`fused`, `same response`, `simultaneously`) — false-negatives on any future author's alternative phrasing. Same failure class as generacy#909's dialect-pinned classifier — the direct experience that drove Q3=C's structural-check preference.
- **Per-section audit assertions checking each G.<n> has the ≤4 bound inline** (Q3=A rejected). Would require G.1–G.5 each to state the bound (Q1=C's rejected shape), or the audit would false-fail on shortened-reference contracts. Q3=C's "section-exists + bound-present + gate-references" architecture composes with Q1=B (single home + cross-refs); Q3=A doesn't compose with Q1=B.
- **HTML-comment annotation of fused sections** (Q3=D rejected). Introduces an annotation surface that drifts on refactor (comment stripped by reformat → audit false-fails → author disables audit). Same failure class as #398's Q2=C rejection of author-annotated audit exceptions. Structural discriminators (Q3=C's section-header + bound-token + reference-substring) are more robust than comment-based ones.
- **Rewriting G.1 to reintroduce `ceil(N/4)` phrasing** (Q4=A/B/D rejected). Q4=A (verbatim insertion) preserves the ambiguity Q4 found (does "one question per call" mean single-item `questions` array or ≤1 harness-question?); Q4=B (rewrite G.1 to combine) concentrates the wording in G.1 where G.2–G.5 can't see it; Q4=D (append one-line footnote to G.1) leaves the ambiguity unresolved and hides the rule from G.2–G.5. Q4=C is the only option that resolves the ambiguity (single-item default) AND makes the rule visible from every gate contract.
- **Editing `clarify.md`'s clarification-batch gate to reference the contract section**. Scope creep. `clarify.md` handles one issue per invocation and its batch gate is already single-item `questions` array (#400 shape); the ceiling is vacuous. If a future `clarify.md` variant fanouts multiple gates, that's a follow-up finding.
- **Adding invariant §8 "Every AskUserQuestion call has ≤4 items in questions"**. Rejected as scope creep. The rule already lives in the `## AskUserQuestion invocation contract` section and the audit's assertion; a numbered invariant would be a belt-and-suspenders duplicate — same anti-pattern SC-007 of #394 rejected for step-4/step-5 changes, #396 rejected for the D.10 tightening, #398 rejected for the `--help` audit, and #400 rejected for the batch-gate contract. If future drift shows the `## Invariants` surface is needed, that's a follow-up finding.
- **Making the contract section a subsection of `## Gate contract`** (i.e., `### AskUserQuestion invocation contract` at H3 depth nested inside `## Gate contract`). Conflates the invocation surface with the gate-specific parameter shapes. The `## Gate contract` header introduces the parameter tables and per-gate G.1–G.5 subsections; the invocation contract governs the *shape of the call itself* across all gate types and belongs at the same depth as `## Gate contract` (H2).

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — Q1–Q4 decisions with rationale (resolved in `clarifications.md`; research.md restates them as design decisions with alternatives-rejected + implementation patterns).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (pre/post layout of `auto.md`'s H2 sections + G.1–G.5 gate-invocation paragraphs; contract section rule-shape; audit-parser input/output; negative fixture shape), [contracts/](./contracts/) (four contract files: contract-section shape, gate-contract references, drift-audit assertion, negative-fixture shape), [quickstart.md](./quickstart.md) (verification runbook — static greps + Vitest suite + operator smoke-test one-liner).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **`auto.md` D.1/G.1 plus one new top-level `§ AskUserQuestion invocation contract` section covers G.1–G.5.** The failure mode is multi-*gate* co-occurrence (the P3 event burst) and the run proves it isn't clarify-specific — five verdict gates co-fired at 00:59 in the same run. The bound is a property of gate invocation in general, stated once. Per-section repetition (Q1=C) is five copies that drift independently; dragging in `review.md`/`merge.md`/`queue.md`/`status.md`/`watch.md` (Q1=D) makes the bound vacuous at surfaces with single-question gates. `clarify.md` handles one issue per invocation and is out of scope, as the question's context establishes. | Q1=B |
| D2 | **"S6 pattern" is shorthand for the 398-1 style static drift audit.** Name the new test `402-1` in an issue-numbered `describe("402 — …")` block, paired with a negative fixture `tests/fixtures/402-drift-auto.md` (matching `398-drift-auto.md` shape) plus a positive check on current `auto.md`. "S6" is shorthand from the tetrad-development cockpit plan's work breakdown for the static playbook-verification audit pattern — the thing `398-1` instantiates; it is not a code identifier and should not become one (Q2=C mints a category name with no referent). | Q2=A |
| D3 | **The audit asserts the top-level contract section exists, contains the ≤4 bound, and is referenced from each gate contract.** Structural assertion over prose-sniffing: Q3=B's fusion-phrase regex is the same content-sniffing shape that just failed in generacy#909 (dialect-pinned detection false-negating on unanticipated wording); Q3=A/D re-create per-section duplication or annotation surfaces that drift. Q3=C also composes with Q1=B — the audit checks the exact architecture the fix creates. | Q3=C |
| D4 | **New top-level `§ AskUserQuestion invocation contract` section holds the general rules; G.1 shortens to a reference.** Follows from Q1=B/Q3=C. The contract section also settles the ambiguity Q4 found: the default gate shape is a single-item `questions` array (one call per gate/batch); ≤4 items per call is the harness ceiling governing any fusion; multiple calls in one response is the multi-gate fanout mechanism. Q4=B concentrates the wording in G.1 where G.2–G.5 can't see it; Q4=D's footnote leaves the "one question per call" ambiguity unresolved. | Q4=C |

## Verification Layering

Static (necessary but not sufficient — the #384–#400 experience proved static-only fails at behavioral defects):

- `commands/auto.md` contains the exact heading `## AskUserQuestion invocation contract` (positive greppable anchor for the section header).
- Within that section's body, both `4 items` and `per call` appear (positive anchors for the harness ceiling).
- `commands/auto.md` does NOT contain the string `never ceil(N/4)` (negative anchor — the pre-fix wording that Q4=C removes).
- Each of `### G.1`, `### G.2`, `### G.3`, `### G.4` (and its subtypes `(a)`/`(b)`/`(c)`/`(d)`), `### G.5` section bodies contain at least one substring reference `AskUserQuestion invocation contract` (positive anchor for the cross-references).
- `tests/fixtures/402-drift-auto.md` exists and does NOT contain `## AskUserQuestion invocation contract` (positive anchor for the negative fixture — the fixture must lack the section to be a valid drift reproduction).
- `commands/clarify.md`, `commands/review.md`, `commands/merge.md`, `commands/queue.md`, `commands/status.md`, `commands/watch.md` show zero changes on this branch.
- Historical spec directories show zero changes on this branch.
- `auto.md` `## Invariants` section shows zero changes (no new §8).

Behavioral (evidence, not proof — two assertions appended to `tests/playbook-verification.test.ts` in a new `describe("402 — …")` block):

- **402-1 (structural drift audit)**: read `commands/auto.md`, parse its H2 sections, assert the `AskUserQuestion invocation contract` section exists, assert its body contains the ≤4 bound (`4 items` + `per call` on adjacent lines OR a `≤ ?4` regex hit within the section), assert every `### G.<n>` (including `G.4a`/`G.4b`/`G.4c`/`G.4d`) section body contains at least one `AskUserQuestion invocation contract` substring reference. Fails loudly listing the missing check(s) and the offending gate(s).
- **402-2 (negative-fixture regression)**: feed `tests/fixtures/402-drift-auto.md` through the same audit, assert the specific failure (e.g., `missing-contract-section`) is reported. Positive-signal check — guards against the audit silently degrading to no-op via a regex-scope bug or an unnoticed refactor.

True verifier:

- A re-run of the cockpit v1.5 auto-mode integration smoke test on a corpus where ≥5 issues enter the same `waiting-for:*` transition class simultaneously (the exact shape of finding #57's P3 event burst). The auto session fires one `AskUserQuestion` per gate under fusion — never a single call carrying `questions.length ≥ 5` — and the harness never returns `InputValidationError: Too big: expected array to have <=4 items (questions)`. Adherence is probabilistic; the corrected prose + structural audit backstop remove the class of failure by construction. Empirical confirmation is the true verifier (SC pattern parallel to #398's 0 CLI-contract-drift diagnosis-round-burns and #400's 0 mid-batch-splits).
