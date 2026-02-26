/**
 * Task grouping utilities for issue creation.
 *
 * Provides functions to group tasks into GitHub issues using different
 * strategies (per-task, per-story, per-phase) and sort them by dependencies.
 *
 * @example
 * ```typescript
 * import {
 *   groupTasks,
 *   groupByTask,
 *   groupByStory,
 *   groupByPhase,
 *   topologicalSort,
 *   buildIssueBody,
 * } from './grouping.js';
 *
 * const tasks = parseTasksContent(content);
 * const groups = groupTasks(tasks, 'per-story', 'my-feature');
 * const sorted = topologicalSort(groups);
 * ```
 */

import type { Task, TaskGroup, GroupingStrategy, TaskGroupEntry } from '../types/task.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Extended TaskGroup with dependency info for sorting.
 */
export interface SortableTaskGroup extends TaskGroup {
  /** IDs of groups this group depends on */
  groupDependencies: string[];
}

// ============================================================================
// Grouping Strategies
// ============================================================================

/**
 * Group tasks into one issue per task.
 *
 * This is the finest granularity, creating a separate issue for each task.
 *
 * @param tasks - Array of tasks to group
 * @param featureName - Optional feature name for title prefix
 * @returns Array of task groups (one per task)
 *
 * @example
 * ```typescript
 * const groups = groupByTask(tasks, 'user-auth');
 * // Each task becomes its own group/issue
 * ```
 */
export function groupByTask(tasks: Task[], featureName?: string): SortableTaskGroup[] {
  return tasks.map((task) => {
    const titlePrefix = featureName ? `[${featureName}] ` : '';
    const title = `${titlePrefix}${task.id}: ${task.description}`;

    return {
      id: task.id,
      groupType: 'task',
      tasks: [task],
      title,
      body: buildIssueBody([task], task.id, featureName),
      labels: buildLabels(task),
      dependencies: task.dependencies,
      groupDependencies: task.dependencies, // Direct mapping for single-task groups
    };
  });
}

/**
 * Group tasks by user story (US#).
 *
 * Tasks with the same user story are grouped into a single issue.
 * Tasks without a user story are grouped individually.
 *
 * @param tasks - Array of tasks to group
 * @param featureName - Optional feature name for title prefix
 * @returns Array of task groups (one per user story)
 *
 * @example
 * ```typescript
 * const groups = groupByStory(tasks, 'user-auth');
 * // Tasks with [US1] grouped together, [US2] together, etc.
 * ```
 */
export function groupByStory(tasks: Task[], featureName?: string): SortableTaskGroup[] {
  const storyMap = new Map<string, Task[]>();
  const ungrouped: Task[] = [];

  // Group tasks by user story
  for (const task of tasks) {
    if (task.userStory) {
      const existing = storyMap.get(task.userStory) ?? [];
      existing.push(task);
      storyMap.set(task.userStory, existing);
    } else {
      ungrouped.push(task);
    }
  }

  const groups: SortableTaskGroup[] = [];

  // Create groups for each user story
  for (const [storyId, storyTasks] of storyMap) {
    const titlePrefix = featureName ? `[${featureName}] ` : '';
    const title = `${titlePrefix}[${storyId}] ${getStoryDescription(storyTasks)}`;

    // Collect all task dependencies
    const allDeps = new Set<string>();
    for (const task of storyTasks) {
      for (const dep of task.dependencies) {
        // Only include external dependencies (not in this group)
        if (!storyTasks.some((t) => t.id === dep)) {
          allDeps.add(dep);
        }
      }
    }

    // Map task dependencies to group dependencies
    const groupDeps = mapToGroupDependencies(
      Array.from(allDeps),
      storyMap,
      tasks
    );

    groups.push({
      id: storyId,
      groupType: 'story',
      tasks: storyTasks,
      title,
      body: buildIssueBody(storyTasks, storyId, featureName),
      labels: buildLabelsForGroup(storyTasks),
      dependencies: storyTasks.flatMap((t) => t.dependencies),
      groupDependencies: groupDeps,
    });
  }

  // Create individual groups for ungrouped tasks
  for (const task of ungrouped) {
    const singleGroup = groupByTask([task], featureName)[0];
    if (singleGroup) {
      groups.push(singleGroup);
    }
  }

  return groups;
}

