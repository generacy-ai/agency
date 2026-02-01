# Tasks: B5: Port task-parser utility

**Input**: Design documents from `/specs/154-b5-port-task-parser/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup & Types

- [x] T001 [US1] Create `src/utils/task-parser.ts` with module structure and regex patterns
- [x] T002 [P] [US1] Add new types (ParsedTasks, TaskGroupEntry, SubtaskEntry, ParsedTaskGroups, TaskFormat) to `src/utils/task-parser.ts`

## Phase 2: Core Parsing

- [x] T003 [US1] Implement `detectTaskFormat(content)` to identify individual vs task-group format (deps: T001)
- [x] T004 [US1] Implement `parseTaskLine(line, lineNumber, phase?)` for individual task parsing (deps: T001)
- [x] T005 [US1] Implement `parseTasksContent(content)` as main entry point for individual format (deps: T003, T004)

## Phase 3: Task Groups

- [x] T006 [US1] Implement `parseTaskGroupHeader(line, lineNumber)` for TG-XXX header parsing (deps: T001)
- [x] T007 [US1] Implement `parseTaskGroups(content)` for full task group parsing with metadata (deps: T003, T006)

## Phase 4: Issue Link Management

- [x] T008 [US1] Implement `updateTasksWithIssueLinks(content, taskId, issueNumber)` for issue link injection (deps: T001)

## Phase 5: Export & Integration

- [x] T009 Modify `src/utils/index.ts` to re-export task-parser functions (deps: T005, T007, T008)

## Phase 6: Testing

- [x] T010 [P] [US1] Create `src/utils/__tests__/task-parser.test.ts` with individual task format tests (deps: T005)
- [x] T011 [P] [US1] Add task group format tests to task-parser.test.ts (deps: T007)
- [x] T012 [US2] Add dependency validation integration tests (deps: T005)
- [x] T013 Add malformed input handling and edge case tests (deps: T005, T007)

## Dependencies & Execution Order

### Sequential Dependencies
- T001 (module setup) must complete before all other tasks
- T003 (format detection) required for T005 and T007
- T004 (parseTaskLine) required for T005 (parseTasksContent)
- T006 (group header parsing) required for T007 (parseTaskGroups)
- T005, T007, T008 must complete before T009 (exports)

### Parallel Opportunities
- T001 and T002 can run in parallel (setup + types)
- T010 and T011 can run in parallel (test files for different formats)
- T003 and T004 can run in parallel after T001

### Existing Infrastructure
- Uses existing `Task` interface from `src/utils/grouping.ts`
- Uses existing `validateDependencies()` and `getTopologicalOrder()` from `src/utils/dependency.ts`
- No need to create separate types file - new types go in task-parser.ts
