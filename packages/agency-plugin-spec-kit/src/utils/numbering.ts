/**
 * Auto-numbering utilities for spec-kit
 *
 * Provides functions to find the next available feature number
 * by scanning both spec directories and git branches.
 */

import * as path from 'node:path';
import { exists, readDir } from './fs.js';

/** Pattern to match spec directory names: ###-* or larger numbers */
const SPEC_DIR_PATTERN = /^(\d+)-/;

/** Pattern to match feature branch names: type/###-* or ###-* */
const BRANCH_NUMBER_PATTERN = /(?:^|\/|_)(\d+)[-_]/;

/**
 * Find the next available feature number by scanning spec directories and git branches.
 *
 * Scans both:
 * 1. The specs directory for existing feature directories (e.g., 001-feature, 042-another)
 * 2. Git branches (local and remote) for feature patterns
 *
 * Returns the maximum found number + 1, defaulting to 1 if no features exist.
 *
 * @param repoRoot - Absolute path to the repository root
 * @param specsDir - Name of the specs directory (e.g., 'specs')
 * @returns The next available feature number
 *
 * @example
 * ```typescript
 * const nextNum = await findNextFeatureNumber('/path/to/repo', 'specs');
 * // Returns: 3 (if highest existing is 002)
 * ```
 */
export async function findNextFeatureNumber(
  repoRoot: string,
  specsDir: string
): Promise<number> {
  let maxNumber = 0;

  // Scan specs directory
  const specsDirPath = path.join(repoRoot, specsDir);
  if (await exists(specsDirPath)) {
    try {
      const entries = await readDir(specsDirPath);
      for (const entry of entries) {
        const match = entry.match(SPEC_DIR_PATTERN);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    } catch {
      // Continue if directory read fails
    }
  }

  // Scan git branches (local + remote)
  try {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(repoRoot);

    // Get local branches
    const localBranches = await git.branchLocal();
    for (const branch of localBranches.all) {
      const match = branch.match(BRANCH_NUMBER_PATTERN);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // Get remote branches
    try {
      const remoteBranches = await git.branch(['-r']);
      for (const remoteBranch of remoteBranches.all) {
        // Skip HEAD references
        if (remoteBranch.includes('HEAD')) {
          continue;
        }
        const match = remoteBranch.match(BRANCH_NUMBER_PATTERN);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    } catch {
      // Continue with local branches only if remote fails
    }
  } catch {
    // Continue without git if import fails
  }

  return maxNumber + 1;
}

/**
 * Pad a feature number to a specified width.
 *
 * @param num - Feature number to pad
 * @param padding - Number of digits to pad to (default: 3)
 * @returns Zero-padded number string
 *
 * @example
 * ```typescript
 * padFeatureNumber(1);    // '001'
 * padFeatureNumber(42);   // '042'
 * padFeatureNumber(999);  // '999'
 * padFeatureNumber(1, 4); // '0001'
 * ```
 */
export function padFeatureNumber(num: number, padding: number = 3): string {
  return String(num).padStart(padding, '0');
}
