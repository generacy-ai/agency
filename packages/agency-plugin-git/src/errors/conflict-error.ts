/**
 * Conflict error for merge/rebase conflicts
 */
import { GitError } from './git-error.js';
import type { ConflictInfo } from '../types.js';

export class ConflictError extends GitError {
  readonly type = 'conflict' as const;

  /** Structured conflict information */
  readonly conflicts: ConflictInfo[];

  constructor(
    message: string,
    options: {
      command: string;
      exitCode: number;
      stderr: string;
      cwd: string;
      conflicts: ConflictInfo[];
    }
  ) {
    super(message, options);
    this.name = 'ConflictError';
    this.conflicts = options.conflicts;
  }

  override toSafeMessage(): string {
    const count = this.conflicts.length;
    if (count === 0) {
      return 'Merge conflict detected.';
    }
    if (count === 1) {
      return `Merge conflict in ${this.conflicts[0]?.file ?? 'unknown file'}`;
    }
    return `Merge conflicts in ${count} files`;
  }

  /**
   * Get list of conflicted file paths
   */
  getConflictedFiles(): string[] {
    return this.conflicts.map((c) => c.file);
  }
}

/**
 * Patterns that indicate a conflict error
 */
export const CONFLICT_ERROR_PATTERNS = [
  /conflict/i,
  /automatic merge failed/i,
  /needs merge/i,
  /you have unmerged paths/i,
  /fix conflicts and then commit/i,
  /cannot .* because you have unmerged files/i,
];

/**
 * Check if an error message indicates a conflict
 */
export function isConflictError(stderr: string, stdout: string = ''): boolean {
  const combined = stderr + stdout;
  return CONFLICT_ERROR_PATTERNS.some((pattern) => pattern.test(combined));
}
