# Data Model: F2 Core Types

**Feature**: Define core types for spec-kit
**Branch**: `141-f2-define-core-types`

## Entity Relationship Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Feature     │────▶│  FeaturePaths   │     │    BranchInfo   │
│  (development   │     │  (file paths)   │     │   (git branch)  │
│     unit)       │     └─────────────────┘     └─────────────────┘
└─────────────────┘
        │
        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    TicketRef    │────▶│  TicketParams   │     │  TicketUpdates  │
│   (external     │     │  (operations)   │     │   (changes)     │
│    tracker)     │     └─────────────────┘     └─────────────────┘
└─────────────────┘
        │
        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      Task       │────▶│   TaskGroup     │────▶│   IssuePlan     │
│  (work item)    │     │  (issue group)  │     │  (GH issue)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐     ┌─────────────────┐
│ Clarification   │     │   McpError      │
│   Question      │     │   (errors)      │
└─────────────────┘     └─────────────────┘
```

## Core Entities

### Feature

Represents a numbered development unit with specification artifacts.

```typescript
interface Feature {
  /** Branch/directory name following ###-short-name pattern */
  name: string;

  /** Three-digit feature number (e.g., "001", "042") */
  number: string;

  /** Short name extracted from branch (e.g., "user-auth") */
  shortName: string;

  /** Absolute path to feature directory under specs/ */
  directory: string;

  /** Whether repository has git initialized */
  hasGit: boolean;
}
```

**Validation Rules**:
- `name` must match pattern `/^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/`
- `number` must be 3 digits (000-999)
- `directory` must be absolute path

### FeaturePaths

All file paths associated with a feature.

```typescript
interface FeaturePaths {
  /** Repository root directory */
  repoRoot: string;

  /** Current branch name or feature name */
  branch: string;

  /** Whether git is available */
  hasGit: boolean;

  /** Feature directory under specs/ */
  featureDir: string;

  /** Path to spec file (configurable, default: spec.md) */
  specFile: string;

  /** Path to plan file (configurable, default: plan.md) */
  planFile: string;

  /** Path to tasks file (configurable, default: tasks.md) */
  tasksFile: string;

  /** Path to research file */
  researchFile: string;

  /** Path to data model file */
  dataModelFile: string;

  /** Path to quickstart file */
  quickstartFile: string;

  /** Path to contracts directory */
  contractsDir: string;

  /** Path to checklists directory */
  checklistsDir: string;

  /** Path to clarifications file */
  clarificationsFile: string;
}
```

### BranchInfo

Git branch metadata.

```typescript
interface BranchInfo {
  /** Branch name */
  name: string;

  /** Issue number extracted from branch name */
  issueNumber: string;

  /** Short name portion of branch */
  shortName: string;

  /** Whether this is a remote branch */
  isRemote: boolean;

  /** Last commit date (ISO string) */
  lastCommitDate: string;
}
```

### TicketRef

Provider-agnostic ticket reference with extensibility for custom providers.

```typescript
/** Known ticket providers */
const KNOWN_PROVIDERS = ['github', 'jira', 'shortcut', 'linear', 'local'] as const;

/** Ticket provider type - string for extensibility */
type TicketProvider = string;

interface TicketRef {
  /** Provider identifier (github, jira, etc. or custom) */
  provider: TicketProvider;

  /** Ticket ID ("123" or "PROJ-123") */
  id: string;

  /** Full URL if available */
  url?: string;

  /** Original input string */
  raw: string;
}
```

**Design Note**: Using `string` for provider allows plugins to register custom ticket providers (e.g., `"custom-tracker"`) without modifying core types.

### TicketParams

Parameters for ticket operations.

```typescript
interface TicketParams {
  /** Provider to use */
  provider: TicketProvider;

  /** Project identifier (for Jira, etc.) */
  project?: string;

  /** Repository (for GitHub) */
  repository?: string;

  /** Labels to apply */
  labels?: string[];

  /** Assignees */
  assignees?: string[];
}
```

### TicketUpdates

Changes to apply to a ticket.

```typescript
interface TicketUpdates {
  /** New title */
  title?: string;

  /** New description/body */
  body?: string;

  /** Labels to add */
  addLabels?: string[];

  /** Labels to remove */
  removeLabels?: string[];

  /** New assignees */
  assignees?: string[];

  /** New state (open, closed, etc.) */
  state?: string;
}
```

## Task Types

### Task

Single task parsed from tasks.md.

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

### TaskGroup

Group of tasks for GitHub issue creation.

```typescript
type GroupingStrategy = 'per-task' | 'per-story' | 'per-phase';

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

### SubTask

Checkbox item within a task group.

```typescript
interface SubTask {
  /** Whether completed */
  completed: boolean;

  /** Description text */
  description: string;
}
```

### TaskGroupEntry

TG-XXX format task group (epic workflows).

```typescript
interface TaskGroupEntry {
  /** Group ID (e.g., "TG-001") */
  id: string;

  /** Original line number */
  lineNumber: number;

  /** User story reference */
  userStory?: string;

  /** Title/description */
  title: string;

  /** Scope estimate */
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
```

### TaskIdConfig

Configuration for task ID format.

```typescript
interface TaskIdConfig {
  /** Prefix for task IDs (default: "T") */
  idPrefix: string;

  /** Number padding (default: 3) */
  idPadding: number;

  /** Separator after prefix (default: "") */
  idSeparator: string;

  /** Prefix for group IDs (default: "TG") */
  groupPrefix: string;

  /** Separator for groups (default: "-") */
  groupSeparator: string;

  /** Group number padding (default: 3) */
  groupPadding: number;
}
```

## Dependency Types

### TaskDependency

Dependency info from task descriptions.

