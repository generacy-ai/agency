/**
 * Tests for package manager detection
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { detectPackageManager, isDetectionSuccess } from '../../src/pm/index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures');

describe('detectPackageManager', () => {
  it('detects npm from package-lock.json', () => {
    const result = detectPackageManager(join(fixturesDir, 'npm-project'));

    expect(isDetectionSuccess(result)).toBe(true);
    if (isDetectionSuccess(result)) {
      expect(result.packageManager).toBe('npm');
      expect(result.lockfile).toBe('package-lock.json');
    }
  });

  it('detects yarn from yarn.lock', () => {
    const result = detectPackageManager(join(fixturesDir, 'yarn-project'));

    expect(isDetectionSuccess(result)).toBe(true);
    if (isDetectionSuccess(result)) {
      expect(result.packageManager).toBe('yarn');
      expect(result.lockfile).toBe('yarn.lock');
    }
  });

  it('detects pnpm from pnpm-lock.yaml', () => {
    const result = detectPackageManager(join(fixturesDir, 'pnpm-project'));

    expect(isDetectionSuccess(result)).toBe(true);
    if (isDetectionSuccess(result)) {
      expect(result.packageManager).toBe('pnpm');
      expect(result.lockfile).toBe('pnpm-lock.yaml');
    }
  });

  it('returns error when no lockfile found', () => {
    const result = detectPackageManager('/nonexistent/path');

    expect(isDetectionSuccess(result)).toBe(false);
    if (!isDetectionSuccess(result)) {
      expect(result.error).toContain('No lockfile found');
    }
  });

  it('prioritizes pnpm over npm when both exist', () => {
    // Monorepo fixture has pnpm-lock.yaml
    const result = detectPackageManager(join(fixturesDir, 'monorepo'));

    expect(isDetectionSuccess(result)).toBe(true);
    if (isDetectionSuccess(result)) {
      expect(result.packageManager).toBe('pnpm');
    }
  });
});

describe('isDetectionSuccess', () => {
  it('returns true for successful detection', () => {
    const result = detectPackageManager(join(fixturesDir, 'npm-project'));
    expect(isDetectionSuccess(result)).toBe(true);
  });

  it('returns false for failed detection', () => {
    const result = detectPackageManager('/nonexistent');
    expect(isDetectionSuccess(result)).toBe(false);
  });
});
