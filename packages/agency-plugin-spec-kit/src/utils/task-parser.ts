/**
 * Task parser utilities for parsing tasks.md files.
 *
 * Provides functions to parse individual tasks (T### format) and
 * task groups (TG-XXX format) from markdown content.
 *
 * @example
 * ```typescript
 * import {
 *   parseTasksContent,
 *   parseTaskGroups,
 *   detectTaskFormat,
 *   filterEligibleTasks,
 *   updateTasksWithIssueLinks
 * } from './task-parser.js';
 *
 * const content = await readFile('tasks.md');
 * const format = detectTaskFormat(content);
 *
 * if (format === 'individual') {
 *   const tasks = parseTasksContent(content);
 *   const eligible = filterEligibleTasks(tasks);
 * } else {
 *   const groups = parseTaskGroups(content);
 * }
 * ```
 */

import type { Task, TaskGroupEntry, SubTask } from '../types/task.js';
import {
  TASK_ID_PATTERN,
  TASK_GROUP_HEADER_PATTERN,
  PHASE_HEADER_PATTERN,
  CHECKBOX_PATTERN,
  USER_STORY_EXTRACT_PATTERN,
  EXISTING_ISSUE_EXTRACT_PATTERN,
  PARALLEL_MARKER_PATTERN,
  DEPENDENCY_PATTERN,
  SCOPE_EXTRACT_PATTERN,
} from '../types/patterns.js';
import { buildTaskIdSearchPattern } from './index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Task format detected from content.
 */
export type TaskFormat = 'individual' | 'group' | 'unknown';

/**
 * Result of parsing tasks.md content.
 */
export interface ParseTasksResult {
  /** Detected format */
  format: TaskFormat;
  /** Parsed tasks (for individual format) */
  tasks: Task[];
  /** Parsed task groups (for group format) */
  groups: TaskGroupEntry[];
  /** Phases detected in the content */
  phases: string[];
  /** Parse warnings */
  warnings: string[];
}

/**
 * Map of task IDs to issue numbers for updating tasks.md.
 */
export type IssueLinksMap = Map<string, { number: number; url: string }>;

// ============================================================================
// Task Line Parsing (T### Format)
// ============================================================================

/**
 * Pattern for task line in T### format.
 *
 * Matches: `- [ ] T### [#N]? [P]? [US#]? Description (deps: T###, T###)?`
 *
 * Captures:
 * 1. Check mark (space, x, X)
 * 2. Task ID (T###)
 * 3. Existing issue number (optional)
 * 4. Rest of the line (parallel marker, user story, description, deps)
 */
const TASK_LINE_PATTERN =
  /^-\s*\[([ xX])\]\s*(T\d{3})(?:\s*\[#(\d+)\])?\s*(.*)$/;

/**
 * Parse a single task line into a Task object.
 *
 * @param line - Line to parse
 * @param lineNumber - 1-indexed line number
 * @param currentPhase - Current phase context
 * @returns Parsed Task or null if not a valid task line
 */
function parseTaskLine(
  line: string,
  lineNumber: number,
  currentPhase?: string
): Task | null {
  const match = line.match(TASK_LINE_PATTERN);
  if (!match) {
    return null;
  }

  const [, checkMark, taskId, existingIssue, rest] = match;
  const completed = checkMark !== ' ';

  // Parse optional markers from the rest of the line
  let remaining = rest?.trim() ?? '';
  let isParallel = false;
  let userStory: string | undefined;

  // Check for [P] marker
  if (PARALLEL_MARKER_PATTERN.test(remaining)) {
    isParallel = true;
    remaining = remaining.replace(PARALLEL_MARKER_PATTERN, '').trim();
  }

  // Check for [US#] marker
  const userStoryMatch = remaining.match(/^\[US(\d+)\]\s*/);
  if (userStoryMatch) {
    userStory = `US${userStoryMatch[1]}`;
    remaining = remaining.slice(userStoryMatch[0].length);
  }

  // Parse dependencies from (deps: T###, T###) or (depends on T###)
  const dependencies: string[] = [];
  const depMatch = remaining.match(DEPENDENCY_PATTERN);
  if (depMatch && depMatch[1]) {
    const taskIdPattern = buildTaskIdSearchPattern();
    const depIds = depMatch[1].match(taskIdPattern);
    if (depIds) {
      dependencies.push(...depIds);
    }
    // Remove the dependency clause from description
    remaining = remaining.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }

  // Also check for inline (deps: ...) or (dep: ...) pattern
  const inlineDepMatch = remaining.match(/\s*\(deps?:\s*([^)]+)\)\s*$/);
  if (inlineDepMatch && inlineDepMatch[1]) {
    const taskIdPattern = buildTaskIdSearchPattern();
    const depIds = inlineDepMatch[1].match(taskIdPattern);
    if (depIds) {
      dependencies.push(...depIds);
    }
    remaining = remaining.replace(/\s*\(deps?:\s*[^)]+\)\s*$/, '').trim();
  }

  return {
    id: taskId ?? '',
    lineNumber,
    completed,
    isParallel,
    userStory,
    description: remaining,
    dependencies,
    phase: currentPhase,
    existingIssue: existingIssue ? parseInt(existingIssue, 10) : undefined,
  };
}

