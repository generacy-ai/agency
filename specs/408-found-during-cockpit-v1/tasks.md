# Tasks: `auto.md` § step 5 cursor-error class split + circuit breaker + ledger accounting (#408)

**Input**: Design documents from `/specs/408-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (this fix has one story: cursor-recovery class split + circuit breaker + ledger accounting)

## Overview

Three surfaces touched, in TDD order (fixture + tests first, then playbook body, then verification):

1. `packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md` (new — pre-fix drift fixture, ~20-30 lines).
2. `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (extended — new `describe("408 — …")` block with `auditStep5` helper + `408-1` + `408-2` assertions, ~80-120 net added lines).
3. `packages/claude-plugin-cockpit/commands/auto.md` (modified — § step 5 body rewrite + § Gate contract G.4(e) row + G.4(e) presentation block + § Ledger action+outcome vocabulary rows, ~60-100 net changed lines).

Sequenced **after** generacy-ai/generacy#924 (post-#924 hardened error taxonomy is required for `invalid-cursor` branch semantics).

## Phase 1: Setup

- [X] T001 Verify branch `408-found-during-cockpit-v1` is checked out; run `pnpm install` from `/workspaces/agency`; run `pnpm --filter @generacy-ai/claude-plugin-cockpit build` and `pnpm --filter @generacy-ai/claude-plugin-cockpit test` to confirm baseline (existing 394/396/398/400/402/403/406 tests pass; no 408 describe block yet).
- [X] T002 Confirm generacy-ai/generacy#924 is merged and its hardened error taxonomy is live (post-#924, `never-issued` reliably means caller bug; restarts/evictions classify as `discarded`/`resetFrom`). This is the sequencing constraint from plan.md § Summary / § Constraints. If #924 is not yet merged, stop and coordinate.

## Phase 2: Tests First (TDD)

Fixture + audit helper + both assertions land BEFORE the playbook rewrite so the `408-1` failure signal is legible: `408-1` should red on the current `auto.md` (pre-fix § step 5), and `408-2` should green on the negative fixture. When the playbook edits land in Phase 3, `408-1` flips green.

- [X] T003 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md` (~20-30 lines) reproducing the pre-fix § step 5 drift per `specs/408-found-during-cockpit-v1/contracts/negative-fixture-shape.md` and `data-model.md` § Surface 3. Must contain: a top-level `## Instructions` H2, an enumerated list beginning with `5. **Cursor recovery.**`, the pre-fix converged-three-signals wording (all three of `invalid-cursor` / `resetFrom` / expiry converged onto one recovery bullet, no branches, no counter, no escalation gate). Must NOT contain any of: `Continue degraded (sweep-per-batch)`, `Stop (exit auto)`, `cursor-recovery ·` code span. Naming follows `<finding>-drift-<command>.md` pattern (matches `398-drift-auto.md`, `402-drift-auto.md`).
- [X] T004 [US1] Add `auditStep5(filePath)` helper + shared step-5 section parser at the top of the new `describe("408 — …")` block in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. Structural, not prose-sniffing (per `data-model.md` § Surface 2 and `contracts/drift-audit-assertion.md`). Input: markdown file path. Output: `Step5AuditReport` with `{ step5Present, branchAInvalidCursor, branchBResetFrom, optionContinueDegraded, optionStopExit, ledgerShapePresent }`. Extraction: locate `## Instructions` H2, find `5. **Cursor recovery.**` anchor, extract body to item 6 or next H2. Checks: (a) `invalid-cursor` on a distinct branch (paragraph/bullet separation from resetFrom/expiry/discarded); (b) at least one of `resetFrom`/`expiry`/`discarded` on a distinct branch; (c) `Continue degraded (sweep-per-batch)` verbatim; (d) `Stop (exit auto)` verbatim; (e) code span matching `cursor-recovery · <class> · <consecutive-count>` templated form OR concrete `cursor-recovery · invalid-cursor · 1` / `cursor-recovery · resetFrom · 1`. NEVER regex prose vocabulary like "class split", "circuit breaker", "consecutive-fault".
- [X] T005 [US1] Add `408-1 (structural drift audit)` test to the `describe("408 — …")` block per `contracts/drift-audit-assertion.md`. Reads `packages/claude-plugin-cockpit/commands/auto.md` via `auditStep5(AUTO_MD_PATH)`. Asserts all six report fields are `true` with per-field failure messages naming the missing check. Blocked by T004. Runs RED at this point (pre-Phase-3) — that's the correct signal.
- [X] T006 [US1] Add `408-2 (negative-fixture regression)` test to the same block per `contracts/drift-audit-assertion.md`. Reads the T003 fixture via `auditStep5(FIXTURE_408_DRIFT_AUTO)`. Asserts at least one of `branchAInvalidCursor`/`branchBResetFrom`/`optionContinueDegraded`/`optionStopExit`/`ledgerShapePresent` is `false` (any of these three shapes suffices: `missing-class-split` / `missing-escalation-options` / `missing-ledger-shape`). Blocked by T003 and T004. Runs GREEN at this point — the fixture is pre-fix drift.
- [X] T007 [US1] Run `pnpm --filter @generacy-ai/claude-plugin-cockpit test -- --grep "408 — auto.md § step 5"`. Confirm `408-2` passes and `408-1` fails with the report showing the missing structural checks (this proves the audit's structural logic isn't vacuous and that the pre-fix `auto.md` reliably trips the audit). Blocked by T005 and T006.

