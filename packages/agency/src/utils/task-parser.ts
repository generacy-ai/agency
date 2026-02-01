/**
 * Task parser utility for parsing tasks.md files
 *
 * Supports two formats:
 * - Individual tasks (T### format)
 * - Task groups (TG-XXX format) for epic workflows
 *
 * Integrates with existing utilities:
 * - grouping.ts: Task interface and grouping strategies
 * - dependency.ts: Dependency validation and topological sorting
 */

import type { Task } from './grouping.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of parsing a tasks.md file in individual format
 */
export interface ParsedTasks {
  /** Parsed tasks in order of appearance */
  tasks: Task[];

  /** Unique phases found in order of appearance */
  phases: string[];

  /** Unique user stories found */
  userStories: string[];

  /** Warnings for non-fatal issues */
  warnings: string[];
}

/**
 * A subtask within a task group
 */
export interface SubtaskEntry {
  /** Whether the subtask is completed */
  completed: boolean;

  /** Subtask description */
  description: string;
}

/**
 * A task group entry (TG-XXX format)
 * Used for epic workflows where each group becomes one issue
 */
export interface TaskGroupEntry {
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

/**
 * Result of parsing task groups from tasks.md
 */
export interface ParsedTaskGroups {
  /** Parsed task groups */
  groups: TaskGroupEntry[];

  /** Unique phases found */
  phases: string[];

  /** Unique user stories found */
  userStories: string[];

