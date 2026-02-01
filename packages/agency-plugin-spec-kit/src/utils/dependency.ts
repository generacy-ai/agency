/**
 * Dependency validation utilities for tasks.
 *
 * Provides functions to validate task dependencies, detect circular
 * dependencies, and check if dependencies form a valid DAG.
 *
 * @example
 * ```typescript
 * import {
 *   validateDependencies,
 *   detectCircularDependencies,
 *   isValidDAG,
 * } from './dependency.js';
 *
 * const tasks = parseTasksContent(content);
 * const result = validateDependencies(tasks);
 *
 * if (!result.valid) {
 *   console.error('Dependency errors:', result.errors);
 * }
 * ```
 */

import type { Task, TaskGroupEntry } from '../types/task.js';
import type {
  DependencyValidationResult,
  DependencyValidationError,
  CircularDependency,
} from '../types/dependency.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Item that can have dependencies (Task or TaskGroupEntry).
 */
export interface DependencyItem {
  id: string;
  dependencies: string[];
}

/**
 * Normalize Task or TaskGroupEntry to DependencyItem.
 */
function toDependencyItem(item: Task | TaskGroupEntry): DependencyItem {
  if ('dependencies' in item) {
    return { id: item.id, dependencies: item.dependencies };
  }
  // TaskGroupEntry doesn't have dependencies by default, but may be extended
  return { id: item.id, dependencies: [] };
}

// ============================================================================
// Circular Dependency Detection
// ============================================================================

/**
 * Detect circular dependencies using depth-first search.
 *
 * Uses a standard DFS cycle detection algorithm with three states:
 * - WHITE (0): Not visited
 * - GRAY (1): Currently in recursion stack
 * - BLACK (2): Fully processed
 *
 * @param items - Array of items with dependencies
 * @returns Array of detected cycles (empty if no cycles)
 *
 * @example
 * ```typescript
 * const tasks = [
 *   { id: 'T001', dependencies: ['T002'] },
 *   { id: 'T002', dependencies: ['T003'] },
 *   { id: 'T003', dependencies: ['T001'] }, // Creates cycle
 * ];
 *
 * const cycles = detectCircularDependencies(tasks);
 * // [{ cycle: ['T001', 'T002', 'T003', 'T001'], description: '...' }]
 * ```
 */
export function detectCircularDependencies(
  items: DependencyItem[]
): CircularDependency[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const cycles: CircularDependency[] = [];
  const itemMap = new Map<string, DependencyItem>();
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  // Build item map and initialize colors
  for (const item of items) {
    itemMap.set(item.id, item);
    color.set(item.id, WHITE);
    parent.set(item.id, null);
  }

  /**
   * DFS visit function that detects back edges (cycles).
   */
  function dfsVisit(nodeId: string, path: string[]): void {
    color.set(nodeId, GRAY);
    const currentPath = [...path, nodeId];

    const item = itemMap.get(nodeId);
    if (!item) {
      color.set(nodeId, BLACK);
      return;
    }

    for (const depId of item.dependencies) {
      const depColor = color.get(depId);

      if (depColor === GRAY) {
        // Found a back edge - this is a cycle
        const cycleStart = currentPath.indexOf(depId);
        const cyclePath = [...currentPath.slice(cycleStart), depId];

        cycles.push({
          cycle: cyclePath,
          description: cyclePath.join(' → '),
        });
      } else if (depColor === WHITE) {
        parent.set(depId, nodeId);
        dfsVisit(depId, currentPath);
      }
      // BLACK nodes are already fully processed, skip
    }

    color.set(nodeId, BLACK);
  }

  // Run DFS from each unvisited node
  for (const item of items) {
    if (color.get(item.id) === WHITE) {
      dfsVisit(item.id, []);
    }
  }

  return cycles;
}

// ============================================================================
// Dependency Validation
// ============================================================================

/**
 * Validate task dependencies.
 *
 * Checks for:
 * - Circular dependencies
 * - Missing dependencies (referencing non-existent tasks)
 * - Self-references
 *
 * @param items - Array of items (tasks or groups) with dependencies
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```typescript
 * const tasks = parseTasksContent(content);
 * const result = validateDependencies(tasks);
 *
 * if (!result.valid) {
 *   for (const error of result.errors) {
 *     console.error(`${error.type}: ${error.message}`);
 *   }
 * }
 * ```
 */
