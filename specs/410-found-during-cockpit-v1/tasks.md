# Tasks: #410 — `auto.md` D.7 repeat-failure dispatch fresh-evidence rule + verdict-schema addendum + G.4(b) sixth-element row

**Input**: Design documents from `/specs/410-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/{d7-repeat-dispatch-shape,verdict-schema,g4b-presentation-block,drift-audit-assertion,negative-fixture-shape}.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Since spec.md's user-story section is a template stub, tasks are tagged `[US1]` (the single implicit story: "close the finding #62 misdiagnosis at D.7").

## Phase 1: Setup

- [X] T001 Confirm branch `410-found-during-cockpit-v1` is checked out and `packages/claude-plugin-cockpit` builds cleanly (`pnpm install && pnpm --filter @generacy-ai/claude-plugin-cockpit build`) so the Vitest suite baseline is green before extending it.

## Phase 2: Test scaffolding (add before playbook edit — tests should exercise the intended post-fix shape)

- [X] T010 [P] [US1] Create negative fixture `packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md` (~20-30 lines) reproducing the pre-fix D.7 drift per `data-model.md` § Surface 3 and `contracts/negative-fixture-shape.md`: top-level `## Dispatch` H2, `### D.7 — \`agent:error\` / \`failed:*\` → escalation gate (Requeue path)` H3, one unified "Fetch evidence" bullet (no first-vs-repeat sub-path split), single "Spawn diagnosis subagent" bullet with no verdict-schema addendum, minimal five-element G.4(b) presentation block. MUST NOT contain any of: `failure_class_changed`, `failure_classes_seen`, `Failure class changed since prior`, `first dispatch`/`repeat dispatch` branching keyword, or a no-parent-characterization rule anchor. Follows the `398-drift-auto.md` / `402-drift-auto.md` / `408-drift-auto.md` shape and `<finding>-drift-<command>.md` naming.

- [X] T011 [US1] Add `auditD7` helper + `describe("410 — auto.md D.7 repeat-failure dispatch fetches fresh evidence + failure_class_changed verdict field", …)` block to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` per `data-model.md` § Surface 2 and `contracts/drift-audit-assertion.md`. Helper: takes a markdown file path, locates the `## Dispatch` H2 and the `### D.7 —` H3 anchor, extracts D.7 body to the next H3/H2, extracts G.4(b) presentation block from `### G.4 —` (or standalone `### G.4(b)`), returns `D7AuditReport = { d7Present, firstDispatchSubPath, repeatDispatchSubPath, failureClassChangedField, failureClassesSeenField, noParentCharacterizationRule, g4bSixthElementRow }`. Structural checks only — NEVER regex fusion vocabulary like "loop-trust-boundary", "context reuse", "fresh evidence", "identical premise" (per plan.md's Q3=C rejection of dialect-pinned prose regex). Path constants: `AUTO_MD_PATH` (relative to package root → `commands/auto.md`), `FIXTURE_410_DRIFT_AUTO` (→ `tests/fixtures/410-drift-auto.md`).

- [X] T012 [US1] Add assertion `410-1 (structural drift audit)` inside the new describe block: call `auditD7(AUTO_MD_PATH)` and assert all seven report booleans are `true`. Each expect() uses a message naming the missing structural check (e.g., `"first-dispatch sub-path anchor missing"`) so failures point to the exact D.7 property that regressed. Depends on T011.

- [X] T013 [US1] Add assertion `410-2 (regression check)` inside the same describe block: call `auditD7(FIXTURE_410_DRIFT_AUTO)` and assert `d7Present === true` AND at least one of the six structural checks is `false` (positive-signal check that the audit's structural logic isn't vacuous). Fails with a message dumping the observed report JSON. Depends on T010 (fixture must exist) and T011 (helper must exist).