  /** Warnings for non-fatal issues */
  warnings: string[];
}

/**
 * Detected format of tasks.md content
 */
export type TaskFormat = 'individual' | 'task-group';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Regex pattern for parsing task lines
 * Format: - [ ] T### [#N]? [P]? [US#]? Description (deps: T###, T###)?
 *
 * Groups:
 * 1. Checkbox state: ` ` or `x`
 * 2. Task ID: `T###`
 * 3. Existing issue: `[#123]` (optional)
 * 4. Parallel marker: `[P]` (optional) - captured for presence check
 * 5. User story: `[US#]` (optional)
 * 6. Description: text
 * 7. Dependencies: `T001, T002` (optional, inside parentheses with deps/dep prefix)
 */
const TASK_LINE_PATTERN =
  /^-\s*\[([ xX])\]\s*(T\d{3})(?:\s*\[#(\d+)\])?(?:\s*\[P\])?(?:\s*\[US(\d+)\])?\s+(.+?)(?:\s*\(deps?:\s*([^)]+)\))?$/;

/**
 * Regex pattern for task group headers
 * Format: ### TG-### [US#]? Title
 *
 * Groups:
 * 1. Group ID: `TG-###`
 * 2. User story number (optional)
 * 3. Title
 */
const TASK_GROUP_HEADER_PATTERN = /^###\s+(TG-\d{3})(?:\s*\[US(\d+)\])?\s+(.+)$/;

/**
 * Regex pattern for phase headers
 * Matches: ## Phase N: Name or ### Phase N: Name
 */
const PHASE_HEADER_PATTERN = /^#{2,3}\s*(?:Phase\s*)?(\d+)?[:\s]*(.+)$/i;

/**
 * Regex pattern for extracting parallel marker
 */
const PARALLEL_MARKER_PATTERN = /\[P\]/;

/**
 * Regex pattern for extracting explicit depends-on marker
 * Matches: (depends-on: T001, T002) anywhere in the description
 */
const DEPENDS_ON_MARKER_PATTERN = /\(depends-on:\s*([^)]+)\)/i;

/**
 * Regex pattern for scope metadata in task groups
 */
const SCOPE_PATTERN = /^\*\*Scope\*\*:\s*(.+)$/;

/**
 * Regex pattern for files metadata in task groups
 */
const FILES_PATTERN = /^\*\*Files\*\*:/;

/**
 * Regex pattern for tests metadata in task groups
 */
const TESTS_PATTERN = /^\*\*Tests\*\*:\s*(.+)$/;

/**
 * Regex pattern for subtask checkboxes
 */
const SUBTASK_PATTERN = /^-\s*\[([ xX])\]\s+(.+)$/;

/**
 * Regex pattern for existing issue link
 */
const EXISTING_ISSUE_PATTERN = /^\[#\d+\]/;

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect the task format used in a tasks.md file
 *
 * @param content - The tasks.md file content
 * @returns "task-group" if TG-XXX format, "individual" if T### format
 */
export function detectTaskFormat(content: string): TaskFormat {
  // Check for TG-XXX header pattern first (more specific)
  const taskGroupHeaderPattern = /^###\s+TG-\d{3}/m;
  if (taskGroupHeaderPattern.test(content)) {
    return 'task-group';
  }

  // Check for individual task pattern (T###)
  const individualTaskPattern = /^-\s*\[[ xX]\]\s*T\d{3}/m;
  if (individualTaskPattern.test(content)) {
    return 'individual';
  }

  // Default to individual format if no clear pattern found
  return 'individual';
}

// ============================================================================
// Individual Task Parsing
// ============================================================================

/**
 * Parse a single task line
 *
 * @param line - The line to parse
 * @param lineNumber - Line number in the file (1-indexed)
 * @param currentPhase - Current phase context
 * @returns Parsed task or null if line is not a valid task
 */
export function parseTaskLine(
  line: string,
  lineNumber: number,
  currentPhase?: string
): Task | null {
  const match = line.match(TASK_LINE_PATTERN);
  if (!match) {
    return null;
  }

  const checkboxState = match[1];
  const taskId = match[2];
  const existingIssue = match[3];
  const userStoryNum = match[4];
  const description = match[5];
  const deps = match[6];

  // Ensure required fields are present
  if (!checkboxState || !taskId || !description) {
    return null;
  }

  // Check for parallel marker in original line
  const isParallel = PARALLEL_MARKER_PATTERN.test(line);

  // Parse dependencies
  const dependencies: string[] = [];

  // First check the captured deps group from the regex
  if (deps) {
    const depMatches = deps.match(/T\d{3}/g);
    if (depMatches) {
      dependencies.push(...depMatches);
    }
  }

  // Also look for (deps: ...) anywhere in the line (handles cases where it's not at the end)
  const depsInLinePattern = /\(deps?:\s*([^)]+)\)/gi;
  let depsMatch;
  while ((depsMatch = depsInLinePattern.exec(line)) !== null) {
    const depsContent = depsMatch[1];
    if (depsContent) {
      const inlineDeps = depsContent.match(/T\d{3}/g);
      if (inlineDeps) {
        for (const dep of inlineDeps) {
          if (!dependencies.includes(dep)) {
            dependencies.push(dep);
          }
        }
      }
    }
  }

  // Also check for (depends-on: T001, T002) marker in the full line
  const dependsOnMatch = line.match(DEPENDS_ON_MARKER_PATTERN);
  if (dependsOnMatch) {
    const dependsOnContent = dependsOnMatch[1];
    if (dependsOnContent) {
      const explicitDeps = dependsOnContent.match(/T\d{3}/g);
      if (explicitDeps) {
        for (const dep of explicitDeps) {
          if (!dependencies.includes(dep)) {
            dependencies.push(dep);
          }
        }
      }
    }
  }

  return {
    id: taskId,
    lineNumber,
    completed: checkboxState.toLowerCase() === 'x',
    isParallel,
    userStory: userStoryNum ? `US${userStoryNum}` : undefined,
    description: description.trim(),
    dependencies,
    phase: currentPhase,
    existingIssue: existingIssue ? parseInt(existingIssue, 10) : undefined,
  };
}

/**
 * Extract phase name from a header line
 *
 * @param line - The header line to parse
 * @returns Phase name or null if not a valid phase header
 */
export function parsePhaseHeader(line: string): string | null {
  const match = line.match(PHASE_HEADER_PATTERN);
  if (!match) {
    return null;
  }

  // Get the phase name (group 2)
  const phaseName = match[2];
  if (!phaseName) {
    return null;
  }

  const trimmedPhaseName = phaseName.trim();

  // Skip if it's a non-phase header (like "Format", "Dependencies", etc.)
  const nonPhaseHeaders = [
    'format',
    'dependencies',
    'execution order',
    'parallel opportunities',
    'estimated task counts',
    'dependency graph',
    'types',
    'interfaces',
    'utilities',
    'export updates',
    'sequential dependencies',
    'existing infrastructure',
  ];

  if (nonPhaseHeaders.some((h) => trimmedPhaseName.toLowerCase().includes(h))) {
    return null;
  }

  // Include phase number if present
  const phaseNum = match[1];
  if (phaseNum) {
    return `Phase ${phaseNum}: ${trimmedPhaseName}`;
  }

  return trimmedPhaseName;
}

/**
 * Parse tasks.md content string in individual format
 *
 * @param content - The tasks.md file content
 * @returns Parsed tasks with metadata
 */
export function parseTasksContent(content: string): ParsedTasks {
  // Normalize line endings (handle both Unix and Windows)
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const tasks: Task[] = [];
  const phases = new Set<string>();
  const userStories = new Set<string>();
  const warnings: string[] = [];

  let currentPhase: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Skip undefined lines (shouldn't happen but TypeScript needs this)
    if (line === undefined) {
      continue;
    }

    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    // Check for phase header
    if (line.startsWith('#')) {
      const phaseName = parsePhaseHeader(line);
      if (phaseName) {
        currentPhase = phaseName;
        phases.add(phaseName);
      }
      continue;
    }

    // Check for task line
    if (line.trim().startsWith('- [')) {
      const task = parseTaskLine(line, lineNumber, currentPhase);

      if (task) {
        tasks.push(task);

        if (task.userStory) {
          userStories.add(task.userStory);
        }
      } else if (line.includes('T') && /T\d{3}/.test(line)) {
        // Looks like a task but didn't parse - add warning
        warnings.push(
          `Line ${lineNumber}: Task-like line could not be parsed: "${line.substring(0, 80)}..."`
        );
      }
    }
  }

  return {
    tasks,
    phases: Array.from(phases),
    userStories: Array.from(userStories),
    warnings,
  };
}

// ============================================================================
// Task Group Parsing
// ============================================================================

/**
 * Parse a task group header line
 *
 * @param line - The line to parse
 * @param lineNumber - Line number in the file (1-indexed)
 * @returns Partial TaskGroupEntry with id, title, userStory, and lineNumber
 */
export function parseTaskGroupHeader(
  line: string,
  lineNumber: number
): Pick<TaskGroupEntry, 'id' | 'title' | 'userStory' | 'lineNumber'> | null {
  const match = line.match(TASK_GROUP_HEADER_PATTERN);
  if (!match) {
    return null;
  }

  const id = match[1];
  const usNum = match[2];
  const title = match[3];

  // Ensure required fields are present
  if (!id || !title) {
    return null;
  }

  return {
    id,
    lineNumber,
    userStory: usNum ? `US${usNum}` : undefined,
    title: title.trim(),
  };
}

/**
 * Parse a tasks.md file in Task Group format (TG-XXX)
 *
 * @param content - The tasks.md file content
 * @returns Parsed task groups with metadata
 */
export function parseTaskGroups(content: string): ParsedTaskGroups {
  // Normalize line endings (handle both Unix and Windows)
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const groups: TaskGroupEntry[] = [];
  const phases = new Set<string>();
  const userStories = new Set<string>();
  const warnings: string[] = [];

  let currentPhase: string | undefined;
  let currentGroup: TaskGroupEntry | null = null;
  let collectingFiles = false;
  let filesBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Skip undefined lines (shouldn't happen but TypeScript needs this)
    if (line === undefined) {
      continue;
    }

    // Skip empty lines (but finalize file collection if active)
    if (!line.trim()) {
      if (collectingFiles && filesBuffer.length > 0) {
        if (currentGroup) {
          currentGroup.files = filesBuffer;
        }
        collectingFiles = false;
        filesBuffer = [];
      }
      continue;
    }

    // Check for phase header (## Phase N: Name)
    if (line.startsWith('##') && !line.startsWith('###')) {
      const phaseMatch = line.match(/^##\s*(?:Phase\s*)?(\d+)?[:\s]*(.+)$/i);
      if (phaseMatch) {
        const phaseName = phaseMatch[2];
        if (phaseName) {
          const trimmedPhaseName = phaseName.trim();
          // Skip metadata headers
          const nonPhaseHeaders = [
            'format',
            'dependencies',
            'execution order',
            'parallel opportunities',
            'estimated',
            'metadata',
            'tasks',
          ];
          if (!nonPhaseHeaders.some((h) => trimmedPhaseName.toLowerCase().includes(h))) {
            const phaseNum = phaseMatch[1];
            currentPhase = phaseNum ? `Phase ${phaseNum}: ${trimmedPhaseName}` : trimmedPhaseName;
            phases.add(currentPhase);
          }
        }
      }
      continue;
    }

    // Check for task group header (### TG-XXX ...)
    const headerMatch = line.match(TASK_GROUP_HEADER_PATTERN);
    if (headerMatch) {
      // Save previous group if exists
      if (currentGroup) {
        // Finalize any pending files
        if (collectingFiles && filesBuffer.length > 0) {
          currentGroup.files = filesBuffer;
          collectingFiles = false;
          filesBuffer = [];
        }
        // Calculate completion status
        currentGroup.completed =
          currentGroup.subtasks.length > 0 &&
          currentGroup.subtasks.every((st) => st.completed);
        groups.push(currentGroup);
      }

      const id = headerMatch[1];
      const usNum = headerMatch[2];
      const title = headerMatch[3];

      if (id && title) {
        currentGroup = {
          id,
          lineNumber,
          userStory: usNum ? `US${usNum}` : undefined,
          title: title.trim(),
          subtasks: [],
          phase: currentPhase,
          completed: false,
        };

        if (usNum) {
          userStories.add(`US${usNum}`);
        }
      }

      continue;
    }

    // If we're inside a task group, parse metadata and subtasks
    if (currentGroup) {
      // Check for Scope metadata
      const scopeMatch = line.match(SCOPE_PATTERN);
      if (scopeMatch && scopeMatch[1]) {
        currentGroup.scope = scopeMatch[1].trim();
        collectingFiles = false;
        continue;
      }

      // Check for Files metadata (can be multiline)
      if (FILES_PATTERN.test(line)) {
        collectingFiles = true;
        // Check if files are on the same line
        const inlineFiles = line.replace(/^\*\*Files\*\*:\s*/, '').trim();
        if (inlineFiles) {
          // Parse comma-separated or single file
          const fileList = inlineFiles
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean);
          filesBuffer.push(...fileList);
        }
        continue;
      }

      // If collecting files, check for indented file entries
      if (collectingFiles) {
        const trimmedLine = line.trim();
        // Check for list item (- file.ts) or backtick file (`file.ts`)
        // But NOT subtask checkboxes (- [ ] or - [x])
        if (trimmedLine.startsWith('-') && !trimmedLine.match(/^-\s*\[[ xX]\]/)) {
          const file = trimmedLine
            .replace(/^-\s*/, '')
            .replace(/`/g, '')
            .trim();
          if (file) {
            filesBuffer.push(file);
          }
          continue;
        } else if (trimmedLine.startsWith('`')) {
          const file = trimmedLine.replace(/`/g, '').trim();
          if (file) {
            filesBuffer.push(file);
          }
          continue;
        }
        // Any other line (including subtasks) ends file collection
        if (filesBuffer.length > 0) {
          currentGroup.files = filesBuffer;
        }
        collectingFiles = false;
        filesBuffer = [];
        // Don't continue - let the line be processed as something else (e.g., subtask)
      }

      // Check for Tests metadata
      const testsMatch = line.match(TESTS_PATTERN);
      if (testsMatch && testsMatch[1]) {
        currentGroup.tests = testsMatch[1].trim();
        continue;
      }

      // Check for subtask checkbox
      const subtaskMatch = line.match(SUBTASK_PATTERN);
      if (subtaskMatch) {
        const checkState = subtaskMatch[1];
        const description = subtaskMatch[2];
        if (checkState && description) {
          currentGroup.subtasks.push({
            completed: checkState.toLowerCase() === 'x',
            description: description.trim(),
          });
        }
        continue;
      }

      // Check for existing issue link in the header area
      const issueMatch = line.match(/\[#(\d+)\]/);
      if (issueMatch && issueMatch[1] && !currentGroup.existingIssue) {
        currentGroup.existingIssue = parseInt(issueMatch[1], 10);
      }
    }
  }

  // Don't forget the last group
  if (currentGroup) {
    if (collectingFiles && filesBuffer.length > 0) {
      currentGroup.files = filesBuffer;
    }
    currentGroup.completed =
      currentGroup.subtasks.length > 0 &&
      currentGroup.subtasks.every((st) => st.completed);
    groups.push(currentGroup);
  }

  // Add warning if no groups found
  if (groups.length === 0) {
    warnings.push('No task groups (TG-XXX) found in content');
  }

  return {
    groups,
    phases: Array.from(phases),
    userStories: Array.from(userStories),
    warnings,
  };
}

// ============================================================================
// Issue Link Management
// ============================================================================

/**
 * Update a task line in content to include issue link
 *
 * @param line - The task line to update
 * @param issueNumber - The issue number to link
 * @returns Updated line with issue link
 */
export function addIssueLinkToTaskLine(line: string, issueNumber: number): string {
  // Find where to insert the issue link (after task ID)
  const match = line.match(/^(-\s*\[[ xX]\]\s*T\d{3})/);
  if (!match || !match[1]) {
    return line;
  }

  const prefix = match[1];
  const rest = line.substring(prefix.length);

  // Check if already has an issue link
  const firstWord = rest.trim().split(' ')[0] || '';
  if (EXISTING_ISSUE_PATTERN.test(firstWord)) {
    return line; // Already has issue link
  }

  return `${prefix} [#${issueNumber}]${rest}`;
}

/**
 * Update tasks.md content with issue links for individual tasks
 *
 * @param content - The tasks.md file content
 * @param taskIssueMap - Map of task ID to issue number
 * @returns Updated content with issue links
 */
export function updateTasksWithIssueLinks(
  content: string,
  taskIssueMap: Map<string, number>
): string {
  // Normalize line endings (handle both Unix and Windows)
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const updatedLines: string[] = [];

  for (const line of lines) {
    let updatedLine = line;

    // Check if this is a task line
    const match = line.match(/^-\s*\[[ xX]\]\s*(T\d{3})/);
    if (match && match[1]) {
      const taskId = match[1];
      const issueNumber = taskIssueMap.get(taskId);

      if (issueNumber !== undefined) {
        updatedLine = addIssueLinkToTaskLine(line, issueNumber);
      }
    }

    updatedLines.push(updatedLine);
  }

  return updatedLines.join('\n');
}

/**
 * Update task group lines in content with issue links
 *
 * @param content - The tasks.md file content
 * @param groupIssueMap - Map of group ID to issue number
 * @returns Updated content with issue links
 */
export function updateTaskGroupsWithIssueLinks(
  content: string,
  groupIssueMap: Map<string, number>
): string {
  // Normalize line endings (handle both Unix and Windows)
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const updatedLines: string[] = [];

  for (const line of lines) {
    let updatedLine = line;

    // Check if this is a task group header line
    const match = line.match(/^(###\s+)(TG-\d{3})/);
    if (match && match[1] && match[2]) {
      const groupId = match[2];
      const issueNumber = groupIssueMap.get(groupId);

      if (issueNumber !== undefined) {
        // Check if already has any issue link (e.g., [#123])
        const hasExistingIssueLink = /\[#\d+\]/.test(line);
        if (!hasExistingIssueLink) {
          // Insert issue link after the group ID
          const prefix = match[1] + match[2];
          const rest = line.substring(prefix.length);
          updatedLine = `${prefix} [#${issueNumber}]${rest}`;
        }
      }
    }

    updatedLines.push(updatedLine);
  }

  return updatedLines.join('\n');
}
