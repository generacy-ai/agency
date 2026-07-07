# Tasks: Align `/cockpit:queue` slash command to two-argument CLI contract

**Input**: Design documents from `/specs/380-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, contracts/queue-command.contract.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

**Scope note**: This feature edits exactly one file — `packages/claude-plugin-cockpit/commands/queue.md`. Because the eight rewrite tasks (T001–T008) all touch the same file, they are sequential (no `[P]` markers). Local verification greps (T010–T014) inspect the same file post-edit but can run in parallel with each other. Manual smoke-test tasks (T020+) require a Claude Code session with the plugin installed and are executed after commit.

## Phase 1: Rewrite queue.md (eight sequential edits, same file)

All edits target `packages/claude-plugin-cockpit/commands/queue.md`. Canonical strings are in `contracts/queue-command.contract.md` (referenced as "contract §N" below). Apply edits top-down to keep line references stable.

- [ ] T001 [US1] **Edit 1 — Frontmatter**: Replace lines 1–7 of `packages/claude-plugin-cockpit/commands/queue.md` with the two-entry `arguments:` block from contract §1. Order: `epic-ref` first (with the opaque-ref description referencing generacy#822), `phase` second. Both `required: true`. Update the `description:` line to the confirm-gated-wrapper sentence in contract §1. FR-001, FR-010.

- [ ] T002 [US1] **Edit 2 — Description sentence (H1 body)**: In `packages/claude-plugin-cockpit/commands/queue.md`, replace the paragraph immediately under `# Queue Command` (currently line 11 — `Confirm-gated wrapper over \`generacy cockpit queue <phase>\`...`) with the exact block from contract §2. Must reference `<epic-ref> <phase>`, name the two effects (assign + label), mention `--yes`, and end with the `**Queued:** <phase> (<epic-ref>)` header form.

- [ ] T003 [US2] **Edit 3 — Instructions §1 (tokenization gate)**: In `packages/claude-plugin-cockpit/commands/queue.md`, replace the three-bullet gate at lines 21–24 with the two-bullet gate from contract §3. New behavior: zero, one, or three-plus tokens all emit `Usage: /cockpit:queue <epic-ref> <phase>` and exit non-zero; exactly two tokens are captured byte-for-byte as `<epic-ref>` (first) and `<phase>` (second). No validation / parse / normalize / lowercase / expand / punct-strip on either token. FR-002.

- [ ] T004 [US1] **Edit 4 — Instructions §2 (`AskUserQuestion`)**: In `packages/claude-plugin-cockpit/commands/queue.md`, replace the `question:` line (currently ``Run `generacy cockpit queue <phase>`?``) with the action-describing question from contract §4: ``Assign phase `<phase>`'s issues of `<epic-ref>` to the cluster account and add label `process:speckit-feature`?``. Also change the `Confirm` option's description from `"Run the CLI"` to `"Run the CLI with --yes"`. Keep `header: Queue phase`, `multiSelect: false`, and option order (`Confirm` then `Cancel`) unchanged. FR-003.

- [ ] T005 [US1] **Edit 5 — Instructions §3 (Cancelled message)**: In `packages/claude-plugin-cockpit/commands/queue.md`, replace the affirmative-test step (currently line 32) so the emitted line reads `Cancelled: /cockpit:queue <epic-ref> <phase>` (both tokens interpolated). Full replacement text in contract §5. FR-004.

- [ ] T006 [US1] **Edit 6 — Instructions §4 (Bash invocation + `--yes` note)**: In `packages/claude-plugin-cockpit/commands/queue.md`, replace step 4's invocation string `generacy cockpit queue <phase>` with `generacy cockpit queue <epic-ref> <phase> --yes`. Remove the now-false `Pass no flags.` sentence and add the inline HTML comment from contract §6 documenting the `--yes` sole-gate policy (references Claude Code Bash tool being non-interactive / no TTY). FR-005, FR-008.

- [ ] T007 [US1] **Edit 7 — Instructions §5 (success header)**: In `packages/claude-plugin-cockpit/commands/queue.md`, replace `**Queued:** <phase>` in the success rendering step (currently line 34) with `**Queued:** <phase> (<epic-ref>)`. No other change to that step; stdout still renders verbatim in a fenced block with no footer. FR-006.

- [ ] T008 [US1, US2] **Edit 8 — Examples section**: In `packages/claude-plugin-cockpit/commands/queue.md`, replace both paragraphs of the `## Examples` section (currently lines 47–49) with the two-paragraph block in contract §9. Primary example: `/cockpit:queue 1 P1` (two args). Zero-arg example updated with the new `Usage:` line and a mention that one-token and three-plus-token calls emit the same usage line. Remove the single-arg `/cockpit:queue plan` example. FR-009.

