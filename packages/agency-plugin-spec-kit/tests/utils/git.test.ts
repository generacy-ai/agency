/**
 * Tests for git utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { isGitRepo, getCurrentBranch } from '../../src/utils/git.js';

describe('git utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-git-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('isGitRepo', () => {
    it('should return true for directory with .git', async () => {
      await fs.mkdir(join(testDir, '.git'));

      expect(await isGitRepo(testDir)).toBe(true);
    });

    it('should return false for directory without .git', async () => {
      expect(await isGitRepo(testDir)).toBe(false);
    });

    it('should return false for non-existent directory', async () => {
      const fakePath = join(testDir, 'does-not-exist');

      expect(await isGitRepo(fakePath)).toBe(false);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return null for non-git directory', async () => {
      const branch = await getCurrentBranch(testDir);

      expect(branch).toBeNull();
    });

    it('should return null for directory with .git but not a valid git repo', async () => {
      // Create a fake .git directory (not a real git repo)
      await fs.mkdir(join(testDir, '.git'));

      const branch = await getCurrentBranch(testDir);

      // simple-git will fail because it's not a real git repo
      expect(branch).toBeNull();
    });

    // Integration test - only runs if we're in an actual git repo
    it('should return branch name for actual git repo (integration)', async () => {
      // Dynamically find the repo root so this works in any environment (local dev, CI, etc.)
      const workspaceRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();

      const branch = await getCurrentBranch(workspaceRoot);

      // Should return a non-empty string (branch name, or "HEAD" in detached HEAD state)
      expect(typeof branch).toBe('string');
      expect(branch).not.toBe('');
    });
  });
});
