/**
 * Tests for command file distribution and installation
 */

import { existsSync, readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { commandsDir, installCommands } from '../src/commands.js';

describe('commandsDir', () => {
  it('should resolve to an existing directory', () => {
    expect(existsSync(commandsDir)).toBe(true);
  });

  it('should contain .md files', () => {
    const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
  });

  it('should contain all 9 expected command files', () => {
    const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    const expected = [
      'analyze.md', 'checklist.md', 'clarify.md', 'constitution.md',
      'implement.md', 'plan.md', 'specify.md', 'tasks.md', 'taskstoissues.md',
    ];
    expect(files.sort()).toEqual(expected.sort());
  });
});

describe('installCommands', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('should copy all .md files to the target directory', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'commands-test-'));
    const targetDir = join(tempDir, 'commands');

    const copied = await installCommands(targetDir);

    expect(copied.length).toBe(9);
    for (const file of copied) {
      expect(existsSync(join(targetDir, file))).toBe(true);
    }
  });

  it('should overwrite existing files', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'commands-test-'));
    const targetDir = join(tempDir, 'commands');

    // First install
    await installCommands(targetDir);

    // Write a dummy file to verify overwrite
    const testFile = join(targetDir, 'specify.md');
    writeFileSync(testFile, 'old content');

    // Second install should overwrite
    await installCommands(targetDir);

    const content = readFileSync(testFile, 'utf-8');
    expect(content).not.toBe('old content');
  });

  it('should create the target directory if it does not exist', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'commands-test-'));
    const targetDir = join(tempDir, 'nested', 'deep', 'commands');

    await installCommands(targetDir);

    expect(existsSync(targetDir)).toBe(true);
    const files = readdirSync(targetDir);
    expect(files.length).toBe(9);
  });
});
