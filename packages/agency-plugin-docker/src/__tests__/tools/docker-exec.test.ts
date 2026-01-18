/**
 * Tests for docker-exec tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dockerExecTool, dockerExecSchema } from '../../tools/docker-exec.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockExeca = vi.mocked(execa);

describe('dockerExecSchema', () => {
  it('requires container and cmd', () => {
    expect(() => dockerExecSchema.parse({})).toThrow();
    expect(() => dockerExecSchema.parse({ container: 'web' })).toThrow();
    expect(() => dockerExecSchema.parse({ cmd: ['ls'] })).toThrow();
  });

  it('requires non-empty cmd array', () => {
    expect(() =>
      dockerExecSchema.parse({ container: 'web', cmd: [] })
    ).toThrow();
  });

  it('accepts minimal input', () => {
    const result = dockerExecSchema.parse({ container: 'web', cmd: ['ls'] });
    expect(result.container).toBe('web');
    expect(result.cmd).toEqual(['ls']);
  });

  it('accepts full input', () => {
    const result = dockerExecSchema.parse({
      container: 'web',
      cmd: ['npm', 'test'],
      workdir: '/app',
      user: 'node',
      interactive: true,
    });
    expect(result.workdir).toBe('/app');
    expect(result.user).toBe('node');
    expect(result.interactive).toBe(true);
  });
});

describe('dockerExecTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(dockerExecTool.name).toBe('run.docker_exec');
    expect(dockerExecTool.namespace).toBe('run');
    expect(dockerExecTool.outputPattern).toBe('terse');
  });

  it('executes command with minimal options', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'file1.txt\nfile2.txt',
      stderr: '',
      failed: false,
    } as never);

    const result = await dockerExecTool.execute({
      container: 'web',
      cmd: ['ls', '-la'],
    });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['exec', 'web', 'ls', '-la'],
      expect.any(Object)
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'file1.txt\nfile2.txt',
    });
  });

  it('executes command with all options', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'tests passed',
      stderr: '',
      failed: false,
    } as never);

    await dockerExecTool.execute({
      container: 'app',
      cmd: ['npm', 'test'],
      workdir: '/app',
      user: 'node',
      interactive: true,
    });

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      ['exec', '-w', '/app', '-u', 'node', '-i', 'app', 'npm', 'test'],
      expect.any(Object)
    );
  });

  it('returns "(no output)" for empty stdout', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      failed: false,
    } as never);

    const result = await dockerExecTool.execute({
      container: 'web',
      cmd: ['touch', 'file.txt'],
    });

    expect(result.content[0]).toEqual({
      type: 'text',
      text: '(no output)',
    });
  });

  it('handles container not found', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Error: No such container: nonexistent',
      failed: true,
    } as never);

    const result = await dockerExecTool.execute({
      container: 'nonexistent',
      cmd: ['ls'],
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('[NOT_FOUND]');
  });

  it('handles command failure', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 127,
      stdout: '',
      stderr: 'command not found: invalid-cmd',
      failed: true,
    } as never);

    const result = await dockerExecTool.execute({
      container: 'web',
      cmd: ['invalid-cmd'],
    });

    expect(result.isError).toBe(true);
  });
});
