/**
 * Task-related type definitions for spec-kit
 *
 * These types represent tasks parsed from tasks.md files, including
 * individual tasks, task groups for issue creation, and grouping strategies.
 */

/**
 * Single task parsed from tasks.md.
 *
 * Represents a work item with its completion status, dependencies,
 * and metadata for issue generation.
 *
 * @example
 * ```typescript
 * const task: Task = {
 *   id: 'T001',
 *   lineNumber: 15,
 *   completed: false,
 *   isParallel: true,
 *   userStory: 'US1',
 *   description: 'Implement user authentication endpoint',
 *   dependencies: ['T000'],
 *   phase: 'Phase 2: Core',
 * };
 * ```
 */
export interface Task {
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

/**
 * Strategy for grouping tasks into GitHub issues.
 *
 * - `per-task`: One issue per task (finest granularity)
 * - `per-story`: Group tasks by user story
 * - `per-phase`: Group tasks by phase (coarsest granularity)
 */
export type GroupingStrategy = 'per-task' | 'per-story' | 'per-phase';

/**
 * Group of tasks for GitHub issue creation.
 *
 * Represents a collection of tasks that will be converted into a single
 * GitHub issue, with generated title, body, and labels.
 *
 * @example
 * ```typescript
 * const group: TaskGroup = {
 *   id: 'US1',
 *   groupType: 'story',
 *   tasks: [task1, task2],
 *   title: '[US1] User Authentication',
 *   body: '## Tasks\n- [ ] T001 Implement auth...',
 *   labels: ['feature', 'auth'],
 *   dependencies: ['US0'],
 * };
 * ```
 */
export interface TaskGroup {
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

/**
 * Checkbox sub-item within a task group.
 *
 * Represents individual checkboxes in task group format (TG-XXX).
 *
 * @example
 * ```typescript
 * const subtask: SubTask = {
 *   completed: false,
 *   description: 'Write unit tests',
 * };
 * ```
 */
export interface SubTask {
  /** Whether completed */
  completed: boolean;

  /** Description text */
  description: string;
}

/**
 * Task group entry in TG-XXX format (epic workflows).
 *
 * Used for larger epics where tasks are grouped into named
 * task groups with sub-tasks.
 *
 * @example
 * ```typescript
 * const entry: TaskGroupEntry = {
 *   id: 'TG-001',
 *   lineNumber: 20,
 *   userStory: 'US1',
 *   title: 'Setup Authentication Module',
 *   scope: 'S',
 *   files: ['src/auth/index.ts', 'src/auth/provider.ts'],
 *   tests: 'Unit tests for auth providers',
 *   subtasks: [{ completed: false, description: 'Create auth module' }],
 *   phase: 'Phase 1: Setup',
 *   completed: false,
 * };
 * ```
 */
export interface TaskGroupEntry {
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

/**
 * Configuration for task ID format.
 *
 * Allows customization of how task IDs (T001) and task group IDs (TG-001)
 * are formatted.
 *
 * @example
 * ```typescript
 * // Default configuration
 * const config: TaskIdConfig = {
 *   idPrefix: 'T',
 *   idPadding: 3,
 *   idSeparator: '',
 *   groupPrefix: 'TG',
 *   groupSeparator: '-',
 *   groupPadding: 3,
 * };
 *
 * // Custom configuration for different project
 * const customConfig: TaskIdConfig = {
 *   idPrefix: 'TASK',
 *   idPadding: 4,
 *   idSeparator: '-',
 *   groupPrefix: 'GROUP',
 *   groupSeparator: '-',
 *   groupPadding: 4,
 * };
 * ```
 */
export interface TaskIdConfig {
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

/**
 * Default task ID configuration.
 */
export const DEFAULT_TASK_ID_CONFIG: TaskIdConfig = {
  idPrefix: 'T',
  idPadding: 3,
  idSeparator: '',
  groupPrefix: 'TG',
  groupSeparator: '-',
  groupPadding: 3,
};
