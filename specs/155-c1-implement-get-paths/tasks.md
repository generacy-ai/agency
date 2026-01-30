# Tasks: C1: Implement get_paths tool

**Input**: Design documents from `/specs/155-c1-implement-get-paths/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Foundation - Utility Functions

- [ ] T001 [P] Create `src/utils/fs.ts` with file system utilities (`exists`, `findRepoRoot`, `readDir`)
- [ ] T002 [P] Create `src/utils/git.ts` with git utilities (`isGitRepo`, `getCurrentBranch`)
- [ ] T003 Update `src/utils/index.ts` to export new utility modules

## Phase 2: Core Implementation

- [ ] T004 Create `src/tools/get-paths.ts` with `createGetPathsTool` factory function
- [ ] T005 Implement path resolution logic (SPECIFY_FEATURE → branch → extract name → build paths)
- [ ] T006 Add config-based file name customization support (specDirectory, fileNames, directoryNames)
- [ ] T007 Implement error handling (FEATURE_DIR_NOT_FOUND, INVALID_BRANCH_NAME)
- [ ] T008 Update `src/tools/index.ts` to export the new tool

## Phase 3: Testing

- [ ] T009 [P] Create `tests/utils/fs.test.ts` with unit tests for fs utilities
- [ ] T010 [P] Create `tests/utils/git.test.ts` with unit tests for git utilities
- [ ] T011 Create `tests/tools/get-paths.test.ts` with unit tests for the tool:
  - Test explicit branch parameter
  - Test SPECIFY_FEATURE env var override
  - Test current branch detection
  - Test invalid branch name handling
  - Test missing repo root handling
  - Test config-based file name customization

## Phase 4: Integration & Verification

- [ ] T012 Run full test suite and fix any failures
- [ ] T013 Build package and verify no TypeScript errors
- [ ] T014 Manual verification: test tool with actual git branch

## Dependencies & Execution Order

**Phase 1 → Phase 2**: Utility functions must exist before the tool can use them.
- T001 and T002 can run in parallel (no shared dependencies)
- T003 depends on T001 and T002 completion

**Phase 2 → Phase 3**: Core implementation must be complete before writing tests.
- T004 → T005 → T006 → T007 → T008 (sequential within phase)

**Phase 3 → Phase 4**: Tests must pass before final verification.
- T009 and T010 can run in parallel (different files)
- T011 depends on T009, T010 (needs utility functions tested first)

**Phase 4**: Final verification
- T012 → T013 → T014 (sequential)

## Parallel Opportunities

| Phase | Parallel Tasks | Reason |
|-------|----------------|--------|
| 1 | T001, T002 | Different files, no dependencies |
| 3 | T009, T010 | Different test files, testing independent utilities |
