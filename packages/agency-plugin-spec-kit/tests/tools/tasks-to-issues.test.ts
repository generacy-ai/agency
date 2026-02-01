/**
 * Tests for tasks_to_issues tool
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTasksToIssuesTool } from '../../src/tools/tasks-to-issues.js';
import { parseConfig } from '../../src/config.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

// Mock the github-cli module
vi.mock('../../src/utils/github-cli.js', () => ({
  checkGhCli: vi.fn(),
  createIssue: vi.fn(),
  searchIssues: vi.fn(),
  getIssueLabels: vi.fn(),
  findExistingIssue: vi.fn(),
  GhCliError: class GhCliError extends Error {
    code: string;
    retryable: boolean;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
      this.retryable = false;
    }
  },
}));

// Import mocked functions
import {
  checkGhCli,
  createIssue,
  getIssueLabels,
  findExistingIssue,
} from '../../src/utils/github-cli.js';

describe('tasks_to_issues tool', () => {
  let testDir: string;
  let mockCoreAPI: AgencyCoreAPI;

  const createMockCoreAPI = (): AgencyCoreAPI => ({
    registerTool: vi.fn(),
    unregisterTool: vi.fn(),
    getCurrentMode: vi.fn(() => 'coding'),
    registerMode: vi.fn(),
    onModeChange: vi.fn(() => () => {}),
    registerChannel: vi.fn(),
    sendMessage: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    getConfig: vi.fn(() => undefined),
    recordEvent: vi.fn(),
    getPluginId: vi.fn(() => '@generacy-ai/agency-plugin-spec-kit'),
  });

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-tasks-to-issues-test-'));
    mockCoreAPI = createMockCoreAPI();

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock implementations
    (checkGhCli as Mock).mockResolvedValue({ ok: true, version: '2.0.0', user: 'testuser' });
    (getIssueLabels as Mock).mockResolvedValue([]);
    (findExistingIssue as Mock).mockResolvedValue(null);
    (createIssue as Mock).mockImplementation(async (opts) => ({
      number: Math.floor(Math.random() * 1000) + 100,
      url: `https://github.com/owner/repo/issues/${Math.floor(Math.random() * 1000) + 100}`,
      title: opts.title,
    }));
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      expect(tool.name).toBe('spec_kit.tasks_to_issues');
    });

    it('should have correct namespace', () => {
      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have terse output pattern', () => {
      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      expect(tool.outputPattern).toBe('terse');
    });

    it('should support coding mode', () => {
      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      expect(tool.modes).toContain('coding');
    });
  });

  describe('error handling', () => {
    it('should error when gh CLI is not installed', async () => {
      (checkGhCli as Mock).mockResolvedValue({
        ok: false,
        message: 'gh not found',
      });

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: join(testDir, 'specs', '001-feature'),
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('GH_CLI_NOT_FOUND');
    });

    it('should error when gh CLI is not authenticated', async () => {
      (checkGhCli as Mock).mockResolvedValue({
        ok: false,
        message: 'not logged in',
      });

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: join(testDir, 'specs', '001-feature'),
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('GH_NOT_AUTHENTICATED');
    });

    it('should error when feature directory does not exist', async () => {
      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: join(testDir, 'nonexistent'),
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('FEATURE_DIR_NOT_FOUND');
    });

    it('should error when tasks.md does not exist', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('TASKS_FILE_NOT_FOUND');
    });

    it('should error when tasks.md is empty', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(join(featureDir, 'tasks.md'), '');

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('TASKS_FILE_EMPTY');
    });

    it('should error when tasks.md has unknown format', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(join(featureDir, 'tasks.md'), '# No tasks here\n\nJust some text');

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('TASKS_PARSE_ERROR');
    });
  });

  describe('dry run mode', () => {
    it('should return planned issues without creating them', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

## Phase 1: Setup

- [ ] T001 Create project structure
- [ ] T002 [P] Set up linting
`
      );

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.dryRun).toBe(true);
      expect(response.issuesCreated).toBe(0);
      expect(response.issues).toHaveLength(2);
      expect(response.issues[0].title).toContain('T001');
      expect(response.issues[1].title).toContain('T002');

      // Should not have called createIssue
      expect(createIssue).not.toHaveBeenCalled();
    });

    it('should skip completed tasks', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

- [x] T001 Already done
- [ ] T002 Still pending
`
      );

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.tasksIncluded).toBe(1);
      expect(response.tasksSkipped).toBe(1);
      expect(response.issues).toHaveLength(1);
      expect(response.issues[0].title).toContain('T002');
    });

    it('should skip tasks with existing issue links', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

- [ ] T001 [#123] Already has issue
- [ ] T002 Needs issue
`
      );

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.tasksIncluded).toBe(1);
      expect(response.tasksSkipped).toBe(1);
      expect(response.issues).toHaveLength(1);
      expect(response.issues[0].title).toContain('T002');
    });
  });

  describe('grouping strategies', () => {
    const tasksContent = `# Tasks

## Phase 1: Setup

- [ ] T001 [US1] Create module
- [ ] T002 [US1] Add exports

## Phase 2: Core

- [ ] T003 [US2] Implement feature
- [ ] T004 [US2] Add validation
`;

    it('should group by task (per-task)', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(join(featureDir, 'tasks.md'), tasksContent);

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        grouping: 'per-task',
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.groupingStrategy).toBe('per-task');
      expect(response.issues).toHaveLength(4); // One per task
    });

    it('should group by user story (per-story)', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(join(featureDir, 'tasks.md'), tasksContent);

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        grouping: 'per-story',
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.groupingStrategy).toBe('per-story');
      expect(response.issues).toHaveLength(2); // US1 and US2
    });

    it('should group by phase (per-phase)', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(join(featureDir, 'tasks.md'), tasksContent);

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        grouping: 'per-phase',
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.groupingStrategy).toBe('per-phase');
      expect(response.issues).toHaveLength(2); // Phase 1 and Phase 2
    });
  });

  describe('issue creation', () => {
    it('should create issues and return results', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

- [ ] T001 Create structure
- [ ] T002 Add tests
`
      );

      let issueCounter = 100;
      (createIssue as Mock).mockImplementation(async (opts) => ({
        number: issueCounter++,
        url: `https://github.com/owner/repo/issues/${issueCounter - 1}`,
        title: opts.title,
      }));

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        dry_run: false,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.dryRun).toBe(false);
      expect(response.issuesCreated).toBe(2);
      expect(response.issues[0].number).toBe(100);
      expect(response.issues[1].number).toBe(101);

      // Should have called createIssue twice
      expect(createIssue).toHaveBeenCalledTimes(2);
    });

    it('should skip duplicate issues', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

- [ ] T001 Existing task
- [ ] T002 New task
`
      );

      // First task already exists
      (findExistingIssue as Mock).mockImplementation(async (title) => {
        if (title.includes('T001')) return 50;
        return null;
      });

      (createIssue as Mock).mockResolvedValue({
        number: 100,
        url: 'https://github.com/owner/repo/issues/100',
        title: 'T002',
      });

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        dry_run: false,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.issuesCreated).toBe(1);
      expect(response.skippedReasons).toContain('T001: Already exists as #50');

      // Should only create one issue
      expect(createIssue).toHaveBeenCalledTimes(1);
    });

    it('should update tasks.md with issue links', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

- [ ] T001 Create structure
`
      );

      (createIssue as Mock).mockResolvedValue({
        number: 123,
        url: 'https://github.com/owner/repo/issues/123',
        title: 'T001',
      });

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      await tool.execute({
        feature_dir: featureDir,
        dry_run: false,
        cwd: testDir,
      });

      // Read the updated file
      const updatedContent = await fs.readFile(join(featureDir, 'tasks.md'), 'utf-8');
      expect(updatedContent).toContain('[#123]');
    });
  });

  describe('TG-XXX format support', () => {
    it('should parse task group format', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

## Phase 1: Setup

### TG-001 [US1] Setup Module
**Scope**: S
**Files**: src/index.ts

- [ ] Create module structure
- [ ] Add exports

### TG-002 [US2] Add Feature
**Scope**: M

- [ ] Implement feature
- [ ] Add tests
`
      );

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.issues).toHaveLength(2);
      expect(response.issues[0].title).toContain('TG-001');
      expect(response.issues[1].title).toContain('TG-002');
    });

    it('should skip completed task groups', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

### TG-001 Setup Module
- [x] Create module
- [x] Add exports

### TG-002 Add Feature
- [ ] Implement feature
`
      );

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.issues).toHaveLength(1);
      expect(response.issues[0].title).toContain('TG-002');
    });
  });

  describe('dependency handling', () => {
    it('should detect circular dependencies', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

- [ ] T001 First (deps: T003)
- [ ] T002 Second (deps: T001)
- [ ] T003 Third (deps: T002)
`
      );

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('CIRCULAR_DEPENDENCY');
      expect(response.error.details.cycles).toBeDefined();
    });

    it('should sort tasks by dependencies', async () => {
      const featureDir = join(testDir, 'specs', '001-feature');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        join(featureDir, 'tasks.md'),
        `# Tasks

- [ ] T001 First
- [ ] T002 Second (deps: T001)
- [ ] T003 Third (deps: T002)
`
      );

      const config = parseConfig();
      const tool = createTasksToIssuesTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: featureDir,
        dry_run: true,
        cwd: testDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.issues[0].groupId).toBe('T001');
      expect(response.issues[1].groupId).toBe('T002');
      expect(response.issues[2].groupId).toBe('T003');
    });
  });
});

// Import utilities for unit testing
import {
  parseTasksContent,
  parseTaskGroups,
  detectTaskFormat,
  filterEligibleTasks,
  updateTasksWithIssueLinks,
} from '../../src/utils/task-parser.js';

import {
  validateDependencies,
  detectCircularDependencies,
  isValidDAG,
} from '../../src/utils/dependency.js';

import {
  groupByTask,
  groupByStory,
  groupByPhase,
  topologicalSort,
} from '../../src/utils/grouping.js';

describe('task-parser', () => {

  describe('parseTasksContent', () => {
    it('should parse basic task lines', () => {
      const content = `# Tasks

- [ ] T001 Create structure
- [x] T002 Add tests
`;

      const tasks = parseTasksContent(content);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('T001');
      expect(tasks[0].completed).toBe(false);
      expect(tasks[0].description).toBe('Create structure');
      expect(tasks[1].id).toBe('T002');
      expect(tasks[1].completed).toBe(true);
    });

    it('should parse parallel marker', () => {
      const content = `- [ ] T001 [P] Parallel task`;

      const tasks = parseTasksContent(content);

      expect(tasks[0].isParallel).toBe(true);
    });

    it('should parse user story reference', () => {
      const content = `- [ ] T001 [US1] Task with story`;

      const tasks = parseTasksContent(content);

      expect(tasks[0].userStory).toBe('US1');
    });

    it('should parse dependencies', () => {
      const content = `- [ ] T001 Task (deps: T002, T003)`;

      const tasks = parseTasksContent(content);

      expect(tasks[0].dependencies).toEqual(['T002', 'T003']);
    });

    it('should parse existing issue link', () => {
      const content = `- [ ] T001 [#123] Task with issue`;

      const tasks = parseTasksContent(content);

      expect(tasks[0].existingIssue).toBe(123);
    });

    it('should parse phase headers', () => {
      const content = `
## Phase 1: Setup

- [ ] T001 Setup task

## Phase 2: Core

- [ ] T002 Core task
`;

      const tasks = parseTasksContent(content);

      expect(tasks[0].phase).toBe('Phase 1: Setup');
      expect(tasks[1].phase).toBe('Phase 2: Core');
    });
  });

  describe('parseTaskGroups', () => {
    it('should parse TG-XXX format', () => {
      const content = `
### TG-001 Setup Module
**Scope**: S

- [ ] Create module
- [x] Add exports
`;

      const groups = parseTaskGroups(content);

      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('TG-001');
      expect(groups[0].title).toBe('Setup Module');
      expect(groups[0].scope).toBe('S');
      expect(groups[0].subtasks).toHaveLength(2);
      expect(groups[0].completed).toBe(false);
    });

    it('should detect completed groups', () => {
      const content = `
### TG-001 Complete Group

- [x] Done task 1
- [x] Done task 2
`;

      const groups = parseTaskGroups(content);

      expect(groups[0].completed).toBe(true);
    });

    it('should parse user story in group header', () => {
      const content = `### TG-001 [US1] Task Group`;

      const groups = parseTaskGroups(content);

      expect(groups[0].userStory).toBe('US1');
    });
  });

  describe('detectTaskFormat', () => {
    it('should detect individual format', () => {
      const content = `- [ ] T001 Task`;

      expect(detectTaskFormat(content)).toBe('individual');
    });

    it('should detect group format', () => {
      const content = `### TG-001 Group`;

      expect(detectTaskFormat(content)).toBe('group');
    });

    it('should return unknown for no tasks', () => {
      const content = `# Just a title`;

      expect(detectTaskFormat(content)).toBe('unknown');
    });
  });

  describe('filterEligibleTasks', () => {
    it('should filter completed tasks', () => {
      const tasks = [
        { id: 'T001', completed: false, isParallel: false, description: '', dependencies: [], lineNumber: 1 },
        { id: 'T002', completed: true, isParallel: false, description: '', dependencies: [], lineNumber: 2 },
      ];

      const eligible = filterEligibleTasks(tasks);

      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('T001');
    });

    it('should filter tasks with existing issues', () => {
      const tasks = [
        { id: 'T001', completed: false, isParallel: false, description: '', dependencies: [], lineNumber: 1 },
        { id: 'T002', completed: false, isParallel: false, description: '', dependencies: [], lineNumber: 2, existingIssue: 123 },
      ];

      const eligible = filterEligibleTasks(tasks);

      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('T001');
    });
  });

  describe('updateTasksWithIssueLinks', () => {
    it('should add issue links to tasks', () => {
      const content = `- [ ] T001 Task description`;
      const links = new Map([
        ['T001', { number: 123, url: 'https://github.com/owner/repo/issues/123' }],
      ]);

      const updated = updateTasksWithIssueLinks(content, links);

      expect(updated).toBe('- [ ] T001 [#123] Task description');
    });

    it('should not duplicate existing links', () => {
      const content = `- [ ] T001 [#123] Task description`;
      const links = new Map([
        ['T001', { number: 123, url: 'https://github.com/owner/repo/issues/123' }],
      ]);

      const updated = updateTasksWithIssueLinks(content, links);

      expect(updated).toBe(content);
    });
  });
});

describe('dependency utilities', () => {
  describe('detectCircularDependencies', () => {
    it('should detect simple cycle', () => {
      const items = [
        { id: 'A', dependencies: ['B'] },
        { id: 'B', dependencies: ['A'] },
      ];

      const cycles = detectCircularDependencies(items);

      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should detect longer cycle', () => {
      const items = [
        { id: 'A', dependencies: ['B'] },
        { id: 'B', dependencies: ['C'] },
        { id: 'C', dependencies: ['A'] },
      ];

      const cycles = detectCircularDependencies(items);

      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should not detect cycle in valid DAG', () => {
      const items = [
        { id: 'A', dependencies: [] },
        { id: 'B', dependencies: ['A'] },
        { id: 'C', dependencies: ['A', 'B'] },
      ];

      const cycles = detectCircularDependencies(items);

      expect(cycles).toHaveLength(0);
    });
  });

  describe('validateDependencies', () => {
    it('should detect missing dependencies', () => {
      const items = [
        { id: 'A', dependencies: ['B'] }, // B doesn't exist
      ];

      const result = validateDependencies(items);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'missing')).toBe(true);
    });

    it('should detect self-reference', () => {
      const items = [
        { id: 'A', dependencies: ['A'] }, // Self-reference
      ];

      const result = validateDependencies(items);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'self-reference')).toBe(true);
    });

    it('should validate clean dependencies', () => {
      const items = [
        { id: 'A', dependencies: [] },
        { id: 'B', dependencies: ['A'] },
      ];

      const result = validateDependencies(items);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('isValidDAG', () => {
    it('should return true for valid DAG', () => {
      const items = [
        { id: 'A', dependencies: [] },
        { id: 'B', dependencies: ['A'] },
      ];

      expect(isValidDAG(items)).toBe(true);
    });

    it('should return false for cyclic graph', () => {
      const items = [
        { id: 'A', dependencies: ['B'] },
        { id: 'B', dependencies: ['A'] },
      ];

      expect(isValidDAG(items)).toBe(false);
    });
  });
});

describe('grouping utilities', () => {
  const sampleTasks = [
    { id: 'T001', completed: false, isParallel: false, description: 'Task 1', dependencies: [], lineNumber: 1, userStory: 'US1', phase: 'Phase 1' },
    { id: 'T002', completed: false, isParallel: false, description: 'Task 2', dependencies: [], lineNumber: 2, userStory: 'US1', phase: 'Phase 1' },
    { id: 'T003', completed: false, isParallel: false, description: 'Task 3', dependencies: [], lineNumber: 3, userStory: 'US2', phase: 'Phase 2' },
  ];

  describe('groupByTask', () => {
    it('should create one group per task', () => {
      const groups = groupByTask(sampleTasks);

      expect(groups).toHaveLength(3);
      expect(groups[0].tasks).toHaveLength(1);
    });
  });

  describe('groupByStory', () => {
    it('should group tasks by user story', () => {
      const groups = groupByStory(sampleTasks);

      expect(groups).toHaveLength(2); // US1 and US2
      const us1Group = groups.find((g) => g.id === 'US1');
      expect(us1Group?.tasks).toHaveLength(2);
    });
  });

  describe('groupByPhase', () => {
    it('should group tasks by phase', () => {
      const groups = groupByPhase(sampleTasks);

      expect(groups).toHaveLength(2); // Phase 1 and Phase 2
      const phase1Group = groups.find((g) => g.id === 'Phase 1');
      expect(phase1Group?.tasks).toHaveLength(2);
    });
  });

  describe('topologicalSort', () => {
    it('should sort groups by dependencies', () => {
      const groups = [
        { id: 'C', groupDependencies: ['B'], tasks: [], title: '', body: '', labels: [], dependencies: [], groupType: 'task' as const },
        { id: 'A', groupDependencies: [], tasks: [], title: '', body: '', labels: [], dependencies: [], groupType: 'task' as const },
        { id: 'B', groupDependencies: ['A'], tasks: [], title: '', body: '', labels: [], dependencies: [], groupType: 'task' as const },
      ];

      const sorted = topologicalSort(groups);

      expect(sorted[0].id).toBe('A');
      expect(sorted[1].id).toBe('B');
      expect(sorted[2].id).toBe('C');
    });
  });
});
