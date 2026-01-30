# Tasks: C2: Implement check_prereqs tool

**Input**: Design documents from `/specs/156-c2-implement-check-prereqs/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup & Tests

- [ ] T001 Create test file `packages/agency-plugin-spec-kit/tests/tools/check-prereqs.test.ts` with test structure
- [ ] T002 [P] Write test cases for valid prerequisites (all required files exist)
- [ ] T003 [P] Write test cases for missing required files (spec.md, plan.md, tasks.md)
- [ ] T004 [P] Write test cases for available docs detection (optional files, contracts, checklists)
- [ ] T005 [P] Write test cases for edge cases (feature dir not found, invalid branch, include_tasks)

## Phase 2: Core Implementation

- [ ] T006 Create `packages/agency-plugin-spec-kit/src/tools/check-prereqs.ts` with tool factory function
- [ ] T007 Implement `CheckPrereqsParams` interface for type-safe parameters
- [ ] T008 Implement feature directory resolution using existing get-paths pattern
- [ ] T009 Implement required file validation (spec.md, plan.md, tasks.md with configurable flags)
- [ ] T010 Implement available docs detection (research.md, data-model.md, quickstart.md)
- [ ] T011 Implement contracts directory scanning (list .md files in contracts/)
- [ ] T012 Implement checklists directory scanning (list .md files in checklists/)
- [ ] T013 Implement `include_tasks` parameter behavior for optional tasks.md inclusion

## Phase 3: Integration

- [ ] T014 Add export to `packages/agency-plugin-spec-kit/src/tools/index.ts`
- [ ] T015 Run tests and verify all pass
- [ ] T016 Manual verification: test tool with CLI against real feature directory

## Dependencies & Execution Order

**Phase 1 (Setup & Tests)**:
- T001 must complete first (creates test file structure)
- T002-T005 can run in parallel (independent test cases)

**Phase 2 (Core Implementation)**:
- T006 must complete first (creates the tool file)
- T007 depends on T006 (adds interface to same file)
- T008-T013 can run mostly in parallel after T006-T007 (implement different features)
- T009 depends on T008 (needs feature dir to check files)

**Phase 3 (Integration)**:
- T014 depends on T006-T013 (needs completed implementation)
- T015 depends on T014 (needs exports to run tests)
- T016 depends on T015 (needs passing tests first)

**Parallel Opportunities**:
- T002, T003, T004, T005 (all test cases)
- T010, T011, T012, T013 (detection implementations after core is ready)
