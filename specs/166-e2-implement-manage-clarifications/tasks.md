# Tasks: E2 - Implement manage_clarifications Tool

**Input**: Design documents from `/specs/166-e2-implement-manage-clarifications/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which acceptance criteria this task addresses

## Phase 1: Type Definitions & Utilities

- [ ] T001 Add `ClarificationStatus` enum to `packages/agency-plugin-spec-kit/src/types/clarification.ts`
- [ ] T002 [P] Add status field to `ClarificationQuestion` interface in `packages/agency-plugin-spec-kit/src/types/clarification.ts`
- [ ] T003 [P] Add tool output types (`ReadClarificationsOutput`, `AppendClarificationsOutput`, `UpdateAnswerOutput`) to `packages/agency-plugin-spec-kit/src/types/clarification.ts`
- [ ] T004 Add error codes for clarification operations to `packages/agency-plugin-spec-kit/src/types/errors.ts`
- [ ] T005 [P] Export new types from `packages/agency-plugin-spec-kit/src/types/index.ts`
- [ ] T006 Create clarification parser utility at `packages/agency-plugin-spec-kit/src/utils/clarification-parser.ts`
- [ ] T007 [P] Export parser from `packages/agency-plugin-spec-kit/src/utils/index.ts`

## Phase 2: Core Tool Implementation

- [ ] T010 [AC1] Create tool file `packages/agency-plugin-spec-kit/src/tools/manage-clarifications.ts` with basic structure
- [ ] T011 [AC2] Implement `read` operation - parse clarifications.md and return structured data
- [ ] T012 [AC2] Implement `append` operation - add questions to clarifications.md
- [ ] T013 [AC2] Implement `update_answer` operation - update answer for a specific question
- [ ] T014 [AC3] Add Humancy integration for `append` operation (invoke `humancy.ask_question` or `humancy.request_decision`)
- [ ] T015 [AC4] Implement file path resolution using `get_paths` utility
- [ ] T016 [AC5] Add question status tracking (pending/answered)
- [ ] T017 [AC6] Support question batching with batch numbers and timestamps

## Phase 3: Integration & Testing

- [ ] T020 [AC1] Export tool from `packages/agency-plugin-spec-kit/src/tools/index.ts`
- [ ] T021 [AC1] Add tool to plugin's `createTools` function
- [ ] T022 Create unit tests at `packages/agency-plugin-spec-kit/tests/tools/manage-clarifications.test.ts`
- [ ] T023 [P] Test `read` operation with various clarifications.md states
- [ ] T024 [P] Test `append` operation with and without options
- [ ] T025 [P] Test `update_answer` operation
- [ ] T026 Test Humancy integration (mock Humancy tools)

## Phase 4: Package Configuration

- [ ] T030 Add `@generacy-ai/agency-plugin-humancy` as peer dependency in `packages/agency-plugin-spec-kit/package.json`

## Dependencies & Execution Order

**Phase 1 → Phase 2 → Phase 3 → Phase 4**

### Phase 1 parallelism:
- T001 must complete before T002 (status enum needed for status field)
- T002, T003, T005 can run in parallel
- T006 can start after T001, T002, T003 (needs type definitions)
- T007 can run in parallel with T006

### Phase 2 parallelism:
- T010 must complete first (tool structure)
- T011, T012, T013 depend on T010 but can be developed in parallel
- T014 depends on T012 (append operation)
- T015, T016, T017 can be integrated as T011-T013 are developed

### Phase 3 parallelism:
- T020, T021 depend on Phase 2 completion
- T022 depends on T020, T021
- T023, T024, T025, T026 can run in parallel after T022

### Phase 4:
- T030 can run independently but should be done after Phase 3

## Acceptance Criteria Mapping

| AC | Description | Tasks |
|----|-------------|-------|
| AC1 | Create `src/tools/clarifications.ts` | T010, T020, T021 |
| AC2 | Support operations: read, append, update_answer | T011, T012, T013 |
| AC3 | Integrate with Humancy plugin | T014 |
| AC4 | Store questions/answers in local clarifications.md | T015 |
| AC5 | Track question status (pending, answered) | T001, T002, T016 |
| AC6 | Support question batching | T017 |
