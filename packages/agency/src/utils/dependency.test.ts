/**
 * Unit tests for dependency validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  validateDependencies,
  detectCircularDependencies,
  findCycle,
  isValidDAG,
  getTopologicalOrder,
  buildDependencyGraphString,
  DEFAULT_DEPENDENCY_OPTIONS,
} from './dependency.js';
import type { Task } from './grouping.js';

// Helper to create a minimal task
function createTask(id: string, dependencies: string[] = [], phase?: string): Task {
  return {
    id,
    lineNumber: 1,
    completed: false,
    isParallel: false,
    description: `Task ${id}`,
    dependencies,
    phase,
  };
}

describe('dependency utilities', () => {
  describe('validateDependencies', () => {
    it('should return valid for tasks with no dependencies', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002'),
        createTask('T003'),
      ];

      const result = validateDependencies(tasks);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return valid for tasks with valid dependencies', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002', ['T001']),
        createTask('T003', ['T001', 'T002']),
      ];

      const result = validateDependencies(tasks);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect self-reference dependency', () => {
      const tasks: Task[] = [
        createTask('T001', ['T001']), // Self-reference
        createTask('T002'),
      ];

      const result = validateDependencies(tasks);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('self-reference');
      expect(result.errors[0].taskIds).toContain('T001');
      expect(result.errors[0].message).toContain('depends on itself');
    });

    it('should warn about missing dependencies', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002', ['T999']), // T999 doesn't exist
      ];

      const result = validateDependencies(tasks);

      expect(result.valid).toBe(true); // Warnings don't invalidate
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('T999');
      expect(result.warnings[0]).toContain('does not exist');
    });

    it('should detect circular dependency', () => {
      const tasks: Task[] = [
        createTask('T001', ['T002']),
        createTask('T002', ['T001']),
      ];

      const result = validateDependencies(tasks);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'circular')).toBe(true);
    });

    it('should detect complex circular dependency', () => {
      const tasks: Task[] = [
        createTask('T001', ['T003']),
        createTask('T002', ['T001']),
        createTask('T003', ['T002']), // T001 -> T003 -> T002 -> T001
      ];

      const result = validateDependencies(tasks);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'circular')).toBe(true);
    });

    it('should handle empty task list', () => {
      const result = validateDependencies([]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle single task with no dependencies', () => {
      const tasks: Task[] = [createTask('T001')];

      const result = validateDependencies(tasks);

      expect(result.valid).toBe(true);
    });
  });

  describe('detectCircularDependencies', () => {
    it('should return empty array for valid DAG', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002', ['T001']),
        createTask('T003', ['T002']),
      ];

      const errors = detectCircularDependencies(tasks);

      expect(errors).toHaveLength(0);
    });

    it('should detect simple cycle', () => {
      const tasks: Task[] = [
        createTask('T001', ['T002']),
        createTask('T002', ['T001']),
      ];

      const errors = detectCircularDependencies(tasks);

      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe('circular');
    });

    it('should detect cycle with proper error message', () => {
      const tasks: Task[] = [
        createTask('T001', ['T002']),
        createTask('T002', ['T003']),
        createTask('T003', ['T001']),
      ];

      const errors = detectCircularDependencies(tasks);

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Circular dependency');
    });
  });

  describe('findCycle', () => {
    it('should return empty array for no cycle nodes', () => {
      const tasks: Task[] = [createTask('T001')];

      const cycle = findCycle([], tasks);

      expect(cycle).toHaveLength(0);
    });

    it('should find specific cycle path', () => {
      const tasks: Task[] = [
        createTask('T001', ['T002']),
        createTask('T002', ['T001']),
      ];

      const cycle = findCycle(['T001', 'T002'], tasks);

      expect(cycle.length).toBeGreaterThan(0);
    });
  });

  describe('isValidDAG', () => {
    it('should return true for valid DAG', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002', ['T001']),
        createTask('T003', ['T001', 'T002']),
      ];

      expect(isValidDAG(tasks)).toBe(true);
    });

    it('should return false for circular dependency', () => {
      const tasks: Task[] = [
        createTask('T001', ['T002']),
        createTask('T002', ['T001']),
      ];

      expect(isValidDAG(tasks)).toBe(false);
    });

    it('should return true for empty task list', () => {
      expect(isValidDAG([])).toBe(true);
    });

    it('should return true even with self-reference (only checks cycles)', () => {
      // isValidDAG specifically checks for circular dependencies, not self-references
      // Self-references are caught by validateDependencies but don't form cycles in the graph
      const tasks: Task[] = [
        createTask('T001', ['T001']),
      ];

      // Self-reference is excluded from graph building, so DAG is technically valid
      expect(isValidDAG(tasks)).toBe(true);
    });
  });

  describe('getTopologicalOrder', () => {
    it('should return tasks in topological order', () => {
      const tasks: Task[] = [
        createTask('T003', ['T002']),
        createTask('T002', ['T001']),
        createTask('T001'),
      ];

      const ordered = getTopologicalOrder(tasks);

      expect(ordered).not.toBeNull();
      expect(ordered!.map(t => t.id)).toEqual(['T001', 'T002', 'T003']);
    });

    it('should return null for circular dependency', () => {
      const tasks: Task[] = [
        createTask('T001', ['T002']),
        createTask('T002', ['T001']),
      ];

      const ordered = getTopologicalOrder(tasks);

      expect(ordered).toBeNull();
    });

    it('should handle multiple independent chains', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002'),
        createTask('T003', ['T001']),
        createTask('T004', ['T002']),
      ];

      const ordered = getTopologicalOrder(tasks);

      expect(ordered).not.toBeNull();
      expect(ordered!).toHaveLength(4);
      // T001 must come before T003
      const t001Index = ordered!.findIndex(t => t.id === 'T001');
      const t003Index = ordered!.findIndex(t => t.id === 'T003');
      expect(t001Index).toBeLessThan(t003Index);
      // T002 must come before T004
      const t002Index = ordered!.findIndex(t => t.id === 'T002');
      const t004Index = ordered!.findIndex(t => t.id === 'T004');
      expect(t002Index).toBeLessThan(t004Index);
    });

    it('should handle empty task list', () => {
      const ordered = getTopologicalOrder([]);

      expect(ordered).toEqual([]);
    });

    it('should handle single task', () => {
      const tasks: Task[] = [createTask('T001')];

      const ordered = getTopologicalOrder(tasks);

      expect(ordered).toEqual(tasks);
    });
  });

  describe('buildDependencyGraphString', () => {
    it('should build graph string for tasks with dependencies', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002', ['T001']),
        createTask('T003', ['T001', 'T002']),
      ];

      const graphString = buildDependencyGraphString(tasks);

      expect(graphString).toContain('T001 (no dependencies)');
      expect(graphString).toContain('T002 ← T001');
      expect(graphString).toContain('T003 ← T001, T002');
    });

    it('should handle empty task list', () => {
      const graphString = buildDependencyGraphString([]);

      expect(graphString).toBe('');
    });
  });

  describe('DEFAULT_DEPENDENCY_OPTIONS', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_DEPENDENCY_OPTIONS.intraPhaseSequential).toBe(true);
      expect(DEFAULT_DEPENDENCY_OPTIONS.crossPhaseDependencies).toBe(true);
      expect(DEFAULT_DEPENDENCY_OPTIONS.includeExplicit).toBe(true);
    });
  });
});
