/**
 * spec_kit.tasks_to_issues tool
 *
 * Converts tasks from tasks.md into GitHub issues with configurable
 * grouping strategies.
 *
 * Supports:
 * - Two task formats: individual tasks (T###) and task groups (TG-XXX)
 * - Three grouping strategies: per-task, per-story, per-phase
 * - Dependency validation with circular dependency detection
 * - Dry-run mode for previewing issue creation
 * - Duplicate detection via GitHub search
 * - Automatic update of tasks.md with created issue links
 *
 * @example
 * ```typescript
 * import { createTasksToIssuesTool } from './tasks-to-issues.js';
 *
 * const tool = createTasksToIssuesTool(config, core);
 *
 * // Dry run to preview issues
 * const preview = await tool.execute({ dry_run: true });
 *
 * // Create issues
 * const result = await tool.execute({ grouping: 'per-story' });
 * ```
 */

import * as path from 'node:path';
import type { AgencyTool, ToolResult, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitConfig } from '../config.js';
import type { GroupingStrategy, Task, TaskGroupEntry } from '../types/task.js';
import type {
  IssuePlan,
  CreatedIssue,
  TasksToIssuesResult,
} from '../types/issue.js';
import { exists, readFile, writeFile } from '../utils/fs.js';
import { getCurrentBranch } from '../utils/git.js';
import {
  parseTasksFile,
  filterEligibleTasks,
  filterEligibleGroups,
  updateTasksWithIssueLinks,
  type IssueLinksMap,
} from '../utils/task-parser.js';
import { validateTaskDependencies } from '../utils/dependency.js';
import {
  groupTasks,
  topologicalSort,
  convertGroupEntriesToTaskGroups,
  type SortableTaskGroup,
} from '../utils/grouping.js';
import {
  checkGhCli,
  createIssue,
  getIssueLabels,
  findExistingIssue,
  type GhCliError,
} from '../utils/github-cli.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input parameters for tasks_to_issues tool.
 */
interface TasksToIssuesParams {
  /**
   * Grouping strategy for creating issues.
   * - 'per-task': One issue per task (finest granularity)
   * - 'per-story': Group by user story (US#)
   * - 'per-phase': Group by phase (coarsest granularity)
   *
   * If not specified, auto-detected from labels or defaults to 'per-task'.
   */
  grouping?: GroupingStrategy;

  /**
   * Preview only, do not create issues.
   * Shows what issues would be created without actually creating them.
   */
  dry_run?: boolean;

  /**
   * Parent epic issue number.
   * If not specified, detected from branch name.
   */
  epic_number?: number;

  /**
   * Feature directory path.
   * If not specified, auto-detected from branch.
   */
  feature_dir?: string;

  /**
   * Working directory.
   */
  cwd?: string;
}

/**
 * Error codes for this tool.
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

/**
 * Structured error response.
 */
