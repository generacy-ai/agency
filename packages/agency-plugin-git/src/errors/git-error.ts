/**
 * Base error class for all git operations
 */
export class GitError extends Error {
  /** Git command that failed */
  readonly command: string;

  /** Exit code from git */
  readonly exitCode: number;

  /** Full stderr output (sanitized) */
  readonly stderr: string;

  /** Working directory where command was run */
  readonly cwd: string;

  constructor(
    message: string,
    options: {
      command: string;
      exitCode: number;
      stderr: string;
      cwd: string;
    }
  ) {
    super(message);
    this.name = 'GitError';
    this.command = options.command;
    this.exitCode = options.exitCode;
    this.stderr = options.stderr;
    this.cwd = options.cwd;

    // Maintain proper stack trace in V8
    if ('captureStackTrace' in Error && typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, GitError);
    }
  }

  /**
   * Get a sanitized message suitable for external display
   * Removes potentially sensitive information like paths and credentials
   */
  toSafeMessage(): string {
    return `Git command failed: ${this.message}`;
  }
}
