/**
 * Tests for test tools
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
    stdout: 'All tests passed\nCoverage: 85.5%',
    stderr: '',
    shortMessage: 'Tests passed.',
  }),
  formatCommand: (cmd: string, args: string[]) => `${cmd} ${args.join(' ')}`,
}));

describe('test tools', () => {
  const tools = createTools(DEFAULT_CONFIG);

  const runUnit = tools.find((t) => t.name === 'test.run_unit')!;
  const runIntegration = tools.find((t) => t.name === 'test.run_integration')!;
  const runE2E = tools.find((t) => t.name === 'test.run_e2e')!;
  const runCoverage = tools.find((t) => t.name === 'test.run_coverage')!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('test.run_unit', () => {
    it('has correct metadata', () => {
      expect(runUnit.name).toBe('test.run_unit');
      expect(runUnit.namespace).toBe('test');
      expect(runUnit.outputPattern).toBe('terse');
      expect(runUnit.modes).toContain('coding');
    });

    it('executes successfully with valid project', async () => {
      const result = await runUnit.execute({
        cwd: join(fixturesDir, 'npm-project'),
      });

      expect(result.isError).toBeFalsy();
    });

    it('accepts pattern parameter', async () => {
      const result = await runUnit.execute({
        cwd: join(fixturesDir, 'npm-project'),
        pattern: '*.spec.ts',
      });

      expect(result.isError).toBeFalsy();
    });
  });

  describe('test.run_integration', () => {
    it('has correct metadata', () => {
      expect(runIntegration.name).toBe('test.run_integration');
      expect(runIntegration.namespace).toBe('test');
    });

    it('uses test:integration script by default', async () => {
      // Since npm-project doesn't have test:integration, this should fail
      const result = await runIntegration.execute({
        cwd: join(fixturesDir, 'npm-project'),
      });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Script not found');
    });
  });

  describe('test.run_e2e', () => {
    it('has correct metadata', () => {
      expect(runE2E.name).toBe('test.run_e2e');
      expect(runE2E.namespace).toBe('test');
    });
  });

  describe('test.run_coverage', () => {
    it('has correct metadata', () => {
      expect(runCoverage.name).toBe('test.run_coverage');
      expect(runCoverage.namespace).toBe('test');
    });

    it('accepts threshold parameter', async () => {
      // Since npm-project doesn't have test:coverage script, this will fail
      // but we're testing parameter acceptance
      const result = await runCoverage.execute({
        cwd: join(fixturesDir, 'npm-project'),
        threshold: 80,
        script: 'test', // Use existing script for parameter test
      });

      // Should execute (mocked)
      expect(result).toBeDefined();
    });
  });
});

describe('test tool parameter validation', () => {
  const tools = createTools(DEFAULT_CONFIG);
  const runUnit = tools.find((t) => t.name === 'test.run_unit')!;

  it('rejects invalid parameters', async () => {
    const result = await runUnit.execute({
      cwd: 123, // Invalid type
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Invalid parameters');
  });
});
