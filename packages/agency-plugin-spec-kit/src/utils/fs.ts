/**
 * File system utilities for spec-kit
 *
 * Provides async file system operations for checking existence,
 * finding repository roots, and reading directories.
 */

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Check if a file or directory exists at the given path.
 *
 * @param path - Absolute path to check
 * @returns True if the path exists, false otherwise
 *
 * @example
 * ```typescript
 * if (await exists('/workspace/specs/001-feature')) {
 *   console.log('Feature directory exists');
 * }
 * ```
 */
export async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the contents of a directory.
 *
 * @param path - Absolute path to the directory
 * @returns Array of entry names, or empty array if directory doesn't exist
 *
 * @example
 * ```typescript
 * const entries = await readDir('/workspace/specs');
 * console.log(entries); // ['001-feature', '002-other', ...]
 * ```
 */
export async function readDir(path: string): Promise<string[]> {
  try {
    return await fs.readdir(path);
  } catch {
    return [];
  }
}

/**
 * Find the repository root by traversing up from a starting path.
 *
 * Looks for either a .git directory (git repositories) or a specs/
 * directory (non-git repositories) to identify the project root.
 *
 * @param startPath - Path to start searching from
 * @returns Absolute path to repository root, or null if not found
 *
 * @example
 * ```typescript
 * const repoRoot = await findRepoRoot('/workspace/project/src/utils');
 * console.log(repoRoot); // '/workspace/project'
 * ```
 */
export async function findRepoRoot(startPath: string): Promise<string | null> {
  let current = startPath;

  // Traverse up the directory tree until we hit the root
  while (current !== dirname(current)) {
    // Check for .git directory (git repositories)
    if (await exists(`${current}/.git`)) {
      return current;
    }
    // Check for specs directory (fallback for non-git repos)
    if (await exists(`${current}/specs`)) {
      return current;
    }
    current = dirname(current);
  }

  return null;
}
