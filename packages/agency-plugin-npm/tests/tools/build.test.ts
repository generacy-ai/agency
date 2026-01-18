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
  });
});

describe('tool registration', () => {
  it('creates all 8 tools', () => {
    const tools = createTools(DEFAULT_CONFIG);
    expect(tools).toHaveLength(8);
  });

  it('creates 4 build tools', () => {
    const tools = createTools(DEFAULT_CONFIG);
    const buildTools = tools.filter((t) => t.namespace === 'build');
    expect(buildTools).toHaveLength(4);
  });

  it('creates 4 test tools', () => {
    const tools = createTools(DEFAULT_CONFIG);
    const testTools = tools.filter((t) => t.namespace === 'test');
    expect(testTools).toHaveLength(4);
  });
});
