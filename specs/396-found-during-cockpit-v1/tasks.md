# Tasks: Close the D.10 bypass, add D.11 for `waiting-for:merge-conflicts`, and ship drift-audit hygiene

**Input**: Design documents from `/specs/396-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/ (4 contract files)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: This bugfix has a single implicit user story (US1: cockpit auto-mode never silently stalls on `waiting-for:*`). All implementation tasks are tagged `[US1]`.

## Phase 1: Setup

- [X] T001 Confirm you are on branch `396-found-during-cockpit-v1` and `pnpm install` has been run at repo root; verify `vitest` is present under `packages/claude-plugin-cockpit` (added by #394) via `pnpm --filter claude-plugin-cockpit test --run --reporter=basic` returning green with the existing 394 assertions.

## Phase 2: Foundational (blocks all other work)

- [X] T002 [P] [US1] Create `packages/claude-plugin-cockpit/lib/gate-vocabulary.ts` per `contracts/gate-vocabulary-module.md` and `data-model.md` § 5.1: header comment naming `/workspaces/tetrad-development/.github/labels.yml` and `/workspaces/tetrad-development/docs/label-protocol.md` as upstream sources with the sync-obligation clause including the phrase "runtime safety"; `export const GATE_VOCABULARY = [...] as const` with the 12 tokens in the exact order listed in `data-model.md` § 5.1 (clarification, spec-review, clarification-review, plan-review, tasks-review, implementation-review, manual-validation, address-pr-feedback, pr-feedback, children-complete, dependencies, merge-conflicts); `export type GateVocabularyToken = (typeof GATE_VOCABULARY)[number]`.

- [X] T003 [P] [US1] Create fixture `packages/claude-plugin-cockpit/tests/fixtures/396-merge-conflicts-live-state.json` matching `data-model.md` § 6.1 shape: one issue with `labels: ["waiting-for:merge-conflicts"]`, `transition_class: "waiting-for:merge-conflicts"`, and `conflicted_paths: ["packages/foo/src/bar.ts", "packages/foo/tests/bar.test.ts"]`. Match the `cockpit status --json` schema shape from `394-actionable-live-state.json`.

- [X] T004 [P] [US1] Create fixture `packages/claude-plugin-cockpit/tests/fixtures/396-someday-gate-live-state.json` matching `data-model.md` § 6.2 shape: one issue with `labels: ["waiting-for:someday-gate"]` and `transition_class: "waiting-for:someday-gate"`. This token must NOT appear in `GATE_VOCABULARY` and must NOT appear in `auto.md`'s § Dispatch table (used to prove the D.10 catch-all fires on runtime-unknown tokens).

## Phase 3: Core Implementation — `auto.md` edits (sequential; same file)

All of T005–T011 edit `packages/claude-plugin-cockpit/commands/auto.md`. Execute sequentially in the listed order to keep the diff coherent; do NOT parallelize.

- [X] T005 [US1] In `auto.md` § Dispatch table (currently ~lines 60-71 per `data-model.md` § 1.1), insert four new rows so the post-state matches `data-model.md` § 1.2 exactly: `D.9a` (`waiting-for:pr-feedback` → ledger only, legacy alias), `D.9b` (`waiting-for:children-complete` → ledger only, epic-container state), `D.9c` (`waiting-for:dependencies` → ledger only, engine-owned cross-issue wait) between D.9 and the new D.11 row; `D.11` (`waiting-for:merge-conflicts` → escalation gate) between D.9c and D.10; D.10 remains the final row. Verify final visible order via `grep -n '^| D\.'`: D.1 → D.2 → ... → D.9 → D.9a → D.9b → D.9c → D.11 → D.10 (per contracts C.1–C.3).

- [X] T006 [US1] In `auto.md` § Dispatch prose, add three new subheadings for the ledger-only D.9-family per `data-model.md` § 2.1, § 2.2, § 2.3: `### D.9a — \`waiting-for:pr-feedback\` → ledger only`, `### D.9b — \`waiting-for:children-complete\` → ledger only`, `### D.9c — \`waiting-for:dependencies\` → ledger only`. Each subheading gets three prose blocks: **Trigger** (with the one-line rationale from `research.md` R2 table), **Dispatch** (verbatim `**Ledger line only.** No CLI verb, no subagent, no gate — server-side-owned.`), and **Ledger line** (`<issue-ref> · <token> · (no-op) · server-side-owned`).

- [X] T007 [US1] In `auto.md` § Dispatch prose, edit D.10's trigger prose to the tightened wording per `data-model.md` § 2.4 post-state and `contracts/dispatch-D10-tightened-trigger.md`. Preserve trigger cases (a)/(b)/(c) verbatim and add case (d): `**(d) the \`waiting-for:*\` label is a token that does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11)**.` After the case enumeration, append the two verbatim anchor sentences: `**Any \`waiting-for:*\` label without a matching dispatch row IS an unrecognized state.** "Known but not actionable" is not a permissible classification outcome — the § Dispatch table is the exhaustive list of \`waiting-for:*\` states the loop may treat as no-ops (via the named ledger-only rows D.9, D.9a, D.9b, D.9c). "Wait for someone else to handle it" is never a permissible dispatch outcome for a \`waiting-for:*\` state unless the table explicitly names it ledger-only. If the table does not name it, D.10 fires — verbatim state in the presentation block.` Also update the trigger's opening sentence to enumerate `D.1–D.9 (including D.9a/b/c) or D.11` (per contract D10-C.5).

