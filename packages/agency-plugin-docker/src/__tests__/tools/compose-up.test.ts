/**
 * Tests for compose-up tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { composeUpTool, composeUpSchema } from '../../tools/compose-up.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockExeca = vi.mocked(execa);

describe('composeUpSchema', () => {
  it('accepts valid minimal input', () => {
    const result = composeUpSchema.parse({});
    expect(result.detach).toBe(true); // default value
  });

  it('accepts full input', () => {
    const result = composeUpSchema.parse({
      file: 'docker-compose.prod.yml',
      services: ['web', 'db'],
      detach: false,
      build: true,
    });
    expect(result.file).toBe('docker-compose.prod.yml');
    expect(result.services).toEqual(['web', 'db']);
    expect(result.detach).toBe(false);
    expect(result.build).toBe(true);
  });
});

describe('composeUpTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(composeUpTool.name).toBe('run.docker_compose_up');
    expect(composeUpTool.namespace).toBe('run');
    expect(composeUpTool.outputPattern).toBe('terse');
  });

  it('executes compose up with defaults', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Creating network...',
      stderr: '',
      failed: false,
    } as never);

    const result = await composeUpTool.execute({});

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'up', '-d'],
      expect.any(Object)
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Services started.',
    });
  });

  it('executes compose up with all options', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Creating...',
      stderr: '',
      failed: false,
    } as never);

    await composeUpTool.execute({
      file: 'custom.yml',
      services: ['web', 'redis'],
      detach: true,
      build: true,
    });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', '-f', 'custom.yml', 'up', '-d', '--build', 'web', 'redis'],
      expect.any(Object)
    );
  });

  it('handles failure with error classification', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Cannot connect to the Docker daemon',
      failed: true,
    } as never);

    const result = await composeUpTool.execute({});

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('[DAEMON]');
  });
});