/**
 * Parse tasks.md content into individual Task objects.
 *
 * Handles the T### format commonly used for task lists.
 *
 * @param content - Raw markdown content
 * @returns Array of parsed tasks
 *
 * @example
 * ```typescript
 * const content = `
 * ## Phase 1: Setup
 *
 * - [ ] T001 Create project structure
 * - [x] T002 [P] Set up linting (deps: T001)
 * `;
 *
 * const tasks = parseTasksContent(content);
 * // [
 * //   { id: 'T001', completed: false, phase: 'Phase 1: Setup', ... },
 * //   { id: 'T002', completed: true, isParallel: true, ... }
 * // ]
 * ```
 */
export function parseTasksContent(content: string): Task[] {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  let currentPhase: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNumber = i + 1; // 1-indexed

    // Check for phase header
    const phaseMatch = line.match(PHASE_HEADER_PATTERN);
    if (phaseMatch) {
      const phaseNum = phaseMatch[1];
      const phaseName = phaseMatch[2]?.trim();
      currentPhase = phaseNum ? `Phase ${phaseNum}: ${phaseName}` : phaseName;
      continue;
    }

    // Also match ## headers that aren't phase headers as potential phase markers
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch && !phaseMatch) {
      currentPhase = headerMatch[1]?.trim();
      continue;
    }

    // Try to parse as task line
    const task = parseTaskLine(line, lineNumber, currentPhase);
    if (task) {
      tasks.push(task);
    }
  }

  return tasks;
}

// ============================================================================
// Task Group Parsing (TG-XXX Format)
// ============================================================================

/**
 * Parse task groups from tasks.md content (TG-XXX format).
 *
 * This format is used for epic workflows with grouped tasks.
 *
 * @param content - Raw markdown content
 * @returns Array of parsed task group entries
 *
 * @example
 * ```typescript
 * const content = `
 * ### TG-001 [US1] Task Group: Setup Module
 * **Scope**: S
 * **Files**: src/index.ts
 *
 * - [ ] Create module structure
 * - [ ] Add exports
 * `;
 *
 * const groups = parseTaskGroups(content);
 * ```
 */