- [X] T008 [US1] In `auto.md` § Dispatch prose, insert the new `### D.11 — \`waiting-for:merge-conflicts\` → escalation gate (I've resolved it / Skip / Stop)` subheading between D.9c and D.10 per `data-model.md` § 2.5 and `contracts/dispatch-D11-merge-conflicts.md`. Include **Trigger** (verbatim event string `waiting-for:merge-conflicts`), **Dispatch** three-step body (1. Fetch context via `gh issue view --comments <issue-ref>`; 2. Present escalation gate via single `AskUserQuestion` with options in this exact order: `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`; 3. Apply verdict — advance path with the verbatim anchor sentence `On non-zero exit: re-present the D.11 gate with the CLI stderr prepended verbatim to the presentation block` (D11-C.3 / C.7), skip and stop shapes), **Future degradation** paragraph, and **Ledger line** row listing all four outcomes verbatim: `advanced`, `advance failed: <description>`, `skip (session-local mute)`, `stop (exit)` (C.8).

- [X] T009 [US1] In `auto.md` § Gate contract table (currently ~lines 271-273 per `data-model.md` § 3.1), insert `G.4 (d)` row between `G.4 (b)` and `G.4 (c)` (C.9) per `data-model.md` § 3.2: `| G.4 (d) | Escalation: Merge-conflicts | \`I've resolved it — advance the gate\` / \`Skip\` / \`Stop\` (single call) | Conflicted paths (+ CLI stderr on re-present) |`.

- [X] T010 [US1] In `auto.md` § Gate contract G.4 presentation-block prose (currently ~lines 394-429 per `data-model.md` § 3.3), insert a new `**(d) Merge-conflicts**` sub-block between `**(b) agent:error / failed:***` and `**(c) Unrecognized state**` per `data-model.md` § 3.4 (C.10). Include both the **Initial presentation** block (verbatim body naming conflicted paths from the pause alert plus the resolve-locally guidance sentence) and the **Re-presentation on non-zero CLI exit** block prefixed with `Advance failed for <issue-ref>:` (C.11). Also extend the G.4 § Options-per-subtype table (~lines 437-441 per `data-model.md` § 3.5) with `| (d) merge-conflicts | \`I've resolved it — advance the gate\` / \`Skip (session-local mute)\` / \`Stop (exit auto)\` |` between (b) and (c). Also extend § Post-gate mechanism sentences (~lines 444-448 per `data-model.md` § 3.6) with the verbatim sentence for `\`I've resolved it — advance the gate\` (subtype d only) → \`generacy cockpit advance --gate merge-conflicts <issue-ref>\`. On zero exit, ledger \`advanced\` and continue. On non-zero exit, re-present the D.11 gate with the CLI stderr prepended verbatim to the presentation block (see § D.11 dispatch step 3).`

- [X] T011 [US1] In `auto.md` § Action + outcome vocabulary table (currently ~lines 513-528 per `data-model.md` § 4.1), insert four rows so the post-state matches `data-model.md` § 4.2 in this exact order (C.12): `D.9a pr-feedback`, `D.9b children-complete`, `D.9c dependencies`, `D.11 merge-conflicts`. Rows D.9a/b/c use `(no-op)` / `server-side-owned`; D.11 uses `escalation-gate` action with outcomes `advanced`, `advance failed: <description>`, `skip (session-local mute)`, `stop (exit)`. Insert D.9a/b/c immediately after the existing D.9 row and D.11 immediately before the existing D.10 row.

## Phase 4: Behavioral tests (extend existing suite)

- [X] T012 [US1] In `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, append a new `describe("396 — auto.md D.11 dispatch + tightened D.10 trigger + drift audit", …)` block **below** the existing `describe("394 — …")` block. Do NOT edit or reorder the 394 block; its two assertions must continue to pass unchanged (verify via a scratch run before proceeding). Colocate small D.11 and D.10 reference-dispatch handler helpers inside the test file (the playbook prose IS the runtime — the helpers are test-side interpretations of the prose per contract in `data-model.md` § 7).

- [X] T013 [US1] Inside the 396 describe block, add assertion **396-1** per `contracts/dispatch-D11-merge-conflicts.md` and `plan.md` § Verification Layering: read `tests/fixtures/396-merge-conflicts-live-state.json`; feed it through the D.11 reference-dispatch handler; assert the escalation gate is invoked via a single-call `AskUserQuestion` mock; assert the recorded options are exactly `["I've resolved it — advance the gate", "Skip (session-local mute)", "Stop (exit auto)"]` in that order and `multiSelect: false`; assert the presentation block contains the fixture's `conflicted_paths` entries.

- [X] T014 [US1] Inside the 396 describe block, add assertion **396-2** per `contracts/dispatch-D10-tightened-trigger.md`: read `tests/fixtures/396-someday-gate-live-state.json`; feed it through the dispatch classifier; assert the D.10 unrecognized-state gate fires; assert the mocked presentation block contains the verbatim string `waiting-for:someday-gate`; assert the `AskUserQuestion` options are `["Skip (session-local mute)", "Stop (exit auto)"]` (no Retry per D.10 contract).

- [X] T015 [US1] Inside the 396 describe block, add assertion **396-3** per `contracts/audit-drift-check.md` and `plan.md` § Vocabulary/Dispatch mapping: import `GATE_VOCABULARY` from `../lib/gate-vocabulary.ts`; read `../commands/auto.md` as raw text; for each token in `GATE_VOCABULARY`, assert the token appears as either a `## D.<n> — \`<token>\`` heading OR as a `` `<token>` `` Trigger token in a § Dispatch row; on failure, the assertion message must name the specific missing token(s).

