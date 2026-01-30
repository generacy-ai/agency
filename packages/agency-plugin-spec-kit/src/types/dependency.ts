/**
 * Dependency-related type definitions for spec-kit
 *
 * These types represent task dependencies, dependency graphs,
 * and validation results for dependency analysis.
 */

/**
 * Dependency info extracted from a task description.
 *
 * Represents the dependencies of a single task, including
 * how the dependency was determined.
 *
 * @example
 * ```typescript
 * const dep: TaskDependency = {
 *   taskId: 'T003',
 *   dependsOn: ['T001', 'T002'],
 *   phase: 'Phase 2: Core',
 *   source: 'explicit',
 * };
 * ```
 */
export interface TaskDependency {
  /** Task ID */
  taskId: string;

  /** Task IDs this depends on */
  dependsOn: string[];

  /** Phase this task belongs to */
  phase?: string;

  /** Whether auto-generated (from phase ordering) or explicit (in description) */
  source: 'auto' | 'explicit';
}

/**
 * Phase-based dependency graph.
 *
 * Represents the complete dependency structure organized by phases.
 *
 * @example
 * ```typescript
 * const graph: DependencyGraph = {
 *   phases: ['Phase 1: Setup', 'Phase 2: Core'],
 *   tasksByPhase: {
 *     'Phase 1: Setup': ['T001', 'T002'],
 *     'Phase 2: Core': ['T003', 'T004'],
 *   },
 *   dependencies: [dep1, dep2, dep3],
 *   executionOrder: ['T001', 'T002', 'T003', 'T004'],
 * };
 * ```
 */
export interface DependencyGraph {
  /** Ordered list of phases */
  phases: string[];

  /** Tasks grouped by phase */
  tasksByPhase: Record<string, string[]>;

  /** All task dependencies */
  dependencies: TaskDependency[];

  /** Computed execution order (topologically sorted) */
  executionOrder: string[];
}

/**
 * Error types for dependency validation.
 */
export type DependencyErrorType = 'circular' | 'missing' | 'self-reference';

/**
 * Individual validation error for a dependency issue.
 *
 * @example
 * ```typescript
 * const error: DependencyValidationError = {
 *   type: 'circular',
 *   taskIds: ['T001', 'T002', 'T003'],
 *   message: 'Circular dependency detected: T001 → T002 → T003 → T001',
 * };
 * ```
 */
export interface DependencyValidationError {
  /** Error type */
  type: DependencyErrorType;

  /** Task IDs involved */
  taskIds: string[];

  /** Human-readable message */
  message: string;
}

/**
 * Result of dependency validation.
 *
 * Indicates whether all dependencies are valid and provides
 * detailed error information if validation fails.
 *
 * @example
 * ```typescript
 * const result: DependencyValidationResult = {
 *   valid: false,
 *   errors: [
 *     {
 *       type: 'missing',
 *       taskIds: ['T005'],
 *       message: 'Task T003 depends on T005 which does not exist',
 *     },
 *   ],
 *   warnings: ['Task T001 has no dependencies, may be a root task'],
 * };
 * ```
 */
export interface DependencyValidationResult {
  /** Whether all dependencies valid */
  valid: boolean;

  /** Validation errors */
  errors: DependencyValidationError[];

  /** Warnings (non-blocking issues) */
  warnings: string[];
}

/**
 * Information about a circular dependency.
 *
 * Provides detailed information about a detected dependency cycle.
 *
 * @example
 * ```typescript
 * const circular: CircularDependency = {
 *   cycle: ['T001', 'T002', 'T003', 'T001'],
 *   description: 'T001 → T002 → T003 → T001',
 * };
 * ```
 */
export interface CircularDependency {
  /** Task/group IDs involved in cycle (last element equals first) */
  cycle: string[];

  /** Human-readable description of the cycle */
  description: string;
}

/**
 * Options for dependency analysis.
 *
 * @example
 * ```typescript
 * const options: DependencyAnalysisOptions = {
 *   includeImplicitDependencies: true,
 *   strictPhaseOrdering: true,
 * };
 * ```
 */
export interface DependencyAnalysisOptions {
  /** Whether to include implicit dependencies from phase ordering */
  includeImplicitDependencies?: boolean;

  /** Whether tasks in later phases strictly depend on all tasks in earlier phases */
  strictPhaseOrdering?: boolean;
}