export function parseTaskGroups(content: string): TaskGroupEntry[] {
  const lines = content.split('\n');
  const groups: TaskGroupEntry[] = [];
  let currentGroup: TaskGroupEntry | null = null;
  let currentPhase: string | undefined;
  let inSubtasks = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNumber = i + 1;

    // Check for phase header (## Phase N: Name)
    const phaseMatch = line.match(PHASE_HEADER_PATTERN);
    if (phaseMatch) {
      const phaseNum = phaseMatch[1];
      const phaseName = phaseMatch[2]?.trim();
      currentPhase = phaseNum ? `Phase ${phaseNum}: ${phaseName}` : phaseName;

      // Save current group if exists
      if (currentGroup) {
        currentGroup.completed = currentGroup.subtasks.every((s) => s.completed);
        groups.push(currentGroup);
        currentGroup = null;
      }
      inSubtasks = false;
      continue;
    }

    // Check for task group header (### TG-XXX ...)
    const groupMatch = line.match(TASK_GROUP_HEADER_PATTERN);
    if (groupMatch) {
      // Save previous group if exists
      if (currentGroup) {
        currentGroup.completed = currentGroup.subtasks.every((s) => s.completed);
        groups.push(currentGroup);
      }

      const groupId = groupMatch[1] ?? '';
      const userStoryNum = groupMatch[2];
      const title = groupMatch[3]?.trim() ?? '';

      // Check for existing issue in title
      const issueMatch = title.match(EXISTING_ISSUE_EXTRACT_PATTERN);
      const existingIssue = issueMatch ? parseInt(issueMatch[1] ?? '0', 10) : undefined;
      const cleanTitle = issueMatch
        ? title.replace(EXISTING_ISSUE_EXTRACT_PATTERN, '').trim()
        : title;

      currentGroup = {
        id: groupId,
        lineNumber,
        userStory: userStoryNum ? `US${userStoryNum}` : undefined,
        title: cleanTitle,
        subtasks: [],
        phase: currentPhase,
        completed: false,
        existingIssue,
      };
      inSubtasks = false;
      continue;
    }

    // If we're in a group, parse metadata and subtasks
    if (currentGroup) {
      // Parse scope - handle both **Scope**: S and [S] formats
      const markdownScopeMatch = line.match(/^\*\*Scope\*\*:\s*(XS|S|M|L|XL)\b/i);
      if (markdownScopeMatch) {
        currentGroup.scope = markdownScopeMatch[1]?.toUpperCase();
        continue;
      }
      const scopeMatch = line.match(SCOPE_EXTRACT_PATTERN);
      if (scopeMatch) {
        currentGroup.scope = scopeMatch[1];
        continue;
      }

      // Parse files (starts with **Files**: or - file path)
      if (line.match(/^\*\*Files\*\*:/)) {
        const filesLine = line.replace(/^\*\*Files\*\*:\s*/, '').trim();
        if (filesLine) {
          currentGroup.files = filesLine.split(/,\s*/);
        }
        continue;
      }

      // Parse tests
      if (line.match(/^\*\*Tests?\*\*:/)) {
        currentGroup.tests = line.replace(/^\*\*Tests?\*\*:\s*/, '').trim();
        continue;
      }

      // Parse subtask (checkbox)
      const checkboxMatch = line.match(CHECKBOX_PATTERN);
      if (checkboxMatch) {
        inSubtasks = true;
        const completed = checkboxMatch[1] !== ' ';
        const description = checkboxMatch[2]?.trim() ?? '';
        currentGroup.subtasks.push({
          completed,
          description,
        });
        continue;
      }

      // Continue adding to files list if we see file-like lines
      if (!inSubtasks && line.match(/^-\s+`?[a-zA-Z0-9_./]+`?$/)) {
        const filePath = line.replace(/^-\s+`?/, '').replace(/`?$/, '').trim();
        if (!currentGroup.files) {
          currentGroup.files = [];
        }
        currentGroup.files.push(filePath);
        continue;
      }
    }
  }

  // Don't forget the last group
  if (currentGroup) {
    currentGroup.completed = currentGroup.subtasks.every((s) => s.completed);
    groups.push(currentGroup);
  }

  return groups;
}

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Auto-detect the task format in tasks.md content.
 *
 * Checks for presence of T### or TG-XXX patterns.
 *
 * @param content - Raw markdown content
 * @returns Detected format type
 *
 * @example
 * ```typescript
 * detectTaskFormat('- [ ] T001 Do thing');  // 'individual'
 * detectTaskFormat('### TG-001 Setup');      // 'group'
 * detectTaskFormat('No tasks here');         // 'unknown'
 * ```
 */
export function detectTaskFormat(content: string): TaskFormat {
  // Check for TG-XXX headers (group format)
  // Use multiline pattern to match lines starting with ###
  const groupHeaderPattern = /^###\s+TG-\d{3}/m;
  if (groupHeaderPattern.test(content)) {
    return 'group';
  }

  // Check for T### task lines (individual format)
  // Looking for lines like "- [ ] T001" or "- [x] T002"
  const taskLinePattern = /^-\s*\[[ xX]\]\s*T\d{3}/m;
  if (taskLinePattern.test(content)) {
    return 'individual';
  }

  return 'unknown';
}

// ============================================================================
// Filtering
// ============================================================================

/**
 * Filter tasks to only include eligible ones for issue creation.
 *
 * Eligible tasks are:
 * - Not completed
 * - Don't already have an existing issue link
 *
 * @param tasks - Array of parsed tasks
 * @returns Filtered array of eligible tasks
 *
 * @example
 * ```typescript
 * const allTasks = parseTasksContent(content);
 * const eligible = filterEligibleTasks(allTasks);
 * // Only incomplete tasks without existing issues
 * ```
 */
export function filterEligibleTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => !task.completed && task.existingIssue === undefined);
}

/**
 * Filter task groups to only include eligible ones for issue creation.
 *
 * @param groups - Array of parsed task groups
 * @returns Filtered array of eligible groups
 */
