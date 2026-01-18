/**
 * Tests for exec-git utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execGit, execGitOrThrow, isGitAvailable, isGitRepository } from '../src/utils/exec-git.js';
import { GitError, AuthError, NetworkError, ConflictError } from '../src/errors/index.js';
import { createMockRepo, type MockRepo } from './utils/mock-git.js';

describe('exec-git', () => {
  let repo: MockRepo;

  beforeEach(async () => {
    repo = await createMockRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('execGit', () => {
    it('should execute git commands successfully', async () => {
      const result = await execGit(['status'], { cwd: repo.path });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('On branch');
    });

    it('should capture stdout and stderr', async () => {
      const result = await execGit(['log', '--oneline', '-1'], { cwd: repo.path });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
    });

    it('should return non-zero exit code for invalid commands', async () => {
      const result = await execGit(['invalid-command'], { cwd: repo.path });
      expect(result.exitCode).not.toBe(0);
    });

    it('should respect cwd option', async () => {
      const result = await execGit(['rev-parse', '--git-dir'], { cwd: repo.path });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('.git');
    });
  });

  describe('execGitOrThrow', () => {
    it('should return result on success', async () => {
      const result = await execGitOrThrow(['status'], { cwd: repo.path });
      expect(result.exitCode).toBe(0);
    });

    it('should throw GitError on failure', async () => {
      await expect(
        execGitOrThrow(['checkout', 'nonexistent-branch'], { cwd: repo.path })
      ).rejects.toThrow(GitError);
    });
  });

  describe('isGitAvailable', () => {
    it('should return true when git is installed', async () => {
      const available = await isGitAvailable();
      expect(available).toBe(true);
    });
  });

  describe('isGitRepository', () => {
    it('should return true for git repositories', async () => {
      const isRepo = await isGitRepository(repo.path);
      expect(isRepo).toBe(true);
    });

    it('should return false for non-repositories', async () => {
      const isRepo = await isGitRepository('/tmp');
      expect(isRepo).toBe(false);
    });
  });
});

describe('error classification', () => {
  it('should detect auth errors from patterns', async () => {
    const { isAuthError } = await import('../src/errors/auth-error.js');
    expect(isAuthError('Permission denied (publickey)')).toBe(true);
    expect(isAuthError('Authentication failed for')).toBe(true);
    expect(isAuthError('could not read Username')).toBe(true);
    expect(isAuthError('normal error message')).toBe(false);
  });

  it('should detect network errors from patterns', async () => {
    const { isNetworkError } = await import('../src/errors/network-error.js');
    expect(isNetworkError('Could not resolve host: github.com')).toBe(true);
    expect(isNetworkError('Connection refused')).toBe(true);
    expect(isNetworkError('fatal: unable to access')).toBe(true);
    expect(isNetworkError('normal error message')).toBe(false);
  });

  it('should detect conflict errors from patterns', async () => {
    const { isConflictError } = await import('../src/errors/conflict-error.js');
    expect(isConflictError('CONFLICT (content): Merge conflict in file.txt')).toBe(true);
    expect(isConflictError('Automatic merge failed')).toBe(true);
    expect(isConflictError('normal error message')).toBe(false);
  });

  it('should detect detached head errors from patterns', async () => {
    const { isDetachedHeadError } = await import('../src/errors/detached-head-error.js');
    expect(isDetachedHeadError('HEAD detached at abc1234')).toBe(true);
    expect(isDetachedHeadError('You are not currently on a branch')).toBe(true);
    expect(isDetachedHeadError('On branch main')).toBe(false);
  });
});
