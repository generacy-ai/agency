/**
 * Task grouping strategies for converting tasks to issues
 * Implements per-task, per-story, and per-phase grouping
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Task structure as expected by grouping utilities
 */
export interface Task {
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

/**
 * Grouping strategy for converting tasks to issues
 */
export type GroupingStrategy = 'per-task' | 'per-story' | 'per-phase';

/**
 * A group of tasks that will become a single GitHub issue
 */
export interface TaskGroup {
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

/**
 * Issue plan for preview/dry-run mode
 */
export interface IssuePlan {
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

// Re-export dependency types for convenience
export type { DependencyGenerationOptions } from './dependency.js';
export { DEFAULT_DEPENDENCY_OPTIONS } from './dependency.js';

// ============================================================================
// Grouping Functions
// ============================================================================

/**
 * Group tasks by individual task (one issue per task)
 *
 * @param tasks - Array of tasks to group
 * @param featureName - Feature name for title generation
 * @returns Array of TaskGroups, one per task
 */
export function groupByTask(tasks: Task[], featureName: string): TaskGroup[] {
  return tasks.map((task) => ({
    id: task.id,
    groupType: 'task' as const,
    tasks: [task],
    title: buildTaskTitle(task, featureName),
    body: '', // Will be built later with full context
    labels: ['epic-child'],
    dependencies: task.dependencies,
  }));
}

/**
 * Group tasks by user story (one issue per story)
 *
 * @param tasks - Array of tasks to group
 * @param featureName - Feature name for title generation
 * @returns Array of TaskGroups, one per story plus ungrouped tasks
 */
export function groupByStory(tasks: Task[], featureName: string): TaskGroup[] {
  const storyMap = new Map<string, Task[]>();
  const noStoryTasks: Task[] = [];

  // Group tasks by user story
  for (const task of tasks) {
    if (task.userStory) {
      const existing = storyMap.get(task.userStory) || [];
      existing.push(task);
      storyMap.set(task.userStory, existing);
    } else {
      noStoryTasks.push(task);
    }
  }

  const groups: TaskGroup[] = [];

  // Create groups for each story
  for (const [story, storyTasks] of storyMap) {
    // Collect all dependencies that are not within this group
    const internalTaskIds = new Set(storyTasks.map((t) => t.id));
    const externalDeps = new Set<string>();

    for (const task of storyTasks) {
      for (const dep of task.dependencies) {
        if (!internalTaskIds.has(dep)) {
          externalDeps.add(dep);
        }
      }
    }

    groups.push({
      id: story,
      groupType: 'story',
      tasks: storyTasks,
      title: buildStoryTitle(story, storyTasks, featureName),
      body: '', // Will be built later
      labels: ['epic-child'],
      dependencies: Array.from(externalDeps),
    });
  }

  // Tasks without a story become individual issues
  for (const task of noStoryTasks) {
    groups.push({
      id: task.id,
      groupType: 'task',
      tasks: [task],
      title: buildTaskTitle(task, featureName),
      body: '',
      labels: ['epic-child'],
      dependencies: task.dependencies,
    });
  }

  return groups;
}

/**
 * Group tasks by phase (one issue per phase)
 *
 * @param tasks - Array of tasks to group
 * @param featureName - Feature name for title generation
 * @returns Array of TaskGroups, one per phase plus ungrouped tasks
 */
export function groupByPhase(tasks: Task[], featureName: string): TaskGroup[] {
  const phaseMap = new Map<string, Task[]>();
  const noPhaseTasks: Task[] = [];

  // Group tasks by phase
  for (const task of tasks) {
    if (task.phase) {
      const existing = phaseMap.get(task.phase) || [];
      existing.push(task);
      phaseMap.set(task.phase, existing);
    } else {
      noPhaseTasks.push(task);
    }
  }

  const groups: TaskGroup[] = [];

  // Create groups for each phase
  for (const [phase, phaseTasks] of phaseMap) {
    // Collect external dependencies
    const internalTaskIds = new Set(phaseTasks.map((t) => t.id));
    const externalDeps = new Set<string>();

    for (const task of phaseTasks) {
      for (const dep of task.dependencies) {
        if (!internalTaskIds.has(dep)) {
          externalDeps.add(dep);
        }
      }
    }

    groups.push({
      id: phase,
      groupType: 'phase',
      tasks: phaseTasks,
      title: buildPhaseTitle(phase, featureName),
      body: '',
      labels: ['epic-child'],
      dependencies: Array.from(externalDeps),
    });
  }

  // Tasks without a phase become individual issues
  for (const task of noPhaseTasks) {
    groups.push({
      id: task.id,
      groupType: 'task',
      tasks: [task],
      title: buildTaskTitle(task, featureName),
      body: '',
      labels: ['epic-child'],
      dependencies: task.dependencies,
    });
  }

  return groups;
}

/**
 * Group tasks using the specified strategy
 *
 * @param tasks - Array of tasks to group
 * @param strategy - Grouping strategy to use
 * @param featureName - Feature name for title generation
 * @returns Array of TaskGroups according to the strategy
 */
export function groupTasks(
  tasks: Task[],
  strategy: GroupingStrategy,
  featureName: string
): TaskGroup[] {
  switch (strategy) {
    case 'per-task':
      return groupByTask(tasks, featureName);
    case 'per-story':
      return groupByStory(tasks, featureName);
    case 'per-phase':
      return groupByPhase(tasks, featureName);
    default:
      // Fallback to per-task
      return groupByTask(tasks, featureName);
  }
}

// ============================================================================
// Title Building Functions
// ============================================================================

/**
 * Build title for a single task issue
 *
 * @param task - Task to build title for
 * @param featureName - Feature name for context
 * @returns Generated issue title
 */
export function buildTaskTitle(task: Task, featureName: string): string {
  // Extract issue number from feature name
  const issueMatch = featureName.match(/^(\d+)-/);
  const issueNum = issueMatch && issueMatch[1] ? `#${parseInt(issueMatch[1], 10)}` : '';

  // Truncate description if too long
  const maxDescLength = 60;
  const desc =
    task.description.length > maxDescLength
      ? task.description.substring(0, maxDescLength - 3) + '...'
      : task.description;

  return `[${task.id}] ${desc}${issueNum ? ` (${issueNum})` : ''}`;
}

/**
 * Build title for a user story issue
 *
 * @param story - Story identifier
 * @param tasks - Tasks in the story
 * @param featureName - Feature name for context
 * @returns Generated issue title
 */
export function buildStoryTitle(
  story: string,
  tasks: Task[],
  featureName: string
): string {
  const issueMatch = featureName.match(/^(\d+)-/);
  const issueNum = issueMatch && issueMatch[1] ? `#${parseInt(issueMatch[1], 10)}` : '';

  // Try to extract a meaningful title from task descriptions
  const taskIds = tasks.map((t) => t.id).join(', ');

  return `[${story}] Tasks: ${taskIds}${issueNum ? ` (${issueNum})` : ''}`;
}

/**
 * Build title for a phase issue
 *
 * @param phase - Phase name
 * @param featureName - Feature name for context
 * @returns Generated issue title
 */
export function buildPhaseTitle(phase: string, featureName: string): string {
  const issueMatch = featureName.match(/^(\d+)-/);
  const issueNum = issueMatch && issueMatch[1] ? `#${parseInt(issueMatch[1], 10)}` : '';

  return `${phase}${issueNum ? ` (${issueNum})` : ''}`;
}

// ============================================================================
// Issue Body Building Functions
// ============================================================================

/**
 * Build issue body with tasks and metadata
 *
 * @param group - TaskGroup to build body for
 * @param epicNumber - Optional parent epic issue number
 * @param featureName - Optional feature directory name
 * @param resolvedDeps - Optional map of taskId -> issueNumber for resolved dependencies
 * @returns Markdown issue body string
 */
export function buildIssueBody(
  group: TaskGroup,
  epicNumber?: number,
  featureName?: string,
  resolvedDeps?: Map<string, number>
): string {
  const sections: string[] = [];

  // Description section
  sections.push('## Description\n');

  if (group.groupType === 'task' && group.tasks[0]) {
    sections.push(group.tasks[0].description);
  } else if (group.groupType === 'story') {
    sections.push(`Implementation tasks for ${group.id}.\n`);
  } else {
    sections.push(`Implementation tasks for ${group.id}.\n`);
  }

  sections.push('');

  // Tasks section (as checkboxes)
  sections.push('## Tasks\n');
  for (const task of group.tasks) {
    const checkbox = task.completed ? '[x]' : '[ ]';
    sections.push(`- ${checkbox} ${task.id}: ${task.description}`);
  }
  sections.push('');

  // Source metadata (HTML comments for machine parsing)
  sections.push('## Source\n');
  if (epicNumber) {
    sections.push(`<!-- epic-parent: ${epicNumber} -->`);
  }
  if (featureName) {
    sections.push(`<!-- source-feature: ${featureName} -->`);
  }
  sections.push('');

  // Dependencies section
  if (group.dependencies.length > 0) {
    sections.push('## Dependencies\n');

    // Build dependency references (prefer issue numbers if available)
    const depRefs: string[] = [];
    for (const dep of group.dependencies) {
      if (resolvedDeps?.has(dep)) {
        depRefs.push(`#${resolvedDeps.get(dep)}`);
      } else {
        depRefs.push(dep);
      }
    }

    sections.push(`<!-- depends-on: ${depRefs.join(', ')} -->`);
    sections.push(`Depends on: ${depRefs.join(', ')}`);
    sections.push('');
  }

  // Footer
  sections.push('---');
  sections.push('*Generated from tasks.md by speckit*');

  return sections.join('\n');
}

/**
 * Build issue body with resolved dependencies
 *
 * @param group - Task group to build body for
 * @param epicNumber - Parent epic issue number
 * @param featureName - Feature directory name
 * @param groupToIssue - Map of group ID to created issue number
 * @param taskToGroup - Map of task ID to group ID
 * @returns Issue body string with depends-on metadata
 */
export function buildIssueBodyWithDependencies(
  group: TaskGroup,
  epicNumber?: number,
  featureName?: string,
  groupToIssue?: Map<string, number>,
  taskToGroup?: Map<string, string>
): string {
  // Resolve dependencies to issue numbers if possible
  let resolvedDeps: Map<string, number> | undefined;

  if (groupToIssue && taskToGroup && group.dependencies.length > 0) {
    const issueNums = resolveDependenciesToIssues(
      group.dependencies,
      groupToIssue,
      taskToGroup
    );

    if (issueNums.length > 0) {
      // Build a map for the existing buildIssueBody function
      resolvedDeps = new Map();
      for (let i = 0; i < group.dependencies.length && i < issueNums.length; i++) {
        const dep = group.dependencies[i];
        const issueNum = issueNums[i];
        if (dep !== undefined && issueNum !== undefined) {
          resolvedDeps.set(dep, issueNum);
        }
      }
    }
  }

  return buildIssueBody(group, epicNumber, featureName, resolvedDeps);
}

/**
 * Convert TaskGroup to IssuePlan for preview mode
 *
 * @param group - TaskGroup to convert
 * @param epicNumber - Optional parent epic issue number
 * @param featureName - Optional feature directory name
 * @returns IssuePlan for preview display
 */
export function groupToIssuePlan(
  group: TaskGroup,
  epicNumber?: number,
  featureName?: string
): IssuePlan {
  const body = buildIssueBody(group, epicNumber, featureName);

  return {
    title: group.title,
    groupId: group.id,
    taskCount: group.tasks.length,
    taskIds: group.tasks.map((t) => t.id),
    labels: group.labels,
    dependencies: group.dependencies,
    bodyPreview: body.length > 500 ? body.substring(0, 497) + '...' : body,
  };
}

// ============================================================================
// Auto-Dependencies and Sorting
// ============================================================================

/**
 * Extract unique phases from groups in order of appearance
 *
 * @param groups - Array of task groups
 * @returns Array of unique phase names in order
 */
export function extractPhases(groups: TaskGroup[]): string[] {
  const phases: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const task of group.tasks) {
      if (task.phase && !seen.has(task.phase)) {
        phases.push(task.phase);
        seen.add(task.phase);
      }
    }
  }

