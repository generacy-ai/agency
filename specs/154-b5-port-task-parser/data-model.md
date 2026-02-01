# Data Model: Task Parser

## Core Types

### Task (Existing - from grouping.ts)

```typescript
/**
 * Task structure as expected by grouping utilities
 * Already defined in src/utils/grouping.ts
 */
interface Task {
  /** Task ID (e.g., "T001") */
  id: string;

  /** Original line number in tasks.md (1-indexed) */
  lineNumber: number;

  /** Whether the task is completed */
  completed: boolean;

  /** Whether task can be parallelized */
  isParallel: boolean;

  /** User story reference (e.g., "US1") */
  userStory?: string;

  /** Task description text */
  description: string;

  /** Dependencies (task IDs this depends on) */
  dependencies: string[];

  /** Phase this task belongs to */
  phase?: string;

  /** Existing GitHub issue link (if already created) */
  existingIssue?: number;
}
```

### ParsedTasks (New)

```typescript
/**
 * Result of parsing a tasks.md file
 */
interface ParsedTasks {
  /** Parsed tasks in order of appearance */
  tasks: Task[];

  /** Unique phases found in order of appearance */
  phases: string[];

  /** Unique user stories found */
  userStories: string[];

  /** Warnings for non-fatal issues */
  warnings: string[];
}
```

### TaskGroupEntry (New - for TG-XXX format)

```typescript
/**
 * A task group entry (TG-XXX format)
 * Used for epic workflows where each group becomes one issue
 */
interface TaskGroupEntry {
  /** Group ID (e.g., "TG-001") */
  id: string;

  /** Line number of the group header */
  lineNumber: number;

  /** User story reference (e.g., "US1") */
  userStory?: string;

  /** Group title from header */
  title: string;

  /** Subtasks within the group */
  subtasks: SubtaskEntry[];

  /** Phase this group belongs to */
  phase?: string;

  /** Whether all subtasks are completed */
  completed: boolean;

  /** Existing issue number if already linked */
  existingIssue?: number;

  /** Scope metadata (optional) */
  scope?: string;

  /** Files to modify (optional) */
  files?: string[];

  /** Test requirements (optional) */
  tests?: string;
}
```

### SubtaskEntry (New)

```typescript
/**
 * A subtask within a task group
 */
interface SubtaskEntry {
  /** Whether the subtask is completed */
  completed: boolean;

  /** Subtask description */
  description: string;
}
```

### ParsedTaskGroups (New)

```typescript
/**
 * Result of parsing task groups from tasks.md
 */
interface ParsedTaskGroups {
  /** Parsed task groups */
  groups: TaskGroupEntry[];

  /** Unique phases found */
  phases: string[];

  /** Unique user stories found */
  userStories: string[];

  /** Warnings for non-fatal issues */
  warnings: string[];
}
```

### TaskFormat (New)

```typescript
/**
 * Detected format of tasks.md content
 */
type TaskFormat = 'individual' | 'task-group';
```

## Validation Types (Existing - from dependency.ts)

```typescript
/**
 * Result of dependency validation
 * Already defined in src/utils/dependency.ts
 */
interface DependencyValidationResult {
  valid: boolean;
  errors: DependencyValidationError[];
  warnings: string[];
}

interface DependencyValidationError {
  type: 'circular' | 'missing' | 'self-reference';
  taskIds: string[];
  message: string;
}
```

## Relationships

```
tasks.md content
      │
      ▼
┌─────────────────┐
│ detectTaskFormat │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
individual  task-group
    │         │
    ▼         ▼
┌────────┐ ┌────────────┐
│parseTasks│ │parseTaskGroups│
└────┬───┘ └─────┬──────┘
     │           │
     ▼           ▼
ParsedTasks  ParsedTaskGroups
     │           │
     └─────┬─────┘
           ▼
   validateDependencies()
           │
           ▼
  DependencyValidationResult
```

## Example Data

### Individual Task Format

Input:
```markdown
## Phase 1: Setup

- [ ] T001 [US1] Initialize project structure
- [ ] T002 Configure TypeScript (deps: T001)
- [x] T003 [#42] Add linting (deps: T001, T002)
```

Output:
```typescript
{
  tasks: [
    {
      id: "T001",
      lineNumber: 3,
      completed: false,
      isParallel: false,
      userStory: "US1",
      description: "Initialize project structure",
      dependencies: [],
      phase: "Phase 1: Setup"
    },
    {
      id: "T002",
      lineNumber: 4,
      completed: false,
      isParallel: false,
      description: "Configure TypeScript",
      dependencies: ["T001"],
      phase: "Phase 1: Setup"
    },
    {
      id: "T003",
      lineNumber: 5,
      completed: true,
      isParallel: false,
      description: "Add linting",
      dependencies: ["T001", "T002"],
      phase: "Phase 1: Setup",
      existingIssue: 42
    }
  ],
  phases: ["Phase 1: Setup"],
  userStories: ["US1"],
  warnings: []
}
```

### Task Group Format

Input:
```markdown
## Phase 1: Authentication

### TG-001 [US1] User Login
**Scope**: Frontend
**Files**: `src/auth/login.ts`

- [ ] Create login form
- [x] Add validation
```

Output:
```typescript
{
  groups: [
    {
      id: "TG-001",
      lineNumber: 3,
      userStory: "US1",
      title: "User Login",
      subtasks: [
        { completed: false, description: "Create login form" },
        { completed: true, description: "Add validation" }
      ],
      phase: "Phase 1: Authentication",
      completed: false,
      scope: "Frontend",
      files: ["src/auth/login.ts"]
    }
  ],
  phases: ["Phase 1: Authentication"],
  userStories: ["US1"],
  warnings: []
}
```
