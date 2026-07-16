# Tasks: Auto-emit playbook-verification re-pin task in `/tasks`

**Input**: Design documents from `/specs/427-summary-packages-claude-plugin/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = /tasks emitter, US2 = CLAUDE.md coupling, US3 = validate-first-run outcome — verified via SC-001 downstream)

## Phase 1: Core — prompt edits

The primary artifact is the `/tasks` skill prompt. Two files must stay byte-identical (SC-005, FR-007); therefore T001 and T002 cannot run in parallel (T002 copies the exact text T001 lands on). CLAUDE.md is independent of the two skill files and can be edited in parallel with them.

- [X] **T001** [US1] Edit `packages/agency-plugin-spec-kit/commands/tasks.md` to add a "Playbook coupling — mandatory verification task" rule inside Step 1 "Check Prerequisites" step 3 (task organization rules). The rule must instruct the model that when `spec.md` names any path matching `packages/claude-plugin-cockpit/commands/*.md`, `tasks.md` MUST include a task that:
  - names `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`,
  - lists every matched `commands/*.md` path under "Files edited by this issue",
  - enumerates pin sites found at `/tasks` time by grepping the test file for `extractSubheadingBlock`, `extractInstructionsSteps`, `readFileSync(AUTO_MD_PATH)`, `readFileSync(resolve(COMMANDS_DIR, ...))`, and `readdirSync(COMMANDS_DIR)`,
  - filters those sites to ones that read the edited file(s) (with the sweep at `:515` covering every playbook),
  - states re-pinning means updating the assertion to the **NEW** contract,
  - contains the sentence "Do NOT weaken or delete an assertion to make the test pass" (or equivalent anti-relaxation guidance).

  Canonical task shape to program the prompt to emit (from plan.md "The emitted task text"): see plan.md §"Edit sites" for the exact template.

  **Verifies**: FR-001, FR-002, FR-005, FR-006, FR-007 (this file half).

- [X] **T002** [US1] Mirror T001 into `packages/claude-plugin-agency-spec-kit/commands/tasks.md`. Copy the edited T001 file byte-for-byte over the mirror, then run `diff packages/agency-plugin-spec-kit/commands/tasks.md packages/claude-plugin-agency-spec-kit/commands/tasks.md` — expected: empty output.

  **Dependency**: Must run after T001.
  **Verifies**: FR-007 (mirror half), SC-005.

- [X] **T003** [P] [US2] Add a short "## Cockpit playbook pins" section to root `CLAUDE.md` (~5–10 lines, keep total file well under 200 lines). Section must:
  - name `packages/claude-plugin-cockpit/commands/auto.md`,
  - name `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`,
  - describe the coupling (test pins headings and loop-shape contracts by exact string),
  - prescribe re-pinning to the NEW contract as the correct response to a broken pin, and forbid weakening/deleting the assertion,
  - mention that the rule applies to every `commands/*.md` playbook, not only `auto.md`.

  **Parallel with T001/T002**: independent file.
  **Verifies**: FR-003, SC-004.

## Phase 2: Verification
<!-- Phase boundary: Complete Phase 1 (T001–T003) before starting Phase 2 -->

- [X] **T004** [P] [US1] Verify byte-identity: run
  ```bash
  diff packages/agency-plugin-spec-kit/commands/tasks.md \
       packages/claude-plugin-agency-spec-kit/commands/tasks.md
  ```
  Expected: empty output. If non-empty, resolve by choosing the more-recently-edited file as source of truth and copying it over the other, then re-run.

  **Verifies**: SC-005 (Scenario 4).

- [X] **T005** [P] [US2] Verify CLAUDE.md content: run
  ```bash
  grep -n "auto.md" CLAUDE.md
  grep -n "playbook-verification.test.ts" CLAUDE.md
  grep -n "re-pin" CLAUDE.md
  ```
  Expected: each returns ≥1 line.

  **Verifies**: SC-004 (Scenario 5).

- [ ] **T006** [manual] [US1] Historical-replay dogfood (Scenario 3 in quickstart.md): in a scratch working copy, point `/speckit:tasks` at the `spec.md` of a prior playbook-editing issue (e.g. #420 or #421) and confirm the generated `tasks.md` now contains at least one task naming `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` and listing pin sites. Also confirm the generated task text contains "Do NOT weaken or delete an assertion" (or equivalent).

  **Verifies**: SC-002, SC-003 (guidance-present half), and validates FR-001/FR-002/FR-005/FR-006 end-to-end.

## Dependencies & Execution Order

**Within Phase 1**:
- T001 must complete before T002 (T002 is a byte-copy of T001's output).
- T003 is independent of T001/T002 and can run in parallel with either.

**Between phases**:
- All of Phase 1 (T001, T002, T003) must complete before any Phase 2 task runs — Phase 2 verifies Phase 1's output.

**Within Phase 2**:
- T004 and T005 are file-independent one-liners and can run in parallel.
- T006 depends on T001 + T002 having landed (needs the emitter live in the skill file the local runtime loads).

**Parallel opportunities**:
- Phase 1: T003 alongside T001 (then T002 serialized after T001).
- Phase 2: T004 and T005 concurrently; T006 after (or alongside T004/T005 if the runtime picks up the edited skill without a reinstall).

**Out of scope for tasks**:
- No changes to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (spec §"Out of Scope").
- No changes to any `packages/claude-plugin-cockpit/commands/*.md` playbook (those are the trigger, not a target).
- SC-001 (validate-first-run success rate on the next batch) is measured downstream, not by a task here.

## Suggested next step

`/speckit:implement` to execute T001–T006 in order.
