/**
 * Utility functions for spec-kit
 *
 * Provides task ID builders, regex utilities, file system utilities,
 * and other helper functions used throughout the spec-kit package.
 */

import type { TaskIdConfig } from '../types/task.js';
import { DEFAULT_TASK_ID_CONFIG } from '../types/task.js';

// Re-export file system utilities
export {
  // Error classes
  FileNotFoundError,
  PermissionError,
  RepoNotFoundError,
  // Functions
  exists,
  isDirectory,
  isFile,
  readFile,
  writeFile,
  mkdir,
  readDir,
  findRepoRoot,
} from './fs.js';

/**
 * Build a task ID from a number.
 *
 * @param num - Task number (1-indexed)
 * @param config - Optional task ID configuration
 * @returns Formatted task ID (e.g., "T001")
 *
 * @example
 * ```typescript
 * buildTaskId(1);           // "T001"
 * buildTaskId(42);          // "T042"
 * buildTaskId(1, { idPrefix: 'TASK', idPadding: 4, idSeparator: '-' });
 * // "TASK-0001"
 * ```
 */
export function buildTaskId(
  num: number,
  config: Partial<TaskIdConfig> = {}
): string {
  const { idPrefix, idPadding, idSeparator } = {
    ...DEFAULT_TASK_ID_CONFIG,
    ...config,
  };
  const paddedNum = String(num).padStart(idPadding, '0');
  return `${idPrefix}${idSeparator}${paddedNum}`;
}

/**
 * Build a task group ID from a number.
 *
 * @param num - Group number (1-indexed)
 * @param config - Optional task ID configuration
 * @returns Formatted task group ID (e.g., "TG-001")
 *
 * @example
 * ```typescript
 * buildTaskGroupId(1);      // "TG-001"
 * buildTaskGroupId(42);     // "TG-042"
 * buildTaskGroupId(1, { groupPrefix: 'GROUP', groupSeparator: '_', groupPadding: 4 });
 * // "GROUP_0001"
 * ```
 */
export function buildTaskGroupId(
  num: number,
  config: Partial<TaskIdConfig> = {}
): string {
  const { groupPrefix, groupSeparator, groupPadding } = {
    ...DEFAULT_TASK_ID_CONFIG,
    ...config,
  };
  const paddedNum = String(num).padStart(groupPadding, '0');
  return `${groupPrefix}${groupSeparator}${paddedNum}`;
}

/**
 * Build a regex pattern that matches task IDs exactly.
 *
 * @param config - Optional task ID configuration
 * @returns RegExp that matches a task ID (e.g., /^T\d{3}$/)
 *
 * @example
 * ```typescript
 * const pattern = buildTaskIdPattern();
 * pattern.test('T001');     // true
 * pattern.test('T1234');    // false (wrong padding)
 * pattern.test('TASK001');  // false (wrong prefix)
 * ```
 */
export function buildTaskIdPattern(
  config: Partial<TaskIdConfig> = {}
): RegExp {
  const { idPrefix, idPadding, idSeparator } = {
    ...DEFAULT_TASK_ID_CONFIG,
    ...config,
  };
  const escapedPrefix = escapeRegex(idPrefix);
  const escapedSeparator = escapeRegex(idSeparator);
  return new RegExp(`^${escapedPrefix}${escapedSeparator}\\d{${idPadding}}$`);
}

/**
 * Build a regex pattern that matches task group IDs exactly.
 *
 * @param config - Optional task ID configuration
 * @returns RegExp that matches a task group ID (e.g., /^TG-\d{3}$/)
 *
 * @example
 * ```typescript
 * const pattern = buildTaskGroupIdPattern();
 * pattern.test('TG-001');   // true
 * pattern.test('TG001');    // false (missing separator)
 * ```
 */
export function buildTaskGroupIdPattern(
  config: Partial<TaskIdConfig> = {}
): RegExp {
  const { groupPrefix, groupSeparator, groupPadding } = {
    ...DEFAULT_TASK_ID_CONFIG,
    ...config,
  };
  const escapedPrefix = escapeRegex(groupPrefix);
  const escapedSeparator = escapeRegex(groupSeparator);
  return new RegExp(
    `^${escapedPrefix}${escapedSeparator}\\d{${groupPadding}}$`
  );
}

/**
 * Build a regex pattern for searching task IDs in text (not anchored).
 *
 * @param config - Optional task ID configuration
 * @returns RegExp that finds task IDs in text
 *
 * @example
 * ```typescript
 * const pattern = buildTaskIdSearchPattern();
 * const text = 'Depends on T001 and T002';
 * const matches = text.match(pattern); // ['T001', 'T002']
 * ```
 */
