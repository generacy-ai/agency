/**
 * Tests for compose-down tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { composeDownTool, composeDownSchema } from '../../tools/compose-down.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockExeca = vi.mocked(execa);

describe('composeDownSchema', () => {
  it('accepts empty input', () => {
    const result = composeDownSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts full input', () => {
    const result = composeDownSchema.parse({
      file: 'docker-compose.yml',
      volumes: true,
      removeOrphans: true,
    });
    expect(result.file).toBe('docker-compose.yml');
    expect(result.volumes).toBe(true);
    expect(result.removeOrphans).toBe(true);
  });
});

describe('composeDownTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(composeDownTool.name).toBe('run.docker_compose_down');
    expect(composeDownTool.namespace).toBe('run');
    expect(composeDownTool.outputPattern).toBe('terse');
  });

  it('executes compose down with defaults', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Stopping containers...',
      stderr: '',
      failed: false,
    } as never);

    const result = await composeDownTool.execute({});

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'down'],
      expect.any(Object)
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Services stopped.',
    });
  });

  it('executes compose down with volumes flag', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Removing volumes...',
      stderr: '',
      failed: false,
    } as never);

    await composeDownTool.execute({ volumes: true });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'down', '-v'],
      expect.any(Object)
    );
  });

  it('executes compose down with remove-orphans flag', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      failed: false,
    } as never);

    await composeDownTool.execute({ removeOrphans: true });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'down', '--remove-orphans'],
      expect.any(Object)
    );
  });

  it('handles failure', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'permission denied',
      failed: true,
    } as never);

    const result = await composeDownTool.execute({});

    expect(result.isError).toBe(true);
  });
});
