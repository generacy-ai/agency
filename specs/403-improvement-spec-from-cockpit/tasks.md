# Tasks: Improvement spec from the cockpit v1.5 — auto.md ledger-only contract + phase:* row + subagent diagnosis + invariants cost-contract

**Input**: Design documents from `/specs/403-improvement-spec-from-cockpit/`
**Prerequisites**: plan.md (required), spec.md (required), clarifications.md, research.md, data-model.md, contracts/, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)

## Phase 1: Blocking Audit (FR-008, US5)

This phase runs **before** any prose edit to `auto.md`. Findings are resolved in-branch.

- [ ] **T001** [US5] **BLOCKING D.9 misclassification audit.** For every current D.9-class row in `packages/claude-plugin-cockpit/commands/auto.md` (D.9, D.9a, D.9b, D.9c, and the D.9d row this issue adds), produce a one-line justification that the row is genuinely ledger-only (no actionable follow-up beyond the ledger append). Deliverable: a markdown table in the PR body with columns `row | trigger label | one-line justification for ledger-only status`. If any current row is misclassified (an actionable transition is silently muted by the ledger-only contract), re-route it to the correct actionable dispatch class (D.1–D.8, D.10, D.11) in the same PR. **This task blocks T002–T009 from being applied.**

## Phase 2: Playbook edits — `commands/auto.md`

All Phase 2 tasks edit the same file (`packages/claude-plugin-cockpit/commands/auto.md`); none are `[P]` — they are serial edits to one file. Order within the phase is not load-bearing beyond T001 blocking all of them.

- [ ] **T002** [US1] Extend the "Ledger line only. No CLI verb, no subagent, no gate — server-side-owned." prose in the D.9, D.9a, D.9b, and D.9c subheadings of `packages/claude-plugin-cockpit/commands/auto.md` to: "**Ledger line only.** No CLI verb (in particular, no `generacy cockpit status --json` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned." Preserve the existing `Ledger line only.` prefix and `server-side-owned` suffix verbatim so downstream grep-audits keep matching. (FR-001)

- [ ] **T003** [US1] In `packages/claude-plugin-cockpit/commands/auto.md` § Dispatch table (top of § Dispatch), add a table row for D.9d immediately after D.9c, keyed on the `phase:*` trigger with dispatch class "Ledger line only". Amend the "streamed lines are advisory" paragraph with one sentence pointing readers at § Invariants #8. (FR-005)

- [ ] **T004** [US1] In `packages/claude-plugin-cockpit/commands/auto.md` § Dispatch, add a new `### D.9d — `phase:*` → ledger only` subheading between D.9c and D.11. Include: (a) prefix-match trigger prose (any transition class whose token begins with the literal `phase:` prefix matches — `phase:specify`, `phase:clarify`, `phase:plan`, `phase:tasks`, `phase:implement`, `phase:validate`, plus any future workflow-phase addition; workflow-dependent open set); (b) the shared "Ledger line only." dispatch prose extended with `no status table, no prose recap`, using the `engine-owned phase transition` suffix (distinct from `server-side-owned`); (c) explicit "Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels."; (d) the ledger-line format `<issue-ref> · <phase:*-token> · (no-op) · engine-owned phase transition`. (FR-005)

- [ ] **T005** [US3] In `packages/claude-plugin-cockpit/commands/auto.md` § Dispatch D.7, rewrite step 1 so the parent's sole evidence-fetch verb is `generacy cockpit context <issue>` (no ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent). Insert step 2 "Spawn diagnosis subagent" with the invocation shape (`subagent_type: "general-purpose"`, description `"Diagnose <issue-ref> failure"`, prompt payload with issue-ref + failure-context + gate-option-set directive + return-schema directive) and the return contract: strict JSON `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`. On unrecoverable error, subagent returns `{"error": "<description>"}`. Leave the remaining D.7 branches ("Apply verdict", degradation clause, ledger lines) unchanged. (FR-003)

- [ ] **T006** [US3] In `packages/claude-plugin-cockpit/commands/auto.md` § Dispatch D.11, rewrite step 1 the same way (`generacy cockpit context <issue>` sole verb; no `gh issue view --comments`), and add step 1.5 that dispatches a diagnosis subagent for any conflict-triage work beyond the engine bundle (repro, log reads, `git status` / `git diff` / branch inspection). Return contract: strict JSON `{root_cause, evidence, recommended_action, confidence}` where `recommended_action` is exactly one of `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`. (FR-003)

