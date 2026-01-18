# Tasks: Mode System Implementation

**Input**: Design documents from `/specs/009-mode-system-implementation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1: Agent Mode Selection, US2: Generacy Orchestration)

## Phase 1: Setup & Types

- [x] T001 Add new error codes `MODE_CIRCULAR_INHERITANCE` and `MODE_CONFIG_INVALID` to `packages/agency/src/errors/agency-error.ts`
- [x] T002 [P] Create `packages/agency/src/modes/types.ts` with `ModeDefinition`, `ResolvedMode`, and `ModeConfig` interfaces and zod schemas
- [x] T003 [P] Install `yaml` dependency: `pnpm add yaml --filter @generacy-ai/agency`

## Phase 2: Core Modules

- [x] T010 [P] Create `packages/agency/src/modes/pattern-matcher.ts` with `matchesTool(toolName, includes, excludes)` function - excludes always win over includes
- [x] T011 [P] Create `packages/agency/src/modes/pattern-matcher.test.ts` with tests for glob patterns, exact matches, negation, and excludes precedence
- [x] T012 [P] Create `packages/agency/src/modes/inheritance-resolver.ts` with `resolveInheritance(modes)` function using DFS cycle detection and topological sort
- [x] T013 [P] Create `packages/agency/src/modes/inheritance-resolver.test.ts` with tests for inheritance chain, cycle detection, and pattern flattening

## Phase 3: Configuration Loading

- [x] T020 Create `packages/agency/src/modes/config-loader.ts` with `loadModeConfig(projectRoot)` function - loads from `.agency/modes.yaml` with JSON fallback
- [x] T021 [P] Create `packages/agency/src/modes/config-loader.test.ts` with tests for YAML loading, JSON fallback, validation errors, and built-in defaults
- [x] T022 [P] Add built-in default modes (research, coding, review, debug) to config-loader with `coding` as default mode

## Phase 4: ModeManager Enhancement

- [x] T030 [US1] Update `packages/agency/src/modes/manager.ts` to accept `ModeConfig`, resolve inheritance at construction, and use pattern matcher for filtering
- [x] T031 [US1] Add `onModeChange(callback)` event subscription to ModeManager
- [x] T032 [US2] Add `setModeConfig(config)` API override method to ModeManager
- [x] T033 Update `packages/agency/src/modes/manager.test.ts` with tests for new functionality: inheritance, events, API override

## Phase 5: Integration

- [x] T040 Update `packages/agency/src/tools/registry.ts` `getToolsForMode()` to use resolved includes/excludes from ModeManager
- [x] T041 [P] Update `packages/agency/src/modes/index.ts` to re-export all new modules and types
- [x] T042 [P] Update `packages/agency/src/config/schema.ts` to include ModeDefinition and ModeConfig schemas

## Phase 6: Validation & Polish

- [x] T050 Create integration test in `packages/agency/src/modes/integration.test.ts` for full workflow: load config → resolve inheritance → filter tools
- [x] T051 Add performance test verifying mode switch < 10ms (SC-001)
- [x] T052 Verify all acceptance criteria pass and run full test suite

## Dependencies & Execution Order

**Phase 1 (Setup)**:
- T001, T002, T003 can run in parallel
- All must complete before Phase 2

**Phase 2 (Core Modules)**:
- T010, T011, T012, T013 can all run in parallel (different files)
- Depends on T002 (types)

**Phase 3 (Configuration)**:
- T020 depends on T012 (uses inheritance resolver)
- T021, T022 can run after T020
- Depends on T003 (yaml package)

**Phase 4 (ModeManager)**:
- T030 depends on T010, T012, T020 (uses pattern matcher, resolver, config loader)
- T031, T032 depend on T030
- T033 depends on T030-T032

**Phase 5 (Integration)**:
- T040 depends on T030 (needs updated ModeManager)
- T041, T042 can run in parallel

**Phase 6 (Validation)**:
- T050, T051, T052 run after all prior phases

**Parallel Opportunities**:
- Phase 1: All 3 tasks in parallel
- Phase 2: All 4 tasks in parallel
- Phase 3: T021, T022 in parallel after T020
- Phase 5: T041, T042 in parallel
