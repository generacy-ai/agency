/**
 * Git utilities for spec-kit
 *
 * Provides functions for checking git repository status and
 * retrieving current branch information.
 */

import { exists } from './fs.js';

/**
 * Check if the given path is a git repository.
 *
 * @param path - Absolute path to check
 * @returns True if the path contains a .git directory
 *
 * @example
 * ```typescript
 * if (await isGitRepo('/workspace/project')) {
 *   console.log('This is a git repository');
 * }
 * ```
 */
export async function isGitRepo(path: string): Promise<boolean> {
  return exists(`${path}/.git`);
}

/**
 * Get the current git branch name.
 *
 * Uses git rev-parse to get the abbreviated reference name of HEAD.
 * Returns null if not in a git repository or if git fails.
 *
 * @param repoPath - Absolute path to the repository root
 * @returns Current branch name, or null if unavailable
 *
 * @example
 * ```typescript
 * const branch = await getCurrentBranch('/workspace/project');
 * console.log(branch); // '001-my-feature' or 'main' or null
 * ```
 */
export async function getCurrentBranch(
  repoPath: string
): Promise<string | null> {
  try {
    // Use dynamic import for simple-git to handle cases where it might not be installed
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(repoPath);
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  } catch {
    return null;
  }
}
