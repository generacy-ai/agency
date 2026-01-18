/**
 * Network error for remote connection failures
 */
import { GitError } from './git-error.js';

export class NetworkError extends GitError {
  readonly type = 'network' as const;

  /** Remote that failed */
  readonly remote?: string;

  constructor(
    message: string,
    options: {
      command: string;
      exitCode: number;
      stderr: string;
      cwd: string;
      remote?: string;
    }
  ) {
    super(message, options);
    this.name = 'NetworkError';
    this.remote = options.remote;
  }

  override toSafeMessage(): string {
    if (this.remote) {
      return `Network error connecting to remote '${this.remote}'`;
    }
    return 'Network error. Please check your connection.';
  }
}

/**
 * Patterns that indicate a network error
 */
export const NETWORK_ERROR_PATTERNS = [
  /could not resolve host/i,
  /connection refused/i,
  /connection timed out/i,
  /network is unreachable/i,
  /unable to access/i,
  /couldn't connect to server/i,
  /failed to connect/i,
  /no route to host/i,
  /connection reset/i,
  /ssl.*error/i,
];

/**
 * Check if an error message indicates a network error
 */
export function isNetworkError(stderr: string): boolean {
  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(stderr));
}

/**
 * Extract remote name from error message if present
 */
export function extractRemote(stderr: string): string | undefined {
  // Try to extract remote from common git error formats
  const patterns = [
    /fatal: unable to access '([^']+)'/,
    /fatal: repository '([^']+)' not found/,
    /remote: ([^\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = stderr.match(pattern);
    if (match?.[1]) {
      // Try to extract host from URL
      try {
        const url = new URL(match[1]);
        return url.hostname;
      } catch {
        return match[1];
      }
    }
  }

  return undefined;
}
