/**
 * Tests for copy_template tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCopyTemplateTool } from '../../src/tools/copy-template.js';
import { parseConfig } from '../../src/config.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('copy_template tool', () => {
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
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-copy-template-test-'));
    mockCoreAPI = createMockCoreAPI();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper to set up a test repo with template files
   */
  async function setupTestRepo(): Promise<string> {
    const repoDir = join(testDir, 'repo');
    await fs.mkdir(repoDir);
    await fs.mkdir(join(repoDir, '.git'));
    await fs.mkdir(join(repoDir, 'specs'));
    await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

    // Create templates directory with all template files
    const templatesDir = join(repoDir, '.specify', 'templates');
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(join(templatesDir, 'spec-template.md'), '# Spec Template\n\n## Overview\n');
    await fs.writeFile(join(templatesDir, 'plan-template.md'), '# Plan Template\n\n## Summary\n');
    await fs.writeFile(join(templatesDir, 'tasks-template.md'), '# Tasks Template\n\n## Phase 1\n');
    await fs.writeFile(join(templatesDir, 'checklist-template.md'), '# Checklist Template\n\n- [ ] Item 1\n');
    await fs.writeFile(join(templatesDir, 'agent-file-template.md'), '# Agent File Template\n\n## Instructions\n');

    return repoDir;
  }

  describe('tool metadata', () => {
    it('should have correct name', () => {
      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      expect(tool.name).toBe('spec_kit.copy_template');
    });

    it('should have correct namespace', () => {
      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have terse output pattern', () => {
      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      expect(tool.outputPattern).toBe('terse');
    });

    it('should support coding mode', () => {
      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      expect(tool.modes).toContain('coding');
    });

    it('should have templates as required parameter', () => {
      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      expect(tool.inputSchema.required).toContain('templates');
    });
  });

  describe('single template copy', () => {
    it('should copy spec template to feature directory', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.copied).toHaveLength(1);
      expect(response.copied[0].template).toBe('spec');
      expect(response.copied[0].destination).toBe(join(featureDir, 'spec.md'));

      // Verify file was created
      const content = await fs.readFile(join(featureDir, 'spec.md'), 'utf-8');
      expect(content).toContain('# Spec Template');
    });

    it('should copy plan template to feature directory', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['plan'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.copied).toHaveLength(1);
      expect(response.copied[0].template).toBe('plan');

      const content = await fs.readFile(join(featureDir, 'plan.md'), 'utf-8');
      expect(content).toContain('# Plan Template');
    });

    it('should copy tasks template to feature directory', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['tasks'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.copied).toHaveLength(1);
      expect(response.copied[0].template).toBe('tasks');

      const content = await fs.readFile(join(featureDir, 'tasks.md'), 'utf-8');
      expect(content).toContain('# Tasks Template');
    });
  });

  describe('checklist template', () => {
    it('should copy checklist to checklists/ subdirectory', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['checklist'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.copied).toHaveLength(1);
      expect(response.copied[0].template).toBe('checklist');
      expect(response.copied[0].destination).toBe(join(featureDir, 'checklists', 'checklist.md'));

      // Verify file was created in checklists subdirectory
      const content = await fs.readFile(join(featureDir, 'checklists', 'checklist.md'), 'utf-8');
      expect(content).toContain('# Checklist Template');
    });

    it('should create checklists directory if it does not exist', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      // Ensure checklists directory does not exist
      try {
        await fs.rmdir(join(featureDir, 'checklists'));
      } catch {
        // Directory doesn't exist, which is fine
      }

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['checklist'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);

      // Verify directory was created
      const stats = await fs.stat(join(featureDir, 'checklists'));
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('agent-file template', () => {
    it('should copy agent-file to repo root', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['agent-file'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.copied).toHaveLength(1);
      expect(response.copied[0].template).toBe('agent-file');
      expect(response.copied[0].destination).toBe(join(repoDir, 'CLAUDE.md'));

      // Verify file was created at repo root
      const content = await fs.readFile(join(repoDir, 'CLAUDE.md'), 'utf-8');
      expect(content).toContain('# Agent File Template');
    });
  });

  describe('multiple templates', () => {
    it('should copy multiple templates in a single call', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec', 'plan', 'tasks'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.copied).toHaveLength(3);

      // Verify all files were created
      const specContent = await fs.readFile(join(featureDir, 'spec.md'), 'utf-8');
      expect(specContent).toContain('# Spec Template');

      const planContent = await fs.readFile(join(featureDir, 'plan.md'), 'utf-8');
      expect(planContent).toContain('# Plan Template');

      const tasksContent = await fs.readFile(join(featureDir, 'tasks.md'), 'utf-8');
      expect(tasksContent).toContain('# Tasks Template');
    });

    it('should handle mixed templates including checklist and agent-file', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec', 'checklist', 'agent-file'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.copied).toHaveLength(3);

      // Verify each file in its correct location
      await fs.access(join(featureDir, 'spec.md'));
      await fs.access(join(featureDir, 'checklists', 'checklist.md'));
      await fs.access(join(repoDir, 'CLAUDE.md'));
    });
  });

  describe('custom dest_filename', () => {
    it('should use custom filename for single template', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['checklist'],
        dest_filename: 'ux-checklist.md',
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.copied[0].destination).toBe(join(featureDir, 'checklists', 'ux-checklist.md'));

      const content = await fs.readFile(join(featureDir, 'checklists', 'ux-checklist.md'), 'utf-8');
      expect(content).toContain('# Checklist Template');
    });

    it('should auto-append .md extension if missing', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec'],
        dest_filename: 'my-spec',
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.copied[0].destination).toBe(join(featureDir, 'my-spec.md'));
    });
  });

  describe('error cases', () => {
    it('should reject dest_filename with multiple templates', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec', 'plan'],
        dest_filename: 'custom.md',
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('dest_filename');
    });

    it('should handle missing template source file', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      // Remove spec template
      await fs.unlink(join(repoDir, '.specify', 'templates', 'spec-template.md'));

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.skipped).toHaveLength(1);
      expect(response.skipped[0].reason).toBe('source_not_found');
    });

    it('should use process.cwd() as default when no feature_dir or cwd provided', async () => {
      // Note: When no feature_dir or cwd is provided, the tool uses process.cwd()
      // This test verifies that behavior by checking the tool runs (though it may
      // fail to find repo root if run outside a git repo, which is expected)
      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec'],
      });

      const response = JSON.parse(result.content[0].text);
      // The result depends on whether we're in a git repo - either success or repo not found error
      // but it should NOT be an invalid parameters error
      if (!response.success) {
        expect(response.error).toContain('repository root');
      }
    });

    it('should skip existing files', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      // Create existing spec.md
      await fs.writeFile(join(featureDir, 'spec.md'), '# Existing Spec');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.skipped).toHaveLength(1);
      expect(response.skipped[0].template).toBe('spec');
      expect(response.skipped[0].reason).toBe('exists');

      // Verify existing content was preserved
      const content = await fs.readFile(join(featureDir, 'spec.md'), 'utf-8');
      expect(content).toBe('# Existing Spec');
    });

    it('should reject invalid template name', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['invalid-template'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('invalid');
    });

    it('should reject empty templates array', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: [],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('directory creation', () => {
    it('should create feature directory if it does not exist', async () => {
      const repoDir = await setupTestRepo();
      const newFeatureDir = join(repoDir, 'specs', '002-new-feature');
      // newFeatureDir does not exist

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec'],
        feature_dir: newFeatureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);

      // Verify directory and file were created
      const stats = await fs.stat(newFeatureDir);
      expect(stats.isDirectory()).toBe(true);
      await fs.access(join(newFeatureDir, 'spec.md'));
    });
  });

  describe('deduplicate templates', () => {
    it('should deduplicate template names', async () => {
      const repoDir = await setupTestRepo();
      const featureDir = join(repoDir, 'specs', '001-my-feature');

      const config = parseConfig();
      const tool = createCopyTemplateTool(config, mockCoreAPI);

      const result = await tool.execute({
        templates: ['spec', 'spec', 'plan'],
        feature_dir: featureDir,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      // Should only copy spec once
      expect(response.copied).toHaveLength(2);
    });
  });
});
