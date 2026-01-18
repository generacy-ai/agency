/**
 * Tests for script validation
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { validateScript, getAvailableScripts, formatScriptNotFoundError } from '../../src/scripts/index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures');

describe('validateScript', () => {
  it('returns exists=true for existing script', () => {
    const result = validateScript(join(fixturesDir, 'npm-project'), 'build');

    expect(result.exists).toBe(true);
    expect(result.command).toBe("echo 'Building...'");
  });

  it('returns exists=false with available scripts for missing script', () => {
    const result = validateScript(join(fixturesDir, 'npm-project'), 'nonexistent');

    expect(result.exists).toBe(false);
    expect(result.availableScripts).toContain('build');
    expect(result.availableScripts).toContain('test');
    expect(result.error).toContain('Script not found');
  });

  it('returns error when package.json not found', () => {
    const result = validateScript('/nonexistent/path', 'build');

    expect(result.exists).toBe(false);
    expect(result.error).toContain('No package.json found');
  });
});

describe('getAvailableScripts', () => {
  it('returns all scripts from package.json', () => {
    const scripts = getAvailableScripts(join(fixturesDir, 'npm-project'));

    expect(scripts).toEqual({
      build: "echo 'Building...'",
      test: "echo 'Testing...'",
      lint: "echo 'Linting...'",
      format: "echo 'Formatting...'",
    });
  });

  it('returns empty object when package.json not found', () => {
    const scripts = getAvailableScripts('/nonexistent/path');
    expect(scripts).toEqual({});
  });
});

describe('formatScriptNotFoundError', () => {
  it('formats error with available scripts', () => {
    const error = formatScriptNotFoundError('missing', ['build', 'test', 'lint']);

    expect(error).toContain("Script not found: 'missing'");
    expect(error).toContain('Available scripts');
    expect(error).toContain('- build');
    expect(error).toContain('- test');
    expect(error).toContain('- lint');
    expect(error).toContain('Recovery:');
  });

  it('handles empty available scripts', () => {
    const error = formatScriptNotFoundError('missing', []);

    expect(error).toContain("Script not found: 'missing'");
    expect(error).not.toContain('Available scripts');
    expect(error).toContain('Recovery:');
  });

  it('truncates long list of scripts', () => {
    const scripts = Array.from({ length: 15 }, (_, i) => `script${i}`);
    const error = formatScriptNotFoundError('missing', scripts);

    expect(error).toContain('... and 5 more');
  });
});
