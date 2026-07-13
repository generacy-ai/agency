# Tasks: Operator-requested capability from the cockpit auto-mode workstream

**Input**: Design documents from `/specs/416-operator-requested-capability/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
  - **US1**: Mid-run ad-hoc issues in epic mode (add-existing + file-new + D.8 enumeration)
  - **US2**: Epic-less mode (tracking-issue-driven runs with scope-drained gate)
  - **US3**: First-sight events dispatch through the existing table (Q5 anchor)
  - **SUP**: Cross-story support (parser module, ledger vocabulary, invocation forms)

## Phase 1: Setup

- [X] T001 Verify hard dependency `generacy-ai/generacy#935` has shipped and the `cockpit_scope_add`, `cockpit_queue(issue=…)`, and `initial: true` `issue-transition` primitives are available on the tool server that `packages/claude-plugin-cockpit` targets. If not shipped, **stop** — spec Summary explicitly sequences after #935 (see plan.md Constraints).
- [X] T002 [P] Confirm test infrastructure — run `pnpm --filter @generacy-ai/claude-plugin-cockpit test` on the current branch and confirm the 394/396/398/400 `describe` blocks pass unchanged (baseline for the 416 extension).

## Phase 2: Foundation (blocks all playbook + test work)

- [X] T003 [SUP] Create `packages/claude-plugin-cockpit/lib/intent-recognition.ts` — pure reference module implementing:
  - `type AddExistingIntent = { ref: string }`
  - `type FileNewIntent = { topic: string }`
  - `parseAddExistingIntent(input: string): AddExistingIntent | null` — extracts `<owner>/<repo>#<n>` (or `#<n>` shorthand); returns `null` when no parseable ref is found (matches confirm-on-ambiguity contract in `contracts/intent-recognition.md`).
  - `parseFileNewIntent(input: string): FileNewIntent | null` — recognizes NL variants of "file an issue for X", "open a bug for X", "create an issue about X"; returns `null` for ambiguous chat ("look at X").
  - No I/O, no CLI shell-out. Type shapes MUST match `data-model.md` (§ AddExistingIntent, § FileNewIntent).

## Phase 3: Fixtures (all parallel — independent files)

### 3a. Intent-recognition fixtures (US1 + US2 shared)

- [X] T004 [P] [SUP] Create `packages/claude-plugin-cockpit/tests/fixtures/416-add-existing-full-ref.txt` — canonical `also process owner/repo#42` NL variant with full ref.
- [X] T005 [P] [SUP] Create `packages/claude-plugin-cockpit/tests/fixtures/416-add-existing-shorthand.txt` — `process #42 too` shorthand (tracking ref supplies repo).
- [X] T006 [P] [SUP] Create `packages/claude-plugin-cockpit/tests/fixtures/416-add-existing-multiple-refs.txt` — message with multiple refs; first parseable ref wins.
- [X] T007 [P] [SUP] Create `packages/claude-plugin-cockpit/tests/fixtures/416-add-existing-nonref-chat.txt` — regular chat, no ref; parser returns `null` → confirm-intent path.
- [X] T008 [P] [SUP] Create `packages/claude-plugin-cockpit/tests/fixtures/416-file-new-file-an-issue.txt` — canonical `file an issue for the flaky test in module X and process it` phrasing.
- [X] T009 [P] [SUP] Create `packages/claude-plugin-cockpit/tests/fixtures/416-file-new-open-a-bug.txt` — `open a bug for X` variant.
- [X] T010 [P] [SUP] Create `packages/claude-plugin-cockpit/tests/fixtures/416-file-new-create-an-issue.txt` — `create an issue about X` variant.
- [X] T011 [P] [SUP] Create `packages/claude-plugin-cockpit/tests/fixtures/416-file-new-ambiguous-look-at.txt` — `look at X` ambiguous chat; parser returns `null`, NO auto-trigger.

### 3b. Filing-gate (G.6) fixtures (US1)