## Phase 5: Polish — static + suite verification

- [X] T016 [P] [US1] Run every static-check command listed in `quickstart.md` § Static checks (§ Dispatch table structure C.1–C.3/C.9/C.12; § Dispatch prose subheadings C.6; D.10 tightened trigger D10-C.1–D10-C.5; D.11 dispatch prose C.7/C.8/D11-C.1–D11-C.4; § Gate contract G.4 (d) C.9/C.10/C.11; `lib/gate-vocabulary.ts` GV-C.1–GV-C.6). Every command must return the expected match count. Any deviation is a contract-invariant failure — fix at source (do NOT loosen the grep).

- [X] T017 [P] [US1] Run `git diff origin/develop -- packages/claude-plugin-cockpit/commands/{clarify,review,merge,queue,watch,status}.md` and `git diff origin/develop -- specs/{372-epic-generacy-ai-tetrad,384-found-during-cockpit-v1,388-found-during-cockpit-v1,390-found-during-cockpit-v1,394-found-during-cockpit-v1}/`; both must produce empty output (sibling-playbook and historical-spec byte-identity per `data-model.md` § 8 and `quickstart.md`).

- [X] T018 [P] [US1] Run `sed -n '/^## Invariants$/,/^## /p' packages/claude-plugin-cockpit/commands/auto.md | grep -c '^[0-9]\+\.'` and confirm it returns exactly `7`. Confirms the § Invariants section was not touched by this fix (no §8 added — the D.10 tightening lives inside D.10's own trigger prose, per `plan.md` Constraints and SC-007 of #394).

- [X] T019 [US1] Run `pnpm --filter claude-plugin-cockpit test`; confirm five green assertions: the two existing 394 assertions PLUS 396-1, 396-2, 396-3. Any red — including a 394 regression — is a blocker. Investigate before proceeding.

- [X] T020 [US1] Confirm operator-side companion state (per `plan.md` Companion operator-side edits and `quickstart.md` § Companion operator-side edit): grep `/workspaces/tetrad-development/.github/labels.yml` and `/workspaces/tetrad-development/docs/label-protocol.md` for both `waiting-for:merge-conflicts` and `completed:merge-conflicts`. If any of the four greps returns zero matches, note it in the PR body as a same-day operator TODO (does NOT block this PR — the plugin-local vocabulary decouples the two per D1/Q1=C).

## Dependencies & Execution Order

**Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5** (sequential phase boundaries).

**Within Phase 2**: T002, T003, T004 are all `[P]` — different files, no shared state. Run in parallel.

**Within Phase 3**: T005 → T006 → T007 → T008 → T009 → T010 → T011 must run **sequentially**. All seven tasks edit the same file (`auto.md`) at different sections. Parallelizing would cause merge conflicts on the shared file. Execute in the listed order (top-of-file to bottom-of-file: § Dispatch table (T005) → § Dispatch prose (T006/T007/T008) → § Gate contract table (T009) → § Gate contract prose (T010) → § Action + outcome vocabulary (T011)) to keep the running diff coherent.

**Within Phase 4**: T012 must precede T013/T014/T015 (T012 creates the describe block the assertions live in). T013, T014, T015 target distinct assertion blocks within the same file — technically appendable in sequence but they touch the same file so keep them sequential to avoid interleaving.

**Within Phase 5**: T016, T017, T018 are all `[P]` (independent read-only checks). T019 depends on Phase 4 completion (needs the assertions). T020 is `[P]` with T016/T017/T018 (reads a different repo) but pragmatically run last so its outcome informs the PR body.

**Parallel opportunities**:
- Phase 2: T002 || T003 || T004 (three independent new files).
- Phase 5: T016 || T017 || T018 || T020 (four independent read-only checks; T019 is separate — it depends on T012–T015).

**Critical path**: T001 → (T002/T003/T004 in parallel) → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T019 → (T016/T017/T018/T020 in parallel).

**Story mapping**: All twenty tasks serve US1 — the single implicit story (cockpit auto-mode never silently stalls on `waiting-for:*`). No cross-story parallelism at the task level; parallelism is intra-phase across independent files/edits.
