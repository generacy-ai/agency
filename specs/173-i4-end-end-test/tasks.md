# Tasks: End-to-End Test - Local Provider Flow

**Input**: Design documents from `/specs/173-i4-end-end-test/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

- [X] T001 Create integration test directory structure at `packages/agency-plugin-spec-kit/tests/integration/`
- [X] T002 Create `local-flow.test.ts` with test infrastructure (imports, temp directory setup, cleanup hooks)
- [X] T003 Add helper function `executeTool()` for MCP tool invocation pattern
- [X] T004 Add helper function `createMockCoreAPI()` for minimal core API mocking

## Phase 2: Core Test Implementation

- [X] T010 [P] Implement test: "creates local ticket with correct ID format" (LOCAL-NNN pattern)
- [X] T011 [P] Implement test: "retrieves ticket by ID" (validates get_ticket tool)
- [X] T012 Implement test: "persists tickets to .specify/local-tickets.json" (file I/O verification)
- [X] T013 Implement test: "ticket numbering increments correctly" (LOCAL-001, LOCAL-002, LOCAL-003)
- [X] T014 [P] Implement test: "retrieves ticket with flexible ref formats" (LOCAL-001, local-001, 001, 1)

## Phase 3: Advanced Scenarios

- [X] T020 Implement test: "full workflow works offline" (create_feature + create_ticket without network)
- [X] T021 [P] Implement test: "handles missing ticket with NotFoundError"
- [X] T022 [P] Implement test: "updates ticket state correctly" (open → in_progress → closed)
- [X] T023 Implement test: "multiple tickets in sequence maintain correct numbering"

## Phase 4: Edge Cases & Documentation

- [X] T030 [P] Implement test: "handles empty store initialization" (first ticket creates store)
- [X] T031 [P] Implement test: "handles ticket with body and labels"
- [X] T032 Add inline documentation comments explaining test patterns
- [X] T033 Verify all tests pass with `pnpm test tests/integration/local-flow.test.ts`

## Dependencies & Execution Order

**Sequential dependencies:**
- T001 → T002 → T003, T004 (setup must complete before helpers)
- T003, T004 → T010-T014 (helpers needed for all tests)
- Phase 2 → Phase 3 (core tests validate basic functionality first)
- All tests → T033 (verification runs last)

**Parallel opportunities:**
- T003 and T004 can run in parallel (independent helper functions)
- T010, T011, T014 can run in parallel (different test scenarios, no shared state)
- T021, T022 can run in parallel (independent error/state tests)
- T030, T031 can run in parallel (independent edge case tests)

**Test isolation:**
All tests use isolated temp directories via `beforeEach`/`afterEach` hooks, ensuring no shared state between test runs.
