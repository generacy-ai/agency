# Tasks: F2 Define Core Types

**Input**: Design documents from `/specs/141-f2-define-core-types/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

- [x] T001 Add zod dependency to `packages/agency-plugin-spec-kit/package.json`
- [x] T002 Create `src/types/` directory structure

## Phase 2: Core Types

- [x] T003 [P] Create `src/types/feature.ts` - Feature, FeaturePaths, BranchInfo, PrerequisiteResult types with JSDoc
- [x] T004 [P] Create `src/types/ticket.ts` - TicketProvider (string + constants), TicketRef, TicketParams, TicketUpdates with JSDoc
- [x] T005 [P] Create `src/types/task.ts` - Task, TaskGroup, TaskGroupEntry, SubTask, GroupingStrategy, TaskIdConfig with JSDoc
- [x] T006 [P] Create `src/types/clarification.ts` - ClarificationQuestion, ClarificationOption, ClarificationBatch, ClarificationsFile with JSDoc
- [x] T007 [P] Create `src/types/dependency.ts` - TaskDependency, DependencyGraph, DependencyValidationResult, CircularDependency with JSDoc
- [x] T008 [P] Create `src/types/issue.ts` - IssuePlan, CreatedIssue, TasksToIssuesResult with JSDoc
- [x] T009 [P] Create `src/types/errors.ts` - ErrorCode union, McpError interface, createError factory function with JSDoc

## Phase 3: Configuration Schema

- [x] T010 Create `src/types/config.ts` - Zod schemas (TaskIdConfigSchema, FileNamesSchema, SpecKitConfigSchema) with inferred types

## Phase 4: Utilities

- [x] T011 Create `src/utils/index.ts` - buildTaskId, buildTaskGroupId, buildTaskIdPattern, buildTaskGroupIdPattern, escapeRegex utilities
- [x] T012 Create `src/types/patterns.ts` - Validation constants (FEATURE_NAME_PATTERN, TASK_ID_PATTERN, USER_STORY_PATTERN, etc.)

## Phase 5: Integration

- [x] T013 Create `src/types/index.ts` - Re-export all types from feature, ticket, task, clarification, dependency, issue, errors, config, patterns
- [x] T014 Update `src/index.ts` - Export types module and utils module from package entry point
- [x] T015 Run `pnpm build` to verify TypeScript compilation succeeds
- [x] T016 Verify all types have JSDoc documentation

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 (Setup) → Phase 2 (Core Types) → Phase 3 (Config) → Phase 4 (Utilities) → Phase 5 (Integration)

**Parallel opportunities**:
- T003-T009 can run in parallel (different type files, no dependencies between them)
- Phase 3 depends on Phase 2 completion (config references task types)
- Phase 4 depends on Phase 3 (utils use config types)
- Phase 5 depends on all previous phases

**Task dependencies**:
- T001 → T010 (zod needed for config schemas)
- T002 → T003-T009 (directory must exist)
- T003-T009 → T013 (all types needed for index)
- T010 → T013 (config needed for index)
- T011, T012 → T014 (utils and patterns needed for entry point)
- T013, T014 → T015 (all code needed for build verification)
