# Tasks: Update canonical workflow templates to use build.validate

**Input**: Design documents from `/specs/325-problem-canonical-workflow/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Core Implementation

- [X] T001 [P] [US1] Replace `run-lint` step with `run-validate` using `build.validate` in `packages/agency-plugin-spec-kit/workflows/speckit-feature.yaml` (lines 192–196)
- [X] T002 [P] [US1] Replace `run-lint` step with `run-validate` using `build.validate` in `packages/agency-plugin-spec-kit/workflows/speckit-bugfix.yaml` (lines 162–166)

## Phase 2: Verification

- [X] T003 [US1] Grep both workflow files to confirm no remaining `pnpm` references in verification phases
- [X] T004 [US2] Confirm `build.validate` is present in both templates
- [X] T005 [US1] Confirm `run-tests` step is preserved separately in both templates
- [X] T006 Verify both templates were updated identically (FR-004)

## Dependencies & Execution Order

- **T001 and T002** are independent and can run in parallel — they modify different files with the same transformation
- **T003–T006** depend on T001 and T002 completing first — they are verification checks
- **T003–T006** can all run in parallel with each other (read-only checks)

**Total tasks**: 6
**Phases**: 2 (Core Implementation, Verification)
**Parallel opportunities**: T001‖T002, T003‖T004‖T005‖T006
