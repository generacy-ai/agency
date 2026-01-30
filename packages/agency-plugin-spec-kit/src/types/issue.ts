/**
 * Issue-related type definitions for spec-kit
 *
 * These types represent GitHub issues created from tasks,
 * including planned issues (preview) and created issues.
 */

/**
 * Planned issue for preview/dry-run mode.
 *
 * Represents an issue that would be created, allowing
 * review before actual creation.
 *
 * @example
 * ```typescript
 * const plan: IssuePlan = {
 *   title: '[T001] Implement user authentication',
 *   groupId: 'T001',
 *   taskCount: 1,
 *   taskIds: ['T001'],
 *   labels: ['feature', 'auth', 'phase:core'],
 *   dependencies: [],
 *   bodyPreview: '## Description\nImplement user auth...',
 * };
 * ```
 */
export interface IssuePlan {
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

/**
 * Successfully created GitHub issue.
 *
 * Represents an issue that has been created in GitHub,
 * with its number and URL.
 *
 * @example
 * ```typescript
 * const issue: CreatedIssue = {
 *   number: 123,
 *   url: 'https://github.com/owner/repo/issues/123',
 *   title: '[T001] Implement user authentication',
 *   taskIds: ['T001'],
 *   groupId: 'T001',
 * };
 * ```
 */
export interface CreatedIssue {
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

/**
 * Result of tasks-to-issues operation.
 *
 * Summarizes the outcome of converting tasks to GitHub issues,
 * including created issues and any failures.
 *
 * @example
 * ```typescript
 * const result: TasksToIssuesResult = {
 *   success: true,
 *   groupingStrategy: 'per-story',
 *   issuesCreated: 3,
 *   issues: [issue1, issue2, issue3],
 *   tasksIncluded: 10,
 *   tasksSkipped: 2,
 *   skippedReasons: ['T011: Already has linked issue #45'],
 *   dryRun: false,
 * };
 * ```
 */
export interface TasksToIssuesResult {
  /** Whether operation completed successfully */
  success: boolean;

  /** Grouping strategy used */
  groupingStrategy: string;

  /** Number of issues created */
  issuesCreated: number;

  /** Created issues (or planned issues in dry-run mode) */
  issues: CreatedIssue[] | IssuePlan[];

  /** Total tasks included in issues */
  tasksIncluded: number;

  /** Tasks that were skipped */
  tasksSkipped: number;

  /** Reasons for skipped tasks */
  skippedReasons: string[];

  /** Whether this was a dry-run */
  dryRun: boolean;

  /** Error message if success is false */
  error?: string;
}

/**
 * Options for creating issues from tasks.
 *
 * @example
 * ```typescript
 * const options: TasksToIssuesOptions = {
 *   grouping: 'per-story',
 *   dryRun: true,
 *   epicNumber: 42,
 *   labels: ['feature'],
 * };
 * ```
 */
export interface TasksToIssuesOptions {
  /** Grouping strategy to use */
  grouping?: 'per-task' | 'per-story' | 'per-phase';

  /** Preview without creating */
  dryRun?: boolean;

  /** Parent epic issue number */
  epicNumber?: number;

  /** Additional labels to apply to all issues */
  labels?: string[];

  /** Skip tasks that already have linked issues */
  skipExisting?: boolean;
}

/**
 * Statistics about issue creation.
 *
 * @example
 * ```typescript
 * const stats: IssueCreationStats = {
 *   totalTasks: 15,
 *   completedTasks: 5,
 *   pendingTasks: 10,
 *   issuesPlanned: 3,
 *   tasksPerIssue: 3.33,
 * };
 * ```
 */
export interface IssueCreationStats {
  /** Total number of tasks */
  totalTasks: number;

  /** Already completed tasks (skipped) */
  completedTasks: number;

  /** Tasks pending (to be included) */
  pendingTasks: number;

  /** Number of issues to be created */
  issuesPlanned: number;

  /** Average tasks per issue */
  tasksPerIssue: number;
}
