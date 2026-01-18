/**
 * Package manager detection from lockfiles
 *
 * Priority order: pnpm-lock.yaml > yarn.lock > package-lock.json
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageManager, DetectionResult, DetectionError, DetectionOutcome } from './types.js';

/** Lockfile to package manager mapping (priority order) */
const LOCKFILES: Array<{ file: string; pm: PackageManager }> = [
  { file: 'pnpm-lock.yaml', pm: 'pnpm' },
  { file: 'yarn.lock', pm: 'yarn' },
  { file: 'package-lock.json', pm: 'npm' },
];

/**
 * Detect package manager from lockfile in the given directory.
 *
 * @param cwd - Directory to check for lockfiles
 * @returns Detection result or error
 */
export function detectPackageManager(cwd: string): DetectionOutcome {
  for (const { file, pm } of LOCKFILES) {
    const lockfilePath = join(cwd, file);
    if (existsSync(lockfilePath)) {
      return {
        packageManager: pm,
        lockfile: file,
        lockfilePath,
      } satisfies DetectionResult;
    }
  }

  return {
    packageManager: null,
    error: `No lockfile found in ${cwd}. Expected one of: ${LOCKFILES.map(l => l.file).join(', ')}`,
  } satisfies DetectionError;
}

/**
 * Check if detection was successful
 */
export function isDetectionSuccess(result: DetectionOutcome): result is DetectionResult {
  return result.packageManager !== null;
}
