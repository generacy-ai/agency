# Data Model: Task Grouping and Dependency

## Core Types

### Task (Input)

The base task structure (expected to be provided by task-parser or defined elsewhere):

```typescript
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

### GroupingStrategy

```typescript
type GroupingStrategy = 'per-task' | 'per-story' | 'per-phase';
```

| Strategy | Behavior |
|----------|----------|
| `per-task` | One GitHub issue per task |
| `per-story` | One issue per user story (tasks grouped by US reference) |
| `per-phase` | One issue per phase (tasks grouped by phase name) |

### TaskGroup (Output)

```typescript
interface TaskGroup {
  /** Group identifier (task ID, story ID, or phase name) */
  id: string;

  /** How this group was formed */
  groupType: 'task' | 'story' | 'phase';

  /** Tasks in this group */
  tasks: Task[];

  /** Generated issue title */
  title: string;

  /** Generated issue body (empty until buildIssueBody called) */
  body: string;

  /** Labels to apply */
  labels: string[];

  /** Dependencies (other group IDs or existing issue numbers) */
  dependencies: string[];
}
```

### IssuePlan (Preview)

```typescript
interface IssuePlan {
  /** Generated title */
  title: string;

  /** Group ID or task ID */
  groupId: string;

  /** Number of tasks included */
  taskCount: number;

  /** Task IDs included */
  taskIds: string[];

  /** Labels to apply */
  labels: string[];

  /** Dependencies (by group ID or issue number) */
  dependencies: string[];

  /** Description preview (truncated to 500 chars) */
  bodyPreview: string;
}
```

## Dependency Types

### DependencyValidationResult

```typescript
interface DependencyValidationResult {
  /** Whether all dependencies are valid (no errors) */
  valid: boolean;

  /** Validation errors (circular deps, self-references) */
  errors: DependencyValidationError[];

  /** Warnings (missing deps reference non-existent tasks) */
  warnings: string[];
}
```

### DependencyValidationError

```typescript
interface DependencyValidationError {
  /** Type of error */
  type: 'circular' | 'missing' | 'self-reference';

  /** Task IDs involved in the error */
  taskIds: string[];

  /** Human-readable error message */
  message: string;
}
```

### DependencyGenerationOptions

```typescript
interface DependencyGenerationOptions {
  /** Generate sequential dependencies within phases */
  intraPhaseSequential: boolean;

  /** Generate cross-phase dependencies (Phase N → all Phase N-1) */
  crossPhaseDependencies: boolean;

  /** Include explicit depends-on markers from tasks */
  includeExplicit: boolean;
}
```

### DEFAULT_DEPENDENCY_OPTIONS

```typescript
const DEFAULT_DEPENDENCY_OPTIONS: DependencyGenerationOptions = {
  intraPhaseSequential: true,
  crossPhaseDependencies: true,
  includeExplicit: true,
};
```

## Type Relationships

```
Task[] ──┬── validateDependencies() ──▶ DependencyValidationResult
         │
         └── groupTasks(strategy) ──▶ TaskGroup[]
                                           │
                                           ├── topologicalSort() ──▶ { sorted, hasCycle }
                                           │
                                           ├── applyAutoDependencies() ──▶ TaskGroup[] (with auto-deps)
                                           │
                                           └── groupToIssuePlan() ──▶ IssuePlan[]
```

## Validation Rules

### Task ID Format
- Pattern: `/^T\d{3}$/` (e.g., T001, T002, T999)
- Used for dependency references

### Self-Reference Check
- A task cannot depend on itself
- Checked per-task in dependency array

### Circular Dependency Check
- Uses Kahn's algorithm to detect cycles
- Fails if not all tasks can be topologically sorted

### Missing Dependency Warning
- Dependency references non-existent task ID
- Warning only (doesn't fail validation)
- May indicate external dependency or typo

## Issue Body Format

Standard markdown format with machine-readable HTML comments:

```markdown
## Description

[Task description or group summary]

## Tasks

- [ ] T001: First task description
- [x] T002: Completed task description

## Source

<!-- epic-parent: 123 -->
<!-- source-feature: 163-d4-port-grouping-dependency -->

## Dependencies

<!-- depends-on: #42, #43 -->
Depends on: #42, #43

---
*Generated from tasks.md by speckit*
```

## Grouping Behavior

### per-task
- Each task becomes its own TaskGroup
- Group ID = Task ID
- Dependencies = Task's original dependencies

### per-story
- Tasks with same `userStory` grouped together
- Tasks without userStory become individual groups
- External dependencies collected (deps outside group)

### per-phase
- Tasks with same `phase` grouped together
- Tasks without phase become individual groups
- External dependencies collected (deps outside group)