## Phase 3: Core Implementation — `auto.md` § step 5 rewrite

Sequential within the file (all edits to the same file). Do these in the order below so each edit is testable in isolation with a git diff.

- [X] T008 [US1] Rewrite § step 5 body in `packages/claude-plugin-cockpit/commands/auto.md` per `contracts/step-5-shape.md` and `data-model.md` § Surface 1 "Post-fix § step 5 (target layout)". Replace the pre-fix converged three-signal bullet list with the two-branch layout: **Branch A** (`resetFrom` / expiry / `discarded` → recover + per-class ledger line) and **Branch B** (`invalid-cursor` → log verbatim + ledger line + recover once at counter==1; fire G.4(e) at counter≥2). State the per-class consecutive-fault counter map and the Q2=A reset semantics ("any successful cursor reuse resets ALL counters"). Cross-reference `§ Gate contract G.4(e)` from Branch B's escalation bullet. Preserve the tail paragraph on idempotent convergence (sweep + re-arm cursor-less; in-memory cursor; retirement of the compound-liveness cross-check).
- [X] T009 [US1] Add G.4(e) row to the § Gate contract table in `auto.md` per `contracts/g4e-escalation-gate.md` § Table row and `data-model.md` § Surface 1 "Post-fix § Gate contract table row". Insert between existing G.4 rows (a/b/c/d) with column values: trigger `Escalation: consecutive invalid-cursor fault`, options `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)` (single call, no Retry), evidence `Verbatim code/message/details from the two most recent invalid-cursor typed errors + consecutive-count`.
- [X] T010 [US1] Add § Gate contract G.4(e) presentation block (new H3 subsection) to `auto.md` per `contracts/g4e-escalation-gate.md` § Presentation block and `data-model.md` § Surface 1 "Post-fix § Gate contract G.4(e) presentation block". Include: Trigger paragraph (counter==2 or first re-check in unhealed streak), Presentation markdown block (verbatim `code`/`message`/`details` for occurrences N-1 and N + recovery-state paragraph + Options list), Gate invocation parameters (question text, header `Escalate`, `multiSelect: false`, two options in the specified order), Post-gate behavior (`Continue degraded` → mark streak operator-acknowledged; `Stop` → clean exit + § L.6 summary), Ledger line contract (`<epic-ref> · invalid-cursor-streak · escalation-gate · <continue-degraded | stop>`), Failure modes (indefinite block per Q3=D).
- [X] T011 [US1] Add `cursor-recovery` action rows to § Ledger action+outcome vocabulary table in `auto.md` per `contracts/ledger-line-shape.md` and `data-model.md` § Surface 1 "Post-fix § Ledger action+outcome vocabulary table". Two rows: (Branch A) source `§ step 5 cursor recovery (Branch A)`, action `cursor-recovery`, outcomes `resetFrom · <N>` / `expiry · <N>` / `discarded · <N>`; (Branch B) source `§ step 5 cursor recovery (Branch B)`, action `cursor-recovery`, outcomes `invalid-cursor · <N>`; plus one row for the escalation gate: source `§ step 5 Branch B escalation`, action `escalation-gate`, outcomes `continue-degraded` / `stop (exit)`.
- [X] T012 [US1] Update § L.6 run-summary counted-events list in `auto.md` per `data-model.md` § Surface 1 "Post-fix § L.6 run-summary update". Add two lines: `· Cursor recoveries: <k7> (<by class: invalid-cursor=<a>, resetFrom=<b>, expiry=<c>, discarded=<d>>)` and `· Cursor-recovery escalations: <k8> (<continue-degraded=<x>, stop=<y>>)`. This is the surface SC-003 measurement reads to identify degraded runs.

## Phase 4: Verification & Static Anchors

