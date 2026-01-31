/**
 * Tests for create_feature tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createCreateFeatureTool } from '../../src/tools/create-feature.js';
import { parseConfig } from '../../src/config.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('create_feature tool', () => {
  let testDir: string;
  let repoDir: string;
  let specsDir: string;
  let templatesDir: string;
  let mockCore: AgencyCoreAPI;

  const defaultConfig = parseConfig({
    paths: {
      specs: 'specs',
      templates: '.specify/templates',
    },
  });

  const initGitRepo = (dir: string): void => {
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });
    // Create initial commit
    execSync('git commit --allow-empty -m "Initial commit"', { cwd: dir, stdio: 'pipe' });
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-createfeature-test-'));
    repoDir = join(testDir, 'repo');
    await fs.mkdir(repoDir);
    initGitRepo(repoDir);

    // Create specs directory
    specsDir = join(repoDir, 'specs');
    await fs.mkdir(specsDir);

    // Create templates directory and template file
    templatesDir = join(repoDir, '.specify', 'templates');
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.writeFile(
      join(templatesDir, 'spec-template.md'),
      `# Feature Specification: {feature_name}

**Branch**: \`{branch_name}\` | **Date**: {date} | **Status**: {status}

## Summary

[Description here]
`
    );

    // Mock core API
    mockCore = {} as AgencyCoreAPI;
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
      const tool = createCreateFeatureTool(defaultConfig, mockCore);
      expect(tool.name).toBe('spec_kit.create_feature');
    });

    it('should have correct namespace', () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);
      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have terse output pattern', () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);
      expect(tool.outputPattern).toBe('terse');
    });

    it('should support coding mode', () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);
      expect(tool.modes).toContain('coding');
    });

    it('should have correct input schema', () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);
      expect(tool.inputSchema.properties).toHaveProperty('description');
      expect(tool.inputSchema.properties).toHaveProperty('number');
      expect(tool.inputSchema.properties).toHaveProperty('short_name');
      expect(tool.inputSchema.properties).toHaveProperty('parent_epic_branch');
      expect(tool.inputSchema.properties).toHaveProperty('cwd');
      expect(tool.inputSchema.required).toContain('description');
    });
  });

  describe('happy path - create feature with description only', () => {
    it('should create feature with auto-generated number and short name', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'Add user authentication',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.feature_number).toBe('1');
      expect(response.branch).toBe('1-add-user-authentication');
      expect(response.feature_dir).toContain('specs/1-add-user-authentication');
      expect(response.spec_file).toContain('spec.md');
      expect(response.branch_created).toBe(true);

      // Verify branch was created
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoDir,
        encoding: 'utf-8',
      }).trim();
      expect(currentBranch).toBe('1-add-user-authentication');

      // Verify directory structure
      const featureDir = join(specsDir, '1-add-user-authentication');
      expect(await fs.stat(featureDir)).toBeTruthy();
      expect(await fs.stat(join(featureDir, 'checklists'))).toBeTruthy();
      expect(await fs.stat(join(featureDir, 'contracts'))).toBeTruthy();

      // Verify spec.md was created
      const specContent = await fs.readFile(join(featureDir, 'spec.md'), 'utf-8');
      expect(specContent).toContain('Feature Specification:');
      expect(specContent).toContain('1-add-user-authentication');
    });
  });

  describe('explicit feature number parameter', () => {
    it('should use provided feature number', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'Add user authentication',
        number: 42,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.feature_number).toBe('42');
      expect(response.branch).toBe('42-add-user-authentication');
    });

    it('should fail for number out of range', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'Add user authentication',
        number: 1000,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_FEATURE_NUMBER');
    });

    it('should fail for zero', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'Add user authentication',
        number: 0,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_FEATURE_NUMBER');
    });
  });

  describe('explicit short name parameter', () => {
    it('should use provided short name', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'Add user authentication',
        short_name: 'auth-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.branch).toBe('1-auth-feature');
    });

    it('should fail for invalid short name with spaces', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'Add user authentication',
        short_name: 'invalid name',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_BRANCH_NAME');
    });

    it('should fail for invalid short name with uppercase', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'Add user authentication',
        short_name: 'InvalidName',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_BRANCH_NAME');
    });
  });

  describe('number collision handling', () => {
    it('should fail when feature number already exists as branch', async () => {
      // Create existing branch
      execSync('git checkout -b 42-existing-feature', { cwd: repoDir, stdio: 'pipe' });
      execSync('git checkout master || git checkout main', { cwd: repoDir, stdio: 'pipe' });

      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'New feature',
        number: 42,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('BRANCH_EXISTS');
    });

    it('should fail when feature number already exists as directory', async () => {
      // Create existing directory
      await fs.mkdir(join(specsDir, '42-existing-feature'));

      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'New feature',
        number: 42,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('BRANCH_EXISTS');
    });

    it('should auto-generate next available number when existing features exist', async () => {
      // Create existing branch
      execSync('git checkout -b 5-existing-feature', { cwd: repoDir, stdio: 'pipe' });
      execSync('git checkout master || git checkout main', { cwd: repoDir, stdio: 'pipe' });

      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'New feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.feature_number).toBe('6');
    });
  });

  describe('not in git repo error case', () => {
    it('should fail when not in a git repository', async () => {
      const nonGitDir = join(testDir, 'not-a-repo');
      await fs.mkdir(nonGitDir);

      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'New feature',
        cwd: nonGitDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('GIT_NOT_INITIALIZED');
    });
  });

  describe('invalid description', () => {
    it('should fail for empty description', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: '',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_CONFIG');
    });

    it('should fail for whitespace-only description', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: '   ',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_CONFIG');
    });

    it('should fail for description exceeding max length', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'a'.repeat(1001),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_CONFIG');
    });
  });

  describe('short name generation', () => {
    it('should generate short name by filtering stop words', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'Add the user authentication for the admin users',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      // Should filter out "the", "for", "the" and keep meaningful words
      expect(response.branch).toMatch(/^1-add-user-authentication/);
    });

    it('should limit short name to max words', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'Add very long feature name with many extra words that exceed limit',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      // Should be limited to 4 words by default
      const shortName = response.branch.replace(/^\d+-/, '');
      const wordCount = shortName.split('-').length;
      expect(wordCount).toBeLessThanOrEqual(4);
    });
  });

  describe('template substitution', () => {
    it('should substitute template variables in spec.md', async () => {
      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'My test feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);

      const specContent = await fs.readFile(response.spec_file, 'utf-8');
      expect(specContent).toContain('My test feature');
      expect(specContent).toContain(response.branch);
      expect(specContent).toMatch(/\d{4}-\d{2}-\d{2}/); // Date format
      expect(specContent).toContain('Draft');
    });

    it('should create basic spec when template is missing', async () => {
      // Remove template
      await fs.rm(templatesDir, { recursive: true, force: true });

      const tool = createCreateFeatureTool(defaultConfig, mockCore);

      const result = await tool.execute({
        description: 'My test feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);

      const specContent = await fs.readFile(response.spec_file, 'utf-8');
      expect(specContent).toContain('Feature Specification:');
      expect(specContent).toContain('My test feature');
    });
  });
});
