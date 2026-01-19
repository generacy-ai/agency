# Tasks: Enhance humancy plugin for three-layer decision model

**Input**: Design documents from `/specs/036-enhance-humancy-plugin-three/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story/acceptance criteria this task addresses

## Phase 1: Schema Foundation

- [X] T001 [AC1] Create `src/types/three-layer.ts` with Recommendation, ProtegeRecommendation, HumanDecision, and ThreeLayerBreakdown interfaces and Zod schemas
- [X] T002 [P] [AC3] Create `src/types/decision-record.ts` with DecisionRecord, DecisionOutcome, and DecisionContext interfaces and Zod schemas
- [X] T003 [P] Update `src/types/index.ts` to export new types from three-layer.ts and decision-record.ts

## Phase 2: Request/Response Enhancement

- [X] T004 [AC1] Extend `src/types/requests.ts` with enhanced DecisionOption (tradeoffs), domain, decisionContext, and includeRecommendations fields
- [X] T005 [AC2] Extend `src/types/responses.ts` with decisionId, baseline, protege, and human fields for three-layer response

## Phase 3: Decision Storage

- [X] T006 [AC3] Create `src/storage/decision-store.ts` with in-memory DecisionStore class (store, get, update by decisionId)
- [X] T007 [P] Create `src/storage/index.ts` to export DecisionStore

## Phase 4: Tool Enhancement

- [X] T008 [AC1,AC2,AC4] Update `src/tools/request-decision.ts` to handle new optional parameters (domain, decisionContext, includeRecommendations) and return enhanced response with three-layer breakdown when requested
- [X] T009 Update `src/tools/index.ts` to inject DecisionStore dependency into request-decision tool

## Phase 5: New Tools

- [X] T010 [AC3] Create `src/tools/get-decision-outcome.ts` with tool to retrieve decision record by decisionId
- [X] T011 [P] [AC3] Create `src/tools/report-decision-result.ts` with tool to report outcome (success/failure/mixed) for a decision
- [X] T012 Update `src/tools/index.ts` to export new tools (get-decision-outcome, report-decision-result)
- [X] T013 Update `src/plugin.ts` to register new tools and manage DecisionStore lifecycle

## Phase 6: Testing

- [X] T014 [AC5] Create `src/__tests__/types/three-layer.test.ts` with unit tests for new Zod schemas
- [X] T015 [P] [AC5] Create `src/__tests__/storage/decision-store.test.ts` with unit tests for DecisionStore
- [X] T016 [AC4,AC5] Update `src/__tests__/tools/request-decision.test.ts` with tests for enhanced parameters and backward compatibility
- [X] T017 [P] [AC5] Create `src/__tests__/tools/get-decision-outcome.test.ts` with tests for outcome retrieval
- [X] T018 [P] [AC5] Create `src/__tests__/tools/report-decision-result.test.ts` with tests for outcome reporting

## Dependencies & Execution Order

**Sequential dependencies:**
- T003 requires T001 + T002 (type exports need types to exist)
- T004 + T005 can start after T001 (need three-layer types)
- T006 requires T002 (storage needs DecisionRecord types)
- T007 requires T006 (export needs store)
- T008 requires T004 + T005 + T006 (tool needs enhanced types and storage)
- T009 requires T006 + T008 (dependency injection needs both)
- T010 + T011 require T006 (new tools need storage)
- T012 requires T010 + T011 (exports need tools)
- T013 requires T009 + T012 (plugin needs all tools)
- T014 requires T001 + T002 (schema tests need schemas)
- T015 requires T006 (storage tests need storage)
- T016 requires T008 (tool tests need enhanced tool)
- T017 requires T010 (tests need tool)
- T018 requires T011 (tests need tool)

**Parallel opportunities:**
- Phase 1: T001, T002 can run in parallel (independent files)
- Phase 3: T007 can run after T006
- Phase 5: T010, T011 can run in parallel (independent tools)
- Phase 6: T014, T015, T017, T018 can run in parallel (independent test files)

**Critical path:** T001 → T004/T005 → T006 → T008 → T010/T011 → T013 → T016
