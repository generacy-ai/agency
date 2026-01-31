/**
 * Tests for auto-numbering utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import {
  findNextFeatureNumber,
  padFeatureNumber,
} from '../../src/utils/numbering.js';

describe('padFeatureNumber', () => {
  it('should pad single digit to 3 digits by default', () => {
    expect(padFeatureNumber(1)).toBe('001');
  });

  it('should pad double digit to 3 digits', () => {
    expect(padFeatureNumber(42)).toBe('042');
  });

  it('should not pad triple digit', () => {
    expect(padFeatureNumber(999)).toBe('999');
  });

  it('should handle custom padding', () => {
    expect(padFeatureNumber(1, 4)).toBe('0001');
    expect(padFeatureNumber(42, 5)).toBe('00042');
  });

  it('should handle padding of 1', () => {
    expect(padFeatureNumber(7, 1)).toBe('7');
  });

  it('should not truncate numbers larger than padding', () => {
    expect(padFeatureNumber(1234, 3)).toBe('1234');
  });
});

describe('findNextFeatureNumber', () => {
  let testDir: string;
  let repoDir: string;
  let specsDir: string;

  const initGitRepo = (dir: string): void => {
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', {
      cwd: dir,
      stdio: 'pipe',
    });
    execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "Initial commit"', {
      cwd: dir,
      stdio: 'pipe',
    });
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-numbering-test-'));
    repoDir = join(testDir, 'repo');
    specsDir = 'specs';
    await fs.mkdir(repoDir);
    await fs.mkdir(join(repoDir, specsDir));
    initGitRepo(repoDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('scanning specs directory', () => {
    it('should return 1 when no features exist', async () => {
      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(1);
    });

    it('should return max + 1 from spec directories', async () => {
      await fs.mkdir(join(repoDir, specsDir, '001-first-feature'));
      await fs.mkdir(join(repoDir, specsDir, '002-second-feature'));
      await fs.mkdir(join(repoDir, specsDir, '005-fifth-feature'));

      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(6);
    });

    it('should handle non-consecutive numbers', async () => {
      await fs.mkdir(join(repoDir, specsDir, '001-feature'));
      await fs.mkdir(join(repoDir, specsDir, '010-feature'));
      await fs.mkdir(join(repoDir, specsDir, '100-feature'));

      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(101);
    });

    it('should ignore non-matching directories', async () => {
      await fs.mkdir(join(repoDir, specsDir, '003-valid-feature'));
      await fs.mkdir(join(repoDir, specsDir, 'not-a-feature'));
      await fs.mkdir(join(repoDir, specsDir, 'readme'));

      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(4);
    });

    it('should handle specs dir not existing', async () => {
      await fs.rm(join(repoDir, specsDir), { recursive: true });

      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(1);
    });
  });

  describe('scanning git branches', () => {
    it('should consider local branch numbers', async () => {
      execSync('git checkout -b 005-feature-branch', {
        cwd: repoDir,
        stdio: 'pipe',
      });
      execSync('git checkout -b 010-another-feature', {
        cwd: repoDir,
        stdio: 'pipe',
      });
      execSync('git checkout master || git checkout main', {
        cwd: repoDir,
        stdio: 'pipe',
        shell: '/bin/bash',
      });

      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(11);
    });

    it('should take max of branches and directories', async () => {
      // Create directory with number 5
      await fs.mkdir(join(repoDir, specsDir, '005-dir-feature'));

      // Create branch with number 10
      execSync('git checkout -b 010-branch-feature', {
        cwd: repoDir,
        stdio: 'pipe',
      });
      execSync('git checkout master || git checkout main', {
        cwd: repoDir,
        stdio: 'pipe',
        shell: '/bin/bash',
      });

      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(11);
    });

    it('should handle typed branch patterns', async () => {
      execSync('git checkout -b feature/042-some-feature', {
        cwd: repoDir,
        stdio: 'pipe',
      });
      execSync('git checkout master || git checkout main', {
        cwd: repoDir,
        stdio: 'pipe',
        shell: '/bin/bash',
      });

      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(43);
    });
  });

  describe('combined scanning', () => {
    it('should return 1 when no features exist in any source', async () => {
      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(1);
    });

    it('should find highest from any source', async () => {
      // Directory has 3
      await fs.mkdir(join(repoDir, specsDir, '003-dir-feature'));

      // Local branch has 7
      execSync('git checkout -b 007-branch-feature', {
        cwd: repoDir,
        stdio: 'pipe',
      });
      execSync('git checkout master || git checkout main', {
        cwd: repoDir,
        stdio: 'pipe',
        shell: '/bin/bash',
      });

      const nextNum = await findNextFeatureNumber(repoDir, specsDir);
      expect(nextNum).toBe(8);
    });
  });
});