- [ ] T009 [US1, US2] **Edit hygiene sweep — do NOT touch error-handling block**: Confirm the `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block (currently lines 37–43), the `Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling` marker, and the three list items (MISSING_BINARY / AUTH_FAILURE / OTHER) are byte-identical with the pre-edit file. If any edit above leaked into this zone, revert those lines. FR-007. See research.md Decision 5 and #378 byte-identical invariant.

## Phase 2: Local deterministic verification (grep-based)

Run these from the repo root after Phase 1. T010–T013 are read-only inspections of the same file and can run in parallel. T014 depends on `commands/status.md` being present (it is) and is also parallelizable.

- [ ] T010 [P] [US2] **V1 — new usage line present**: Run `grep -c "Usage: /cockpit:queue <epic-ref> <phase>" packages/claude-plugin-cockpit/commands/queue.md`. Expected: `2` or more (one in the tokenization gate at Instructions §1, one in the Examples section). FR-002, FR-009.

- [ ] T011 [P] [US1] **V2 — CLI invocation carries both positionals AND `--yes`**: Run `grep -c "generacy cockpit queue <epic-ref> <phase> --yes" packages/claude-plugin-cockpit/commands/queue.md`. Expected: `1` or more. Repetitions in the Examples with concrete values (e.g. `generacy cockpit queue 1 P1 --yes`) are fine. FR-005, FR-008.

- [ ] T012 [P] [US1, US2] **V3 — no stale one-argument surface remains**: Run each of these four greps against `packages/claude-plugin-cockpit/commands/queue.md`:
   ```bash
   grep -n "Usage: /cockpit:queue <phase>" packages/claude-plugin-cockpit/commands/queue.md
   grep -n 'Run `generacy cockpit queue <phase>`' packages/claude-plugin-cockpit/commands/queue.md
   grep -nE "\*\*Queued:\*\* <phase>[^ ]" packages/claude-plugin-cockpit/commands/queue.md
   grep -n 'Cancelled: /cockpit:queue <phase>[^ ]' packages/claude-plugin-cockpit/commands/queue.md
   ```
   Expected: no output from any of the four. Any hit is stale pre-fix copy that must be edited (jump back to the corresponding T00N task).

- [ ] T013 [P] [US1] **Frontmatter arg-order sanity**: Run `grep -c "required: true" packages/claude-plugin-cockpit/commands/queue.md` — expected `2`. Then `grep -n "^  - name:" packages/claude-plugin-cockpit/commands/queue.md` — expected two matches with `epic-ref` on the earlier line, `phase` on the later. Contract §1.

- [ ] T014 [P] [US1] **V4 — error-handling block byte-identical with sibling**: Run:
   ```bash
   diff \
     <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/queue.md) \
     <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/status.md)
   ```
   Expected: no output. Any diff means an accidental edit inside the untouched zone — revert to match `status.md` (or any sibling from the #378 sweep). FR-007.

## Phase 3: Commit
<!-- Phase boundary: All Phase 2 verifications must pass before committing. -->

- [ ] T015 [US1, US2] **Stage and commit**: `git add packages/claude-plugin-cockpit/commands/queue.md`, verify `git status` shows exactly one modified file under `packages/claude-plugin-cockpit/commands/`, then commit with message `fix: #380 align /cockpit:queue slash command to two-argument CLI contract`. Do NOT push yet — the manual smoke test in Phase 4 may reveal issues that need amending (or, more likely, a follow-up commit).

## Phase 4: Manual smoke tests (require a Claude Code session with the plugin installed)
<!-- Phase boundary: T015 must be committed so the plugin loads the fixed queue.md. -->

Prerequisites for this phase (from quickstart.md § Prerequisites):
- Claude Code session with `@generacy-ai/claude-plugin-cockpit` plugin installed (either locally linked from this checkout, or from a preview publish).
- `generacy` CLI on `$PATH` in that session's shell.
- Write access to `christrudelpw/sniplink` (or a comparable test epic) with phase-1 issues open.

- [ ] T020 [US1] **SC-001 primary path — reach confirm gate**: In a Claude Code session, `cd` to the `christrudelpw/sniplink` checkout. Run `/cockpit:queue 1 P1`. Pass criterion: the `AskUserQuestion` gate shows with the literal question ``Assign phase `P1`'s issues of `1` to the cluster account and add label `process:speckit-feature`?`` and NO usage error at step 1. Cancel out at this point (don't run the CLI yet).