interface ErrorResponse {
  success: false;
  error: {
    code: TasksToIssuesErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an error response.
 */
function errorResult(
  code: TasksToIssuesErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolResult {
  const response: ErrorResponse = {
    success: false,
    error: { code, message, details },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(response) }],
    isError: true,
  };
}

/**
 * Create a success response.
 */
function successResult(data: TasksToIssuesResult): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

/**
 * Extract issue number from branch name.
 *
 * Handles formats like:
 * - '123-feature-name' -> 123
 * - 'feature/123-name' -> 123
 * - 'bug/123_some_feature' -> 123
 */
function extractIssueNumberFromBranch(branch: string): number | null {
  // Try to find a number at the start or after a prefix
  const match = branch.match(/(?:^|\/|_)(\d+)(?:-|_|$)/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

/**
 * Get feature directory path.
 *
 * If not provided, auto-detects from branch name.
 */
async function getFeatureDir(
  config: SpecKitConfig,
  params: TasksToIssuesParams
): Promise<string | null> {
  if (params.feature_dir) {
    return params.feature_dir;
  }

  const cwd = params.cwd ?? process.cwd();

  // Try to detect from branch
  const branch = await getCurrentBranch(cwd);
  if (!branch) {
    return null;
  }

  // Look for spec directory matching branch pattern
  const specsDir = path.join(cwd, config.paths.specs);
  if (!(await exists(specsDir))) {
    return null;
  }

  // The branch might be '164-d5-implement-tasks-issues' -> look for 'specs/164-*'
  const issueNum = extractIssueNumberFromBranch(branch);
  if (issueNum) {
    // Look for directory starting with issue number
    const { readDir } = await import('../utils/fs.js');
    const entries = await readDir(specsDir);

    for (const entry of entries) {
      if (entry.startsWith(`${issueNum}-`) || entry.startsWith(`${issueNum}_`)) {
        return path.join(specsDir, entry);
      }
    }
  }

  return null;
}

/**
 * Detect grouping strategy from issue labels.
 */
async function detectGroupingFromLabels(
  epicNumber: number | undefined,
  cwd?: string
): Promise<GroupingStrategy | null> {
  if (!epicNumber) {
    return null;
  }

  try {
    const labels = await getIssueLabels(epicNumber, cwd);

    // Check for grouping labels
    for (const label of labels) {
      if (label === 'epic-grouping:per-task') return 'per-task';
      if (label === 'epic-grouping:per-story') return 'per-story';
      if (label === 'epic-grouping:per-phase') return 'per-phase';
    }
  } catch {
    // Ignore errors - just use default
  }

  return null;
}

/**
 * Check if duplicate issues exist for a title.
 */
async function checkForDuplicate(
  title: string,
  cwd?: string
): Promise<number | null> {
  try {
    return await findExistingIssue(title, cwd);
  } catch {
    // Ignore search errors
    return null;
  }
}

/**
 * Create issue plans from task groups (dry run).
 */
function createIssuePlans(groups: SortableTaskGroup[]): IssuePlan[] {
  return groups.map((group) => ({
    title: group.title,
    groupId: group.id,
    taskCount: group.tasks.length || 1, // At least 1 for TG-XXX format
    taskIds: group.tasks.map((t) => t.id),
    labels: group.labels,
    dependencies: group.groupDependencies,
    bodyPreview: group.body.length > 500 ? group.body.slice(0, 497) + '...' : group.body,
  }));
}

// ============================================================================
// Main Tool
// ============================================================================

/**
 * Create the spec_kit.tasks_to_issues tool.
 *
 * @param config - SpecKit plugin configuration
 * @param core - Agency core API
 * @returns AgencyTool instance
 */
export function createTasksToIssuesTool(
  config: SpecKitConfig,
  _core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.tasks_to_issues',
    description:
      'Convert tasks from tasks.md into GitHub issues with configurable grouping strategies',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding', 'speckit'],
    inputSchema: {
      type: 'object',
      properties: {
        grouping: {
          type: 'string',
          enum: ['per-task', 'per-story', 'per-phase'],
          description:
            'Grouping strategy (optional - auto-detected from labels)',
        },
        dry_run: {
          type: 'boolean',
          default: false,
          description: 'Preview only, do not create issues',
        },
        epic_number: {
          type: 'number',
          description: 'Parent epic issue number (optional - detected from branch)',
        },
        feature_dir: {
          type: 'string',
          description: 'Feature directory path (optional - auto-detected)',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        grouping: groupingParam,
        dry_run = false,
        epic_number: epicNumberParam,
        feature_dir: featureDirParam,
        cwd = process.cwd(),
      } = params as TasksToIssuesParams;

      // Step 1: Check gh CLI availability
      const ghStatus = await checkGhCli(cwd);
      if (!ghStatus.ok) {
        if (ghStatus.message?.includes('not found')) {
          return errorResult(
            'GH_CLI_NOT_FOUND',
            'GitHub CLI (gh) not found. Install from: https://cli.github.com/'
          );
        }
        return errorResult(
          'GH_NOT_AUTHENTICATED',
          `GitHub CLI not authenticated. Run: gh auth login\n${ghStatus.message}`
        );
      }

      // Step 2: Determine feature directory
      const featureDir = await getFeatureDir(config, {
        feature_dir: featureDirParam,
        cwd,
      });

      if (!featureDir || !(await exists(featureDir))) {
        return errorResult(
          'FEATURE_DIR_NOT_FOUND',
          `Feature directory not found. Specify feature_dir or ensure you're on a feature branch.`
        );
      }

      // Step 3: Read and parse tasks.md
      const tasksPath = path.join(featureDir, 'tasks.md');
      if (!(await exists(tasksPath))) {
        return errorResult(
          'TASKS_FILE_NOT_FOUND',
          `tasks.md not found at: ${tasksPath}`
        );
      }

      const tasksContent = await readFile(tasksPath);
      if (!tasksContent.trim()) {
        return errorResult('TASKS_FILE_EMPTY', 'tasks.md is empty');
      }

      const parseResult = parseTasksFile(tasksContent);

      if (parseResult.format === 'unknown') {
        return errorResult(
          'TASKS_PARSE_ERROR',
          'Could not detect task format in tasks.md. Expected T### or TG-XXX format.',
          { warnings: parseResult.warnings }
        );
      }

      // Step 4: Get epic number (from param, branch, or directory name)
      let epicNumber = epicNumberParam;
      if (!epicNumber) {
        // Try to extract from feature directory name
        const dirName = path.basename(featureDir);
        const dirMatch = dirName.match(/^(\d+)-/);
        if (dirMatch?.[1]) {
          epicNumber = parseInt(dirMatch[1], 10);
        }
      }

      // Step 5: Determine grouping strategy
      let grouping: GroupingStrategy = groupingParam ?? 'per-task';
      if (!groupingParam) {
        // Try to detect from labels
        const detectedGrouping = await detectGroupingFromLabels(epicNumber, cwd);
        if (detectedGrouping) {
          grouping = detectedGrouping;
        }
      }

      // Step 6: Handle different formats
      let groups: SortableTaskGroup[] = [];
      let eligibleTasks: Task[] = [];
      let eligibleGroups: TaskGroupEntry[] = [];

      const featureName = path.basename(featureDir);

      if (parseResult.format === 'individual') {
        eligibleTasks = filterEligibleTasks(parseResult.tasks);

        if (eligibleTasks.length === 0) {
          return successResult({
            success: true,
            groupingStrategy: grouping,
            issuesCreated: 0,
            issues: [],
            tasksIncluded: 0,
            tasksSkipped: parseResult.tasks.length,
            skippedReasons: ['All tasks are either completed or already have linked issues'],
            dryRun: dry_run,
          });
        }

        // Step 7: Validate dependencies
        const validation = validateTaskDependencies(eligibleTasks);
        if (!validation.valid) {
          const circularErrors = validation.errors.filter((e) => e.type === 'circular');
          if (circularErrors.length > 0) {
            return errorResult(
              'CIRCULAR_DEPENDENCY',
              'Circular dependencies detected in tasks',
              {
                cycles: circularErrors.map((e) => ({
                  tasks: e.taskIds,
                  description: e.message,
                })),
              }
            );
          }

          // Non-circular errors are warnings, not blockers
          // (missing dependencies might refer to already-completed tasks)
        }

        // Step 8: Group tasks
        groups = groupTasks(eligibleTasks, grouping, featureName);
      } else {
        // TG-XXX format
        eligibleGroups = filterEligibleGroups(parseResult.groups);

        if (eligibleGroups.length === 0) {
          return successResult({
            success: true,
            groupingStrategy: grouping,
            issuesCreated: 0,
            issues: [],
            tasksIncluded: 0,
            tasksSkipped: parseResult.groups.length,
            skippedReasons: ['All task groups are either completed or already have linked issues'],
            dryRun: dry_run,
          });
        }

        // Convert TaskGroupEntry to SortableTaskGroup
        groups = convertGroupEntriesToTaskGroups(eligibleGroups, featureName, epicNumber);
      }

      // Step 9: Topological sort
      const sortedGroups = topologicalSort(groups);

      // Step 10: Dry run - just return plans
      if (dry_run) {
        const plans = createIssuePlans(sortedGroups);

        return successResult({
          success: true,
          groupingStrategy: grouping,
          issuesCreated: 0,
          issues: plans,
          tasksIncluded:
            parseResult.format === 'individual'
              ? eligibleTasks.length
              : eligibleGroups.reduce((acc, g) => acc + g.subtasks.length, 0),
          tasksSkipped:
            parseResult.format === 'individual'
              ? parseResult.tasks.length - eligibleTasks.length
              : parseResult.groups.length - eligibleGroups.length,
          skippedReasons: [],
          dryRun: true,
        });
      }

      // Step 11: Create issues
      const createdIssues: CreatedIssue[] = [];
      const skippedReasons: string[] = [];
      const issueLinks: IssueLinksMap = new Map();

      for (const group of sortedGroups) {
        // Check for duplicates
        const existing = await checkForDuplicate(group.title, cwd);
        if (existing) {
          skippedReasons.push(`${group.id}: Already exists as #${existing}`);
          // Still add to links map so we can update tasks.md
          issueLinks.set(group.id, {
            number: existing,
            url: `https://github.com/OWNER/REPO/issues/${existing}`, // URL will be updated
          });
          continue;
        }

        // Build labels including epic reference
        const labels = [...group.labels];
        if (epicNumber) {
          labels.push(`epic:${epicNumber}`);
        }

        // Create the issue
        try {
          const result = await createIssue({
            title: group.title,
            body: group.body,
            labels,
            cwd,
          });

          createdIssues.push({
            number: result.number,
            url: result.url,
            title: result.title,
            taskIds: group.tasks.map((t) => t.id),
            groupId: group.id,
          });

          issueLinks.set(group.id, {
            number: result.number,
            url: result.url,
          });

          // Also add individual task IDs for per-story/per-phase grouping
          for (const task of group.tasks) {
            if (task.id !== group.id) {
              issueLinks.set(task.id, {
                number: result.number,
                url: result.url,
              });
            }
          }
        } catch (error) {
          const ghError = error as GhCliError;
          skippedReasons.push(`${group.id}: Failed to create - ${ghError.message}`);
        }
      }

      // Step 12: Update tasks.md with issue links
      let _tasksUpdated = false;
      if (issueLinks.size > 0) {
        try {
          const updatedContent = updateTasksWithIssueLinks(tasksContent, issueLinks);
          if (updatedContent !== tasksContent) {
            await writeFile(tasksPath, updatedContent);
            _tasksUpdated = true;
          }
        } catch {
          // Log warning but don't fail
          skippedReasons.push('Warning: Failed to update tasks.md with issue links');
        }
      }

      // Step 13: Return result
      return successResult({
        success: true,
        groupingStrategy: grouping,
        issuesCreated: createdIssues.length,
        issues: createdIssues,
        tasksIncluded:
          parseResult.format === 'individual'
            ? eligibleTasks.length
            : eligibleGroups.reduce((acc, g) => acc + g.subtasks.length, 0),
        tasksSkipped:
          parseResult.format === 'individual'
            ? parseResult.tasks.length - eligibleTasks.length
            : parseResult.groups.length - eligibleGroups.length,
        skippedReasons,
        dryRun: false,
      });
    },
  };
}
