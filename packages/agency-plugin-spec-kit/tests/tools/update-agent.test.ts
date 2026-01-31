/**
 * Tests for update_agent tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createUpdateAgentTool } from '../../src/tools/update-agent.js';
import { extractTechnologies, updateAgentContent } from '../../src/tools/update-agent.js';
import { parseConfig } from '../../src/config.js';
import { AGENT_CONFIGS, AGENT_TYPES } from '../../src/types/agent.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('update_agent tool', () => {
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
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-updateagent-test-'));
    mockCoreAPI = createMockCoreAPI();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // Tool Metadata Tests
  // ============================================================================

  describe('tool metadata', () => {
    it('should have correct name', () => {
      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      expect(tool.name).toBe('spec_kit.update_agent');
    });

    it('should have correct namespace', () => {
      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have terse output pattern', () => {
      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      expect(tool.outputPattern).toBe('terse');
    });

    it('should support coding mode', () => {
      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      expect(tool.modes).toContain('coding');
    });

    it('should have input schema with all properties', () => {
      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      expect(tool.inputSchema.properties).toHaveProperty('agent_type');
      expect(tool.inputSchema.properties).toHaveProperty('create_if_missing');
      expect(tool.inputSchema.properties).toHaveProperty('feature_dir');
      expect(tool.inputSchema.properties).toHaveProperty('cwd');
    });
  });

  // ============================================================================
  // Technology Extraction Tests (T013)
  // ============================================================================

  describe('extractTechnologies', () => {
    it('should extract language/version from plan.md', () => {
      const planContent = `
# Implementation Plan

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Node.js fs/promises
`;

      const data = extractTechnologies(planContent);

      expect(data.language).toBe('TypeScript 5.x');
    });

    it('should extract primary dependencies', () => {
      const planContent = `
**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Node.js fs/promises, path
`;

      const data = extractTechnologies(planContent);

      expect(data.dependencies).toBe('Node.js fs/promises, path');
    });

    it('should extract storage information', () => {
      const planContent = `
**Storage**: PostgreSQL 15, Redis
`;

      const data = extractTechnologies(planContent);

      expect(data.storage).toBe('PostgreSQL 15, Redis');
    });

    it('should extract testing framework', () => {
      const planContent = `
**Testing**: Vitest
`;

      const data = extractTechnologies(planContent);

      expect(data.testing).toBe('Vitest');
    });

    it('should extract project type', () => {
      const planContent = `
**Project Type**: MCP Tool Plugin
`;

      const data = extractTechnologies(planContent);

      expect(data.projectType).toBe('MCP Tool Plugin');
    });

    it('should handle missing fields gracefully', () => {
      const planContent = `
# Just a heading with no tech info
`;

      const data = extractTechnologies(planContent);

      expect(data.language).toBeUndefined();
      expect(data.dependencies).toBeUndefined();
      expect(data.storage).toBeUndefined();
      expect(data.testing).toBeUndefined();
      expect(data.projectType).toBeUndefined();
    });

    it('should extract all fields from complete plan', () => {
      const planContent = `
# Implementation Plan

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Node.js fs/promises, path
**Storage**: SQLite
**Testing**: Vitest
**Project Type**: CLI Application
`;

      const data = extractTechnologies(planContent);

      expect(data.language).toBe('TypeScript 5.x');
      expect(data.dependencies).toBe('Node.js fs/promises, path');
      expect(data.storage).toBe('SQLite');
      expect(data.testing).toBe('Vitest');
      expect(data.projectType).toBe('CLI Application');
    });
  });

  // ============================================================================
  // Content Update with Markers Tests (T014)
  // ============================================================================

  describe('updateAgentContent with markers', () => {
    it('should update content between TECHNOLOGIES markers', () => {
      const existingContent = `
# Agent Guidelines

## Active Technologies

<!-- TECHNOLOGIES START -->
- Old content
<!-- TECHNOLOGIES END -->

## Recent Changes

<!-- CHANGES START -->
- Old changes
<!-- CHANGES END -->
`;

      const data = {
        language: 'TypeScript 5.x',
        dependencies: 'Node.js',
      };

      const updated = updateAgentContent(existingContent, data, 'specs/001-test');

      expect(updated).toContain('- **Language**: TypeScript 5.x');
      expect(updated).toContain('- **Dependencies**: Node.js');
      expect(updated).not.toContain('- Old content');
    });

    it('should preserve markers after update', () => {
      const existingContent = `
<!-- TECHNOLOGIES START -->
old
<!-- TECHNOLOGIES END -->
`;

      const data = { language: 'Python' };
      const updated = updateAgentContent(existingContent, data, 'specs/002-test');

      expect(updated).toContain('<!-- TECHNOLOGIES START -->');
      expect(updated).toContain('<!-- TECHNOLOGIES END -->');
    });

    it('should update changes section with new entry', () => {
      const existingContent = `
<!-- CHANGES START -->
- 2024-01-01: Old change
<!-- CHANGES END -->
`;

      const data = { language: 'TypeScript' };
      const updated = updateAgentContent(existingContent, data, 'specs/003-feature');

      expect(updated).toContain('Updated from 003-feature');
      expect(updated).toContain('- 2024-01-01: Old change');
    });

    it('should limit changes to 3 entries', () => {
      const existingContent = `
<!-- CHANGES START -->
- 2024-01-03: Change 3
- 2024-01-02: Change 2
- 2024-01-01: Change 1
<!-- CHANGES END -->
`;

      const data = { language: 'TypeScript' };
      const updated = updateAgentContent(existingContent, data, 'specs/004-new');

      // Should have new entry plus 2 old ones (3 total)
      const changesSection = updated.match(/<!-- CHANGES START -->([\s\S]*?)<!-- CHANGES END -->/)?.[1];
      const lines = changesSection?.split('\n').filter(line => line.trim().startsWith('-')) || [];

      expect(lines.length).toBe(3);
      expect(updated).toContain('Updated from 004-new');
      expect(updated).toContain('Change 3');
      expect(updated).toContain('Change 2');
      expect(updated).not.toContain('Change 1');
    });
  });

  // ============================================================================
  // Content Update without Markers Tests (T015)
  // ============================================================================

  describe('updateAgentContent without markers (header fallback)', () => {
    it('should insert after Active Technologies header', () => {
      const existingContent = `
# Agent Guidelines

## Active Technologies

Some existing content here.

## Other Section
`;

      const data = { language: 'Go 1.21' };
      const updated = updateAgentContent(existingContent, data, 'specs/005-test');

      expect(updated).toContain('<!-- TECHNOLOGIES START -->');
      expect(updated).toContain('- **Language**: Go 1.21');
      expect(updated).toContain('<!-- TECHNOLOGIES END -->');
    });

    it('should insert after Recent Changes header', () => {
      const existingContent = `
## Recent Changes

Some old changes.

## Footer
`;

      const data = { language: 'Rust' };
      const updated = updateAgentContent(existingContent, data, 'specs/006-test');

      expect(updated).toContain('<!-- CHANGES START -->');
      expect(updated).toContain('Updated from 006-test');
      expect(updated).toContain('<!-- CHANGES END -->');
    });

    it('should leave content unchanged if no headers or markers', () => {
      const existingContent = `
# Some Document

Just some text without the expected sections.
`;

      const data = { language: 'TypeScript' };
      const updated = updateAgentContent(existingContent, data, 'specs/007-test');

      // Content should remain mostly unchanged since no insertion points
      expect(updated).toBe(existingContent);
    });
  });

  // ============================================================================
  // File Creation from Template Tests (T016)
  // ============================================================================

  describe('file creation from template', () => {
    it('should create agent file from template when create_if_missing is true', async () => {
      // Setup repo with template but no agent file
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, '.specify', 'templates'), { recursive: true });
      await fs.mkdir(join(repoDir, 'specs', '001-test'), { recursive: true });

      // Create template
      const templateContent = `
# Agent Template

## Active Technologies

<!-- TECHNOLOGIES START -->
<!-- TECHNOLOGIES END -->

## Recent Changes

<!-- CHANGES START -->
<!-- CHANGES END -->
`;
      await fs.writeFile(
        join(repoDir, '.specify', 'templates', 'agent-file-template.md'),
        templateContent
      );

      // Create plan.md
      await fs.writeFile(
        join(repoDir, 'specs', '001-test', 'plan.md'),
        '**Language/Version**: TypeScript 5.x\n**Testing**: Vitest'
      );

      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      const result = await tool.execute({
        agent_type: 'claude',
        create_if_missing: true,
        feature_dir: join(repoDir, 'specs', '001-test'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.updated).toHaveLength(1);
      expect(response.updated[0].agent).toBe('claude');
      expect(response.updated[0].created).toBe(true);

      // Verify file was created
      const createdContent = await fs.readFile(join(repoDir, 'CLAUDE.md'), 'utf-8');
      expect(createdContent).toContain('TypeScript 5.x');
    });
  });

  // ============================================================================
  // File Creation without Template Tests (T017)
  // ============================================================================

  describe('file creation without template', () => {
    it('should generate minimal content when no template exists', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, '.specify', 'templates'), { recursive: true });
      await fs.mkdir(join(repoDir, 'specs', '001-test'), { recursive: true });

      // No template file - just the directory

      // Create plan.md
      await fs.writeFile(
        join(repoDir, 'specs', '001-test', 'plan.md'),
        '**Language/Version**: Python 3.11\n**Project Type**: Web API'
      );

      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      const result = await tool.execute({
        agent_type: 'claude',
        create_if_missing: true,
        feature_dir: join(repoDir, 'specs', '001-test'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.updated[0].created).toBe(true);

      // Verify minimal content was generated
      const createdContent = await fs.readFile(join(repoDir, 'CLAUDE.md'), 'utf-8');
      expect(createdContent).toContain('# Claude Code Development Guidelines');
      expect(createdContent).toContain('<!-- TECHNOLOGIES START -->');
      expect(createdContent).toContain('- **Language**: Python 3.11');
      expect(createdContent).toContain('- **Project Type**: Web API');
      expect(createdContent).toContain('<!-- MANUAL ADDITIONS START -->');
    });
  });

  // ============================================================================
  // Integration Tests (T018)
  // ============================================================================

  describe('full tool execution', () => {
    it('should update existing agent file with plan data', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, '.specify', 'templates'), { recursive: true });
      await fs.mkdir(join(repoDir, 'specs', '042-feature'), { recursive: true });

      // Create existing CLAUDE.md
      const existingContent = `
# Claude Code Guidelines

## Active Technologies

<!-- TECHNOLOGIES START -->
- **Language**: Old Language
<!-- TECHNOLOGIES END -->

## Recent Changes

<!-- CHANGES START -->
- 2024-01-01: Initial setup
<!-- CHANGES END -->
`;
      await fs.writeFile(join(repoDir, 'CLAUDE.md'), existingContent);

      // Create plan.md
      await fs.writeFile(
        join(repoDir, 'specs', '042-feature', 'plan.md'),
        `
# Implementation Plan

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: React 18, Next.js 14
**Testing**: Vitest
**Project Type**: Web Application
`
      );

      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      const result = await tool.execute({
        agent_type: 'claude',
        feature_dir: join(repoDir, 'specs', '042-feature'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.updated).toHaveLength(1);
      expect(response.updated[0].agent).toBe('claude');
      expect(response.updated[0].created).toBe(false);

      // Verify content was updated
      const updatedContent = await fs.readFile(join(repoDir, 'CLAUDE.md'), 'utf-8');
      expect(updatedContent).toContain('TypeScript 5.x');
      expect(updatedContent).toContain('React 18, Next.js 14');
      expect(updatedContent).not.toContain('Old Language');

      // Verify plan_data is returned
      expect(response.plan_data.language).toBe('TypeScript 5.x');
      expect(response.plan_data.dependencies).toBe('React 18, Next.js 14');
    });

    it('should update all existing agent files when no agent_type specified', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, '.specify', 'templates'), { recursive: true });
      await fs.mkdir(join(repoDir, 'specs', '001-test'), { recursive: true });

      // Create multiple agent files
      const agentContent = `
## Active Technologies

<!-- TECHNOLOGIES START -->
old
<!-- TECHNOLOGIES END -->
`;
      await fs.writeFile(join(repoDir, 'CLAUDE.md'), agentContent);
      await fs.writeFile(join(repoDir, 'GEMINI.md'), agentContent);

      // Create plan.md
      await fs.writeFile(
        join(repoDir, 'specs', '001-test', 'plan.md'),
        '**Language/Version**: Go 1.21'
      );

      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      const result = await tool.execute({
        feature_dir: join(repoDir, 'specs', '001-test'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.updated).toHaveLength(2);
      expect(response.updated.map((u: { agent: string }) => u.agent).sort()).toEqual(['claude', 'gemini']);
    });
  });

  // ============================================================================
  // Error Case Tests (T019)
  // ============================================================================

  describe('error handling', () => {
    it('should return error when feature_dir not provided', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));

      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      const result = await tool.execute({
        agent_type: 'claude',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.errors).toHaveLength(1);
      expect(response.errors[0].error.code).toBe('FEATURE_DIR_NOT_FOUND');
    });

    it('should return error when plan.md not found', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs', '001-test'), { recursive: true });
      // No plan.md created

      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      const result = await tool.execute({
        agent_type: 'claude',
        feature_dir: join(repoDir, 'specs', '001-test'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.errors).toHaveLength(1);
      expect(response.errors[0].error.code).toBe('PLAN_NOT_FOUND');
    });

    it('should return error when agent file not found and create_if_missing is false', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, '.specify', 'templates'), { recursive: true });
      await fs.mkdir(join(repoDir, 'specs', '001-test'), { recursive: true });

      // Create plan.md but no agent file
      await fs.writeFile(
        join(repoDir, 'specs', '001-test', 'plan.md'),
        '**Language/Version**: TypeScript'
      );

      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      const result = await tool.execute({
        agent_type: 'claude',
        create_if_missing: false,
        feature_dir: join(repoDir, 'specs', '001-test'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.errors).toHaveLength(1);
      expect(response.errors[0].error.code).toBe('AGENT_FILE_NOT_FOUND');
      expect(response.skipped).toContain('claude');
    });

    it('should return error when repo root not found', async () => {
      // Create a directory without .git
      const orphanDir = join(testDir, 'orphan');
      await fs.mkdir(orphanDir);

      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      const result = await tool.execute({
        agent_type: 'claude',
        feature_dir: join(orphanDir, 'specs', '001-test'),
        cwd: orphanDir,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.errors).toHaveLength(1);
      expect(response.errors[0].error.code).toBe('FEATURE_DIR_NOT_FOUND');
    });

    it('should return error for invalid agent_type', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs', '001-test'), { recursive: true });
      await fs.writeFile(
        join(repoDir, 'specs', '001-test', 'plan.md'),
        '**Language/Version**: TypeScript'
      );

      const config = parseConfig();
      const tool = createUpdateAgentTool(config, mockCoreAPI);

      const result = await tool.execute({
        agent_type: 'invalid-agent' as any,
        feature_dir: join(repoDir, 'specs', '001-test'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.errors).toHaveLength(1);
      expect(response.errors[0].error.code).toBe('INVALID_CONFIG');
    });
  });

  // ============================================================================
  // Agent Types Coverage
  // ============================================================================

  describe('agent type configurations', () => {
    it('should have configs for all 17 agent types', () => {
      expect(AGENT_TYPES).toHaveLength(17);

      for (const agentType of AGENT_TYPES) {
        expect(AGENT_CONFIGS[agentType]).toBeDefined();
        expect(AGENT_CONFIGS[agentType].type).toBe(agentType);
        expect(AGENT_CONFIGS[agentType].filePath).toBeTruthy();
        expect(AGENT_CONFIGS[agentType].displayName).toBeTruthy();
      }
    });

    it('should have correct file paths for known agents', () => {
      expect(AGENT_CONFIGS.claude.filePath).toBe('CLAUDE.md');
      expect(AGENT_CONFIGS.copilot.filePath).toBe('.github/copilot-instructions.md');
      expect(AGENT_CONFIGS['cursor-agent'].filePath).toBe('.cursor/rules/agent.mdc');
      expect(AGENT_CONFIGS.windsurf.filePath).toBe('.windsurfrules');
    });
  });
});