/**
 * Group tasks by phase.
 *
 * Tasks with the same phase are grouped into a single issue.
 * This is the coarsest granularity.
 *
 * @param tasks - Array of tasks to group
 * @param featureName - Optional feature name for title prefix
 * @returns Array of task groups (one per phase)
 *
 * @example
 * ```typescript
 * const groups = groupByPhase(tasks, 'user-auth');
 * // All "Phase 1: Setup" tasks grouped, "Phase 2: Core" together, etc.
 * ```
 */
export function groupByPhase(tasks: Task[], featureName?: string): SortableTaskGroup[] {
  const phaseMap = new Map<string, Task[]>();
  const ungrouped: Task[] = [];

  // Group tasks by phase
  for (const task of tasks) {
    if (task.phase) {
      const existing = phaseMap.get(task.phase) ?? [];
      existing.push(task);
      phaseMap.set(task.phase, existing);
    } else {
      ungrouped.push(task);
    }
  }

  const groups: SortableTaskGroup[] = [];

  // Create groups for each phase
  for (const [phase, phaseTasks] of phaseMap) {
    const titlePrefix = featureName ? `[${featureName}] ` : '';
    const title = `${titlePrefix}${phase}`;

    // Collect external dependencies
    const allDeps = new Set<string>();
    for (const task of phaseTasks) {
      for (const dep of task.dependencies) {
        if (!phaseTasks.some((t) => t.id === dep)) {
          allDeps.add(dep);
        }
      }
    }

    // Map to group dependencies (phases that contain the dependencies)
    const groupDeps = mapToGroupDependencies(
      Array.from(allDeps),
      phaseMap,
      tasks,
      'phase'
    );

    groups.push({
      id: phase,
      groupType: 'phase',
      tasks: phaseTasks,
      title,
      body: buildIssueBody(phaseTasks, phase, featureName),
      labels: buildLabelsForGroup(phaseTasks),
      dependencies: phaseTasks.flatMap((t) => t.dependencies),
      groupDependencies: groupDeps,
    });
  }

  // Create individual groups for ungrouped tasks
  for (const task of ungrouped) {
    const singleGroup = groupByTask([task], featureName)[0];
    if (singleGroup) {
      groups.push(singleGroup);
    }
  }

  return groups;
}

/**
 * Group tasks using the specified strategy.
 *
 * Main entry point for task grouping.
 *
 * @param tasks - Array of tasks to group
 * @param strategy - Grouping strategy to use
 * @param featureName - Optional feature name for title prefix
 * @returns Array of task groups
 *
 * @example
 * ```typescript
 * const groups = groupTasks(tasks, 'per-story', 'my-feature');
 * ```
 */
export function groupTasks(
  tasks: Task[],
  strategy: GroupingStrategy,
  featureName?: string
): SortableTaskGroup[] {
  switch (strategy) {
    case 'per-task':
      return groupByTask(tasks, featureName);
    case 'per-story':
      return groupByStory(tasks, featureName);
    case 'per-phase':
      return groupByPhase(tasks, featureName);
    default:
      // Default to per-task for unknown strategies
      return groupByTask(tasks, featureName);
  }
}

// ============================================================================
// Topological Sort
// ============================================================================

/**
 * Topologically sort task groups by dependencies using Kahn's algorithm.
 *
 * Returns groups in an order where all dependencies come before dependents.
 *
 * @param groups - Array of task groups with dependencies
 * @returns Sorted array of groups
 * @throws Error if circular dependency detected
 *
 * @example
 * ```typescript
 * const groups = groupTasks(tasks, 'per-task');
 * const sorted = topologicalSort(groups);
 * // Groups are now in dependency order
 * ```
 */