- [X] T014 [US1] Run `pnpm --filter @generacy-ai/claude-plugin-cockpit test -- --grep "410 — auto.md D.7"` and confirm the current failure mode: `410-1` should FAIL (auto.md hasn't been rewritten yet — the seven report booleans are still in pre-fix state), `410-2` should PASS (the negative fixture already trips the audit). This is the pre-implementation baseline that proves the audit sees the drift.

## Phase 3: Playbook rewrite (make 410-1 pass)

- [X] T020 [US1] Rewrite `packages/claude-plugin-cockpit/commands/auto.md` § D.7 step 1 body per `data-model.md` § "Post-fix D.7 step 1 body (target layout)" and `contracts/d7-repeat-dispatch-shape.md`: insert a **Dispatch classification** paragraph (per-issue, any failure class, per contiguous invocation trigger scope; Q1=B); split step 1 "Fetch evidence" into two sub-paths at bullet or paragraph separation — **First dispatch** (unchanged; call `cockpit_context(issue=<issue-ref>)`) and **Repeat dispatch** (call `cockpit_context(issue=<issue-ref>)` again — same evidence verb; state "No dispatch of a repeat D.7 without the new alert body in hand"; state the no-parent-characterization rule with an explicit MUST NOT anchor forbidding phrases like "requeue failed identically", "same as before"). Preserve the surrounding step 1 preamble (parent's sole evidence-fetch tool, no ad-hoc `gh` chains, engine-bundle rule).

- [X] T021 [US1] Extend `packages/claude-plugin-cockpit/commands/auto.md` § D.7 step 2 body per `data-model.md` § "Post-fix D.7 step 1 body" step 2 excerpt and `contracts/verdict-schema.md`: retain the existing "Spawn diagnosis subagent" invocation shape; add a **First dispatch invocation** sub-block (unchanged shape; return contract names only `root_cause`/`evidence`/`recommended_action`/`confidence`; states `failure_class_changed` and `failure_classes_seen` are absent or `null` on first dispatch); add a **Repeat dispatch invocation** sub-block (SendMessage to existing subagent if live; fresh spawn with both verbatim prior + fresh alert bodies on continuation-miss per Q4=A; explicit "no parent-authored summary of similarity" rule); add a **Verdict return-schema addendum on repeat dispatches** sub-block naming both `failure_class_changed: boolean` (Q2=B computation: any of three dimensions — `classifier_reason` exact match, `error_taxonomy` exact match, canonical `<file>::<name>` failing-test identifier — differs; absent-vs-present differs) and `failure_classes_seen: string[]` (Q3=D immediately-prior running list; second-dispatch initializes `[<class1>, <class2>]`; N-th dispatch appends fresh class).

- [X] T022 [US1] Extend `packages/claude-plugin-cockpit/commands/auto.md` § Gate contract G.4(b) presentation block per `data-model.md` § "Post-fix G.4(b) presentation block" and `contracts/g4b-presentation-block.md`: split the block into a **First-dispatch presentation** (five-element form, unchanged) and a **Repeat-dispatch presentation** (six-element form — inserts `**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)` between "Evidence" and "Current state"; header changes to `Agent error on <issue-ref> (repeat dispatch):` per data-model.md); populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields; no in-parent re-analysis; note a `yes` value usually means the prior Requeue made progress.

- [X] T023 [US1] Cross-check D.7 step 3 references the G.4(b) sixth-element row for repeat dispatches per `data-model.md` § "Cross-surface invariants" #5. Update step 3's presentation-composition sentence to name the sixth-element row explicitly (e.g., "On repeat dispatches, the presentation block gains a sixth element between 'Evidence' and 'Current state': `**Failure class changed since prior:** <yes | no>  (classes this session: …)`, populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields. No in-parent re-analysis."). Depends on T020, T021, T022.

## Phase 4: Verification

- [X] T030 [US1] Run `pnpm --filter @generacy-ai/claude-plugin-cockpit test -- --grep "410 — auto.md D.7"` and confirm both `410-1` and `410-2` now pass. If `410-1` still fails, read the failure message's list of missing booleans and fix the corresponding D.7 or G.4(b) surface. If `410-2` fails, the audit went vacuous — re-check `auditD7`'s scope against the fixture. Depends on T020, T021, T022, T023.

- [X] T031 [P] [US1] Run the full playbook-verification suite: `pnpm --filter @generacy-ai/claude-plugin-cockpit test`. Confirm no prior 394 / 396 / 398 / 400 / 402 / 403 / 406 / 408 assertions regressed (scope-boundary invariant per plan.md's `## Constraints`: no sibling playbook edits, no library file edits). Depends on T030.

- [X] T032 [P] [US1] Run the static-check block from `quickstart.md` § Tier 1 verbatim:
  - `grep -c 'first dispatch\|first-dispatch\|First dispatch' packages/claude-plugin-cockpit/commands/auto.md` ≥ 1
  - `grep -c 'repeat dispatch\|repeat-dispatch\|Repeat dispatch' packages/claude-plugin-cockpit/commands/auto.md` ≥ 1
  - `grep -c 'failure_class_changed' packages/claude-plugin-cockpit/commands/auto.md` ≥ 2
  - `grep -c 'failure_classes_seen' packages/claude-plugin-cockpit/commands/auto.md` ≥ 1
  - `grep -c 'Failure class changed since prior' packages/claude-plugin-cockpit/commands/auto.md` ≥ 1
  - `grep -E 'MUST NOT characterize|no parent-authored|not the parent'"'"'s role to characterize|parent MUST NOT summarize' packages/claude-plugin-cockpit/commands/auto.md` ≥ 1 match
  - `grep -c 'cockpit_context' packages/claude-plugin-cockpit/commands/auto.md` ≥ 3
  - Fixture presence + fixture negative-anchor checks (fixture MUST NOT contain the post-fix field names or G.4(b) row).
  Depends on T020–T023 + T010.

- [X] T033 [P] [US1] Run the sibling-playbook-untouched checks from `quickstart.md` § Tier 1: `git diff develop -- packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md` all empty; `git diff develop -- packages/claude-plugin-cockpit/lib/` empty; historical spec directories (`specs/384-*` … `specs/408-*`) show no diff on this branch. Enforces the plan's scope boundary.

## Phase 5: True verifier (out-of-band; operator-driven)

- [ ] T040 [US1] Coordinate with the cockpit v1.5 operator to run the smoke test from `quickstart.md` § Tier 3 on a T-S13-style corpus with a 2-failure-class D.7 repeat (first fault healed by Requeue exposes a distinct-class second fault). Success criteria per `quickstart.md` § "Success criteria (SC-001 measurement)": 0 repeat D.7 dispatches without a fresh `cockpit_context` evidence fetch; 100% of repeat verdicts carry `failure_class_changed`; 0 parent-authored characterizations of similarity in the transcript; G.4(b) sixth-element row rendered on all repeat dispatches. Not blocking for merge (adherence is probabilistic; the corrected prose + audit backstop remove the class of failure by construction), but confirms the fix behaves in the real runtime.

## Dependencies & Execution Order

**Sequential chain**:
- T001 (setup) → T010 (fixture) + T011 (helper) → T012, T013 (assertions) → T014 (baseline confirming pre-fix drift is visible) → T020, T021, T022 (playbook rewrite) → T023 (cross-reference) → T030 (410 suite passes)
- T031, T032, T033 (parallel post-implementation verifications) → T040 (out-of-band smoke test)

**Parallel opportunities**:
- **T010 and T011 are parallel** — fixture creation and test-helper implementation touch disjoint files.
- **T020, T021, T022 are NOT parallel** — all three edit the same file (`commands/auto.md`), and each edit's context depends on the surrounding structure the prior edits produced. Do them sequentially in one working session.
- **T031, T032, T033 are parallel** — full-suite Vitest run, static greps, and scope-boundary git diffs are independent verifications over the post-edit tree.

**Critical path**: T001 → T010 → T011 → T012/T013 → T014 → T020 → T021 → T022 → T023 → T030 → T031/T032/T033 (parallel) → T040 (out-of-band).

**TDD order**: T010–T014 land before T020–T023. The 410-1 assertion FAILS on the baseline (per T014) — the assertion codifies the intended post-fix shape, and its failure list at T014 is the shopping list for T020–T023. Once the rewrite lands, T030 confirms 410-1 flips green and 410-2 remains green (fixture still trips the audit).

---

*Generated by `/tasks` for issue #410 (workflow:speckit-bugfix; standard mode — fine-grained tasks).*
