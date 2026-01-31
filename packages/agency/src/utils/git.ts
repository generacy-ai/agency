/**
 * Git utilities using simple-git library
 *
 * Provides programmatic access to common git operations needed by MCP tools,
 * including branch management, repository status, and fetch operations.
 */

import { simpleGit, type SimpleGit } from 'simple-git';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal git status interface providing essential status information
 */
export interface GitStatus {
  /** Whether the working tree has no uncommitted changes */
  isClean: boolean;
  /** Current branch name (or "HEAD" if detached) */
  currentBranch: string;
  /** Whether there are uncommitted changes (inverse of isClean for convenience) */
  hasChanges: boolean;
}

/**
 * Check if a directory is a git repository
 *
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns true if the directory contains a .git folder
 */
export async function isGitRepo(cwd?: string): Promise<boolean> {
  const workDir = cwd ?? process.cwd();
  const gitDir = join(workDir, '.git');
  return existsSync(gitDir);
}

/**
 * Create a SimpleGit instance for the given directory
 *
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns SimpleGit instance configured for the directory
 * @throws Error if the directory is not a git repository
 */
export async function getGit(cwd?: string): Promise<SimpleGit> {
  const workDir = cwd ?? process.cwd();
  if (!(await isGitRepo(workDir))) {
    throw new Error(`Not a git repository: ${workDir}`);
  }
  return simpleGit(workDir);
}

/**
 * Get the current branch name
 *
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Current branch name, or "HEAD" if in detached HEAD state
 * @throws Error if the directory is not a git repository
 */
export async function getCurrentBranch(cwd?: string): Promise<string> {
  const git = await getGit(cwd);
  const result = await git.revparse(['--abbrev-ref', 'HEAD']);
  return result.trim();
}

/**
 * Check if a branch exists locally or on the remote (origin)
 *
 * @param name - Branch name to check
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns true if the branch exists locally or as origin/<name>
 * @throws Error if the directory is not a git repository
 */
export async function branchExists(name: string, cwd?: string): Promise<boolean> {
  const git = await getGit(cwd);

  // Check local branches first (faster, most common case)
  const localBranches = await git.branchLocal();
  if (localBranches.all.includes(name)) {
    return true;
  }

  // Check remote (origin/) branches
  try {
    const remoteBranches = await git.branch(['-r']);
    return remoteBranches.all.includes(`origin/${name}`);
  } catch {
    // If remote check fails (e.g., no origin remote), return false
    return false;
  }
}

/**
 * Create a new branch and optionally check it out
 *
 * @param name - Name for the new branch
 * @param from - Base branch to create from (defaults to current branch)
 * @param cwd - Working directory (defaults to process.cwd())
 * @throws Error if the directory is not a git repository or branch creation fails
 */
export async function createBranch(
  name: string,
  from?: string,
  cwd?: string
): Promise<void> {
  const git = await getGit(cwd);

  if (from) {
    // Create branch from specific base and checkout
    await git.checkoutBranch(name, from);
  } else {
    // Create branch from current HEAD and checkout
    await git.checkoutLocalBranch(name);
  }
}

/**
 * Switch to a different branch
 *
 * @param branch - Branch name to checkout
 * @param cwd - Working directory (defaults to process.cwd())
 * @throws Error if the directory is not a git repository or checkout fails
 */
export async function checkout(branch: string, cwd?: string): Promise<void> {
  const git = await getGit(cwd);
  await git.checkout(branch);
}

/**
 * Options for the fetch operation
 */
export interface FetchOptions {
  /** Fetch all remotes (default: true) */
  all?: boolean;
  /** Prune deleted remote branches (default: true) */
  prune?: boolean;
}

/**
 * Fetch from remote with configurable options
 *
 * @param options - Fetch options (all, prune)
 * @param cwd - Working directory (defaults to process.cwd())
 * @throws Error if the directory is not a git repository or fetch fails
 */
export async function fetch(options?: FetchOptions, cwd?: string): Promise<void> {
  const git = await getGit(cwd);
  const { all = true, prune = true } = options ?? {};

  const fetchArgs: string[] = [];
  if (all) fetchArgs.push('--all');
  if (prune) fetchArgs.push('--prune');

  await git.fetch(fetchArgs);
}

/**
 * Get the working tree status
 *
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns GitStatus with isClean, currentBranch, and hasChanges
 * @throws Error if the directory is not a git repository
 */
export async function getStatus(cwd?: string): Promise<GitStatus> {
  const git = await getGit(cwd);
  const status = await git.status();
  const currentBranch = await getCurrentBranch(cwd);

  return {
    isClean: status.isClean(),
    currentBranch,
    hasChanges: !status.isClean(),
  };
}
