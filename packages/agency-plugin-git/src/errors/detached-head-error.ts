/**
 * Detached HEAD error for operations requiring a branch
 */
import { GitError } from './git-error.js';

export class DetachedHeadError extends GitError {
  readonly type = 'detached_head' as const;

  /** Current HEAD commit */
  readonly headCommit: string;

  constructor(
    message: string,
    options: {
      command: string;
      exitCode: number;
      stderr: string;
      cwd: string;
      headCommit: string;
    }
  ) {
    super(message, options);
    this.name = 'DetachedHeadError';
    this.headCommit = options.headCommit;
  }

  override toSafeMessage(): string {
    return `HEAD is detached at ${this.headCommit.slice(0, 7)}. This operation requires a branch.`;
  }
}

/**
 * Patterns that indicate a detached HEAD situation
 */
export const DETACHED_HEAD_PATTERNS = [
  /head detached/i,
  /you are not currently on a branch/i,
  /detached head/i,
];

/**
 * Check if an error message indicates detached HEAD
 */
export function isDetachedHeadError(stderr: string): boolean {
  return DETACHED_HEAD_PATTERNS.some((pattern) => pattern.test(stderr));
}
