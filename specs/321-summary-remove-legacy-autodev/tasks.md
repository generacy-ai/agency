# Tasks: Remove Legacy Autodev References

**Input**: Design documents from `/specs/321-summary-remove-legacy-autodev/`
**Prerequisites**: plan.md (required), spec.md (required), research.md (available), clarifications.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Source Code & Config

- [ ] T001 [US1] Update JSDoc example in `packages/agency-extension/src/types/plugin.ts` line 10 — change `'autodev'` to `'speckit'`
- [ ] T002 [P] [US1] Delete `.claude/autodev.json` configuration file

## Phase 2: Command Markdown Cleanup

Remove stale `/autodev:start`, `/autodev:continue`, and "autodev workflow" references entirely from command markdown files (per clarification Q1 answer B — these commands don't exist, no replacement).

- [ ] T003 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/claude-plugin-agency-spec-kit/commands/analyze.md`
- [ ] T004 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/claude-plugin-agency-spec-kit/commands/checklist.md`
- [ ] T005 [P] [US1] Remove `/autodev:*` references and "autodev workflow" prose from `packages/claude-plugin-agency-spec-kit/commands/clarify.md`
- [ ] T006 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/claude-plugin-agency-spec-kit/commands/constitution.md`
- [ ] T007 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/claude-plugin-agency-spec-kit/commands/implement.md`
- [ ] T008 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/claude-plugin-agency-spec-kit/commands/plan.md`
- [ ] T009 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/claude-plugin-agency-spec-kit/commands/specify.md`
- [ ] T010 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/claude-plugin-agency-spec-kit/commands/tasks.md`
- [ ] T011 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/claude-plugin-agency-spec-kit/commands/taskstoissues.md`
- [ ] T012 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/agency-plugin-spec-kit/commands/analyze.md`
- [ ] T013 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/agency-plugin-spec-kit/commands/checklist.md`
- [ ] T014 [P] [US1] Remove `/autodev:*` references and "autodev workflow" prose from `packages/agency-plugin-spec-kit/commands/clarify.md`
- [ ] T015 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/agency-plugin-spec-kit/commands/constitution.md`
- [ ] T016 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/agency-plugin-spec-kit/commands/implement.md`
- [ ] T017 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/agency-plugin-spec-kit/commands/plan.md`
- [ ] T018 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/agency-plugin-spec-kit/commands/specify.md`
- [ ] T019 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/agency-plugin-spec-kit/commands/tasks.md`
- [ ] T020 [P] [US1] Remove `/autodev:*` references from "Post-Command Check" in `packages/agency-plugin-spec-kit/commands/taskstoissues.md`

## Phase 3: Documentation

- [ ] T021 [US1] Update `packages/claude-plugin-agency-spec-kit/README.md` — remove any active `autodev` references

## Phase 4: Verification

- [ ] T022 [US1] Run `pnpm build` and confirm clean exit
- [ ] T023 [US1] Run `grep -r "autodev" --include="*.ts" --include="*.md" packages/ | grep -v specs/` and confirm zero results
- [ ] T024 [US1] Confirm `.claude/autodev.json` no longer exists

## Dependencies & Execution Order

- **T001 and T002** are independent and can run in parallel
- **T003–T020** are all independent of each other (different files) and can run in parallel; no dependency on Phase 1
- **T021** is independent of other phases but logically grouped with documentation
- **T022–T024** must run after all other tasks complete (verification depends on all changes being in place)
- **Phases 1–3 can run in parallel**; Phase 4 must wait for Phases 1–3 to complete