  return phases;
}

/**
 * Generate phase-based dependencies
 * All issues in Phase N depend on ALL issues in Phase N-1
 *
 * @param groups - Array of task groups (should be sorted by phase)
 * @returns Map of group ID to additional dependency group IDs
 */
export function generatePhaseDependencies(
  groups: TaskGroup[]
): Map<string, string[]> {
  const phaseDeps = new Map<string, string[]>();
  const phases = extractPhases(groups);

  // Build map of phase -> groups in that phase
  const phaseGroups = new Map<string, TaskGroup[]>();
  for (const phase of phases) {
    phaseGroups.set(phase, []);
  }

  for (const group of groups) {
    // Get the phase from the first task (groups should be homogeneous)
    const phase = group.tasks[0]?.phase;
    if (phase && phaseGroups.has(phase)) {
      phaseGroups.get(phase)?.push(group);
    }
  }

  // Generate cross-phase dependencies
  for (let i = 1; i < phases.length; i++) {
    const currentPhase = phases[i]!;
    const previousPhase = phases[i - 1]!;

    const currentGroups = phaseGroups.get(currentPhase) || [];
    const previousGroups = phaseGroups.get(previousPhase) || [];
    const previousGroupIds = previousGroups.map((g) => g.id);

    // All groups in current phase depend on all groups in previous phase
    for (const group of currentGroups) {
      const existingDeps = phaseDeps.get(group.id) || [];
      phaseDeps.set(group.id, [...existingDeps, ...previousGroupIds]);
    }
  }

  return phaseDeps;
}

/**
 * Generate sequential dependencies within phases
 * Groups within the same phase depend on the previous group
 *
 * @param groups - Array of task groups
 * @returns Map of group ID to sequential dependency group ID
 */
export function generateSequentialDependencies(
  groups: TaskGroup[]
): Map<string, string[]> {
  const seqDeps = new Map<string, string[]>();
  const phases = extractPhases(groups);

  // Build map of phase -> groups in that phase (in order)
  const phaseGroups = new Map<string, TaskGroup[]>();
  for (const phase of phases) {
    phaseGroups.set(phase, []);
  }

  for (const group of groups) {
    const phase = group.tasks[0]?.phase;
    if (phase && phaseGroups.has(phase)) {
      phaseGroups.get(phase)?.push(group);
    }
  }

  // Generate sequential dependencies within each phase
  for (const [, groupsInPhase] of phaseGroups) {
    for (let i = 1; i < groupsInPhase.length; i++) {
      const currentGroup = groupsInPhase[i]!;
      const previousGroup = groupsInPhase[i - 1]!;

      const existingDeps = seqDeps.get(currentGroup.id) || [];
      seqDeps.set(currentGroup.id, [...existingDeps, previousGroup.id]);
    }
  }

  return seqDeps;
}

/**
 * Apply auto-generated dependencies to groups
 *
 * @param groups - Array of task groups
 * @param options - Dependency generation options
 * @returns Groups with updated dependencies
 */
export function applyAutoDependencies(
  groups: TaskGroup[],
  options?: import('./dependency.js').DependencyGenerationOptions
): TaskGroup[] {
  // Import default options dynamically to avoid circular dependency issues
  const effectiveOptions = options || {
    intraPhaseSequential: true,
    crossPhaseDependencies: true,
    includeExplicit: true,
  };

  const updatedGroups = groups.map((g) => ({
    ...g,
    dependencies: [...g.dependencies],
  }));

  // Apply cross-phase dependencies
  if (effectiveOptions.crossPhaseDependencies) {
    const phaseDeps = generatePhaseDependencies(updatedGroups);
    for (const group of updatedGroups) {
      const additionalDeps = phaseDeps.get(group.id) || [];
      for (const dep of additionalDeps) {
        if (!group.dependencies.includes(dep)) {
          group.dependencies.push(dep);
        }
      }
    }
  }

  // Apply sequential dependencies within phases
  if (effectiveOptions.intraPhaseSequential) {
    const seqDeps = generateSequentialDependencies(updatedGroups);
    for (const group of updatedGroups) {
      const additionalDeps = seqDeps.get(group.id) || [];
      for (const dep of additionalDeps) {
        if (!group.dependencies.includes(dep)) {
          group.dependencies.push(dep);
        }
      }
    }
  }

  return updatedGroups;
}

/**
 * Topological sort for dependency ordering using Kahn's algorithm
 * Returns groups in order that respects dependencies
 *
 * @param groups - Array of task groups to sort
 * @returns Sorted groups and cycle detection info
 */
export function topologicalSort(
  groups: TaskGroup[]
): { sorted: TaskGroup[]; hasCycle: boolean; cycleInfo?: string } {
  // Build dependency graph
  const groupById = new Map<string, TaskGroup>();
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // groupId -> groups that depend on it

  // Get all task IDs to map task dependencies to group dependencies
  const taskToGroup = new Map<string, string>();
  for (const group of groups) {
    groupById.set(group.id, group);
    inDegree.set(group.id, 0);
    dependents.set(group.id, []);

    for (const task of group.tasks) {
      taskToGroup.set(task.id, group.id);
    }
  }

  // Calculate in-degrees based on task-level dependencies
  for (const group of groups) {
    const resolvedDeps = new Set<string>();

    for (const dep of group.dependencies) {
      const depGroupId = taskToGroup.get(dep) || dep;
      if (groupById.has(depGroupId) && depGroupId !== group.id && !resolvedDeps.has(depGroupId)) {
        resolvedDeps.add(depGroupId);
        inDegree.set(group.id, (inDegree.get(group.id) || 0) + 1);
        dependents.get(depGroupId)?.push(group.id);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const sorted: TaskGroup[] = [];

  // Find all nodes with no incoming edges
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const group = groupById.get(current);
    if (group) {
      sorted.push(group);
    }

    // Reduce in-degree for dependents
    for (const dependent of dependents.get(current) || []) {
      const newDegree = (inDegree.get(dependent) || 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  // Check for cycle
  if (sorted.length !== groups.length) {
    // Find nodes still with in-degree > 0 (part of cycle)
    const cycleNodes: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree > 0) {
        cycleNodes.push(id);
      }
    }

    return {
      sorted,
      hasCycle: true,
      cycleInfo: `Circular dependency detected involving: ${cycleNodes.join(', ')}`,
    };
  }

  return { sorted, hasCycle: false };
}

// ============================================================================
// Dependency Resolution
// ============================================================================

/**
 * Resolve group/task dependencies to issue numbers
 *
 * @param dependencies - Array of task IDs or group IDs
 * @param groupToIssue - Map of group ID to created issue number
 * @param taskToGroup - Map of task ID to group ID
 * @returns Array of issue numbers
 */
export function resolveDependenciesToIssues(
  dependencies: string[],
  groupToIssue: Map<string, number>,
  taskToGroup: Map<string, string>
): number[] {
  const issueNumbers: number[] = [];
  const seen = new Set<number>();

  for (const dep of dependencies) {
    // Try direct group lookup first
    let issueNum = groupToIssue.get(dep);

    // If not found, try task -> group -> issue
    if (!issueNum) {
      const groupId = taskToGroup.get(dep);
      if (groupId) {
        issueNum = groupToIssue.get(groupId);
      }
    }

    if (issueNum && !seen.has(issueNum)) {
      issueNumbers.push(issueNum);
      seen.add(issueNum);
    }
  }

  return issueNumbers;
}