- [X] T012 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/416-filing-gate-first-draft.md` — first-round G.6 presentation shape (five-element block: title, labels, body, filing target repo, filing target parent-tracking-ref). Match `contracts/filing-gate.md`.
- [X] T013 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/416-filing-gate-revised.md` — post-`Make changes` presentation. Same five-element block, revised body — byte-identical presentation shape, different field contents (guards against diff-view drift per Q3).

### 3c. D.8 ad-hoc enumeration fixtures (US1)

- [X] T014 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/416-d8-adhoc-none.md` — D.8 presentation with empty ad-hoc list (block **omitted**, `Queue P<next> (Recommended)`).
- [X] T015 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/416-d8-adhoc-one.md` — D.8 with one open ad-hoc (`Open ad-hoc issues in scope (added mid-run):` block present, `Hold — 1 open ad-hoc issue(s) in scope (Recommended)`).
- [X] T016 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/416-d8-adhoc-two.md` — D.8 with two open ad-hoc (block enumerates both refs numbered, `Hold` recommended).

### 3d. Scope-drained gate (G.7) fixtures (US2)

- [X] T017 [P] [US2] Create `packages/claude-plugin-cockpit/tests/fixtures/416-scope-drained-completed-only.md` — G.7 with all refs `completed`; `Keep watching (Recommended)` present.
- [X] T018 [P] [US2] Create `packages/claude-plugin-cockpit/tests/fixtures/416-scope-drained-mixed.md` — G.7 with mixed `completed` + `not-planned` per-ref disposition rendered.
- [X] T019 [P] [US2] Create `packages/claude-plugin-cockpit/tests/fixtures/416-scope-drained-not-planned-only.md` — G.7 with all refs `not-planned`; still terminal (Q1 anchor).

## Phase 4: Playbook edits — `commands/auto.md` (sequential — same file)

All tasks in this phase edit `packages/claude-plugin-cockpit/commands/auto.md`. They MUST run sequentially. No `[P]` markers.

- [X] T020 [SUP] `auto.md` § Instructions **step 1** rewrite: recognize three invocation forms (`<epic-ref>` unchanged, `--tracking <issue-ref>` new, `--new "<title>"` new); parse the tracking ref; print startup line; extend ledger header with `Tracking ref: <owner>/<repo>#<n>`. Match `contracts/invocation-forms.md`.
- [X] T021 [SUP] `auto.md` § Instructions **step 3** (startup sweep): one-sentence add — under `--tracking` / `--new`, the sweep reads the tracking issue's task list and treats each live-state ref as a synthetic event (structurally identical to the epic-ref sweep).
- [X] T022 [US3] `auto.md` § Instructions **step 4** (main loop, event-consumption): one-sentence add — `initial-flagged events (connect-time snapshots or mid-run scope joins) dispatch normally through the existing table by carried state; the step-4a re-check remains authoritative and D.10 structurally cannot fire on them.` Q5 anchor. **No new dispatch row.**
- [X] T023 [US1] `auto.md` § **Add-issue flow (mid-run)** — new subsection inserted after § Dispatch, before § Gate contract. Documents:
  - Intent-class recognition prose (two classes; confirm-on-ambiguity; structural safety net; references `lib/intent-recognition.ts`).
  - Add-existing path: `cockpit_scope_add` → `cockpit_queue(issue=…)` → ledger line (`<ref> · scope-add · queued`). **No gate.**
  - File-new path: drafter → G.6 filing gate → `gh issue create` → `cockpit_scope_add` → `cockpit_queue(issue=…)` → ledger line.
  - Match `contracts/intent-recognition.md`.
