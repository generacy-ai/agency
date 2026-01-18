/**
 * Tests for compose-ps tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { composePsTool, composePsSchema } from '../../tools/compose-ps.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockExeca = vi.mocked(execa);

describe('composePsSchema', () => {
  it('accepts empty input', () => {
    const result = composePsSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts format option', () => {
    const result = composePsSchema.parse({ format: 'json' });
    expect(result.format).toBe('json');
  });

  it('rejects invalid format', () => {
    expect(() => composePsSchema.parse({ format: 'xml' })).toThrow();
  });
});

describe('composePsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(composePsTool.name).toBe('run.docker_compose_ps');
    expect(composePsTool.namespace).toBe('run');
    expect(composePsTool.outputPattern).toBe('terse');
  });

  it('executes compose ps with defaults', async () => {
    const psOutput = `NAME    IMAGE   STATUS
web     nginx   running
db      postgres  running`;

    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: psOutput,
      stderr: '',
      failed: false,
    } as never);

    const result = await composePsTool.execute({});

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'ps'],
      expect.any(Object)
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: psOutput,
    });
  });

  it('executes compose ps with json format', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '[{"Name": "web", "Status": "running"}]',
      stderr: '',
      failed: false,
    } as never);

    await composePsTool.execute({ format: 'json' });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'ps', '--format', 'json'],
      expect.any(Object)
    );
  });

  it('executes compose ps for specific services', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'web running',
      stderr: '',
      failed: false,
    } as never);

    await composePsTool.execute({ services: ['web'] });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'ps', 'web'],
      expect.any(Object)
    );
  });

  it('returns "(no services running)" when stdout is empty', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      failed: false,
    } as never);

    const result = await composePsTool.execute({});

    expect(result.content[0]).toEqual({
      type: 'text',
      text: '(no services running)',
    });
  });

  it('handles failure', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Cannot connect to the Docker daemon',
      failed: true,
    } as never);

    const result = await composePsTool.execute({});

    expect(result.isError).toBe(true);
  });
});