- [ ] T021 [US1] **SC-002 Confirm path — CLI runs and issues update**: Re-run `/cockpit:queue 1 P1` and select `Confirm`. Pass criteria: (a) CLI stdout appears under `**Queued:** P1 (1)` in a triple-backtick fenced block, (b) run `gh issue list --repo christrudelpw/sniplink --label process:speckit-feature --assignee @me` and expect three P1 issues listed, all assigned to `@me` with the `process:speckit-feature` label.

- [ ] T022 [US1] **Cancel path — no CLI call**: Re-run `/cockpit:queue 1 P1`, select `Cancel`. Expected single-line output: `Cancelled: /cockpit:queue 1 P1`. Verify with `gh issue list` that no assignee/label state changed. FR-004.

- [ ] T023 [US2] **SC-003 usage-line paths**: In the same session, run three invocations:
   - `/cockpit:queue` → expect literal `Usage: /cockpit:queue <epic-ref> <phase>`. No prompt. No CLI call.
   - `/cockpit:queue P1` → same usage line. No prompt. No CLI call.
   - `/cockpit:queue 1 P1 extra` → same usage line. No prompt. No CLI call.
   FR-002.

- [ ] T024 [US1] **SC-004 error-class parity — MISSING_BINARY**: In a shell where `generacy` is NOT on `$PATH` (e.g. temporarily rename or `PATH=/tmp`), run `/cockpit:queue 1 P1` → `Confirm`. Expected: the printed remedy matches `packages/claude-plugin-cockpit/README.md § Error Handling § MISSING_BINARY` verbatim. Confirms #378's byte-identical fix is intact. FR-007.

- [ ] T025 [US1] **SC-004 error-class parity — AUTH_FAILURE**: With `GH_TOKEN=""` (or after `gh auth logout`), run `/cockpit:queue 1 P1` → `Confirm`. Expected: exact line `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.` (Re-authenticate with `gh auth login` afterwards.) FR-007.

- [ ] T026 [US1] **SC-004 error-class parity — OTHER**: Force any other CLI failure (e.g. an invalid phase: `/cockpit:queue 1 ZZ`) → `Confirm`. Expected: `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced block. FR-007.

## Phase 5: PR
<!-- Phase boundary: All Phase 4 smoke tests must pass before opening the PR. -->

- [ ] T030 **Push and open PR**: `git push -u origin 380-found-during-cockpit-v1`, then `gh pr create --base develop --title "fix: #380 align /cockpit:queue slash command to two-argument CLI contract"` with a body that (a) links to spec.md, (b) references clarification Q1 (`--yes` sole-gate policy), (c) links to [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #6, and (d) lists the four V1–V4 grep results plus the SC-001/SC-002/SC-003/SC-004 outcomes from Phase 4.

## Dependencies & Execution Order

**Within Phase 1 (all edit the same file → sequential)**:
- T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 (hygiene sweep).

**Phase 2 (verification greps, read-only on same file)**:
- T010, T011, T012, T013, T014 are all `[P]` — no shared write path, no data dependencies. Any failure kicks work back to the corresponding Phase 1 task (V1/T012 hits ⇒ re-run one of T001–T008; V4/T014 diff ⇒ T009 reverts).

**Phase boundaries (sequential across phases)**:
- Phase 1 → Phase 2 (edits must land before greps can inspect the file)
- Phase 2 → Phase 3 (all four greps must pass before commit)
- Phase 3 → Phase 4 (commit must land so the plugin loads the fixed queue.md)
- Phase 4 → Phase 5 (all seven smoke checks — SC-001, SC-002, cancel, three SC-003 cases, three SC-004 cases — must pass before push/PR)

**Parallel opportunities**:
- Phase 2 verifications T010, T011, T012, T013, T014 run concurrently.
- Phase 4 smoke tests T023 (usage) and T024–T026 (error classes) can run in either order relative to T020–T022 (they don't mutate the epic's issue state). T021 must precede any re-run that expects the P1 issues to already be assigned.

## Grouping strategy for issue creation

Default (`per-story`) is fine for this feature. Both user stories (US1: happy path + confirm; US2: usage messages) touch the same file, so if per-task issue creation is desired later, add the `epic-grouping:per-task` label before running `/speckit:taskstoissues`.

---

*Generated by /tasks for issue [generacy-ai/agency#380](https://github.com/generacy-ai/agency/issues/380)*
