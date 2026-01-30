/**
 * Tests for file system utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  exists,
  readDir,
  findRepoRoot,
  FileNotFoundError,
  RepoNotFoundError,
} from '../../src/utils/fs.js';

describe('fs utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test content');

      expect(await exists(filePath)).toBe(true);
    });

    it('should return true for existing directory', async () => {
      const dirPath = join(testDir, 'subdir');
      await fs.mkdir(dirPath);

      expect(await exists(dirPath)).toBe(true);
    });

    it('should return false for non-existent path', async () => {
      const fakePath = join(testDir, 'does-not-exist');

      expect(await exists(fakePath)).toBe(false);
    });
  });

  describe('readDir', () => {
    it('should list directory contents', async () => {
      await fs.writeFile(join(testDir, 'file1.txt'), '');
      await fs.writeFile(join(testDir, 'file2.txt'), '');
      await fs.mkdir(join(testDir, 'subdir'));

      const entries = await readDir(testDir);

      expect(entries).toContain('file1.txt');
      expect(entries).toContain('file2.txt');
      expect(entries).toContain('subdir');
      expect(entries).toHaveLength(3);
    });

    it('should throw FileNotFoundError for non-existent directory', async () => {
      const fakePath = join(testDir, 'does-not-exist');

      await expect(readDir(fakePath)).rejects.toThrow(FileNotFoundError);
    });

    it('should return empty array for empty directory', async () => {
      const emptyDir = join(testDir, 'empty');
      await fs.mkdir(emptyDir);

      const entries = await readDir(emptyDir);

      expect(entries).toEqual([]);
    });
  });

  describe('findRepoRoot', () => {
    it('should find repo root with .git directory', async () => {
      // Create a mock git repo structure
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      const nestedDir = join(repoDir, 'src', 'utils');
      await fs.mkdir(nestedDir, { recursive: true });

      const root = await findRepoRoot(nestedDir);

      expect(root).toBe(repoDir);
    });

    it('should prefer .git over specs if both exist', async () => {
      // Create a directory with both .git and specs
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      const nestedDir = join(repoDir, 'src');
      await fs.mkdir(nestedDir, { recursive: true });

      const root = await findRepoRoot(nestedDir);

      expect(root).toBe(repoDir);
    });

    it('should throw RepoNotFoundError if no repo root found', async () => {
      // Use a path with no parent markers
      const orphanDir = join(testDir, 'orphan');
      await fs.mkdir(orphanDir);

      await expect(findRepoRoot(orphanDir)).rejects.toThrow(RepoNotFoundError);
    });
  });
});
