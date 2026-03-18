/**
 * Tests for build tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from '../../src/config.js';
import { createTools } from '../../src/tools/index.js';

const fixturesDir = join(import.meta.dirname, '../fixtures');

// Mock the exec module to avoid actual command execution in tests
vi.mock('../../src/exec/runner.js', () => ({
  exec: vi.fn().mockResolvedValue({
    exitCode: 0,
    stdout: 'Success',
    stderr: '',
    shortMessage: 'Operation completed.',
  }),
  formatCommand: (cmd: string, args: string[]) => `${cmd} ${args.join(' ')}`,
}));

describe('build tools', () => {
  const tools = createTools(DEFAULT_CONFIG);

  const installDeps = tools.find((t) => t.name === 'build.install_dependencies')!;
  const compile = tools.find((t) => t.name === 'build.compile')!;
  const lint = tools.find((t) => t.name === 'build.lint')!;
  const format = tools.find((t) => t.name === 'build.format')!;
  const validate = tools.find((t) => t.name === 'build.validate')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('build.install_dependencies', () => {
    it('has correct metadata', () => {
      expect(installDeps.name).toBe('build.install_dependencies');
      expect(installDeps.namespace).toBe('build');
      expect(installDeps.outputPattern).toBe('terse');
      expect(installDeps.modes).toContain('coding');
    });

    it('executes successfully with default parameters', async () => {
      const result = await installDeps.execute({
        cwd: join(fixturesDir, 'npm-project'),
      });

      expect(result.isError).toBeFalsy();
    });

    it('returns error for invalid cwd', async () => {
      const result = await installDeps.execute({
        cwd: '/nonexistent/path',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('text');
    });
  });

  describe('build.compile', () => {
    it('has correct metadata', () => {
      expect(compile.name).toBe('build.compile');
      expect(compile.namespace).toBe('build');
    });

    it('validates script exists before execution', async () => {
      // This should fail because 'nonexistent' script doesn't exist
      const result = await compile.execute({
        cwd: join(fixturesDir, 'npm-project'),
        script: 'nonexistent',
      });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Script not found');
    });
  });

  describe('build.lint', () => {
    it('has correct mode affiliations', () => {
      expect(lint.modes).toContain('coding');
      expect(lint.modes).toContain('review');
    });
  });

  describe('build.format', () => {
    it('has correct metadata', () => {
      expect(format.name).toBe('build.format');
      expect(format.namespace).toBe('build');
    });

    it('includes review mode', () => {
      expect(format.modes).toContain('review');
    });
  });

  describe('build.validate', () => {
    it('has correct metadata', () => {
      expect(validate.name).toBe('build.validate');
      expect(validate.namespace).toBe('build');
      expect(validate.outputPattern).toBe('terse');
      expect(validate.modes).toEqual(['default', 'coding', 'review']);
    });

    it('discovers validation scripts from package.json', async () => {
      const result = await validate.execute({
        cwd: join(fixturesDir, 'validate-project'),
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('lint');
      expect(text).toContain('format:check');
      expect(text).toContain('typecheck');
    });

    it('short-circuits when validate script exists', async () => {
      const { exec } = await import('../../src/exec/runner.js');
      const mockExec = vi.mocked(exec);

      const result = await validate.execute({
        cwd: join(fixturesDir, 'validate-shortcircuit'),
      });

      expect(result.isError).toBeFalsy();
      // Should only run the 'validate' script, not lint/typecheck
      expect(mockExec).toHaveBeenCalledTimes(1);
      const callArgs = mockExec.mock.calls[0];
      // The args should contain 'validate' as the script
      expect(callArgs[1]).toEqual(expect.arrayContaining(['validate']));
    });

    it('uses explicit scripts param bypassing discovery', async () => {
      const { exec } = await import('../../src/exec/runner.js');
      const mockExec = vi.mocked(exec);

      const result = await validate.execute({
        cwd: join(fixturesDir, 'validate-shortcircuit'),
        scripts: ['lint', 'typecheck'],
      });

      expect(result.isError).toBeFalsy();
      // Should run exactly 2 scripts (lint and typecheck), not 'validate'
      expect(mockExec).toHaveBeenCalledTimes(2);
    });

    it('appends --check to explicit format script (DD-4)', async () => {
      const { exec } = await import('../../src/exec/runner.js');
      const mockExec = vi.mocked(exec);

      await validate.execute({
        cwd: join(fixturesDir, 'pnpm-project'),
        scripts: ['format'],
      });

      const formatCall = mockExec.mock.calls.find((call) =>
        call[1].some((arg: string) => arg === '--check'),
      );
      expect(formatCall).toBeDefined();
    });

    it('returns success when no validation scripts exist', async () => {
      const result = await validate.execute({
        cwd: join(fixturesDir, 'npm-project'),
      });

      // npm-project has lint and format but no format:check or typecheck
      // It does have lint, so it should find at least lint
      expect(result.isError).toBeFalsy();
    });

    it('appends --check to format when format:check is absent', async () => {
      const { exec } = await import('../../src/exec/runner.js');
      const mockExec = vi.mocked(exec);

      // pnpm-project has 'format' but no 'format:check'
      await validate.execute({
        cwd: join(fixturesDir, 'pnpm-project'),
      });

      // Should have called exec for lint and format (with --check)
      const formatCall = mockExec.mock.calls.find((call) =>
        call[1].some((arg: string) => arg === '--check'),
      );
      expect(formatCall).toBeDefined();
    });
  });
});

describe('tool registration', () => {
  it('creates all 9 tools', () => {
    const tools = createTools(DEFAULT_CONFIG);
    expect(tools).toHaveLength(9);
  });

  it('creates 5 build tools', () => {
    const tools = createTools(DEFAULT_CONFIG);
    const buildTools = tools.filter((t) => t.namespace === 'build');
    expect(buildTools).toHaveLength(5);
  });

  it('creates 4 test tools', () => {
    const tools = createTools(DEFAULT_CONFIG);
    const testTools = tools.filter((t) => t.namespace === 'test');
    expect(testTools).toHaveLength(4);
  });
});
