/**
 * Tests for docker-build tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dockerBuildTool, dockerBuildSchema } from '../../tools/docker-build.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockExeca = vi.mocked(execa);

describe('dockerBuildSchema', () => {
  it('requires context', () => {
    expect(() => dockerBuildSchema.parse({})).toThrow();
  });

  it('accepts minimal input', () => {
    const result = dockerBuildSchema.parse({ context: '.' });
    expect(result.context).toBe('.');
  });

  it('accepts full input', () => {
    const result = dockerBuildSchema.parse({
      context: './app',
      tag: 'myapp:latest',
      dockerfile: 'Dockerfile.prod',
      buildArgs: { NODE_ENV: 'production' },
    });
    expect(result.context).toBe('./app');
    expect(result.tag).toBe('myapp:latest');
    expect(result.dockerfile).toBe('Dockerfile.prod');
    expect(result.buildArgs).toEqual({ NODE_ENV: 'production' });
  });
});

describe('dockerBuildTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(dockerBuildTool.name).toBe('run.docker_build');
    expect(dockerBuildTool.namespace).toBe('run');
    expect(dockerBuildTool.outputPattern).toBe('terse');
  });

  it('executes build with minimal options', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Successfully built abc123',
      stderr: '',
      failed: false,
    } as never);

    const result = await dockerBuildTool.execute({ context: '.' });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['build', '.'],
      expect.any(Object)
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Image built.',
    });
  });

  it('executes build with tag', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Successfully tagged myapp:v1',
      stderr: '',
      failed: false,
    } as never);

    const result = await dockerBuildTool.execute({
      context: '.',
      tag: 'myapp:v1',
    });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['build', '-t', 'myapp:v1', '.'],
      expect.any(Object)
    );

    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Image built: myapp:v1',
    });
  });

  it('executes build with dockerfile and build args', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Built',
      stderr: '',
      failed: false,
    } as never);

    await dockerBuildTool.execute({
      context: './app',
      dockerfile: 'Dockerfile.dev',
      buildArgs: { DEBUG: 'true', VERSION: '1.0' },
    });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      [
        'build',
        '-f', 'Dockerfile.dev',
        '--build-arg', 'DEBUG=true',
        '--build-arg', 'VERSION=1.0',
        './app',
      ],
      expect.any(Object)
    );
  });

  it('handles build failure', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'error: no space left on device',
      failed: true,
    } as never);

    const result = await dockerBuildTool.execute({ context: '.' });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('[RESOURCE]');
  });
});
