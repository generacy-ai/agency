# Feature Specification: B5: Port task-parser utility

**Branch**: `154-b5-port-task-parser` | **Date**: 2026-01-31 | **Status**: Draft

## Summary

Port the complete task-parser utility from the speckit reference implementation, including all parsing functionality (task groups, individual tasks, format detection), dependency graph building, topological sorting, and issue link management. Types will be organized in a separate `src/types/tasks.ts` file for reusability.

## Parent Epic
Part of #139

## Agent Assignment
**Agent B** - Git & Feature Tools (`src/utils/*`, `src/tools/git-ops.ts`, `src/tools/create-feature.ts`)

## Description
Port the task parser utility that extracts tasks from tasks.md for the tasks-to-issues tool.

## Acceptance Criteria
- [ ] Create `src/utils/task-parser.ts`
- [ ] Parse markdown task lists from tasks.md
- [ ] Extract task metadata (ID, description, phase, dependencies, user stories)
- [ ] Support both task formats: T### (individual) and TG-XXX (task groups)
- [ ] Build task dependency graph
- [ ] Handle malformed task files gracefully

## Task Formats to Support

### Individual Tasks (T###)
```markdown
## Phase 1: Setup
- [ ] T001: Initialize project structure
- [ ] T002: Configure build system (depends: T001)
```

### Task Groups (TG-XXX)
```markdown
## TG-AUTH: Authentication System
**US1**: As a user, I want to log in

- [ ] Implement login form
- [ ] Add session management
```

## Functions to Implement

**Note**: Full port from reference implementation - includes all parsing functionality, not just the minimal interface.

```typescript
// src/types/tasks.ts - Separate file for type sharing

export interface Task {
  id: string;           // T001 or TG-AUTH
  description: string;
  phase?: string;
  dependencies: string[];
  userStory?: string;
  completed: boolean;
  line: number;         // Line number in file
}

export interface TaskGroup {
  id: string;           // TG-AUTH
  title: string;
  userStories: UserStory[];
  tasks: Task[];
  line: number;
}

export interface UserStory {
  id: string;           // US1
  description: string;
  line: number;
}

export interface ParseError {
  message: string;
  line?: number;
  taskId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ParseError[];
  warnings: ParseError[];
}

export interface ParsedTasks {
  format: 'individual' | 'task-group';
  tasks: Task[];
  taskGroups?: TaskGroup[];
  phases: string[];
  errors: ParseError[];
}
```

```typescript
// src/utils/task-parser.ts - Full implementation

// Core parsing functions
export function parseTasks(content: string): ParsedTasks;
export function parseTaskGroups(content: string): TaskGroup[];
export function detectTaskFormat(content: string): 'individual' | 'task-group' | 'unknown';

// Dependency graph functions
export function buildDependencyGraph(tasks: Task[]): Map<string, string[]>;
export function topologicalSort(tasks: Task[]): Task[];
export function validateDependencies(tasks: Task[]): ValidationResult;

// Filtering and eligibility
export function filterEligibleTasks(tasks: Task[], completed: Set<string>): Task[];
export function getReadyTasks(tasks: Task[], dependencyGraph: Map<string, string[]>): Task[];

// Issue link management (from reference)
export function updateIssueLinkInContent(
  content: string,
  taskId: string,
  issueNumber: number
): string;
```

## Dependencies
- F2 (Task types)
- B1 (fs utilities for reading files)

## Files to Create/Modify
- `src/types/tasks.ts` - Type definitions for tasks, task groups, parsing results
- `src/types/index.ts` - Re-export types
- `src/utils/task-parser.ts` - Full parser implementation
- `src/utils/index.ts` - Re-export utilities

## References
- Current implementation: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/task-parser.ts`

## User Stories

### US1: Task Parsing for Issue Generation

**As a** developer using the tasks-to-issues tool,
**I want** task markdown files to be parsed accurately,
**So that** I can automatically generate GitHub issues from my task breakdown.

**Acceptance Criteria**:
- [ ] Individual tasks (T###) are parsed with ID, description, dependencies
- [ ] Task groups (TG-XXX) are parsed with user stories and nested tasks
- [ ] Malformed entries produce helpful error messages with line numbers

### US2: Dependency Ordering

**As a** developer planning implementation,
**I want** tasks sorted in dependency order,
**So that** I know which tasks must complete before others.

**Acceptance Criteria**:
- [ ] Dependency graph correctly maps task relationships
- [ ] Topological sort produces valid execution order
- [ ] Circular dependencies are detected and reported

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Parse individual task format (T###) | P1 | With dependencies |
| FR-002 | Parse task group format (TG-XXX) | P1 | With user stories |
| FR-003 | Auto-detect task format | P1 | |
| FR-004 | Build dependency graph | P1 | |
| FR-005 | Topological sort tasks | P1 | |
| FR-006 | Validate dependency references | P1 | No undefined refs |
| FR-007 | Filter eligible/ready tasks | P2 | Based on completed set |
| FR-008 | Update issue links in content | P2 | After issue creation |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Parse accuracy | 100% | Reference implementation parity |
| SC-002 | Error recovery | Partial parse | Malformed files don't crash |

## Assumptions

- Reference implementation patterns are correct and should be followed
- Task IDs are unique within a file
- Dependency references use task IDs

## Out of Scope

- UI for task visualization
- Task execution/automation
- Persistence beyond file parsing

---

*Generated by speckit*