- [ ] **T007** [US3] In `packages/claude-plugin-cockpit/commands/auto.md` § Gate contract G.4 subtypes (b) and (d), update the presentation-block description so the five-element display is populated verbatim from the diagnosis subagent's return: `recommended_action` renders as a "Suggested decision" line with `confidence` beside it; `root_cause` and `evidence` fill the context and evidence rows. Explicitly state: no in-parent re-analysis; the operator still chooses from the full option set; the option set itself is unchanged. (FR-004)

- [ ] **T008** [US2] In `packages/claude-plugin-cockpit/commands/auto.md` § Ledger, add a new subsection `### L.4 — Status table policy` restricting full-epic-status-table emission to exactly four surfaces: (1) `phase-complete` dispatch (D.8 G.5); (2) `epic-complete` exit (step 6 / § Ledger L.6 run-summary); (3) escalation-gate presentations (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d); (4) startup-sweep summary (step 3, exactly one table). Explicitly state: between phase boundaries, the ledger line is the sole record; no table after D.1–D.5, D.9/D.9a/D.9b/D.9c/D.9d, or any actionable dispatch that is not one of the four surfaces above. (FR-002)

- [ ] **T009** [US4] In `packages/claude-plugin-cockpit/commands/auto.md` § Invariants, append a numbered §8 immediately after §7: "**Ledger-only rows are cheap by contract.** A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose. Playbook edits that add per-event output — a `cockpit status --json` re-check, an epic status table, a prose recap — on a ledger-only row are efficiency regressions." Preserve §1–§7 numbers verbatim (no renumbering). (FR-006)

## Phase 3: Test fixtures — `tests/fixtures/`

Each fixture is a separate new file — `[P]` across the phase. Fixtures land before the test-suite extension so T015 can read them.