export function filterEligibleGroups(groups: TaskGroupEntry[]): TaskGroupEntry[] {
  return groups.filter(
    (group) => !group.completed && group.existingIssue === undefined
  );
}

// ============================================================================
// Content Updates
// ============================================================================

/**
 * Update tasks.md content with created issue links.
 *
 * Replaces task lines with versions that include [#N] issue references.
 *
 * @param content - Original tasks.md content
 * @param issueLinks - Map of task/group IDs to issue numbers and URLs
 * @returns Updated content with issue links
 *
 * @example
 * ```typescript
 * const links = new Map([
 *   ['T001', { number: 123, url: 'https://github.com/...' }],
 *   ['T002', { number: 124, url: 'https://github.com/...' }],
 * ]);
 *
 * const updated = updateTasksWithIssueLinks(content, links);
 * // "- [ ] T001 [#123] Description..."
 * ```
 */
export function updateTasksWithIssueLinks(
  content: string,
  issueLinks: IssueLinksMap
): string {
  const lines = content.split('\n');
  const updatedLines: string[] = [];

  for (const line of lines) {
    let updatedLine = line;

    // Check if line contains a task ID that we have a link for
    for (const [taskId, issueInfo] of issueLinks) {
      // Handle T### format: insert [#N] after the task ID
      const taskPattern = new RegExp(
        `^(-\\s*\\[[ xX]\\]\\s*)(${taskId})(?![\\d#])`,
        ''
      );
      const taskMatch = line.match(taskPattern);
      if (taskMatch) {
        // Don't add if already has an issue link
        if (!line.includes(`[#${issueInfo.number}]`)) {
          updatedLine = line.replace(
            taskPattern,
            `$1$2 [#${issueInfo.number}]`
          );
        }
        break;
      }

      // Handle TG-XXX format: insert [#N] after the group ID in header
      const groupPattern = new RegExp(
        `^(###\\s+)(${taskId})(?![\\d#])`,
        ''
      );
      const groupMatch = line.match(groupPattern);
      if (groupMatch) {
        if (!line.includes(`[#${issueInfo.number}]`)) {
          updatedLine = line.replace(
            groupPattern,
            `$1$2 [#${issueInfo.number}]`
          );
        }
        break;
      }
    }

    updatedLines.push(updatedLine);
  }

  return updatedLines.join('\n');
}

// ============================================================================
// Full Parse
// ============================================================================

/**
 * Parse tasks.md content, auto-detecting format.
 *
 * Returns a comprehensive result with tasks or groups depending on format.
 *
 * @param content - Raw markdown content
 * @returns Complete parse result with format, tasks/groups, phases, and warnings
 *
 * @example
 * ```typescript
 * const result = parseTasksFile(content);
 *
 * if (result.format === 'individual') {
 *   console.log(`Found ${result.tasks.length} tasks`);
 * } else if (result.format === 'group') {
 *   console.log(`Found ${result.groups.length} task groups`);
 * }
 * ```
 */
export function parseTasksFile(content: string): ParseTasksResult {
  const format = detectTaskFormat(content);
  const warnings: string[] = [];
  let tasks: Task[] = [];
  let groups: TaskGroupEntry[] = [];
  const phases: string[] = [];

  if (format === 'individual') {
    tasks = parseTasksContent(content);
    // Extract unique phases
    for (const task of tasks) {
      if (task.phase && !phases.includes(task.phase)) {
        phases.push(task.phase);
      }
    }
  } else if (format === 'group') {
    groups = parseTaskGroups(content);
    // Extract unique phases
    for (const group of groups) {
      if (group.phase && !phases.includes(group.phase)) {
        phases.push(group.phase);
      }
    }
  } else {
    warnings.push('Could not detect task format in content');
  }

  return {
    format,
    tasks,
    groups,
    phases,
    warnings,
  };
}

/**
 * Count total tasks and completed tasks.
 *
 * @param tasks - Array of tasks
 * @returns Object with total and completed counts
 */
export function countTasks(tasks: Task[]): { total: number; completed: number } {
  return {
    total: tasks.length,
    completed: tasks.filter((t) => t.completed).length,
  };
}

/**
 * Count total groups and completed groups.
 *
 * @param groups - Array of task groups
 * @returns Object with total and completed counts
 */
export function countGroups(groups: TaskGroupEntry[]): {
  total: number;
  completed: number;
} {
  return {
    total: groups.length,
    completed: groups.filter((g) => g.completed).length,
  };
}
