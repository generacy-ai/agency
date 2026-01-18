/**
 * Tests for docker-run tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dockerRunTool, dockerRunSchema } from '../../tools/docker-run.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockExeca = vi.mocked(execa);

describe('dockerRunSchema', () => {
  it('requires image', () => {
    expect(() => dockerRunSchema.parse({})).toThrow();
  });

  it('applies default detach value', () => {
    const result = dockerRunSchema.parse({ image: 'nginx' });
    expect(result.detach).toBe(true);
  });

  it('validates port mapping format', () => {
    expect(() =>
      dockerRunSchema.parse({ image: 'nginx', ports: ['invalid'] })
    ).toThrow();

    const result = dockerRunSchema.parse({ image: 'nginx', ports: ['8080:80'] });
    expect(result.ports).toEqual(['8080:80']);
  });

  it('validates volume mapping format', () => {
    expect(() =>
      dockerRunSchema.parse({ image: 'nginx', volumes: ['invalid'] })
    ).toThrow();

    const result = dockerRunSchema.parse({
      image: 'nginx',
      volumes: ['/host:/container'],
    });
    expect(result.volumes).toEqual(['/host:/container']);
  });

  it('accepts full input', () => {
    const result = dockerRunSchema.parse({
      image: 'nginx:latest',
      name: 'web',
      ports: ['80:80', '443:443'],
      env: { NODE_ENV: 'prod' },
      volumes: ['/data:/app/data'],
      detach: true,
      rm: true,
      cmd: ['nginx', '-g', 'daemon off;'],
    });
    expect(result.image).toBe('nginx:latest');
    expect(result.name).toBe('web');
  });
});

describe('dockerRunTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(dockerRunTool.name).toBe('run.docker_run');
    expect(dockerRunTool.namespace).toBe('run');
    expect(dockerRunTool.outputPattern).toBe('terse');
  });

  it('executes run with minimal options', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'abc123def456789',
      stderr: '',
      failed: false,
    } as never);

    const result = await dockerRunTool.execute({ image: 'nginx' });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['run', '-d', 'nginx'],
      expect.any(Object)
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Container started: abc123def456',
    });
  });

  it('executes run with name', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'xyz789',
      stderr: '',
      failed: false,
    } as never);

    const result = await dockerRunTool.execute({
      image: 'nginx',
      name: 'webserver',
    });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['run', '-d', '--name', 'webserver', 'nginx'],
      expect.any(Object)
    );

    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Container started: webserver (xyz789)',
    });
  });

  it('executes run with all options', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'container123',
      stderr: '',
      failed: false,
    } as never);

    await dockerRunTool.execute({
      image: 'node:18',
      name: 'app',
      ports: ['3000:3000'],
      env: { NODE_ENV: 'production' },
      volumes: ['/app:/app'],
      detach: true,
      rm: true,
      cmd: ['node', 'server.js'],
    });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      [
        'run', '-d',
        '--name', 'app',
        '--rm',
        '-p', '3000:3000',
        '-e', 'NODE_ENV=production',
        '-v', '/app:/app',
        'node:18',
        'node', 'server.js',
      ],
      expect.any(Object)
    );
  });

  it('handles failure', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Unable to find image \'invalid:latest\' locally',
      failed: true,
    } as never);

    const result = await dockerRunTool.execute({ image: 'invalid' });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('[NOT_FOUND]');
  });
});
