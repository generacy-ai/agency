# Data Model: D5 Implement tasks_to_issues Tool

## Core Entities

### Task (Individual Format - T###)

```typescript
/**
 * Single task parsed from tasks.md (T### format)
 */
interface Task {
  /** Task ID (e.g., "T001") */
  id: string;

  /** Original line number in tasks.md (1-indexed) */
  lineNumber: number;

  /** Whether the task is completed */
  completed: boolean;

  /** Whether task can be parallelized (marked with [P]) */
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

### TaskGroupEntry (Group Format - TG-XXX)

```typescript
/**
 * Task group entry in TG-XXX format (epic workflows)
 */
interface TaskGroupEntry {
  /** Group ID (e.g., "TG-001") */
  id: string;

  /** Original line number */
  lineNumber: number;

  /** User story reference */
  userStory?: string;

  /** Title/description */
  title: string;

  /** Scope estimate (XS, S, M, L, XL) */
  scope?: string;

  /** Files affected */
  files?: string[];

  /** Test description */
  tests?: string;

  /** Sub-tasks */
  subtasks: SubTask[];

  /** Phase this group belongs to */
  phase?: string;

  /** Whether all subtasks done */
  completed: boolean;

  /** Existing issue link */
  existingIssue?: number;
}

interface SubTask {
  /** Whether completed */
  completed: boolean;

  /** Description text */
  description: string;
}
```

### TaskGroup (For Issue Creation)

```typescript
/**
 * Group of tasks for GitHub issue creation
 */
interface TaskGroup {
  /** Group identifier */
  id: string;

  /** How this group was formed */
  groupType: 'task' | 'story' | 'phase';

  /** Tasks in this group */
  tasks: Task[];

  /** Generated issue title */
  title: string;

  /** Generated issue body */
  body: string;

  /** Labels to apply */
  labels: string[];

  /** Dependencies (other group IDs or issue numbers) */
  dependencies: string[];
}
```

## Grouping Strategy

```typescript
/**
 * Strategy for grouping tasks into GitHub issues
 */
type GroupingStrategy = 'per-task' | 'per-story' | 'per-phase';
```

## Issue Types

### IssuePlan (Preview Mode)

```typescript
/**
 * Planned issue for dry-run mode
 */
interface IssuePlan {
  /** Generated title */
  title: string;

  /** Group or task ID */
  groupId: string;

  /** Number of tasks in this issue */
  taskCount: number;

  /** Task IDs included */
  taskIds: string[];

  /** Labels to apply */
  labels: string[];

  /** Dependencies (other group IDs or issue numbers) */
  dependencies: string[];

  /** Body preview (may be truncated) */
  bodyPreview: string;
}
```

### CreatedIssue (Creation Mode)

```typescript
/**
 * Successfully created GitHub issue
 */
interface CreatedIssue {
  /** GitHub issue number */
  number: number;

  /** Full URL */
  url: string;

  /** Title */
  title: string;

  /** Task IDs included */
  taskIds: string[];

  /** Group ID */
  groupId: string;
}
```

## Tool Input/Output

### Input Parameters

```typescript
interface TasksToIssuesParams {
  /** Grouping strategy (optional - auto-detected from labels) */
  grouping?: 'per-task' | 'per-story' | 'per-phase';

  /** Preview only, do not create issues */
  dry_run?: boolean;

  /** Parent epic issue number (optional - detected from branch) */
  epic_number?: number;

  /** Feature directory path (optional - auto-detected) */
  feature_dir?: string;

  /** Working directory */
  cwd?: string;
}
```

### Output Result

```typescript
interface TasksToIssuesResult {
  /** Whether operation succeeded */
  success: boolean;

  /** Mode: 'preview' or 'created' */
  mode: 'preview' | 'created';

  /** Grouping strategy used */
  grouping_strategy: GroupingStrategy;

  /** Parent epic number (if detected) */
  epic_number?: number;

  /** Planned issues (dry_run mode) */
  issues_planned?: IssuePlan[];

