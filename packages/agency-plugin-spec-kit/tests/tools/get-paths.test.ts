/**
 * Tests for get_paths tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGetPathsTool } from '../../src/tools/get-paths.js';
import { parseConfig } from '../../src/config.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('get_paths tool', () => {
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
    // Create a temporary directory for tests
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-getpaths-test-'));
    mockCoreAPI = createMockCoreAPI();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    // Reset env var
    delete process.env['SPECIFY_FEATURE'];
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      expect(tool.name).toBe('spec_kit.get_paths');
    });

    it('should have correct namespace', () => {
      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have terse output pattern', () => {
      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      expect(tool.outputPattern).toBe('terse');
    });

    it('should support coding and research modes', () => {
      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      expect(tool.modes).toContain('coding');
      expect(tool.modes).toContain('research');
    });
  });

  describe('execute with explicit branch parameter', () => {
    it('should return paths for valid branch name', async () => {
      // Create a mock repo with specs directory
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.exists).toBe(true);
      expect(response.branch).toBe('001-my-feature');
      expect(response.featureDir).toBe(join(repoDir, 'specs', '001-my-feature'));
      expect(response.specFile).toBe(
        join(repoDir, 'specs', '001-my-feature', 'spec.md')
      );
    });

    it('should return exists=false when feature directory missing', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      // Note: not creating the feature directory

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '002-missing',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.exists).toBe(false);
      expect(response.branch).toBe('002-missing');
    });

    it('should reject invalid branch name format', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: 'invalid-branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_BRANCH_NAME');
    });
  });

  describe('execute with SPECIFY_FEATURE env var', () => {
    it('should use env var when set', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '003-env-feature'));

      process.env['SPECIFY_FEATURE'] = '003-env-feature';

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({ cwd: repoDir });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.branch).toBe('003-env-feature');
    });

    it('should prioritize explicit branch over env var', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '004-explicit'));

      process.env['SPECIFY_FEATURE'] = '003-env-feature';

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '004-explicit',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.branch).toBe('004-explicit');
    });
  });

  describe('error handling', () => {
    it('should return FEATURE_DIR_NOT_FOUND when repo root not found', async () => {
      // Create a directory with no .git or specs
      const orphanDir = join(testDir, 'orphan');
      await fs.mkdir(orphanDir);

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-test',
        cwd: orphanDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('FEATURE_DIR_NOT_FOUND');
    });

    it('should return INVALID_BRANCH_NAME when no feature can be determined', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      // No branches, no env var, no existing features

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({ cwd: repoDir });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_BRANCH_NAME');
    });
  });

  describe('feature directory fallback', () => {
    it('should find most recent feature directory when no branch specified', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-first'));
      await fs.mkdir(join(repoDir, 'specs', '042-second'));
      await fs.mkdir(join(repoDir, 'specs', '010-third'));

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({ cwd: repoDir });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      // Should pick highest number (042-second when sorted reverse)
      expect(response.branch).toBe('042-second');
    });
  });

  describe('path structure', () => {
    it('should include all expected paths in response', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-test',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('repoRoot');
      expect(response).toHaveProperty('branch');
      expect(response).toHaveProperty('hasGit');
      expect(response).toHaveProperty('featureDir');
      expect(response).toHaveProperty('specFile');
      expect(response).toHaveProperty('planFile');
      expect(response).toHaveProperty('tasksFile');
      expect(response).toHaveProperty('researchFile');
      expect(response).toHaveProperty('dataModelFile');
      expect(response).toHaveProperty('quickstartFile');
      expect(response).toHaveProperty('contractsDir');
      expect(response).toHaveProperty('checklistsDir');
      expect(response).toHaveProperty('clarificationsFile');
    });

    it('should use default file names', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));

      const config = parseConfig();
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-test',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      const featureDir = join(repoDir, 'specs', '001-test');

      expect(response.specFile).toBe(join(featureDir, 'spec.md'));
      expect(response.planFile).toBe(join(featureDir, 'plan.md'));
      expect(response.tasksFile).toBe(join(featureDir, 'tasks.md'));
      expect(response.researchFile).toBe(join(featureDir, 'research.md'));
      expect(response.dataModelFile).toBe(join(featureDir, 'data-model.md'));
      expect(response.quickstartFile).toBe(join(featureDir, 'quickstart.md'));
      expect(response.clarificationsFile).toBe(
        join(featureDir, 'clarifications.md')
      );
      expect(response.contractsDir).toBe(join(featureDir, 'contracts'));
      expect(response.checklistsDir).toBe(join(featureDir, 'checklists'));
    });
  });

  describe('config integration', () => {
    it('should use custom specs directory from config', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'features'));
      await fs.mkdir(join(repoDir, 'features', '001-test'));

      const config = parseConfig({ paths: { specs: 'features' } });
      const tool = createGetPathsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-test',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.featureDir).toBe(join(repoDir, 'features', '001-test'));
    });
  });
});
