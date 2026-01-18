/**
 * Authentication error for credential failures
 */
import { GitError } from './git-error.js';

export class AuthError extends GitError {
  readonly type = 'auth' as const;

  constructor(
    message: string,
    options: {
      command: string;
      exitCode: number;
      stderr: string;
      cwd: string;
    }
  ) {
    super(message, options);
    this.name = 'AuthError';
  }

  override toSafeMessage(): string {
    return 'Authentication failed. Please check your credentials.';
  }
}

/**
 * Patterns that indicate an authentication error
 */
export const AUTH_ERROR_PATTERNS = [
  /permission denied/i,
  /authentication failed/i,
  /could not read username/i,
  /invalid credentials/i,
  /access denied/i,
  /authorization failed/i,
  /please make sure you have the correct access rights/i,
];

/**
 * Check if an error message indicates an auth error
 */
export function isAuthError(stderr: string): boolean {
  return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(stderr));
}
