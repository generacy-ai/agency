# Tasks: B3 - Implement git_ops tool

**Input**: Design documents from `/specs/152-b3-implement-git-ops/`
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

- [ ] T001 Create `src/tools/git-ops.ts` with tool skeleton and Zod input schema
- [ ] T002 [P] Add import and export for git-ops tool in `src/tools/index.ts`

## Phase 2: Core Implementation

- [ ] T010 Implement `current_branch` operation using `simple-git`
- [ ] T011 Implement `status` operation returning `{ clean, staged, unstaged, untracked }`
- [ ] T012 Implement `checkout` operation with branch_name validation
- [ ] T013 Implement `create_branch` operation with branch_name validation
- [ ] T014 Implement `fetch` operation with `fetch_all` and `prune` options

## Phase 3: Error Handling & Validation

- [ ] T020 Add Zod validation for operation-specific required params (branch_name for create_branch/checkout)
- [ ] T021 [P] Add error handling with `createError()` using `GIT_OPERATION_FAILED` code
- [ ] T022 [P] Add cwd parameter handling with fallback to `process.cwd()`

## Phase 4: Testing & Polish

- [ ] T030 Add unit tests for all git operations (mock simple-git)
- [ ] T031 [P] Test error scenarios (invalid branch names, git failures)
- [ ] T032 Verify tool registration and build passes

## Dependencies & Execution Order

**Phase 1**: T001 must complete before T010-T014 (creates the file). T002 can run in parallel.

**Phase 2**: T010-T014 can run in any order (each operation is independent). Start with T010/T011 (simplest operations) for faster feedback.

**Phase 3**: T020-T022 can all run in parallel after Phase 2. They refine the implementation.

**Phase 4**: T030 depends on Phase 2 completion. T031 can run in parallel with T030. T032 is final verification.

**Recommended execution**:
1. T001 → T002 (parallel)
2. T010 → T011 → T012 → T013 → T014 (sequential, building complexity)
3. T020, T021, T022 (parallel)
4. T030 → T031 (parallel) → T032
