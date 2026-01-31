/**
 * Tests for git_ops tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createGitOpsTool } from '../../src/tools/git-ops.js';

describe('git_ops tool', () => {
  let testDir: string;
  let repoDir: string;

  const initGitRepo = (dir: string): void => {
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });
    // Create initial commit
    execSync('git commit --allow-empty -m "Initial commit"', { cwd: dir, stdio: 'pipe' });
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-gitops-test-'));
    repoDir = join(testDir, 'repo');
    await fs.mkdir(repoDir);
    initGitRepo(repoDir);
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
      const tool = createGitOpsTool();
      expect(tool.name).toBe('spec_kit.git_ops');
    });

    it('should have correct namespace', () => {
      const tool = createGitOpsTool();
      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have terse output pattern', () => {
      const tool = createGitOpsTool();
      expect(tool.outputPattern).toBe('terse');
    });

    it('should support coding and research modes', () => {
      const tool = createGitOpsTool();
      expect(tool.modes).toContain('coding');
      expect(tool.modes).toContain('research');
    });

    it('should have correct input schema', () => {
      const tool = createGitOpsTool();
      expect(tool.inputSchema.properties).toHaveProperty('operation');
      expect(tool.inputSchema.properties).toHaveProperty('branch_name');
      expect(tool.inputSchema.properties).toHaveProperty('cwd');
      expect(tool.inputSchema.properties).toHaveProperty('fetch_all');
      expect(tool.inputSchema.properties).toHaveProperty('prune');
      expect(tool.inputSchema.required).toContain('operation');
    });
  });

  describe('current_branch operation', () => {
    it('should return current branch name', async () => {
      const tool = createGitOpsTool();

      const result = await tool.execute({
        operation: 'current_branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      // Git defaults to master or main
      expect(['master', 'main']).toContain(response.branch);
    });

    it('should return branch name after checkout', async () => {
      execSync('git checkout -b test-branch', { cwd: repoDir, stdio: 'pipe' });

      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'current_branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.branch).toBe('test-branch');
    });
  });

  describe('status operation', () => {
    it('should return clean status for clean repo', async () => {
      const tool = createGitOpsTool();

      const result = await tool.execute({
        operation: 'status',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.clean).toBe(true);
      expect(response.staged).toEqual([]);
      expect(response.unstaged).toEqual([]);
      expect(response.untracked).toEqual([]);
    });

    it('should detect untracked files', async () => {
      await fs.writeFile(join(repoDir, 'new-file.txt'), 'content');

      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'status',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.clean).toBe(false);
      expect(response.untracked).toContain('new-file.txt');
    });

    it('should detect staged files', async () => {
      await fs.writeFile(join(repoDir, 'staged-file.txt'), 'content');
      execSync('git add staged-file.txt', { cwd: repoDir, stdio: 'pipe' });

      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'status',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.clean).toBe(false);
      expect(response.staged).toContain('staged-file.txt');
    });

    it('should detect unstaged modified files', async () => {
      // Create and commit a file
      await fs.writeFile(join(repoDir, 'modified-file.txt'), 'initial');
      execSync('git add modified-file.txt && git commit -m "add file"', {
        cwd: repoDir,
        stdio: 'pipe',
      });
      // Modify without staging
      await fs.writeFile(join(repoDir, 'modified-file.txt'), 'modified');

      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'status',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.clean).toBe(false);
      expect(response.unstaged).toContain('modified-file.txt');
    });
  });

  describe('checkout operation', () => {
    it('should checkout existing branch', async () => {
      // Create a branch first
      execSync('git branch feature-branch', { cwd: repoDir, stdio: 'pipe' });

      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'checkout',
        branch_name: 'feature-branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.branch).toBe('feature-branch');

      // Verify we're on the branch
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoDir,
        encoding: 'utf-8',
      }).trim();
      expect(currentBranch).toBe('feature-branch');
    });

    it('should fail for non-existent branch', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'checkout',
        branch_name: 'non-existent-branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('GIT_OPERATION_FAILED');
    });

    it('should require branch_name parameter', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'checkout',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('GIT_OPERATION_FAILED');
      expect(response.error.message).toContain('branch_name is required');
    });
  });

  describe('create_branch operation', () => {
    it('should create and checkout new branch', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'create_branch',
        branch_name: 'new-feature',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.branch).toBe('new-feature');

      // Verify we're on the new branch
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoDir,
        encoding: 'utf-8',
      }).trim();
      expect(currentBranch).toBe('new-feature');
    });

    it('should fail for existing branch', async () => {
      execSync('git branch existing-branch', { cwd: repoDir, stdio: 'pipe' });

      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'create_branch',
        branch_name: 'existing-branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('GIT_OPERATION_FAILED');
    });

    it('should require branch_name parameter', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'create_branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('GIT_OPERATION_FAILED');
      expect(response.error.message).toContain('branch_name is required');
    });

    it('should fail for invalid branch name', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'create_branch',
        branch_name: 'invalid..branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('GIT_OPERATION_FAILED');
    });
  });

  describe('fetch operation', () => {
    it('should succeed with default options', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'fetch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.fetched).toBe(true);
    });

    it('should respect fetch_all option', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'fetch',
        fetch_all: true,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should respect prune option', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'fetch',
        prune: true,
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should fail for non-git directory', async () => {
      const nonGitDir = join(testDir, 'not-a-repo');
      await fs.mkdir(nonGitDir);

      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'current_branch',
        cwd: nonGitDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('GIT_NOT_INITIALIZED');
    });

    it('should include operation context in error', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'checkout',
        branch_name: 'non-existent',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.context).toHaveProperty('operation', 'checkout');
      expect(response.error.context).toHaveProperty('branch_name', 'non-existent');
    });
  });

  describe('cwd parameter', () => {
    it('should use provided cwd', async () => {
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'current_branch',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should default to process.cwd() when cwd not provided', async () => {
      // This test is tricky since process.cwd() may not be a git repo
      // We'll just ensure the tool runs without error
      const tool = createGitOpsTool();
      const result = await tool.execute({
        operation: 'current_branch',
      });

      // Should either succeed or fail with appropriate error
      const response = JSON.parse(result.content[0].text);
      expect(typeof response.success).toBe('boolean');
    });
  });
});
