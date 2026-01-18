/**
 * Tests for status tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStatusTool } from '../../src/tools/status.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import { createMockRepo, type MockRepo } from '../utils/mock-git.js';

describe('source_control.status', () => {
  let repo: MockRepo;
  const tool = createStatusTool(DEFAULT_CONFIG);

  beforeEach(async () => {
    repo = await createMockRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('source_control.status');
    expect(tool.namespace).toBe('source_control');
    expect(tool.modes).toContain('research');
    expect(tool.modes).toContain('coding');
    expect(tool.modes).toContain('review');
  });

  it('should return clean status for clean repo', async () => {
    const result = await tool.execute({ cwd: repo.path });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);

    const output = JSON.parse((result.content[0] as { text: string }).text);
    expect(output.branch).toBe('main');
    expect(output.staged).toEqual([]);
    expect(output.unstaged).toEqual([]);
    expect(output.untracked).toEqual([]);
    expect(output.summary).toContain('working tree clean');
  });

  it('should detect untracked files', async () => {
    await repo.writeFile('new-file.txt', 'content');

    const result = await tool.execute({ cwd: repo.path });
    const output = JSON.parse((result.content[0] as { text: string }).text);

    expect(output.untracked).toContain('new-file.txt');
    expect(output.summary).toContain('1 untracked');
  });

  it('should detect staged files', async () => {
    await repo.writeFile('staged.txt', 'content');
    await repo.git('add', 'staged.txt');

    const result = await tool.execute({ cwd: repo.path });
    const output = JSON.parse((result.content[0] as { text: string }).text);

    expect(output.staged).toHaveLength(1);
    expect(output.staged[0].path).toBe('staged.txt');
    expect(output.staged[0].status).toBe('added');
  });

  it('should detect modified files', async () => {
    await repo.writeFile('README.md', 'modified content');

    const result = await tool.execute({ cwd: repo.path });
    const output = JSON.parse((result.content[0] as { text: string }).text);

    expect(output.unstaged).toHaveLength(1);
    expect(output.unstaged[0].path).toBe('README.md');
    expect(output.unstaged[0].status).toBe('modified');
  });

  it('should return error for non-repo directory', async () => {
    const result = await tool.execute({ cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });
});
