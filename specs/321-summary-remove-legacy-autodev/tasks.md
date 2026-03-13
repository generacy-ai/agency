# Tasks: Remove Legacy Autodev References

**Input**: Design documents from `/specs/321-summary-remove-legacy-autodev/`
**Prerequisites**: plan.md (required), spec.md (required), research.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Source Code & Config

- [X] T001 [US1] Update JSDoc example in `packages/agency-extension/src/types/plugin.ts` line 10 — change `'autodev'` to `'speckit'`
- [X] T002 [P] [US1] Delete `.claude/autodev.json` configuration file

## Phase 2: Command Markdown Cleanup

- [X] T003 [P] [US1] Replace `/autodev:start` → `/speckit:start` and `/autodev:continue` → `/speckit:continue` in `packages/claude-plugin-agency-spec-kit/commands/analyze.md`
- [X] T004 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/claude-plugin-agency-spec-kit/commands/checklist.md`
- [X] T005 [P] [US1] Replace `/autodev:*` → `/speckit:*` and "autodev workflow" → "speckit workflow" in `packages/claude-plugin-agency-spec-kit/commands/clarify.md`
- [X] T006 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/claude-plugin-agency-spec-kit/commands/constitution.md`
- [X] T007 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/claude-plugin-agency-spec-kit/commands/implement.md`
- [X] T008 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/claude-plugin-agency-spec-kit/commands/plan.md`
- [X] T009 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/claude-plugin-agency-spec-kit/commands/specify.md`
- [X] T010 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/claude-plugin-agency-spec-kit/commands/tasks.md`
- [X] T011 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/claude-plugin-agency-spec-kit/commands/taskstoissues.md`
- [X] T012 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/agency-plugin-spec-kit/commands/analyze.md`
- [X] T013 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/agency-plugin-spec-kit/commands/checklist.md`
- [X] T014 [P] [US1] Replace `/autodev:*` → `/speckit:*` and "autodev workflow" → "speckit workflow" in `packages/agency-plugin-spec-kit/commands/clarify.md`
- [X] T015 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/agency-plugin-spec-kit/commands/constitution.md`
- [X] T016 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/agency-plugin-spec-kit/commands/implement.md`
- [X] T017 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/agency-plugin-spec-kit/commands/plan.md`
- [X] T018 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/agency-plugin-spec-kit/commands/specify.md`
- [X] T019 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/agency-plugin-spec-kit/commands/tasks.md`
- [X] T020 [P] [US1] Replace `/autodev:*` → `/speckit:*` in `packages/agency-plugin-spec-kit/commands/taskstoissues.md`

## Phase 3: Documentation

- [X] T021 [US1] Update `packages/claude-plugin-agency-spec-kit/README.md` — replace any active `autodev` references with `speckit`

## Phase 4: Verification

- [X] T022 [US1] Run `pnpm build` and confirm clean exit
- [X] T023 [US1] Run `grep -r "autodev" --include="*.ts" --include="*.md" packages/ | grep -v specs/` and confirm zero results
- [X] T024 [US1] Confirm `.claude/autodev.json` no longer exists

## Dependencies & Execution Order

- **T001 and T002** are independent and can run in parallel
- **T003–T020** are all independent of each other (different files) and can run in parallel; no dependency on Phase 1
- **T021** is independent of other phases but logically grouped with documentation
- **T022–T024** must run after all other tasks complete (verification depends on all changes being in place)
- **Phases 1–3 can run in parallel**; Phase 4 must wait for Phases 1–3 to complete
