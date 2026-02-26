/**
 * Tests for commit tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCommitTool } from '../../src/tools/commit.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import { createMockRepo, type MockRepo } from '../utils/mock-git.js';

describe('source_control.commit', () => {
  let repo: MockRepo;
  const tool = createCommitTool(DEFAULT_CONFIG);

  beforeEach(async () => {
    repo = await createMockRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('source_control.commit');
    expect(tool.namespace).toBe('source_control');
    expect(tool.modes).toEqual(['default', 'coding']);
  });

  it('should require message parameter', async () => {
    const result = await tool.execute({ cwd: repo.path });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('message');
  });

  it('should commit staged changes', async () => {
    await repo.writeFile('new-file.txt', 'content');
    await repo.git('add', 'new-file.txt');

    const result = await tool.execute({
      cwd: repo.path,
      message: 'Add new file',
    });

    expect(result.isError).toBeFalsy();
    const output = JSON.parse((result.content[0] as { text: string }).text);
    expect(output.hash).toBeTruthy();
    expect(output.shortHash).toBeTruthy();
    expect(output.branch).toBe('main');
    expect(output.filesChanged).toBe(1);
  });

  it('should stage and commit specified files', async () => {
    await repo.writeFile('file1.txt', 'content1');
    await repo.writeFile('file2.txt', 'content2');

    const result = await tool.execute({
      cwd: repo.path,
      message: 'Add file1 only',
      files: ['file1.txt'],
    });

    expect(result.isError).toBeFalsy();

    // Verify file2 is still untracked
    const status = await repo.git('status', '--porcelain');
    expect(status.stdout).toContain('?? file2.txt');
    expect(status.stdout).not.toContain('file1.txt');
  });

  it('should fail when nothing to commit', async () => {
    const result = await tool.execute({
      cwd: repo.path,
      message: 'Empty commit',
    });

    expect(result.isError).toBe(true);
  });

  it('should allow empty commits with allowEmpty flag', async () => {
    const result = await tool.execute({
      cwd: repo.path,
      message: 'Empty commit',
      allowEmpty: true,
    });

    expect(result.isError).toBeFalsy();
  });

  it('should amend previous commit', async () => {
    // Get original commit hash
    const originalLog = await repo.git('log', '-1', '--format=%H');
    const originalHash = originalLog.stdout;

    // Add a file and amend
    await repo.writeFile('amended.txt', 'content');
    await repo.git('add', 'amended.txt');

    const result = await tool.execute({
      cwd: repo.path,
      message: 'Amended commit',
      amend: true,
    });

    expect(result.isError).toBeFalsy();

    // Verify hash changed
    const newLog = await repo.git('log', '-1', '--format=%H');
    expect(newLog.stdout).not.toBe(originalHash);
  });
});
