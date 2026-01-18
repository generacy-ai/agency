/**
 * Tests for docker-stop tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dockerStopTool, dockerStopSchema } from '../../tools/docker-stop.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockExeca = vi.mocked(execa);

describe('dockerStopSchema', () => {
  it('requires container', () => {
    expect(() => dockerStopSchema.parse({})).toThrow();
  });

  it('accepts minimal input', () => {
    const result = dockerStopSchema.parse({ container: 'web' });
    expect(result.container).toBe('web');
  });

  it('accepts timeout', () => {
    const result = dockerStopSchema.parse({ container: 'web', time: 30 });
    expect(result.time).toBe(30);
  });

  it('rejects negative timeout', () => {
    expect(() =>
      dockerStopSchema.parse({ container: 'web', time: -1 })
    ).toThrow();
  });
});

describe('dockerStopTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(dockerStopTool.name).toBe('run.docker_stop');
    expect(dockerStopTool.namespace).toBe('run');
    expect(dockerStopTool.outputPattern).toBe('terse');
  });

  it('executes stop with minimal options', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'web',
      stderr: '',
      failed: false,
    } as never);

    const result = await dockerStopTool.execute({ container: 'web' });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['stop', 'web'],
      expect.any(Object)
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Container stopped.',
    });
  });

  it('executes stop with timeout', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'container123',
      stderr: '',
      failed: false,
    } as never);

    await dockerStopTool.execute({ container: 'container123', time: 5 });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['stop', '-t', '5', 'container123'],
      expect.any(Object)
    );
  });

  it('handles container not found', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Error: No such container: nonexistent',
      failed: true,
    } as never);

    const result = await dockerStopTool.execute({ container: 'nonexistent' });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('[NOT_FOUND]');
  });
});