export function topologicalSort(groups: SortableTaskGroup[]): SortableTaskGroup[] {
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize in-degree and adjacency list
  for (const group of groups) {
    inDegree.set(group.id, 0);
    adjacency.set(group.id, []);
  }

  // Build the graph
  for (const group of groups) {
    for (const depId of group.groupDependencies) {
      // Only count dependencies that are in our group set
      if (groupMap.has(depId)) {
        inDegree.set(group.id, (inDegree.get(group.id) ?? 0) + 1);
        const adj = adjacency.get(depId) ?? [];
        adj.push(group.id);
        adjacency.set(depId, adj);
      }
    }
  }

  // Find all nodes with in-degree 0 (no dependencies)
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const result: SortableTaskGroup[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = groupMap.get(currentId);
    if (current) {
      result.push(current);
    }

    // Reduce in-degree of dependents
    const dependents = adjacency.get(currentId) ?? [];
    for (const depId of dependents) {
      const newDegree = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, newDegree);

      if (newDegree === 0) {
        queue.push(depId);
      }
    }
  }

  // Check if all nodes were processed
  if (result.length !== groups.length) {
    // There's a cycle - return as-is with a warning
    // The cycle detection in dependency.ts should catch this earlier
    console.warn(
      'Warning: Could not fully sort groups - possible circular dependency'
    );
    // Add remaining groups that weren't sorted
    for (const group of groups) {
      if (!result.includes(group)) {
        result.push(group);
      }
    }
  }

  return result;
}

// ============================================================================
// Issue Body Generation
// ============================================================================

/**
 * Build GitHub issue body markdown for a task group.
 *
 * @param tasks - Tasks in this group
 * @param groupId - Group identifier
 * @param featureName - Optional feature name
 * @param epicNum - Optional parent epic issue number
 * @returns Markdown body for the issue
 *
 * @example
 * ```typescript
 * const body = buildIssueBody(tasks, 'T001', 'my-feature', 42);
 * ```
 */
export function buildIssueBody(
  tasks: Task[],
  groupId: string,
  featureName?: string,
  epicNum?: number
): string {
  const lines: string[] = [];

  // Parent epic reference
  if (epicNum) {
    lines.push(`## Parent Epic`);
    lines.push(`Part of #${epicNum}`);
    lines.push('');
  }

  // Tasks section with checkboxes
  lines.push('## Tasks');
  lines.push('');

  for (const task of tasks) {
    const checkbox = task.completed ? '[x]' : '[ ]';
    let taskLine = `- ${checkbox} **${task.id}**: ${task.description}`;

    if (task.dependencies.length > 0) {
      taskLine += ` _(deps: ${task.dependencies.join(', ')})_`;
    }

    lines.push(taskLine);
  }

  // Phase info
  const phases = [...new Set(tasks.map((t) => t.phase).filter(Boolean))];
  if (phases.length > 0) {
    lines.push('');
    lines.push('## Phase');
    lines.push(phases.join(', '));
  }

  // Dependencies section
  const allDeps = [...new Set(tasks.flatMap((t) => t.dependencies))];
  const externalDeps = allDeps.filter((dep) => !tasks.some((t) => t.id === dep));

  if (externalDeps.length > 0) {
    lines.push('');
    lines.push('## Dependencies');
    lines.push('');
    for (const dep of externalDeps) {
      lines.push(`- ${dep}`);
    }
  }

  // Metadata comment
  lines.push('');
  lines.push('---');
  lines.push(`<!-- speckit-group: ${groupId} -->`);
  if (featureName) {
    lines.push(`<!-- speckit-feature: ${featureName} -->`);
  }
  if (epicNum) {
    lines.push(`<!-- epic-parent: ${epicNum} -->`);
  }

  return lines.join('\n');
}

/**
 * Build issue body for a TaskGroupEntry (TG-XXX format).
 *
 * @param group - Task group entry
 * @param featureName - Optional feature name
 * @param epicNum - Optional parent epic issue number
 * @returns Markdown body for the issue
 */