export function buildTaskIdSearchPattern(
  config: Partial<TaskIdConfig> = {}
): RegExp {
  const { idPrefix, idPadding, idSeparator } = {
    ...DEFAULT_TASK_ID_CONFIG,
    ...config,
  };
  const escapedPrefix = escapeRegex(idPrefix);
  const escapedSeparator = escapeRegex(idSeparator);
  return new RegExp(`${escapedPrefix}${escapedSeparator}\\d{${idPadding}}`, 'g');
}

/**
 * Build a regex pattern for searching task group IDs in text (not anchored).
 *
 * @param config - Optional task ID configuration
 * @returns RegExp that finds task group IDs in text
 *
 * @example
 * ```typescript
 * const pattern = buildTaskGroupIdSearchPattern();
 * const text = 'See TG-001 and TG-002';
 * const matches = text.match(pattern); // ['TG-001', 'TG-002']
 * ```
 */
export function buildTaskGroupIdSearchPattern(
  config: Partial<TaskIdConfig> = {}
): RegExp {
  const { groupPrefix, groupSeparator, groupPadding } = {
    ...DEFAULT_TASK_ID_CONFIG,
    ...config,
  };
  const escapedPrefix = escapeRegex(groupPrefix);
  const escapedSeparator = escapeRegex(groupSeparator);
  return new RegExp(
    `${escapedPrefix}${escapedSeparator}\\d{${groupPadding}}`,
    'g'
  );
}

/**
 * Escape special regex characters in a string.
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp
 *
 * @example
 * ```typescript
 * escapeRegex('foo.bar');    // "foo\\.bar"
 * escapeRegex('T-001');      // "T\\-001"
 * escapeRegex('[test]');     // "\\[test\\]"
 * ```
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a task ID to extract the number.
 *
 * @param taskId - Task ID to parse (e.g., "T001")
 * @param config - Optional task ID configuration
 * @returns Parsed number or null if invalid
 *
 * @example
 * ```typescript
 * parseTaskIdNumber('T001');    // 1
 * parseTaskIdNumber('T042');    // 42
 * parseTaskIdNumber('invalid'); // null
 * ```
 */
export function parseTaskIdNumber(
  taskId: string,
  config: Partial<TaskIdConfig> = {}
): number | null {
  const { idPrefix, idPadding, idSeparator } = {
    ...DEFAULT_TASK_ID_CONFIG,
    ...config,
  };
  const pattern = buildTaskIdPattern(config);

  if (!pattern.test(taskId)) {
    return null;
  }

  const prefixLength = idPrefix.length + idSeparator.length;
  const numStr = taskId.slice(prefixLength, prefixLength + idPadding);
  const num = parseInt(numStr, 10);

  return isNaN(num) ? null : num;
}

/**
 * Parse a task group ID to extract the number.
 *
 * @param groupId - Group ID to parse (e.g., "TG-001")
 * @param config - Optional task ID configuration
 * @returns Parsed number or null if invalid
 *
 * @example
 * ```typescript
 * parseTaskGroupIdNumber('TG-001');  // 1
 * parseTaskGroupIdNumber('TG-042');  // 42
 * parseTaskGroupIdNumber('invalid'); // null
 * ```
 */
export function parseTaskGroupIdNumber(
  groupId: string,
  config: Partial<TaskIdConfig> = {}
): number | null {
  const { groupPrefix, groupSeparator, groupPadding } = {
    ...DEFAULT_TASK_ID_CONFIG,
    ...config,
  };
  const pattern = buildTaskGroupIdPattern(config);

  if (!pattern.test(groupId)) {
    return null;
  }

  const prefixLength = groupPrefix.length + groupSeparator.length;
  const numStr = groupId.slice(prefixLength, prefixLength + groupPadding);
  const num = parseInt(numStr, 10);

  return isNaN(num) ? null : num;
}

/**
 * Validate that a string is a valid task ID.
 *
 * @param taskId - String to validate
 * @param config - Optional task ID configuration
 * @returns True if valid task ID
 *
 * @example
 * ```typescript
 * isValidTaskId('T001');    // true
 * isValidTaskId('T1');      // false
 * isValidTaskId('TASK001'); // false
 * ```
 */
export function isValidTaskId(
  taskId: string,
  config: Partial<TaskIdConfig> = {}
): boolean {
  return buildTaskIdPattern(config).test(taskId);
}

/**
 * Validate that a string is a valid task group ID.
 *
 * @param groupId - String to validate
 * @param config - Optional task ID configuration
 * @returns True if valid task group ID
 *
 * @example
 * ```typescript
 * isValidTaskGroupId('TG-001');  // true
 * isValidTaskGroupId('TG001');   // false
 * isValidTaskGroupId('T-001');   // false
 * ```
 */
export function isValidTaskGroupId(
  groupId: string,
  config: Partial<TaskIdConfig> = {}
): boolean {
  return buildTaskGroupIdPattern(config).test(groupId);
}
