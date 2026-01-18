/**
 * Mock git repository helper for testing
 *
 * Creates temporary git repositories with controlled state for testing.
 */

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export interface MockRepoOptions {
  /** Initial branch name (default: 'main') */
  initialBranch?: string;
  /** Initial commits to create */
  initialCommits?: Array<{
    message: string;
    files: Record<string, string>;
  }>;
  /** Additional branches to create */
  branches?: string[];
}

export interface MockRepo {
  /** Path to the repository */
  path: string;
  /** Clean up the repository */
  cleanup: () => Promise<void>;
  /** Run a git command in the repo */
  git: (...args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  /** Write a file to the repo */
  writeFile: (name: string, content: string) => Promise<void>;
  /** Create a commit with the given files */
  commit: (message: string, files?: Record<string, string>) => Promise<string>;
  /** Create a new branch */
  createBranch: (name: string) => Promise<void>;
  /** Checkout a branch */
  checkout: (ref: string) => Promise<void>;
}

/**
 * Create a temporary git repository for testing
 */
export async function createMockRepo(options: MockRepoOptions = {}): Promise<MockRepo> {
  const {
    initialBranch = 'main',
    initialCommits = [],
    branches = [],
  } = options;

  // Create temp directory
  const path = await mkdtemp(join(tmpdir(), 'git-test-'));

  // Helper to run git commands
  const git = async (...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd: path,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test Author',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test Author',
          GIT_COMMITTER_EMAIL: 'test@example.com',
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('error', reject);
      proc.on('close', (code) => {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0 });
      });
    });
  };

  // Helper to write file
  const writeRepoFile = async (name: string, content: string): Promise<void> => {
    const filePath = join(path, name);
    const dir = join(path, name.split('/').slice(0, -1).join('/'));
    if (dir !== path) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, content);
  };

  // Helper to commit
  const commit = async (message: string, files?: Record<string, string>): Promise<string> => {
    if (files) {
      for (const [name, content] of Object.entries(files)) {
        await writeRepoFile(name, content);
      }
    }
    await git('add', '-A');
    await git('commit', '-m', message, '--allow-empty');
    const result = await git('rev-parse', 'HEAD');
    return result.stdout;
  };

  // Initialize repository
  await git('init', '-b', initialBranch);
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test Author');

  // Create initial commits
  if (initialCommits.length === 0) {
    // Create at least one commit so HEAD exists
    await writeRepoFile('README.md', '# Test Repository\n');
    await git('add', '-A');
    await git('commit', '-m', 'Initial commit');
  } else {
    for (const { message, files } of initialCommits) {
      await commit(message, files);
    }
  }

  // Create additional branches
  for (const branch of branches) {
    await git('branch', branch);
  }

  return {
    path,
    git,
    writeFile: writeRepoFile,
    commit,
    createBranch: async (name: string) => {
      await git('branch', name);
    },
    checkout: async (ref: string) => {
      await git('checkout', ref);
    },
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
}

/**
 * Create a mock repo with merge conflicts
 */
export async function createConflictRepo(): Promise<MockRepo> {
  const repo = await createMockRepo({
    initialCommits: [
      { message: 'Initial commit', files: { 'file.txt': 'Line 1\nLine 2\nLine 3\n' } },
    ],
  });

  // Create feature branch with changes
  await repo.createBranch('feature');
  await repo.checkout('feature');
  await repo.writeFile('file.txt', 'Line 1\nFeature change\nLine 3\n');
  await repo.git('add', '-A');
  await repo.git('commit', '-m', 'Feature change');

  // Go back to main and make conflicting change
  await repo.checkout('main');
  await repo.writeFile('file.txt', 'Line 1\nMain change\nLine 3\n');
  await repo.git('add', '-A');
  await repo.git('commit', '-m', 'Main change');

  return repo;
}
