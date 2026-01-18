# Tasks: Plugin: @generacy-ai/agency-plugin-humancy

**Input**: Design documents from `/specs/018-plugin-generacy-ai-agency/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Package Setup

- [x] T001 Create package.json with dependencies (`packages/agency-plugin-humancy/package.json`)
- [x] T002 [P] Create tsconfig.json extending base config (`packages/agency-plugin-humancy/tsconfig.json`)
- [x] T003 [P] Create src/index.ts entry point with exports (`packages/agency-plugin-humancy/src/index.ts`)

## Phase 2: Type Definitions

- [x] T010 Create connection types enum (`packages/agency-plugin-humancy/src/connection/types.ts`)
- [x] T011 [P] Create request types (DecisionRequest, ReviewRequest, etc.) (`packages/agency-plugin-humancy/src/types/requests.ts`)
- [x] T012 [P] Create response types (HumanResponse variants) (`packages/agency-plugin-humancy/src/types/responses.ts`)
- [x] T013 Create types index with exports (`packages/agency-plugin-humancy/src/types/index.ts`)

## Phase 3: Connection Mode Detection

- [x] T020 Implement ConnectionModeDetector class (`packages/agency-plugin-humancy/src/connection/detector.ts`)
- [x] T021 Create connection index with exports (`packages/agency-plugin-humancy/src/connection/index.ts`)
- [x] T022 Write connection mode detection tests (`packages/agency-plugin-humancy/src/__tests__/connection.test.ts`)

## Phase 4: Tool Implementation

- [x] T030 [US1] Implement humancy.ask_question tool (`packages/agency-plugin-humancy/src/tools/ask-question.ts`)
- [x] T031 [P] [US2] Implement humancy.request_review tool (`packages/agency-plugin-humancy/src/tools/request-review.ts`)
- [x] T032 [P] [US3] Implement humancy.request_decision tool (`packages/agency-plugin-humancy/src/tools/request-decision.ts`)
- [x] T033 [P] [US4] Implement humancy.notify tool (`packages/agency-plugin-humancy/src/tools/notify.ts`)
- [x] T034 Create tools index with exports (`packages/agency-plugin-humancy/src/tools/index.ts`)

## Phase 5: Tool Tests

- [x] T040 [US1] Write ask-question tool tests (`packages/agency-plugin-humancy/src/__tests__/tools/ask-question.test.ts`)
- [x] T041 [P] [US2] Write request-review tool tests (`packages/agency-plugin-humancy/src/__tests__/tools/request-review.test.ts`)
- [x] T042 [P] [US3] Write request-decision tool tests (`packages/agency-plugin-humancy/src/__tests__/tools/request-decision.test.ts`)
- [x] T043 [P] [US4] Write notify tool tests (`packages/agency-plugin-humancy/src/__tests__/tools/notify.test.ts`)

## Phase 6: Plugin Lifecycle

- [x] T050 Create plugin manifest (`packages/agency-plugin-humancy/src/manifest.ts`)
- [x] T051 Implement HumancyPlugin class with lifecycle methods (`packages/agency-plugin-humancy/src/plugin.ts`)
- [x] T052 Write plugin lifecycle tests (`packages/agency-plugin-humancy/src/__tests__/plugin.test.ts`)

## Phase 7: Integration & Polish

- [x] T060 Update workspace pnpm-workspace.yaml to include new package
- [x] T061 [P] Update turbo.json if needed for build pipeline
- [x] T062 Run full build and fix any issues
- [x] T063 Run all tests and ensure passing

## Dependencies & Execution Order

### Sequential Dependencies
1. **Phase 1 → Phase 2**: Package setup must complete before types
2. **Phase 2 → Phase 3**: Types must exist before connection detector uses them
3. **Phase 2 → Phase 4**: Types must exist before tools use them
4. **Phase 3 → Phase 4**: Connection detector must exist before tools can use it
5. **Phase 4 → Phase 5**: Tools must exist before tests can import them
6. **Phase 4 → Phase 6**: Tools must exist before plugin can register them
7. **Phase 6 → Phase 7**: Plugin must be complete before integration testing

### Parallel Opportunities
- **T002, T003**: tsconfig and entry point are independent
- **T011, T012**: Request and response types can be written in parallel
- **T030-T033**: All 4 tools can be implemented in parallel after T020
- **T040-T043**: All 4 tool tests can be written in parallel
- **T060, T061**: Workspace updates are independent

### Critical Path
T001 → T010 → T020 → T030 → T040 → T050 → T051 → T062 → T063

### User Story Mapping
- **US1** (Ask Question): T030, T040
- **US2** (Request Review): T031, T041
- **US3** (Request Decision): T032, T042
- **US4** (Notify): T033, T043
