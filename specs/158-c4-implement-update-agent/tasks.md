# Tasks: C4: Implement update_agent tool

**Input**: Design documents from `/specs/158-c4-implement-update-agent/`
**Prerequisites**: plan.md (required), spec.md (required), research.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup & Types

- [X] T001 Create `src/types/agent.ts` with AgentType enum and AGENT_CONFIGS registry
- [X] T002 [P] Export agent types from `src/types/index.ts`

## Phase 2: Core Implementation

- [X] T003 Create `src/tools/update-agent.ts` with tool scaffold and factory function
- [X] T004 Implement `extractTechnologies()` function to parse plan.md content
- [X] T005 Implement `updateAgentContent()` function with marker-based injection
- [X] T006 Implement `updateAgentContent()` header-based fallback when no markers present
- [X] T007 Implement file creation logic with template support (`create_if_missing`)
- [X] T008 Implement `updateAllAgents()` to scan for existing agent files
- [X] T009 Wire up complete tool execute function with error handling

## Phase 3: Integration

- [X] T010 Export `createUpdateAgentTool` from `src/tools/index.ts`
- [X] T011 Register tool in `createTools` function (main plugin entry)

## Phase 4: Tests

- [X] T012 [P] Create `tests/tools/update-agent.test.ts` test file scaffold
- [X] T013 [P] Add unit tests for technology extraction from plan.md
- [X] T014 Add unit tests for content update with markers
- [X] T015 Add unit tests for content update without markers (header fallback)
- [X] T016 [P] Add unit tests for file creation from template
- [X] T017 [P] Add unit tests for file creation without template
- [X] T018 Add integration test for full tool execution
- [X] T019 Add error case tests (missing files, write failures)

## Dependencies & Execution Order

**Phase dependencies:**
- Phase 1 → Phase 2 (types must exist before implementation)
- Phase 2 → Phase 3 (tool must be implemented before export)
- Phase 2 → Phase 4 (implementation needed for testing)

**Parallel opportunities:**
- T001, T002: Can run in parallel (different files)
- T012, T013, T016, T017: Test scaffolding/setup can be parallelized
- T014, T015: Sequential (T015 tests fallback to T014's approach)

**Critical path:**
T001 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011

**Test execution:**
Tests can be written incrementally as each feature is implemented, following TDD approach if preferred.
