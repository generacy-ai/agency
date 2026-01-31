# Tasks: C3: Implement copy_template tool

**Input**: Design documents from `/specs/157-c3-implement-copy-template/`
**Prerequisites**: plan.md (required), spec.md (required), research.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story/acceptance criterion this task belongs to

## Phase 1: Setup & Tests

- [x] T001 Create test file `packages/agency-plugin-spec-kit/tests/tools/copy-template.test.ts` with test scaffolding
- [x] T002 [P] Write tests for single template copy (spec, plan, tasks)
- [x] T003 [P] Write tests for checklist template (checklists/ subdirectory handling)
- [x] T004 [P] Write tests for agent-file template (repo root destination)
- [x] T005 [P] Write tests for multiple templates in single call
- [x] T006 Write tests for custom dest_filename (single template only)
- [x] T007 Write tests for error cases (dest_filename with multiple templates, missing template, no feature_dir)

## Phase 2: Core Implementation

- [x] T008 Create `packages/agency-plugin-spec-kit/src/tools/copy-template.ts` with template mapping constant
- [x] T009 Implement `resolveTemplatePath()` helper to find template source files using config.paths.templates
- [x] T010 Implement `resolveDestinationPath()` helper for template-specific destination logic
- [x] T011 Implement main `execute()` function with input validation (dest_filename + multiple templates check)
- [x] T012 Add directory creation logic using `mkdir` utility for parent directories
- [x] T013 Add skip-if-exists behavior with tracking for output

## Phase 3: Integration & Export

- [x] T014 Export `createCopyTemplateTool` from `packages/agency-plugin-spec-kit/src/tools/index.ts`
- [x] T015 Register tool in plugin initialization if not auto-registered
- [x] T016 Run tests to verify all scenarios pass

## Dependencies & Execution Order

**Sequential dependencies**:
- T001 must complete before T002-T007 (test file must exist)
- T008 must complete before T009-T013 (module file must exist)
- T009-T010 must complete before T011 (helpers needed by execute)
- T011-T013 must complete before T014-T016 (implementation before export)

**Parallel opportunities**:
- T002, T003, T004, T005 can run in parallel (independent test cases)
- T009 and T010 can run in parallel (independent helper functions)

**Phase boundaries**:
- Phase 1 (tests) can start immediately
- Phase 2 (implementation) can start after T001 completes
- Phase 3 (integration) requires Phase 2 completion
