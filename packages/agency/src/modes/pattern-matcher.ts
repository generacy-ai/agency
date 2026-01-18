/**
 * Pattern Matcher for Mode System
 *
 * Provides glob pattern matching for determining which tools
 * are visible in a given mode. Uses minimatch for pattern matching.
 */

import { minimatch } from 'minimatch';

/**
 * Check if a tool name matches the include/exclude pattern rules
 *
 * A tool matches if:
 * 1. It matches at least one pattern in `includes`
 * 2. AND it does NOT match any pattern in `excludes`
 *
 * Excludes ALWAYS win over includes.
 *
 * Patterns support:
 * - Glob syntax via minimatch (e.g., "source_control.*")
 * - Negation prefix "!" in includes (e.g., "!test.integration_*")
 *
 * @param toolName - The tool name to check (e.g., "source_control.status")
 * @param includes - Patterns that include tools (at least one must match)
 * @param excludes - Patterns that exclude tools (any match excludes the tool)
 * @returns true if the tool should be visible in the mode
 *
 * @example
 * // Basic matching
 * matchesTool('source_control.status', ['source_control.*'], [])
 * // => true
 *
 * @example
 * // Excludes win over includes
 * matchesTool('source_control.status', ['source_control.*'], ['source_control.status'])
 * // => false
 *
 * @example
 * // Negation in includes
 * matchesTool('test.integration_db', ['test.*', '!test.integration_*'], [])
 * // => false (negation pattern excludes it)
 */
export function matchesTool(
  toolName: string,
  includes: string[],
  excludes: string[]
): boolean {
  // Check excludes first - if any match, tool is excluded
  // Excludes ALWAYS win over includes
  for (const pattern of excludes) {
    if (matchesPattern(toolName, pattern)) {
      return false;
    }
  }

  // Process includes with negation support
  // Separate positive patterns from negation patterns
  const positivePatterns: string[] = [];
  const negationPatterns: string[] = [];

  for (const pattern of includes) {
    if (pattern.startsWith('!')) {
      // Negation pattern - strip the "!" prefix
      negationPatterns.push(pattern.slice(1));
    } else {
      positivePatterns.push(pattern);
    }
  }

  // Check negation patterns in includes - if any match, tool is excluded
  for (const pattern of negationPatterns) {
    if (matchesPattern(toolName, pattern)) {
      return false;
    }
  }

  // Check positive patterns - if any match, tool is included
  for (const pattern of positivePatterns) {
    if (matchesPattern(toolName, pattern)) {
      return true;
    }
  }

  // No positive pattern matched
  return false;
}

/**
 * Match a tool name against a single glob pattern
 *
 * Uses minimatch for glob pattern matching.
 *
 * @param toolName - The tool name to match
 * @param pattern - The glob pattern to match against
 * @returns true if the pattern matches the tool name
 *
 * @example
 * matchesPattern('source_control.status', 'source_control.*')
 * // => true
 *
 * @example
 * matchesPattern('build.compile', '*')
 * // => true
 */
export function matchesPattern(toolName: string, pattern: string): boolean {
  return minimatch(toolName, pattern);
}
