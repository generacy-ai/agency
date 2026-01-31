/**
 * Tests for check_prereqs tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCheckPrereqsTool } from '../../src/tools/check-prereqs.js';
import { parseConfig } from '../../src/config.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('check_prereqs tool', () => {
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
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-prereqs-test-'));
    mockCoreAPI = createMockCoreAPI();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env['SPECIFY_FEATURE'];
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      expect(tool.name).toBe('spec_kit.check_prereqs');
    });

    it('should have correct namespace', () => {
      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have terse output pattern', () => {
      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      expect(tool.outputPattern).toBe('terse');
    });

    it('should support coding and research modes', () => {
      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      expect(tool.modes).toContain('coding');
      expect(tool.modes).toContain('research');
    });
  });

  describe('valid prerequisites - all required files exist', () => {
    it('should return valid=true when spec.md exists (default requirement)', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.featureDir).toBe(join(repoDir, 'specs', '001-my-feature'));
    });

    it('should return valid=true when all required files exist', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'plan.md'), '# Plan');
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'tasks.md'), '# Tasks');

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
        require_spec: true,
        require_plan: true,
        require_tasks: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
    });

    it('should not require spec.md when require_spec is false', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      // No spec.md file created

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
        require_spec: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
    });
  });

  describe('missing required files', () => {
    it('should return valid=false when spec.md is missing and required', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      // No spec.md file

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
        require_spec: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.missingRequired).toContain('spec.md');
    });

    it('should return valid=false when plan.md is missing and required', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      // No plan.md file

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
        require_plan: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.missingRequired).toContain('plan.md');
    });

    it('should return valid=false when tasks.md is missing and required', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      // No tasks.md file

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
        require_tasks: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.missingRequired).toContain('tasks.md');
    });

    it('should list all missing required files', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      // No files created

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
        require_spec: true,
        require_plan: true,
        require_tasks: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.missingRequired).toContain('spec.md');
      expect(response.missingRequired).toContain('plan.md');
      expect(response.missingRequired).toContain('tasks.md');
    });
  });

  describe('available docs detection', () => {
    it('should detect research.md when present', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'research.md'), '# Research');

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.availableDocs).toContain('research.md');
    });

    it('should detect data-model.md when present', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'data-model.md'), '# Data Model');

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.availableDocs).toContain('data-model.md');
    });

    it('should detect quickstart.md when present', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'quickstart.md'), '# Quickstart');

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.availableDocs).toContain('quickstart.md');
    });

    it('should detect contracts directory when it has files', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature', 'contracts'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'contracts', 'api.md'), '# API');

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.availableDocs).toContain('contracts/');
    });

    it('should detect checklists directory when it has files', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature', 'checklists'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'checklists', 'ux.md'), '# UX');

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.availableDocs).toContain('checklists/');
    });

    it('should not include empty contracts directory', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature', 'contracts'));
      // No files in contracts

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.availableDocs).not.toContain('contracts/');
    });
  });

  describe('edge cases', () => {
    it('should return error when feature directory not found', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      // Feature directory doesn't exist

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should return error when repo root not found', async () => {
      const orphanDir = join(testDir, 'orphan');
      await fs.mkdir(orphanDir);
      // No .git directory

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: orphanDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.error).toContain('repository root');
    });

    it('should return error for invalid branch name', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: 'invalid-branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(false);
      expect(response.error).toContain('pattern');
    });

    it('should include tasks.md in availableDocs when include_tasks is true', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'tasks.md'), '# Tasks');

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
        include_tasks: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.availableDocs).toContain('tasks.md');
    });

    it('should not include tasks.md when include_tasks is false', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'spec.md'), '# Spec');
      await fs.writeFile(join(repoDir, 'specs', '001-my-feature', 'tasks.md'), '# Tasks');

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({
        branch: '001-my-feature',
        cwd: repoDir,
        include_tasks: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.availableDocs).not.toContain('tasks.md');
    });

    it('should use SPECIFY_FEATURE env var when branch not specified', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '002-env-feature'));
      await fs.writeFile(join(repoDir, 'specs', '002-env-feature', 'spec.md'), '# Spec');

      process.env['SPECIFY_FEATURE'] = '002-env-feature';

      const config = parseConfig();
      const tool = createCheckPrereqsTool(config, mockCoreAPI);

      const result = await tool.execute({ cwd: repoDir });

      const response = JSON.parse(result.content[0].text);
      expect(response.valid).toBe(true);
      expect(response.featureDir).toContain('002-env-feature');
    });
  });
});