- [X] T013 [US1] Run `pnpm --filter @generacy-ai/claude-plugin-cockpit test -- --grep "408 — auto.md § step 5"`. Confirm both `408-1` and `408-2` pass. If `408-1` fails, read the reported missing-checks and revisit T008/T010 accordingly (typos in option strings, wrong middle-dot character U+00B7 in the ledger code span, missing cross-reference from Branch B to G.4(e)). Per `quickstart.md` § Troubleshooting.
- [X] T014 [US1] Run full package suite: `pnpm --filter @generacy-ai/claude-plugin-cockpit test`. Confirm every prior describe block (394/396/398/400/402/403/406) still passes with no regressions plus the new 408 block. If any prior test fails, the § step 5 rewrite touched a surface it should not have (§ step 3 sweep, § Ledger L.5 idempotency rule, § Gate contract G.1–G.3, `## Invariants`, sibling playbooks) — revert and re-scope.
- [X] T015 [P] [US1] Run Tier 1 static anchor checks from `quickstart.md` § Tier 1: positive anchors (`Branch A`, `Branch B`, both option strings, `cursor-recovery ·` code span, G.4(e) subsection heading, class name occurrences), negative anchors (the pre-fix "converge on the same recovery" wording removed), fixture presence + fixture negative anchors (no post-fix strings in `408-drift-auto.md`).
- [X] T016 [P] [US1] Confirm sibling playbooks are byte-identical to `develop` per `quickstart.md` § "Sibling playbooks untouched": `git diff develop -- packages/claude-plugin-cockpit/commands/clarify.md` and same for `merge.md`, `queue.md`, `review.md`, `status.md`, `watch.md` — all empty.
- [X] T017 [P] [US1] Confirm library files and historical spec directories are byte-identical to `develop` per `quickstart.md` § "Library files untouched" and § "Historical specs untouched" — `git diff develop -- packages/claude-plugin-cockpit/lib/` empty; `git diff develop -- specs/{384,388,390,394,396,398,400,402,403,406}-*` all empty.
- [X] T018 [US1] Confirm `## Invariants` section of `auto.md` shows zero net structural changes (no new §9; per plan.md § Constraints "No new invariant number"). `git diff develop -- packages/claude-plugin-cockpit/commands/auto.md` should show changes only in § step 5 body, § Gate contract table + G.4(e) presentation block, § Ledger action+outcome vocabulary rows, and § L.6 summary — nothing in `## Invariants`.

## Phase 5: True Verifier (Tier 3 — post-review, optional at PR time)

- [ ] T019 [US1] Operator smoke test per `quickstart.md` § Tier 3 (true verifier). Re-run the cockpit v1.5 auto-mode integration path on a corpus where the tool server has been made to return `invalid-cursor` on two consecutive `cockpit_await_events` calls (per T-S13-style dev harness override). Expected transcript: first fault writes `<epic-ref> · cursor-recovery · invalid-cursor · 1` and recovers silently; second fault writes `... · invalid-cursor · 2` and fires G.4(e); on `Continue degraded` selection, subsequent `invalid-cursor` continue to increment the counter (accounting) but do NOT re-fire the gate (decide-once); on a successful cursor reuse the counter resets and a fresh 2-in-a-row streak re-fires the gate at count=2 (Q4=A). Adherence is probabilistic — the fix is by construction (prose + audit backstop); this tier confirms empirically. Requires post-#924 environment.

## Dependencies & Execution Order

**Sequencing constraint (external)**: All of Phase 2+ waits on generacy-ai/generacy#924 being merged (T002).

**Phase order**:
- Phase 1 (T001–T002) → Phase 2 (T003–T007) → Phase 3 (T008–T012) → Phase 4 (T013–T018) → Phase 5 (T019)

**Within Phase 2**:
- T003 (fixture) and T004 (audit helper) are the fanout roots. T005 depends on T004. T006 depends on both T003 and T004. T007 depends on T005 and T006.
- T003 is `[P]` — a standalone fixture file, no dependency on the audit helper (only T006 combines them).

**Within Phase 3**:
- T008 (step 5 body) → T009 (gate table row) → T010 (G.4(e) presentation block) → T011 (ledger vocabulary rows) → T012 (L.6 summary). All edits touch the same file (`auto.md`); do them sequentially even where logical independence would allow parallelism, so each git diff is legible.

**Within Phase 4**:
- T013 → T014 sequentially (behavioral before regression sweep).
- T015, T016, T017 are `[P]` — three independent git-diff / grep checks over disjoint file sets.
- T018 comes after T015–T017 (final sanity check on the `## Invariants` untouched property).

**Parallel opportunities**:
- **Phase 2**: T003 can start immediately alongside T004.
- **Phase 4**: T015, T016, T017 all in parallel after T014 passes.

## Success Criteria

- All Vitest assertions in the `408 — …` block pass on the modified `auto.md` and fail (in the correct shape) on `408-drift-auto.md`.
- Static anchors from `quickstart.md` § Tier 1 all match.
- Sibling playbooks + library files + historical spec directories byte-identical to `develop`.
- `## Invariants` section unchanged (no new §9).
- Ledger emission on a post-fix auto run has the shape `<epic-ref> · cursor-recovery · <class> · <consecutive-count>` per Q1=C per-class counter; escalation-gate ledger has shape `<epic-ref> · invalid-cursor-streak · escalation-gate · <continue-degraded | stop>`.
- **True verifier (Phase 5)**: 0 silent sweep-per-batch runs on the T-S13 corpus with induced `invalid-cursor` streaks; every streak of length ≥ 2 fires G.4(e) at count=2 (first firing per unhealed streak); `Continue degraded` is decide-once for that streak; new streak after a successful reuse re-fires the gate at count=2.

## Suggested Next Step

`/speckit:implement` to begin execution starting at T001 (or T002 if the sequencing check on generacy-ai/generacy#924 has already been done).
