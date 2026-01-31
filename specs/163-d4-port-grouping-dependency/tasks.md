# Tasks: D4: Port grouping/dependency logic from speckit

**Input**: Design documents from `/specs/163-d4-port-grouping-dependency/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Type Definitions

- [ ] T001 Create `src/utils/grouping.ts` with type definitions (GroupingStrategy, TaskGroup, IssuePlan)
- [ ] T002 [P] Create `src/utils/dependency.ts` with type definitions (DependencyValidationResult, DependencyValidationError, DependencyGenerationOptions, DEFAULT_DEPENDENCY_OPTIONS)

## Phase 2: Core Implementation - Dependency Utilities

- [ ] T003 Implement `validateDependencies()` in dependency.ts - validate dependencies for task array, check self-references and missing deps
- [ ] T004 Implement `detectCircularDependencies()` in dependency.ts - use Kahn's algorithm to detect cycles
- [ ] T005 [P] Implement `findCycle()` helper in dependency.ts - DFS to find specific cycle path for error messages
- [ ] T006 Implement `isValidDAG()` in dependency.ts - check if dependencies form valid directed acyclic graph
- [ ] T007 [P] Implement `getTopologicalOrder()` in dependency.ts - return tasks in dependency order or null if cycle exists
- [ ] T008 [P] Implement `buildDependencyGraphString()` in dependency.ts - visualize dependency graph as string

## Phase 3: Core Implementation - Grouping Utilities

- [ ] T009 Implement `groupByTask()` in grouping.ts - create one TaskGroup per task
- [ ] T010 [P] Implement `groupByStory()` in grouping.ts - group tasks by userStory field, ungrouped tasks become individual groups
- [ ] T011 [P] Implement `groupByPhase()` in grouping.ts - group tasks by phase field, ungrouped tasks become individual groups
- [ ] T012 Implement `groupTasks()` dispatcher in grouping.ts - route to appropriate grouping function based on strategy

## Phase 4: Issue Body Building

- [ ] T013 Implement `buildTaskTitle()` helper in grouping.ts - generate title for single task issue
- [ ] T014 [P] Implement `buildStoryTitle()` helper in grouping.ts - generate title for user story group
- [ ] T015 [P] Implement `buildPhaseTitle()` helper in grouping.ts - generate title for phase group
- [ ] T016 Implement `buildIssueBody()` in grouping.ts - generate markdown issue body with tasks, metadata, and dependencies

## Phase 5: Auto-Dependencies and Sorting

- [ ] T017 Implement `extractPhases()` in grouping.ts - extract unique phases from groups in order
- [ ] T018 Implement `generatePhaseDependencies()` in grouping.ts - all Phase N groups depend on all Phase N-1 groups
- [ ] T019 [P] Implement `generateSequentialDependencies()` in grouping.ts - sequential deps within phases
- [ ] T020 Implement `applyAutoDependencies()` in grouping.ts - apply cross-phase and sequential deps to groups
- [ ] T021 Implement `topologicalSort()` for TaskGroup[] in grouping.ts - sort groups respecting dependencies

## Phase 6: Dependency Resolution

- [ ] T022 Implement `resolveDependenciesToIssues()` in grouping.ts - convert task/group IDs to issue numbers
- [ ] T023 Implement `buildIssueBodyWithDependencies()` in grouping.ts - build body with resolved issue number deps
- [ ] T024 Implement `groupToIssuePlan()` in grouping.ts - convert TaskGroup to IssuePlan for preview mode

## Phase 7: Integration

- [ ] T025 Update `src/utils/index.ts` to re-export grouping.ts and dependency.ts
- [ ] T026 Add JSDoc comments to all public functions matching speckit style

## Phase 8: Testing

- [ ] T027 Create `src/utils/dependency.test.ts` - unit tests for dependency validation (self-ref, circular, missing)
- [ ] T028 [P] Create `src/utils/grouping.test.ts` - unit tests for grouping strategies (per-task, per-story, per-phase)
- [ ] T029 Add tests for topological sort (valid DAG, cycle detection)
- [ ] T030 [P] Add tests for auto-dependency generation (cross-phase, sequential)
- [ ] T031 Add edge case tests (empty input, single task, no dependencies)
- [ ] T032 Run full test suite and verify all tests pass

## Dependencies & Execution Order

### Phase Dependencies
- Phase 1 (Types) must complete before Phase 2-6 (implementations need types)
- Phase 2 (Dependency utils) can run in parallel with Phase 3 (Grouping utils)
- Phase 4 (Issue body) depends on Phase 3 (needs grouping types)
- Phase 5 (Auto-deps/sorting) depends on Phase 3 (needs TaskGroup)
- Phase 6 (Resolution) depends on Phase 4 and Phase 5
- Phase 7 (Integration) can start after Phase 2 and 3 complete
- Phase 8 (Testing) depends on all implementation phases

### Parallel Opportunities
- T001 and T002 can run in parallel (different files)
- T005, T007, T008 can run in parallel (independent functions)
- T009, T010, T011 are sequential (T012 dispatcher depends on all)
- T013, T014, T015 can run in parallel (independent helpers)
- T017, T018, T019 are partially parallel (T018 needs T017)
- T027, T028, T030 can run in parallel (different test files/areas)

### Critical Path
T001 → T009/T010/T011 → T012 → T016 → T020 → T021 → T024 → T025 → T027-T032