export function validateDependencies(
  items: DependencyItem[]
): DependencyValidationResult {
  const errors: DependencyValidationError[] = [];
  const warnings: string[] = [];

  // Build set of known IDs
  const knownIds = new Set(items.map((item) => item.id));

  // Check each item's dependencies
  for (const item of items) {
    // Check for self-reference
    if (item.dependencies.includes(item.id)) {
      errors.push({
        type: 'self-reference',
        taskIds: [item.id],
        message: `Task ${item.id} depends on itself`,
      });
    }

    // Check for missing dependencies
    for (const depId of item.dependencies) {
      if (!knownIds.has(depId)) {
        errors.push({
          type: 'missing',
          taskIds: [item.id, depId],
          message: `Task ${item.id} depends on ${depId} which does not exist`,
        });
      }
    }
  }

  // Check for circular dependencies
  const cycles = detectCircularDependencies(items);
  for (const cycle of cycles) {
    errors.push({
      type: 'circular',
      taskIds: cycle.cycle.slice(0, -1), // Remove duplicate end
      message: `Circular dependency detected: ${cycle.description}`,
    });
  }

  // Add warnings for items with no dependencies (potential roots)
  const itemsWithoutDeps = items.filter((item) => item.dependencies.length === 0);
  if (itemsWithoutDeps.length === 0 && items.length > 0) {
    warnings.push(
      'No root tasks found (all tasks have dependencies). This may indicate missing tasks.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate dependencies in Task array.
 *
 * Convenience wrapper for validateDependencies that works with Tasks.
 *
 * @param tasks - Array of tasks
 * @returns Validation result
 */
export function validateTaskDependencies(
  tasks: Task[]
): DependencyValidationResult {
  return validateDependencies(tasks.map(toDependencyItem));
}

/**
 * Check if dependencies form a valid DAG (Directed Acyclic Graph).
 *
 * A valid DAG has no circular dependencies.
 *
 * @param items - Array of items with dependencies
 * @returns True if valid DAG (no cycles)
 *
 * @example
 * ```typescript
 * if (!isValidDAG(tasks)) {
 *   throw new Error('Tasks contain circular dependencies');
 * }
 * ```
 */
export function isValidDAG(items: DependencyItem[]): boolean {
  const cycles = detectCircularDependencies(items);
  return cycles.length === 0;
}

/**
 * Check if Task array forms a valid DAG.
 *
 * @param tasks - Array of tasks
 * @returns True if valid DAG
 */
export function isValidTaskDAG(tasks: Task[]): boolean {
  return isValidDAG(tasks.map(toDependencyItem));
}

// ============================================================================
// Dependency Graph Analysis
// ============================================================================

/**
 * Get all direct dependencies for an item.
 *
 * @param items - Array of items
 * @param itemId - ID of item to get dependencies for
 * @returns Array of dependency IDs
 */
export function getDependencies(
  items: DependencyItem[],
  itemId: string
): string[] {
  const item = items.find((i) => i.id === itemId);
  return item?.dependencies ?? [];
}

/**
 * Get all items that depend on a given item.
 *
 * @param items - Array of items
 * @param itemId - ID of item to find dependents for
 * @returns Array of dependent item IDs
 */
export function getDependents(items: DependencyItem[], itemId: string): string[] {
  return items.filter((item) => item.dependencies.includes(itemId)).map((item) => item.id);
}

/**
 * Get all transitive dependencies for an item (recursive).
 *
 * @param items - Array of items
 * @param itemId - ID of item to get all dependencies for
 * @returns Set of all dependency IDs (direct and transitive)
 */
export function getAllDependencies(
  items: DependencyItem[],
  itemId: string
): Set<string> {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const result = new Set<string>();
  const visited = new Set<string>();

  function collect(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    const item = itemMap.get(id);
    if (!item) return;

    for (const depId of item.dependencies) {
      result.add(depId);
      collect(depId);
    }
  }

  collect(itemId);
  return result;
}

/**
 * Find root items (items with no dependencies).
 *
 * @param items - Array of items
 * @returns Array of root item IDs
 */
export function findRootItems(items: DependencyItem[]): string[] {
  return items.filter((item) => item.dependencies.length === 0).map((item) => item.id);
}

/**
 * Find leaf items (items that no other item depends on).
 *
 * @param items - Array of items
 * @returns Array of leaf item IDs
 */
export function findLeafItems(items: DependencyItem[]): string[] {
  const dependedOn = new Set<string>();

  for (const item of items) {
    for (const depId of item.dependencies) {
      dependedOn.add(depId);
    }
  }

  return items.filter((item) => !dependedOn.has(item.id)).map((item) => item.id);
}
