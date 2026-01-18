/**
 * Git command execution wrapper
 *
 * Provides:
 * - Spawn-based execution with timeout
 * - Error classification
 * - Raw output capture for parsing
 */

import { spawn } from 'node:child_process';
import type { ExecGitOptions, ExecGitResult } from '../types.js';
import {
  GitError,
  AuthError,
  NetworkError,
  ConflictError,
  DetachedHeadError,
  isAuthError,
  isNetworkError,
  isConflictError,
  isDetachedHeadError,
  extractRemote,
} from '../errors/index.js';
import type { ConflictInfo } from '../types.js';

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Execute a git command and return the result
 *
 * @param args - Git command arguments (e.g., ['status', '--porcelain'])
 * @param options - Execution options
 * @returns ExecGitResult with exitCode, stdout, stderr
 */
export async function execGit(
  args: string[],
  options: ExecGitOptions = {}
): Promise<ExecGitResult> {
  const {
    cwd = process.cwd(),
    timeout = DEFAULT_TIMEOUT,
    env = {},
  } = options;

  const command = `git ${args.join(' ')}`;

  return new Promise((resolve, reject) => {
    const gitProcess = spawn('git', args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    gitProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    gitProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      gitProcess.kill('SIGTERM');
      reject(
        new GitError(`Git command timed out after ${timeout}ms`, {
          command,
          exitCode: -1,
          stderr: 'Command timed out',
          cwd,
        })
      );
    }, timeout);

    gitProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(
        new GitError(`Failed to spawn git: ${error.message}`, {
          command,
          exitCode: -1,
          stderr: error.message,
          cwd,
        })
      );
    });

    gitProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: code ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command,
      });
    });
  });
}

/**
 * Execute a git command and throw a classified error on failure
 *
 * @param args - Git command arguments
 * @param options - Execution options
 * @returns ExecGitResult on success
 * @throws GitError (or subclass) on failure
 */
export async function execGitOrThrow(
  args: string[],
  options: ExecGitOptions = {}
): Promise<ExecGitResult> {
  const result = await execGit(args, options);

  if (result.exitCode !== 0) {
    throw classifyError(result, options.cwd ?? process.cwd());
  }

  return result;
}

/**
 * Classify a git error based on exit code and stderr
 */
export function classifyError(
  result: ExecGitResult,
  cwd: string,
  conflicts: ConflictInfo[] = []
): GitError {
  const { exitCode, stderr, stdout, command } = result;

  // Check error patterns in order of specificity

  // Auth errors (exit code 128 typically)
  if (isAuthError(stderr)) {
    return new AuthError('Authentication failed', {
      command,
      exitCode,
      stderr,
      cwd,
    });
  }

  // Network errors
  if (isNetworkError(stderr)) {
    return new NetworkError('Network error', {
      command,
      exitCode,
      stderr,
      cwd,
      remote: extractRemote(stderr),
    });
  }

  // Conflict errors (exit code 1 with conflict message)
  if (isConflictError(stderr, stdout)) {
    return new ConflictError('Merge conflict', {
      command,
      exitCode,
      stderr,
      cwd,
      conflicts,
    });
  }

  // Detached HEAD errors
  if (isDetachedHeadError(stderr)) {
    return new DetachedHeadError('HEAD is detached', {
      command,
      exitCode,
      stderr,
      cwd,
      headCommit: extractHeadCommit(stderr) ?? 'unknown',
    });
  }

  // Generic git error
  return new GitError(stderr || `Command exited with code ${exitCode}`, {
    command,
    exitCode,
    stderr,
    cwd,
  });
}

/**
 * Extract HEAD commit from error message
 */
function extractHeadCommit(stderr: string): string | undefined {
  const match = stderr.match(
    /head detached (?:at|from) ([a-f0-9]+)/i
  );
  return match?.[1];
}

/**
 * Check if git is available
 */
export async function isGitAvailable(): Promise<boolean> {
  try {
    const result = await execGit(['--version']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get the current git version
 */
export async function getGitVersion(): Promise<string | null> {
  try {
    const result = await execGit(['--version']);
    if (result.exitCode === 0) {
      const match = result.stdout.match(/git version (\d+\.\d+\.\d+)/);
      return match?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if the current directory is a git repository
 */
export async function isGitRepository(cwd?: string): Promise<boolean> {
  try {
    const result = await execGit(
      ['rev-parse', '--git-dir'],
      { cwd }
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
