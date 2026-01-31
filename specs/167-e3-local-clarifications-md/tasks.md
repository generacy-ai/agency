# Tasks: E3 Local clarifications.md read/write

**Input**: Design documents from `/specs/167-e3-local-clarifications-md/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, research.md
**Status**: All tasks verified complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which acceptance criterion this task verifies

## Context

The implementation already exists in `packages/agency-plugin-spec-kit`. These tasks verify the existing code meets all acceptance criteria.

## Phase 1: Verification Setup

- [X] T001 Build the speckit package (`packages/agency-plugin-spec-kit`)
- [X] T002 [P] Run existing tests to establish baseline (`pnpm test` in package)

## Phase 2: Type Verification

- [X] T010 [AC1] Verify `src/types/clarification.ts` exports all required interfaces
- [X] T011 [P] [AC1] Verify `ClarificationQuestion` interface matches spec requirements
- [X] T012 [P] [AC1] Verify `ClarificationBatch` interface with timestamp support
- [X] T013 [P] [AC1] Verify `ClarificationStatus` enum with PENDING/ANSWERED values

## Phase 3: Parser Function Verification

- [X] T020 [AC2] Verify `parseClarificationsFile()` correctly parses markdown format
- [X] T021 [P] [AC3] Verify `formatQuestion()` generates correct markdown output
- [X] T022 [P] [AC3] Verify `formatBatch()` generates correct markdown with headers
- [X] T023 [AC4] Verify batch timestamps use `generateBatchTimestamp()` format
- [X] T024 [AC5] Verify `nextQuestionNumber` tracking across multiple batches
- [X] T025 [AC6] Verify parser handles malformed/empty files gracefully

## Phase 4: Utility Function Verification

- [X] T030 [AC5] Verify `countQuestions()` returns correct pending/total counts
- [X] T031 [P] Verify `findQuestion()` locates questions by number across batches
- [X] T032 [P] Verify `updateAnswerInContent()` updates answers in-place

## Phase 5: Integration Verification

- [X] T040 Test MCP tool `manage_clarifications` with `read` operation
- [X] T041 [P] Test MCP tool with `append` operation (new batch creation)
- [X] T042 [P] Test MCP tool with `update_answer` operation
- [X] T043 Verify exports in `src/utils/index.ts` include all clarification utilities

## Phase 6: Acceptance Criteria Sign-off

- [X] T050 [AC1] Confirm `src/utils/clarifications.ts` equivalent exists (as `clarification-parser.ts`)
- [X] T051 [AC2] Confirm parsing clarifications.md format works correctly
- [X] T052 [AC3] Confirm generating clarifications.md from structured data works
- [X] T053 [AC4] Confirm question batches with timestamps are supported
- [X] T054 [AC5] Confirm question numbers are tracked across batches
- [X] T055 [AC6] Confirm malformed files are handled gracefully

## Dependencies & Execution Order

**Phase dependencies**:
- Phase 1 (build/test) must complete before verification phases
- Phases 2-4 can run in parallel (type, parser, utility verification)
- Phase 5 requires Phases 2-4 to confirm underlying implementation
- Phase 6 (sign-off) requires all other phases complete

**Parallel opportunities**:
- Within Phase 2: T011, T012, T013 can run in parallel
- Within Phase 3: T021, T022 can run in parallel
- Within Phase 4: T031, T032 can run in parallel
- Within Phase 5: T041, T042 can run in parallel

**Key files**:
- `packages/agency-plugin-spec-kit/src/types/clarification.ts`
- `packages/agency-plugin-spec-kit/src/utils/clarification-parser.ts`
- `packages/agency-plugin-spec-kit/src/tools/manage-clarifications.ts`
- `packages/agency-plugin-spec-kit/src/utils/index.ts`

## Acceptance Criteria Reference

| Code | Criterion |
|------|-----------|
| AC1 | Create `src/utils/clarifications.ts` |
| AC2 | Parse clarifications.md format |
| AC3 | Generate clarifications.md from structured data |
| AC4 | Support question batches with timestamps |
| AC5 | Track question numbers across batches |
| AC6 | Handle malformed files gracefully |
