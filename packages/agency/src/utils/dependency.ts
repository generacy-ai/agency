/**
 * Dependency validation utilities for tasks
 * Implements validation for circular dependencies, self-references, and missing deps
 */

import type { Task } from './grouping.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of dependency validation
 */
export interface DependencyValidationResult {
  /** Whether all dependencies are valid (no errors) */
  valid: boolean;

  /** Validation errors (circular deps, self-references) */
  errors: DependencyValidationError[];

  /** Warnings (missing deps reference non-existent tasks) */
  warnings: string[];
}

/**
 * A dependency validation error
 */
export interface DependencyValidationError {
  /** Type of error */
  type: 'circular' | 'missing' | 'self-reference';

  /** Task IDs involved in the error */
  taskIds: string[];

  /** Human-readable error message */
  message: string;
}

/**
 * Options for auto-generating dependencies
 */
export interface DependencyGenerationOptions {
  /** Generate sequential dependencies within phases */
  intraPhaseSequential: boolean;

  /** Generate cross-phase dependencies (Phase N → all Phase N-1) */
  crossPhaseDependencies: boolean;

  /** Include explicit depends-on markers from tasks */
  includeExplicit: boolean;
}

/**
 * Default options for dependency generation
 */
export const DEFAULT_DEPENDENCY_OPTIONS: DependencyGenerationOptions = {
  intraPhaseSequential: true,
  crossPhaseDependencies: true,
  includeExplicit: true,
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate dependencies for a set of tasks
 *
 * @param tasks - Array of tasks with dependencies
 * @returns Validation result with errors and warnings
 */
export function validateDependencies(tasks: Task[]): DependencyValidationResult {
  const errors: DependencyValidationError[] = [];
  const warnings: string[] = [];

  // Build a map of task IDs for quick lookup
  const taskIds = new Set(tasks.map((t) => t.id));

  // Check for self-references
  for (const task of tasks) {
    if (task.dependencies.includes(task.id)) {
      errors.push({
        type: 'self-reference',
        taskIds: [task.id],
        message: `Task ${task.id} depends on itself`,
      });
    }
  }

  // Check for missing dependencies
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!taskIds.has(dep)) {
        warnings.push(
          `Task ${task.id} depends on ${dep} which does not exist in the task list`
        );
      }
    }
  }

  // Check for circular dependencies
  const circularErrors = detectCircularDependencies(tasks);
  errors.push(...circularErrors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect circular dependencies using Kahn's algorithm
 *
 * @param tasks - Array of tasks with dependencies
 * @returns Array of circular dependency errors
 */
export function detectCircularDependencies(
  tasks: Task[]
): DependencyValidationError[] {
  const errors: DependencyValidationError[] = [];

  // Build adjacency list and in-degree map
  const taskIds = new Set(tasks.map((t) => t.id));
  const adjacency = new Map<string, string[]>(); // taskId -> tasks that depend on it
  const inDegree = new Map<string, number>();

  // Initialize
  for (const task of tasks) {
    adjacency.set(task.id, []);
    inDegree.set(task.id, 0);
  }

  // Build graph (only consider dependencies within the task set)
  // Exclude self-references as they are handled separately
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (taskIds.has(dep) && dep !== task.id) {
        adjacency.get(dep)?.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      }
    }
  }

  // Kahn's algorithm - topological sort
  const queue: string[] = [];
  const sorted: string[] = [];

  // Find all nodes with in-degree 0
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If not all nodes were sorted, there's a cycle
  if (sorted.length !== tasks.length) {
    // Find nodes still with in-degree > 0 (part of cycle)
    const cycleNodes: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree > 0) {
        cycleNodes.push(id);
      }
    }

    // Try to find a specific cycle for better error message
    const cycle = findCycle(cycleNodes, tasks);

    errors.push({
      type: 'circular',
      taskIds: cycle.length > 0 ? cycle : cycleNodes,
      message:
        cycle.length > 0
          ? `Circular dependency detected: ${cycle.join(' → ')} → ${cycle[0]}`
          : `Circular dependency detected involving: ${cycleNodes.join(', ')}`,
    });
  }

  return errors;
}

/**
 * Find a specific cycle path for better error messages using DFS
 *
 * @param cycleNodes - Nodes known to be in a cycle
 * @param tasks - All tasks
 * @returns Array representing the cycle path
 */
export function findCycle(cycleNodes: string[], tasks: Task[]): string[] {
  if (cycleNodes.length === 0) {
    return [];
  }

  // Build dependency map
  const deps = new Map<string, string[]>();
  for (const task of tasks) {
    deps.set(task.id, task.dependencies);
  }

  // DFS to find a cycle
  const cycleSet = new Set(cycleNodes);
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    if (path.includes(node)) {
      // Found cycle - return the cycle portion
      const cycleStart = path.indexOf(node);
      return path.slice(cycleStart);
    }

    if (visited.has(node) || !cycleSet.has(node)) {
      return null;
    }

    visited.add(node);
    path.push(node);

    for (const dep of deps.get(node) || []) {
      if (cycleSet.has(dep)) {
        const result = dfs(dep);
        if (result) {
          return result;
        }
      }
    }

    path.pop();
    return null;
  }

  // Start DFS from any cycle node
  for (const startNode of cycleNodes) {
    const result = dfs(startNode);
    if (result) {
      return result;
    }
    visited.clear();
    path.length = 0;
  }

  return [];
}

/**
 * Check if dependencies form a valid DAG (no cycles)
 *
 * @param tasks - Array of tasks with dependencies
 * @returns True if dependencies form a valid DAG
 */
export function isValidDAG(tasks: Task[]): boolean {
  const result = validateDependencies(tasks);
  return result.errors.filter((e) => e.type === 'circular').length === 0;
}

/**
 * Get topological order of tasks respecting dependencies
 *
 * @param tasks - Array of tasks with dependencies
 * @returns Tasks in topological order, or null if cycle exists
 */
export function getTopologicalOrder(tasks: Task[]): Task[] | null {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const taskIds = new Set(tasks.map((t) => t.id));
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize
  for (const task of tasks) {
    adjacency.set(task.id, []);
    inDegree.set(task.id, 0);
  }

  // Build graph (exclude self-references)
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (taskIds.has(dep) && dep !== task.id) {
        adjacency.get(dep)?.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const sorted: Task[] = [];

  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const task = taskMap.get(current);
    if (task) {
      sorted.push(task);
    }

    for (const neighbor of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycle
  if (sorted.length !== tasks.length) {
    return null;
  }

  return sorted;
}

/**
 * Build a dependency graph visualization string
 *
 * @param tasks - Array of tasks with dependencies
 * @returns String representation of dependency graph
 */
export function buildDependencyGraphString(tasks: Task[]): string {
  const lines: string[] = [];

  for (const task of tasks) {
    if (task.dependencies.length > 0) {
      lines.push(`${task.id} ← ${task.dependencies.join(', ')}`);
    } else {
      lines.push(`${task.id} (no dependencies)`);
    }
  }

  return lines.join('\n');
}
