/**
 * Unit tests for task grouping utilities
 */

import { describe, it, expect } from 'vitest';
import {
  groupByTask,
  groupByStory,
  groupByPhase,
  groupTasks,
  buildTaskTitle,
  buildStoryTitle,
  buildPhaseTitle,
  buildIssueBody,
  buildIssueBodyWithDependencies,
  groupToIssuePlan,
  extractPhases,
  generatePhaseDependencies,
  generateSequentialDependencies,
  applyAutoDependencies,
  topologicalSort,
  resolveDependenciesToIssues,
} from './grouping.js';
import type { Task, TaskGroup } from './grouping.js';

// Helper to create a minimal task
function createTask(
  id: string,
  options: {
    dependencies?: string[];
    phase?: string;
    userStory?: string;
    description?: string;
    completed?: boolean;
  } = {}
): Task {
  return {
    id,
    lineNumber: 1,
    completed: options.completed ?? false,
    isParallel: false,
    description: options.description ?? `Task ${id}`,
    dependencies: options.dependencies ?? [],
    phase: options.phase,
    userStory: options.userStory,
  };
}

describe('grouping utilities', () => {
  describe('groupByTask', () => {
    it('should create one group per task', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002'),
        createTask('T003'),
      ];

      const groups = groupByTask(tasks, '163-feature');

      expect(groups).toHaveLength(3);
      expect(groups[0].id).toBe('T001');
      expect(groups[0].groupType).toBe('task');
      expect(groups[0].tasks).toHaveLength(1);
    });

    it('should preserve task dependencies', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002', { dependencies: ['T001'] }),
      ];

      const groups = groupByTask(tasks, '163-feature');

      expect(groups[1].dependencies).toEqual(['T001']);
    });

    it('should handle empty task list', () => {
      const groups = groupByTask([], '163-feature');

      expect(groups).toHaveLength(0);
    });
  });

  describe('groupByStory', () => {
    it('should group tasks by user story', () => {
      const tasks: Task[] = [
        createTask('T001', { userStory: 'US1' }),
        createTask('T002', { userStory: 'US1' }),
        createTask('T003', { userStory: 'US2' }),
      ];

      const groups = groupByStory(tasks, '163-feature');

      expect(groups).toHaveLength(2);
      const us1Group = groups.find(g => g.id === 'US1');
      expect(us1Group).toBeDefined();
      expect(us1Group!.tasks).toHaveLength(2);
      expect(us1Group!.groupType).toBe('story');
    });

    it('should create individual groups for tasks without stories', () => {
      const tasks: Task[] = [
        createTask('T001', { userStory: 'US1' }),
        createTask('T002'), // No story
      ];

      const groups = groupByStory(tasks, '163-feature');

      expect(groups).toHaveLength(2);
      const noStoryGroup = groups.find(g => g.id === 'T002');
      expect(noStoryGroup).toBeDefined();
      expect(noStoryGroup!.groupType).toBe('task');
    });

    it('should collect external dependencies', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002', { userStory: 'US1', dependencies: ['T001'] }),
        createTask('T003', { userStory: 'US1' }), // Internal to US1
      ];

      const groups = groupByStory(tasks, '163-feature');

      const us1Group = groups.find(g => g.id === 'US1');
      expect(us1Group!.dependencies).toContain('T001'); // External
    });
  });

  describe('groupByPhase', () => {
    it('should group tasks by phase', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002', { phase: 'Phase 1' }),
        createTask('T003', { phase: 'Phase 2' }),
      ];

      const groups = groupByPhase(tasks, '163-feature');

      expect(groups).toHaveLength(2);
      const phase1Group = groups.find(g => g.id === 'Phase 1');
      expect(phase1Group).toBeDefined();
      expect(phase1Group!.tasks).toHaveLength(2);
      expect(phase1Group!.groupType).toBe('phase');
    });

    it('should create individual groups for tasks without phases', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002'), // No phase
      ];

      const groups = groupByPhase(tasks, '163-feature');

      expect(groups).toHaveLength(2);
      const noPhaseGroup = groups.find(g => g.id === 'T002');
      expect(noPhaseGroup).toBeDefined();
      expect(noPhaseGroup!.groupType).toBe('task');
    });
  });

  describe('groupTasks', () => {
    it('should dispatch to groupByTask for per-task strategy', () => {
      const tasks: Task[] = [createTask('T001'), createTask('T002')];

      const groups = groupTasks(tasks, 'per-task', '163-feature');

      expect(groups).toHaveLength(2);
      expect(groups[0].groupType).toBe('task');
    });

    it('should dispatch to groupByStory for per-story strategy', () => {
      const tasks: Task[] = [
        createTask('T001', { userStory: 'US1' }),
        createTask('T002', { userStory: 'US1' }),
      ];

      const groups = groupTasks(tasks, 'per-story', '163-feature');

      expect(groups).toHaveLength(1);
      expect(groups[0].groupType).toBe('story');
    });

    it('should dispatch to groupByPhase for per-phase strategy', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002', { phase: 'Phase 1' }),
      ];

      const groups = groupTasks(tasks, 'per-phase', '163-feature');

      expect(groups).toHaveLength(1);
      expect(groups[0].groupType).toBe('phase');
    });
  });

  describe('title building', () => {
    it('buildTaskTitle should include task ID and description', () => {
      const task = createTask('T001', { description: 'Implement feature' });

      const title = buildTaskTitle(task, '163-feature');

      expect(title).toContain('[T001]');
      expect(title).toContain('Implement feature');
      expect(title).toContain('#163');
    });

    it('buildTaskTitle should truncate long descriptions', () => {
      const task = createTask('T001', {
        description: 'This is a very long description that should be truncated because it exceeds the maximum allowed length',
      });

      const title = buildTaskTitle(task, '163-feature');

      expect(title.length).toBeLessThan(100);
      expect(title).toContain('...');
    });

    it('buildStoryTitle should include story ID and task IDs', () => {
      const tasks: Task[] = [createTask('T001'), createTask('T002')];

      const title = buildStoryTitle('US1', tasks, '163-feature');

      expect(title).toContain('[US1]');
      expect(title).toContain('T001');
      expect(title).toContain('T002');
      expect(title).toContain('#163');
    });

    it('buildPhaseTitle should include phase name', () => {
      const title = buildPhaseTitle('Phase 1', '163-feature');

      expect(title).toContain('Phase 1');
      expect(title).toContain('#163');
    });
  });

  describe('buildIssueBody', () => {
    it('should build body with description section', () => {
      const group: TaskGroup = {
        id: 'T001',
        groupType: 'task',
        tasks: [createTask('T001', { description: 'Test task' })],
        title: 'Test',
        body: '',
        labels: [],
        dependencies: [],
      };

      const body = buildIssueBody(group);

      expect(body).toContain('## Description');
      expect(body).toContain('Test task');
    });

    it('should include tasks as checkboxes', () => {
      const group: TaskGroup = {
        id: 'T001',
        groupType: 'task',
        tasks: [
          createTask('T001', { completed: false }),
          createTask('T002', { completed: true }),
        ],
        title: 'Test',
        body: '',
        labels: [],
        dependencies: [],
      };

      const body = buildIssueBody(group);

      expect(body).toContain('## Tasks');
      expect(body).toContain('- [ ] T001');
      expect(body).toContain('- [x] T002');
    });

    it('should include epic parent metadata', () => {
      const group: TaskGroup = {
        id: 'T001',
        groupType: 'task',
        tasks: [createTask('T001')],
        title: 'Test',
        body: '',
        labels: [],
        dependencies: [],
      };

      const body = buildIssueBody(group, 139, '163-feature');

      expect(body).toContain('<!-- epic-parent: 139 -->');
      expect(body).toContain('<!-- source-feature: 163-feature -->');
    });

    it('should include dependencies section', () => {
      const group: TaskGroup = {
        id: 'T002',
        groupType: 'task',
        tasks: [createTask('T002')],
        title: 'Test',
        body: '',
        labels: [],
        dependencies: ['T001'],
      };

      const body = buildIssueBody(group);

      expect(body).toContain('## Dependencies');
      expect(body).toContain('<!-- depends-on: T001 -->');
      expect(body).toContain('Depends on: T001');
    });

    it('should resolve dependencies to issue numbers', () => {
      const group: TaskGroup = {
        id: 'T002',
        groupType: 'task',
        tasks: [createTask('T002')],
        title: 'Test',
        body: '',
        labels: [],
        dependencies: ['T001'],
      };

      const resolvedDeps = new Map<string, number>([['T001', 42]]);
      const body = buildIssueBody(group, undefined, undefined, resolvedDeps);

      expect(body).toContain('#42');
    });
  });

  describe('groupToIssuePlan', () => {
    it('should convert group to issue plan', () => {
      const group: TaskGroup = {
        id: 'T001',
        groupType: 'task',
        tasks: [createTask('T001'), createTask('T002')],
        title: 'Test Title',
        body: '',
        labels: ['epic-child'],
        dependencies: ['T000'],
      };

      const plan = groupToIssuePlan(group, 139, '163-feature');

      expect(plan.title).toBe('Test Title');
      expect(plan.groupId).toBe('T001');
      expect(plan.taskCount).toBe(2);
      expect(plan.taskIds).toEqual(['T001', 'T002']);
      expect(plan.labels).toEqual(['epic-child']);
      expect(plan.dependencies).toEqual(['T000']);
      expect(plan.bodyPreview.length).toBeLessThanOrEqual(500);
    });
  });

  describe('extractPhases', () => {
    it('should extract unique phases in order', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002', { phase: 'Phase 2' }),
        createTask('T003', { phase: 'Phase 1' }), // Duplicate
      ];
      const groups = groupByTask(tasks, '163-feature');

      const phases = extractPhases(groups);

      expect(phases).toEqual(['Phase 1', 'Phase 2']);
    });

    it('should handle groups without phases', () => {
      const tasks: Task[] = [createTask('T001')];
      const groups = groupByTask(tasks, '163-feature');

      const phases = extractPhases(groups);

      expect(phases).toEqual([]);
    });
  });

  describe('generatePhaseDependencies', () => {
    it('should generate cross-phase dependencies', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002', { phase: 'Phase 2' }),
      ];
      const groups = groupByTask(tasks, '163-feature');

      const phaseDeps = generatePhaseDependencies(groups);

      // T002 (Phase 2) should depend on T001 (Phase 1)
      expect(phaseDeps.get('T002')).toContain('T001');
    });

    it('should not create dependencies for first phase', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002', { phase: 'Phase 1' }),
      ];
      const groups = groupByTask(tasks, '163-feature');

      const phaseDeps = generatePhaseDependencies(groups);

      expect(phaseDeps.get('T001') || []).toHaveLength(0);
    });
  });

  describe('generateSequentialDependencies', () => {
    it('should generate sequential dependencies within phases', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002', { phase: 'Phase 1' }),
        createTask('T003', { phase: 'Phase 1' }),
      ];
      const groups = groupByTask(tasks, '163-feature');

      const seqDeps = generateSequentialDependencies(groups);

      expect(seqDeps.get('T002')).toContain('T001');
      expect(seqDeps.get('T003')).toContain('T002');
    });
  });

  describe('applyAutoDependencies', () => {
    it('should apply both cross-phase and sequential dependencies', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002', { phase: 'Phase 1' }),
        createTask('T003', { phase: 'Phase 2' }),
      ];
      const groups = groupByTask(tasks, '163-feature');

      const updatedGroups = applyAutoDependencies(groups);

      // T002 should depend on T001 (sequential)
      expect(updatedGroups.find(g => g.id === 'T002')!.dependencies).toContain('T001');
      // T003 should depend on T001 and T002 (cross-phase)
      const t003Deps = updatedGroups.find(g => g.id === 'T003')!.dependencies;
      expect(t003Deps).toContain('T001');
      expect(t003Deps).toContain('T002');
    });

    it('should not modify original groups', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002', { phase: 'Phase 1' }),
      ];
      const groups = groupByTask(tasks, '163-feature');
      const originalDeps = [...groups[1].dependencies];

      applyAutoDependencies(groups);

      expect(groups[1].dependencies).toEqual(originalDeps);
    });

    it('should respect options', () => {
      const tasks: Task[] = [
        createTask('T001', { phase: 'Phase 1' }),
        createTask('T002', { phase: 'Phase 1' }),
      ];
      const groups = groupByTask(tasks, '163-feature');

      const updatedGroups = applyAutoDependencies(groups, {
        intraPhaseSequential: false,
        crossPhaseDependencies: false,
        includeExplicit: true,
      });

      // No auto-deps should be added
      expect(updatedGroups.find(g => g.id === 'T002')!.dependencies).toHaveLength(0);
    });
  });

  describe('topologicalSort', () => {
    it('should sort groups in dependency order', () => {
      const tasks: Task[] = [
        createTask('T003', { dependencies: ['T002'] }),
        createTask('T002', { dependencies: ['T001'] }),
        createTask('T001'),
      ];
      const groups = groupByTask(tasks, '163-feature');

      const result = topologicalSort(groups);

      expect(result.hasCycle).toBe(false);
      expect(result.sorted.map(g => g.id)).toEqual(['T001', 'T002', 'T003']);
    });

    it('should detect cycles', () => {
      const tasks: Task[] = [
        createTask('T001', { dependencies: ['T002'] }),
        createTask('T002', { dependencies: ['T001'] }),
      ];
      const groups = groupByTask(tasks, '163-feature');

      const result = topologicalSort(groups);

      expect(result.hasCycle).toBe(true);
      expect(result.cycleInfo).toBeDefined();
    });

    it('should handle groups without dependencies', () => {
      const tasks: Task[] = [
        createTask('T001'),
        createTask('T002'),
      ];
      const groups = groupByTask(tasks, '163-feature');

      const result = topologicalSort(groups);

      expect(result.hasCycle).toBe(false);
      expect(result.sorted).toHaveLength(2);
    });
  });

  describe('resolveDependenciesToIssues', () => {
    it('should resolve group IDs to issue numbers', () => {
      const groupToIssue = new Map<string, number>([
        ['T001', 42],
        ['T002', 43],
      ]);
      const taskToGroup = new Map<string, string>([
        ['T001', 'T001'],
        ['T002', 'T002'],
      ]);

      const issueNums = resolveDependenciesToIssues(
        ['T001', 'T002'],
        groupToIssue,
        taskToGroup
      );

      expect(issueNums).toEqual([42, 43]);
    });

    it('should resolve task IDs through groups', () => {
      const groupToIssue = new Map<string, number>([['US1', 42]]);
      const taskToGroup = new Map<string, string>([
        ['T001', 'US1'],
        ['T002', 'US1'],
      ]);

      const issueNums = resolveDependenciesToIssues(
        ['T001'],
        groupToIssue,
        taskToGroup
      );

      expect(issueNums).toEqual([42]);
    });

    it('should handle unresolved dependencies', () => {
      const groupToIssue = new Map<string, number>([['T001', 42]]);
      const taskToGroup = new Map<string, string>([['T001', 'T001']]);

      const issueNums = resolveDependenciesToIssues(
        ['T001', 'T999'], // T999 doesn't exist
        groupToIssue,
        taskToGroup
      );

      expect(issueNums).toEqual([42]);
    });

    it('should deduplicate issue numbers', () => {
      const groupToIssue = new Map<string, number>([['US1', 42]]);
      const taskToGroup = new Map<string, string>([
        ['T001', 'US1'],
        ['T002', 'US1'],
      ]);

      const issueNums = resolveDependenciesToIssues(
        ['T001', 'T002'], // Both map to same issue
        groupToIssue,
        taskToGroup
      );

      expect(issueNums).toEqual([42]); // Deduplicated
    });
  });

  describe('buildIssueBodyWithDependencies', () => {
    it('should build body with resolved dependencies', () => {
      const group: TaskGroup = {
        id: 'T002',
        groupType: 'task',
        tasks: [createTask('T002')],
        title: 'Test',
        body: '',
        labels: [],
        dependencies: ['T001'],
      };
      const groupToIssue = new Map<string, number>([['T001', 42]]);
      const taskToGroup = new Map<string, string>([['T001', 'T001']]);

      const body = buildIssueBodyWithDependencies(
        group,
        139,
        '163-feature',
        groupToIssue,
        taskToGroup
      );

      expect(body).toContain('#42');
    });
  });
});