- [X] T024 [US1] `auto.md` § **Dispatch D.8** presentation extension: append line block `Open ad-hoc issues in scope (added mid-run):` populated by `openAdHocIssues(trackingRef, ledger)`; empty list omits the block entirely (no "none" placeholder). Flip G.5 recommendation to `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` when list non-empty; `Queue P<next> (<N> issues)` becomes non-recommended but selectable. Match `contracts/phase-queue-adhoc-enumeration.md`.
- [X] T025 [US1] `auto.md` § **Gate contract G.6** (new gate row) — filing gate. Five-element presentation block (title, labels-if-any, body preview, filing target repo, filing target parent-tracking-ref) + single `AskUserQuestion` with three options: `Approve & file (Recommended)` / `Make changes` / `Skip (don't file)`. Header `File`, `multiSelect: false`. Iterative edit branch on `Make changes` — full-draft re-present each round, never a diff view. Single-shot "Other" free-text is the fast path. Match `contracts/filing-gate.md` (Q3 anchor).
- [X] T026 [US2] `auto.md` § **Gate contract G.7** (new gate row) — scope-drained gate. Five-element presentation block (tracking ref, total refs processed, per-ref disposition list from `cockpit_status`'s classifier: `completed` vs `not-planned`) + single `AskUserQuestion` with three options: `Keep watching (Recommended)` / `Add more work` / `Finish (close tracking issue + summary)`. Header `Drain`, `multiSelect: false`. On `Finish`, close via `gh issue close <tracking-ref>` (the G.7 pick IS the outward-facing confirmation — no second gate), print run summary per L.6, exit zero. Terminality deferred to `cockpit_status`'s classifier — playbook does NOT re-derive. Match `contracts/scope-drained-gate.md` (Q1 + Q4 anchors).
- [X] T027 [SUP] `auto.md` § **Gate contract table** — append two new rows: G.6 filing, G.7 scope-drained. Include all metadata columns already present in the table (options set, multiSelect, header).
- [X] T028 [SUP] `auto.md` § **Ledger — L.4 status-table policy** — one new row: scope-drained gate (G.7) is a status-table surface (operator orientation before an exit decision).
- [X] T029 [SUP] `auto.md` § **Ledger — action + outcome vocabulary** — two new rows:
  - `scope-add (add-existing intent)` — `<action>` = `scope-add`, `<outcome>` = `queued` / `error: <description>`.
  - `scope-add (file-new intent)` — `<action>` = `filing-gate+scope-add`, `<outcome>` = `filed + queued (<new-ref>)` / `skipped (draft discarded)` / `error: <description>`.
  Match `contracts/ledger-scope-mutations.md`.
- [X] T030 [SUP] `auto.md` § **Ledger L.6 run summary** extension: append `Scope growth: started with N, added M, completed K` line at the bottom (counts derived from ledger); in epic-less mode, also emit per-ref disposition list.
- [X] T031 [US2] `auto.md` § **Examples** — new **Example 3** (epic-less stabilization run): shows three ad-hoc adds (one add-existing, two file-new), one filing-gate skip, one scope-drained gate cycle with `Keep watching`, one final `Finish` on the second scope-drained gate.

## Phase 5: Behavioral tests (sequential — same file)

All tasks in this phase edit `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. Sequential — no `[P]` markers.

- [X] T032 [SUP] Add `describe("416 — operator-requested capability", () => { … })` block; import `parseAddExistingIntent`, `parseFileNewIntent` from `../lib/intent-recognition`; use the same `resolve(__dirname, "fixtures", …)` idiom the 394/396/398/400 blocks use.
- [X] T033 [SUP] Assertion **416-1**: feed T004–T007 fixtures through `parseAddExistingIntent`; assert each returns the expected `{ref}` or `null`. Q2 spec anchor.
- [X] T034 [SUP] Assertion **416-2**: feed T008–T011 fixtures through `parseFileNewIntent`; assert each returns the expected `{topic}` or `null`. Guards against a broadening regex that would auto-trigger on plain chat.
- [X] T035 [US1] Assertion **416-3** (filing-gate iterative edit preserves full-draft shape): parse T012 + T013; assert both use the identical five-element block layout — only field contents differ. Q3 anchor.
- [X] T036 [US1] Assertion **416-4** (D.8 ad-hoc + scope-drained defaults): for T014–T016 assert presence/absence of the `Open ad-hoc issues in scope (added mid-run):` block and the recommendation flip (`Queue P<next>` vs `Hold`); for T017–T019 assert the `Keep watching (Recommended)` option label is present and that per-ref disposition (`completed` vs `not-planned`) is rendered. Q1 + Q4 anchors.

## Phase 6: Polish & Verification

- [X] T037 [SUP] Run static grep checks per `quickstart.md` § Static checks — positive anchors for the invocation-form flags, gate option labels, ledger vocabulary, D.8 enumeration header, G.6/G.7 table rows; negative anchors: no `Approve draft`/`Skip this question` pair in filing-gate context, no invariant §10, no D.12 row.
- [X] T038 [SUP] Run `pnpm --filter @generacy-ai/claude-plugin-cockpit test` — assert 416-1 through 416-4 all pass; assert 394/396/398/400 blocks still pass unchanged (no regression).
- [X] T039 [SUP] Run `pnpm --filter @generacy-ai/claude-plugin-cockpit build` (or repo-standard build command) — assert `lib/intent-recognition.ts` type-checks and emits without warnings.
- [ ] T040 [US1] **True verifier — epic-mode scenario**: on a real epic tracking issue, `/cockpit:auto <epic-ref>`; mid-run, ask the session to file a bug via NL ("file an issue for X"); confirm G.6 fires, approve & file; confirm the new issue rides through the standard D.1–D.11 dispatch to merge without restarting the session; confirm the next D.8 phase-queue gate names it while open and defaults to `Hold`. (Spec Success criteria #1.)
- [ ] T041 [US2] **True verifier — epic-less scenario**: `/cockpit:auto --new "<title>"` creates a fresh tracking issue through the G.6 filing gate; process 3+ ad-hoc issues (mix of add-existing + file-new intent) to terminal state; confirm exit through G.7 with an accurate run summary (per-ref disposition, `Scope growth: started with 0, added 3, completed K`). (Spec Success criteria #2.)
- [ ] T042 [SUP] **True verifier — isolation**: open two concurrent tabs on the same repo with distinct tracking issues; drive both through a couple of ad-hoc adds; confirm neither session's ledger references the other's refs (isolation observed end-to-end). (Spec Success criteria #3.)

## Dependencies & Execution Order

**Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6** (top-down).

Within-phase parallelism:
- **Phase 1**: T002 can run in parallel with T001 (baseline check is independent of dependency verification).
- **Phase 2**: T003 is a single task; no parallelism.
- **Phase 3**: T004–T019 all `[P]` — each fixture is an independent file. All can run in parallel once T003's type shape is stable.
- **Phase 4**: **All sequential** — same file (`auto.md`). Any ordering that respects the § surface ordering in `auto.md` works; the sequence T020 → T031 above matches the file's top-to-bottom structure and is safest for reviewers.
- **Phase 5**: **All sequential** — same file (`playbook-verification.test.ts`). Assertions can be added in any order but sharing the `describe` block requires T032 first.
- **Phase 6**: T037 + T038 + T039 can run in parallel (independent verifiers). T040/T041/T042 (true-verifier smoke tests) are outside CI — sequential, run when the code has landed.

**Blocking edges**:
- T003 blocks Phase 3 (fixtures need parser type shape) and Phase 5 (tests import parser).
- T023 (§ Add-issue flow) blocks T025 (G.6 references the add-issue flow) and T029 (ledger vocabulary references both intent classes).
- T025 (G.6) + T026 (G.7) block T027 (gate contract table extension).
- Phase 4 blocks Phase 6 static checks (T037) and Vitest run (T038).
- Phase 3 fixtures block Phase 5 assertions (each assertion loads its fixtures).
- Phase 5 blocks T038 (Vitest run) which blocks T040–T042 (true verifier).

**Parallel opportunities identified**:
- All 16 fixtures (T004–T019) in Phase 3 → high concurrency.
- Three Phase 6 automated verifiers (T037, T038, T039) → independent.
- T001 + T002 (Phase 1 dependency check + baseline test) → independent.

---

*Generated by /speckit:tasks. Next step: `/speckit:implement` to begin execution.*
