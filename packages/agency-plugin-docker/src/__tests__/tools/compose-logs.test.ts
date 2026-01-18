/**
 * Tests for compose-logs tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { composeLogsTool, composeLogsSchema } from '../../tools/compose-logs.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockExeca = vi.mocked(execa);

describe('composeLogsSchema', () => {
  it('applies default tail value', () => {
    const result = composeLogsSchema.parse({});
    expect(result.tail).toBe(100);
  });

  it('accepts full input', () => {
    const result = composeLogsSchema.parse({
      file: 'docker-compose.yml',
      services: ['web'],
      tail: 50,
      timestamps: true,
    });
    expect(result.file).toBe('docker-compose.yml');
    expect(result.services).toEqual(['web']);
    expect(result.tail).toBe(50);
    expect(result.timestamps).toBe(true);
  });

  it('rejects negative tail', () => {
    expect(() => composeLogsSchema.parse({ tail: -1 })).toThrow();
  });
});

describe('composeLogsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(composeLogsTool.name).toBe('run.docker_compose_logs');
    expect(composeLogsTool.namespace).toBe('run');
    expect(composeLogsTool.outputPattern).toBe('terse');
  });

  it('executes compose logs with defaults', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'web | Server started on port 3000',
      stderr: '',
      failed: false,
    } as never);

    const result = await composeLogsTool.execute({});

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'logs', '--no-follow', '--tail', '100'],
      expect.any(Object)
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'web | Server started on port 3000',
    });
  });

  it('executes compose logs with timestamps', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '2024-01-18T10:00:00Z web | Started',
      stderr: '',
      failed: false,
    } as never);

    await composeLogsTool.execute({
      timestamps: true,
      tail: 50,
    });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'logs', '--no-follow', '--tail', '50', '-t'],
      expect.any(Object)
    );
  });

  it('executes compose logs for specific services', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'web logs only',
      stderr: '',
      failed: false,
    } as never);

    await composeLogsTool.execute({
      services: ['web', 'api'],
    });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'logs', '--no-follow', '--tail', '100', 'web', 'api'],
      expect.any(Object)
    );
  });

  it('returns "(no logs)" when stdout is empty', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      failed: false,
    } as never);

    const result = await composeLogsTool.execute({});

    expect(result.content[0]).toEqual({
      type: 'text',
      text: '(no logs)',
    });
  });

  it('handles failure', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'No such container: web',
      failed: true,
    } as never);

    const result = await composeLogsTool.execute({ services: ['web'] });

    expect(result.isError).toBe(true);
  });
});