```typescript
interface TaskDependency {
  /** Task ID */
  taskId: string;

  /** Task IDs this depends on */
  dependsOn: string[];

  /** Phase this task belongs to */
  phase?: string;

  /** Whether auto-generated or explicit */
  source: 'auto' | 'explicit';
}
```

### DependencyValidationResult

```typescript
interface DependencyValidationResult {
  /** Whether all dependencies valid */
  valid: boolean;

  /** Validation errors */
  errors: DependencyValidationError[];

  /** Warnings */
  warnings: string[];
}

interface DependencyValidationError {
  /** Error type */
  type: 'circular' | 'missing' | 'self-reference';

  /** Task IDs involved */
  taskIds: string[];

  /** Human-readable message */
  message: string;
}
```

### CircularDependency

```typescript
interface CircularDependency {
  /** Groups involved in cycle */
  cycle: string[];

  /** Description */
  description: string;
}
```

## Clarification Types

### ClarificationQuestion

```typescript
interface ClarificationQuestion {
  /** Sequential question number */
  number: number;

  /** Short topic identifier */
  topic: string;

  /** Why this question matters */
  context: string;

  /** The specific question */
  question: string;

  /** Optional A/B/C options */
  options?: ClarificationOption[];

  /** Answer or null if pending */
  answer: string | null;
}

interface ClarificationOption {
  /** Option label (A, B, C) */
  label: string;

  /** Description */
  description: string;
}
```

### ClarificationBatch

```typescript
interface ClarificationBatch {
  /** Batch number */
  number: number;

  /** ISO timestamp */
  timestamp: string;

  /** Questions in batch */
  questions: ClarificationQuestion[];
}
```

## Issue Types

### IssuePlan

Planned issue for preview mode.

```typescript
interface IssuePlan {
  /** Generated title */
  title: string;

  /** Group or task ID */
  groupId: string;

  /** Number of tasks */
  taskCount: number;

  /** Task IDs included */
  taskIds: string[];

  /** Labels */
  labels: string[];

  /** Dependencies */
  dependencies: string[];

  /** Body preview (truncated) */
  bodyPreview: string;
}
```

### CreatedIssue

```typescript
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

## Error Types

### McpError

```typescript
type ErrorCode =
  | 'BRANCH_EXISTS'
  | 'BRANCH_EXISTS_FOR_ISSUE'
  | 'BRANCH_NOT_FOUND'
  | 'SPEC_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'TASKS_NOT_FOUND'
  | 'FEATURE_DIR_NOT_FOUND'
  | 'TEMPLATE_NOT_FOUND'
  | 'GIT_NOT_INITIALIZED'
  | 'GIT_OPERATION_FAILED'
  | 'INVALID_BRANCH_NAME'
  | 'INVALID_FEATURE_NUMBER'
  | 'FILE_WRITE_FAILED'
  | 'FILE_READ_FAILED'
  | 'AGENT_FILE_NOT_FOUND';

interface McpError {
  /** Error code */
  code: ErrorCode;

  /** Human-readable message */
  message: string;

  /** Additional context */
  context?: Record<string, unknown>;
}
```

## Configuration Schema

### SpecKitConfig (with Zod)

```typescript
import { z } from 'zod';

const TaskIdConfigSchema = z.object({
  idPrefix: z.string().default('T'),
  idPadding: z.number().min(1).max(6).default(3),
  idSeparator: z.string().default(''),
  groupPrefix: z.string().default('TG'),
  groupSeparator: z.string().default('-'),
  groupPadding: z.number().min(1).max(6).default(3),
});

const FileNamesSchema = z.object({
  spec: z.string().default('spec.md'),
  plan: z.string().default('plan.md'),
  tasks: z.string().default('tasks.md'),
  research: z.string().default('research.md'),
  dataModel: z.string().default('data-model.md'),
  quickstart: z.string().default('quickstart.md'),
  clarifications: z.string().default('clarifications.md'),
});

const SpecKitConfigSchema = z.object({
  /** Directory for spec artifacts */
  specDirectory: z.string().default('specs'),

  /** Template directory */
  templateDirectory: z.string().default('.spec-templates'),

  /** Custom file names */
  fileNames: FileNamesSchema.default({}),

  /** Task ID format configuration */
  taskIdConfig: TaskIdConfigSchema.default({}),

  /** Extension point for plugins */
  extensions: z.record(z.unknown()).default({}),
});

type SpecKitConfig = z.infer<typeof SpecKitConfigSchema>;
```

## Utility Functions

Included alongside type definitions:

```typescript
// Task ID utilities
function buildTaskId(num: number, config?: TaskIdConfig): string;
function buildTaskGroupId(num: number, config?: TaskIdConfig): string;
function buildTaskIdPattern(config?: TaskIdConfig): RegExp;
function buildTaskGroupIdPattern(config?: TaskIdConfig): RegExp;
function buildTaskIdSearchPattern(config?: TaskIdConfig): RegExp;

// Error utilities
function createError(code: ErrorCode, message: string, context?: Record<string, unknown>): McpError;

// Regex utilities
function escapeRegex(str: string): string;
```

## Validation Constants

```typescript
// Feature patterns
const FEATURE_NAME_PATTERN = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BRANCH_LENGTH = 244;

// Task patterns (defaults)
const TASK_ID_PATTERN = /^T\d{3}$/;
const USER_STORY_PATTERN = /^\[US\d+\]$/;
const EXISTING_ISSUE_PATTERN = /^\[#(\d+)\]$/;

// Task group patterns
const TASK_GROUP_ID_PATTERN = /^TG-\d{3}$/;
const TASK_GROUP_HEADER_PATTERN = /^###\s+(TG-\d{3})\s*(?:\[US(\d+)\])?\s*(?:Task Group:\s*)?(.+)$/;
```