  /** Created issues (creation mode) */
  issues_created?: CreatedIssue[];

  /** Whether tasks.md was updated */
  tasks_updated?: boolean;

  /** Number of tasks processed */
  tasks_processed: number;

  /** Number of tasks skipped */
  tasks_skipped: number;

  /** Warning messages */
  warnings?: string[];

  /** Error details (if success=false) */
  error?: TasksToIssuesError;
}
```

## Dependency Types

```typescript
/**
 * Error types for dependency validation
 */
type DependencyErrorType = 'circular' | 'missing' | 'self-reference';

/**
 * Individual validation error
 */
interface DependencyValidationError {
  type: DependencyErrorType;
  taskIds: string[];
  message: string;
}

/**
 * Validation result
 */
interface DependencyValidationResult {
  valid: boolean;
  errors: DependencyValidationError[];
  warnings: string[];
}
```

## Error Types

```typescript
/**
 * Error codes for tasks-to-issues tool
 */
type TasksToIssuesErrorCode =
  | 'FEATURE_DIR_NOT_FOUND'
  | 'TASKS_FILE_NOT_FOUND'
  | 'TASKS_FILE_EMPTY'
  | 'TASKS_PARSE_ERROR'
  | 'CIRCULAR_DEPENDENCY'
  | 'GH_CLI_NOT_FOUND'
  | 'GH_NOT_AUTHENTICATED'
  | 'ISSUE_CREATE_FAILED'
  | 'REVIEW_GATE_BLOCKED';

interface TasksToIssuesError {
  code: TasksToIssuesErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}
```

## Parsing Patterns

```typescript
// Task line pattern (T### format)
// Format: - [ ] T### [#N]? [P]? [US#]? Description (deps: T###)?
const TASK_LINE_PATTERN =
  /^-\s*\[([ xX])\]\s*(T\d{3})(?:\s*\[#(\d+)\])?(?:\s*\[P\])?(?:\s*\[US(\d+)\])?\s+(.+?)(?:\s*\(deps?:\s*([^)]+)\))?$/;

// Task group header pattern (TG-XXX format)
// Format: ### TG-XXX [US#]? Title
const TASK_GROUP_HEADER_PATTERN =
  /^###\s+(TG-\d{3})(?:\s+\[US(\d+)\])?\s+(.+)$/;

// Phase header pattern
// Format: ## Phase N: Name
const PHASE_HEADER_PATTERN =
  /^#{2,3}\s*(?:Phase\s*)?(\d+)?[:\s]*(.+)$/i;

// Existing issue pattern
const EXISTING_ISSUE_PATTERN = /\[#(\d+)\]/;

// Scope pattern
const SCOPE_PATTERN = /^\*\*Scope\*\*:\s*(\w+)/;

// Files pattern
const FILES_PATTERN = /^\*\*Files\*\*:/;

// Subtask pattern
const SUBTASK_PATTERN = /^-\s*\[([ xX])\]\s+(.+)$/;
```

## Relationships

```
tasks.md
    │
    ├── Individual Format (T###)
    │   └── Task[] ──────────────────────────────┐
    │       ├── dependencies: string[]           │
    │       └── userStory?: string               │
    │                                            │
    └── Group Format (TG-XXX)                    │
        └── TaskGroupEntry[] ────────────────────┤
            └── subtasks: SubTask[]              │
                                                 │
    ┌────────────────────────────────────────────┘
    │
    ▼
GroupingStrategy
    │
    ├── per-task ─────┐
    ├── per-story ────┤
    └── per-phase ────┘
                      │
                      ▼
               TaskGroup[]
                      │
    ┌─────────────────┴─────────────────┐
    │                                   │
    ▼                                   ▼
dry_run=true                    dry_run=false
    │                                   │
    ▼                                   ▼
IssuePlan[]                    CreatedIssue[]
                                        │
                                        ▼
                               tasks.md (updated)
```

---

*Generated by speckit*