- [ ] **T010** [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/403-phase-transition-live-state.json` — a `phase:plan` transient transition live-state fixture (enumerated phase). Shape parallels `396-someday-gate-live-state.json` — include `transition_class: "phase:plan"` and enough surrounding state fields to feed the dispatch classifier.

- [ ] **T011** [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/403-phase-someday-live-state.json` — a `phase:someday` transient transition live-state fixture (never-enumerated phase; load-bearing check that prefix-match beats enumeration). `transition_class: "phase:someday"`; same surrounding shape as T010.

- [ ] **T012** [P] [US3] Create `packages/claude-plugin-cockpit/tests/fixtures/403-d7-verdict-requeue.json` — a D.7 diagnosis verdict recommending `Requeue (cockpit resume)`. Fields: `root_cause`, `evidence`, `recommended_action: "Requeue (cockpit resume)"`, `confidence: "high"`.

- [ ] **T013** [P] [US3] Create `packages/claude-plugin-cockpit/tests/fixtures/403-d11-verdict-resolved.json` — a D.11 diagnosis verdict recommending `I've resolved it — advance the gate`. Fields: `root_cause`, `evidence`, `recommended_action: "I've resolved it — advance the gate"`, `confidence: "medium"` (or "high" — either satisfies the constraint).

- [ ] **T014** [P] [US3] Create `packages/claude-plugin-cockpit/tests/fixtures/403-verdict-invalid-action.json` — an invalid verdict with `recommended_action: "Merge it"` (not in either D.7 or D.11 option set). Fields as above; guards the string-set constraint at parse time.

## Phase 4: Regression suite — `tests/playbook-verification.test.ts`

Depends on T002–T014 landing.

- [ ] **T015** [US1, US2, US3, US4] Extend `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` with a new top-level `describe("403 — auto.md ledger-only contract + phase:* row + subagent diagnosis + invariants cost-contract", () => …)` block. Add seven assertions matching the assertion index in `data-model.md`:
  - **403-1**: read `commands/auto.md`; extract the D.9, D.9a, D.9b, D.9c subheading blocks; assert each contains the substring `no status table, no prose recap`. (FR-001, US1)
  - **403-2**: extract the D.9d subheading block; assert the prefix-match sentence is present verbatim; assert the "Ledger line only." prose is present verbatim; assert the ledger-line format `engine-owned phase transition` appears. (FR-005, US1)
  - **403-3**: extend the existing `dispatchClassifier` reference in the test file with a `phase:` prefix branch that returns D.9d; feed `403-phase-transition-live-state.json` (`phase:plan`) and `403-phase-someday-live-state.json` (`phase:someday`) through the classifier; assert both produce a ledger-line-only dispatch, not a D.10 escalation. (FR-005, US1)
  - **403-4**: extract the D.7 and D.11 subheading blocks; assert each contains `generacy cockpit context <issue>` (positive) and does NOT contain `gh issue view --comments` in the step-1 evidence-fetch prose (negative); assert the return-schema string `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` is present verbatim. (FR-003, US3)
  - **403-5**: inline a `parseVerdict(input: string, gateType: "D.7" | "D.11") → Verdict | ValidationError` reference in the describe block (< 40 lines; parse JSON; type-check the four fields; constrain `recommended_action` to the gate's option strings). Feed `403-d7-verdict-requeue.json`, `403-d11-verdict-resolved.json`, `403-verdict-invalid-action.json`; assert the first two parse cleanly and the third produces a validation error naming the invalid action verbatim. (FR-004, US3)
  - **403-6**: extract the § Invariants section from `commands/auto.md`; assert exactly eight numbered items exist (§1–§8); assert §8's opening substring is `A transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose;`. (FR-006, US4)
  - **403-7**: sectionize `commands/auto.md`; for each section, grep for the full-epic-status-table header anchor (per `data-model.md` § Status table anchor); assert the anchor appears only inside the four permitted surfaces (D.8 phase-complete, step 6 / § Ledger L.6 epic-complete exit, § Gate contract G.4 escalation gates, startup-sweep summary at step 3). Any occurrence outside those surfaces fails the assertion with the section name in the error message. (FR-002, US2)

## Phase 5: Validation

- [ ] **T016** Run the static-grep runbook from `quickstart.md` § Static checks against the working tree: positive anchors present (`no status table, no prose recap` in D.9 family; `### D.9d — \`phase:*\`` header; `engine-owned phase transition`; `generacy cockpit context <issue>` in D.7 and D.11; verdict-schema string; invariants §8 opening substring; § Ledger L.4 subsection); negative anchors absent (`gh issue view --comments` gone from D.7 and D.11 step 1); FR-009 boundary confirmed (`clarify.md` unchanged); `lib/*.ts` unchanged; historical spec directories unchanged.

- [ ] **T017** Run `pnpm --filter claude-plugin-cockpit test` (or the repo-standard Vitest command) and confirm all seven `403 —` assertions pass together with all pre-existing suites (394 / 396 / 398 / 400). Zero regressions.

- [ ] **T018** Confirm the PR body contains the D.9 misclassification audit table produced by T001 with one row per D.9-family row (D.9, D.9a, D.9b, D.9c, D.9d); the table is the FR-008 deliverable and the review anchor.

## Dependencies & Execution Order

**Blocking prerequisite**: T001 (D.9 audit) must complete and its findings must be actioned before T002–T009 land. This is the FR-008 hard prerequisite spelled out in `spec.md` US5 and the plan's Q2=A decision.

**Phase sequence (mostly sequential)**:

1. **T001** — blocking audit. If a misclassification is found, re-route it in the same PR before proceeding.
2. **T002 → T009** — auto.md edits. All target `packages/claude-plugin-cockpit/commands/auto.md`; serial, no `[P]`. Suggested order: T002 (extend D.9 family prose) → T003 (dispatch table row) → T004 (D.9d subheading) → T005 (D.7 rewrite) → T006 (D.11 rewrite) → T007 (G.4b/G.4d presentation) → T008 (L.4 status-table policy) → T009 (§8 invariant). Order-independence between T003/T004 and T005/T006 exists but a single serial pass keeps the merge diff minimal.
3. **T010–T014** — fixtures. All `[P]`; five independent new files under `tests/fixtures/`. Can land alongside Phase 2 edits.
4. **T015** — regression suite extension. Depends on all of T002–T014 (reads the edited playbook + the new fixtures).
5. **T016 → T017 → T018** — validation. T016 (static greps) and T017 (Vitest suite) confirm the file states; T018 confirms the PR-body deliverable.

**Parallel opportunities**: T010–T014 across each other (five fixtures, independent files). T002–T009 are all on `auto.md` and therefore serial.

**Cross-file independence**: fixtures (Phase 3) and playbook edits (Phase 2) do not touch each other's files — Phase 2 and Phase 3 can proceed in parallel by a two-worker split (worker A does T002–T009 on `auto.md`; worker B does T010–T014 in `tests/fixtures/`), rejoining at T015.

**Explicitly unchanged files** (do not edit): `packages/claude-plugin-cockpit/commands/clarify.md`, `commands/merge.md`, `commands/queue.md`, `commands/review.md`, `commands/status.md`, `commands/watch.md`, `lib/reference-consumption.ts`, `lib/gate-vocabulary.ts`, `lib/clarification-batch-parser.ts`, `scripts/refresh-help-snapshots.sh`, and all historical spec directories under `specs/`. FR-009 pins `clarify.md`; FR-010 pins the other invariants.