export function buildIssueBodyForGroup(
  group: TaskGroupEntry,
  featureName?: string,
  epicNum?: number
): string {
  const lines: string[] = [];

  // Parent epic reference
  if (epicNum) {
    lines.push(`## Parent Epic`);
    lines.push(`Part of #${epicNum}`);
    lines.push('');
  }

  // Title/Description
  lines.push(`## ${group.title}`);
  lines.push('');

  // Metadata
  if (group.scope) {
    lines.push(`**Scope**: ${group.scope}`);
    lines.push('');
  }

  // Files
  if (group.files && group.files.length > 0) {
    lines.push('**Files**:');
    for (const file of group.files) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }

  // Tests
  if (group.tests) {
    lines.push(`**Tests**: ${group.tests}`);
    lines.push('');
  }

  // Subtasks
  if (group.subtasks.length > 0) {
    lines.push('## Tasks');
    lines.push('');
    for (const subtask of group.subtasks) {
      const checkbox = subtask.completed ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${subtask.description}`);
    }
  }

  // Phase info
  if (group.phase) {
    lines.push('');
    lines.push('## Phase');
    lines.push(group.phase);
  }

  // User story
  if (group.userStory) {
    lines.push('');
    lines.push('## User Story');
    lines.push(group.userStory);
  }

  // Metadata comment
  lines.push('');
  lines.push('---');
  lines.push(`<!-- speckit-group: ${group.id} -->`);
  if (featureName) {
    lines.push(`<!-- speckit-feature: ${featureName} -->`);
  }
  if (epicNum) {
    lines.push(`<!-- epic-parent: ${epicNum} -->`);
  }

  return lines.join('\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a description for a user story from its tasks.
 */
function getStoryDescription(tasks: Task[]): string {
  // Use the first task's description, truncated if needed
  if (tasks.length === 0) return 'Tasks';

  const firstTask = tasks[0];
  if (!firstTask) return 'Tasks';

  const desc = firstTask.description;
  if (desc.length > 50) {
    return desc.slice(0, 47) + '...';
  }
  return desc;
}

/**
 * Build labels for a single task.
 */
function buildLabels(task: Task): string[] {
  const labels: string[] = [];

  if (task.phase) {
    // Normalize phase to label format
    const phaseLabel = task.phase
      .toLowerCase()
      .replace(/^phase\s*\d+:\s*/i, '')
      .replace(/\s+/g, '-');
    labels.push(`phase:${phaseLabel}`);
  }

  if (task.userStory) {
    labels.push(task.userStory.toLowerCase());
  }

  if (task.isParallel) {
    labels.push('parallel');
  }

  return labels;
}

/**
 * Build labels for a group of tasks.
 */
function buildLabelsForGroup(tasks: Task[]): string[] {
  const labelSet = new Set<string>();

  for (const task of tasks) {
    for (const label of buildLabels(task)) {
      labelSet.add(label);
    }
  }

  return Array.from(labelSet);
}

/**
 * Map task dependencies to group dependencies.
 *
 * When grouping tasks, we need to map individual task dependencies
 * to the groups that contain those tasks.
 */
function mapToGroupDependencies(
  taskDeps: string[],
  groupMap: Map<string, Task[]>,
  allTasks: Task[],
  groupBy: 'userStory' | 'phase' = 'userStory'
): string[] {
  const groupDeps = new Set<string>();

  for (const dep of taskDeps) {
    // Find which group contains this task dependency
    for (const [groupId, groupTasks] of groupMap) {
      if (groupTasks.some((t) => t.id === dep)) {
        groupDeps.add(groupId);
        break;
      }
    }

    // If not found in any group, check if it's an ungrouped task
    const task = allTasks.find((t) => t.id === dep);
    if (task) {
      const groupKey =
        groupBy === 'userStory' ? task.userStory : task.phase;
      if (!groupKey) {
        // Ungrouped task - treat its ID as the group ID
        groupDeps.add(task.id);
      }
    }
  }

  return Array.from(groupDeps);
}

/**
 * Convert TaskGroupEntry array to SortableTaskGroup array.
 *
 * Used when working with TG-XXX format.
 */
export function convertGroupEntriesToTaskGroups(
  entries: TaskGroupEntry[],
  featureName?: string,
  epicNum?: number
): SortableTaskGroup[] {
  return entries.map((entry) => ({
    id: entry.id,
    groupType: 'task' as const,
    tasks: [], // TG-XXX format uses subtasks, not Task[]
    title: `${entry.id}: ${entry.title}`,
    body: buildIssueBodyForGroup(entry, featureName, epicNum),
    labels: entry.userStory ? [entry.userStory.toLowerCase()] : [],
    dependencies: [], // TG-XXX doesn't have explicit dependencies
    groupDependencies: [],
  }));
}
