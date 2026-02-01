/**
 * GitHub CLI utilities for issue creation and management.
 *
 * Provides functions to interact with GitHub via the `gh` CLI tool,
 * with retry logic for transient errors.
 *
 * @example
 * ```typescript
 * import {
 *   checkGhCli,
 *   createIssue,
 *   searchIssues,
 *   getIssueLabels,
 * } from './github-cli.js';
 *
 * // Check if gh is available and authenticated
 * const status = await checkGhCli();
 * if (!status.ok) {
 *   throw new Error(status.message);
 * }
 *
 * // Create an issue
 * const issue = await createIssue({
 *   title: 'New feature',
 *   body: 'Description...',
 *   labels: ['feature'],
 * });
 * ```
 */

import { execFileSync } from 'node:child_process';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of checking gh CLI availability and authentication.
 */
export interface GhCliCheckResult {
  /** Whether gh is available and authenticated */
  ok: boolean;
  /** Error message if not ok */
  message?: string;
  /** gh version if available */
  version?: string;
  /** Authenticated user if available */
  user?: string;
}

/**
 * Options for creating a GitHub issue.
 */
export interface CreateIssueOptions {
  /** Issue title */
  title: string;
  /** Issue body (markdown) */
  body?: string;
  /** Labels to apply */
  labels?: string[];
  /** Assignees */
  assignees?: string[];
  /** Milestone number */
  milestone?: number;
  /** Project number */
  project?: number;
  /** Working directory */
  cwd?: string;
}

/**
 * Created issue result.
 */
export interface CreatedIssueResult {
  /** Issue number */
  number: number;
  /** Issue URL */
  url: string;
  /** Issue title */
  title: string;
}

/**
 * Options for searching issues.
 */
export interface SearchIssuesOptions {
  /** Search query (GitHub search syntax) */
  query: string;
  /** Maximum results to return */
  maxResults?: number;
  /** Specific repository (owner/repo) */
  repo?: string;
  /** Working directory */
  cwd?: string;
}

/**
 * Search result item.
 */
export interface SearchResultItem {
  /** Issue number */
  number: number;
  /** Issue title */
  title: string;
  /** Issue URL */
  url: string;
  /** Issue state */
  state: 'open' | 'closed';
}

/**
 * Options for gh CLI execution.
 */
interface GhExecOptions {
  /** Working directory */
  cwd?: string;
  /** Maximum retries for transient errors */
  maxRetries?: number;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error codes for GitHub CLI operations.
 */
export type GhCliErrorCode =
  | 'GH_CLI_NOT_FOUND'
  | 'GH_NOT_AUTHENTICATED'
  | 'ISSUE_CREATE_FAILED'
  | 'SEARCH_FAILED'
  | 'LABEL_FETCH_FAILED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * GitHub CLI error.
 */
export class GhCliError extends Error {
  readonly code: GhCliErrorCode;
  readonly command?: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    code: GhCliErrorCode,
    options?: { command?: string; retryable?: boolean }
  ) {
    super(message);
    this.name = 'GhCliError';
    this.code = code;
    this.command = options?.command;
    this.retryable = options?.retryable ?? false;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GhCliError);
    }
  }
}

/**
 * Patterns indicating transient errors that should be retried.
 */
const TRANSIENT_ERROR_PATTERNS = [
  'rate limit',
  'ECONNRESET',
  'ETIMEDOUT',
  'socket hang up',
  'connection refused',
  '502',
  '503',
  '504',
];

/**
 * Check if an error message indicates a transient error.
 */
function isTransientError(message: string): boolean {
  const lower = message.toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Core Execution
// ============================================================================

/**
 * Execute a gh CLI command.
 *
 * @param args - Command arguments
 * @param options - Execution options
 * @returns Command output
 * @throws GhCliError on failure
 */
function ghExec(args: string[], options?: GhExecOptions): string {
  const cwd = options?.cwd ?? process.cwd();

  try {
    return execFileSync('gh', args, {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB
    }).trim();
  } catch (error) {
    const commandStr = `gh ${args.join(' ')}`;

    if (error && typeof error === 'object') {
      const stderr =
        'stderr' in error && typeof error.stderr === 'string'
          ? error.stderr
          : '';
      const message = stderr || String(error);

      // Check for gh not installed
      if (message.includes('ENOENT') || message.includes('not found')) {
        throw new GhCliError(
          'GitHub CLI (gh) not found. Install from: https://cli.github.com/',
          'GH_CLI_NOT_FOUND',
          { command: commandStr, retryable: false }
        );
      }

      // Check for auth errors
      if (
        message.includes('not logged in') ||
        message.includes('auth login') ||
        message.includes('authentication') ||
        message.includes('401')
      ) {
        throw new GhCliError(
          `GitHub CLI not authenticated. Run: gh auth login\n${message}`,
          'GH_NOT_AUTHENTICATED',
          { command: commandStr, retryable: false }
        );
      }

      // Check for rate limiting
      if (message.includes('rate limit')) {
        throw new GhCliError(message, 'RATE_LIMITED', {
          command: commandStr,
          retryable: true,
        });
      }

      // Network errors
      if (isTransientError(message)) {
        throw new GhCliError(message, 'NETWORK_ERROR', {
          command: commandStr,
          retryable: true,
        });
      }

      throw new GhCliError(message, 'UNKNOWN_ERROR', {
        command: commandStr,
        retryable: false,
      });
    }

    throw new GhCliError(String(error), 'UNKNOWN_ERROR', {
      command: commandStr,
      retryable: false,
    });
  }
}

/**
 * Execute with retry logic for transient errors.
 *
 * @param fn - Function to execute
 * @param maxRetries - Maximum retry attempts
 * @returns Function result
 */
async function withRetry<T>(fn: () => T, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (error) {
      if (error instanceof GhCliError) {
        // Don't retry non-retryable errors
        if (!error.retryable || attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s, ... capped at 10s
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(delayMs);
      } else {
        throw error;
      }
    }
  }

  // TypeScript needs this
  throw new Error('Unreachable');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if gh CLI is installed and authenticated.
 *
 * @param cwd - Working directory
 * @returns Check result
 *
 * @example
 * ```typescript
 * const result = await checkGhCli();
 * if (!result.ok) {
 *   console.error(result.message);
 * }
 * ```
 */
export async function checkGhCli(cwd?: string): Promise<GhCliCheckResult> {
  try {
    // Check gh version
    const version = ghExec(['--version'], { cwd });
    const versionMatch = version.match(/gh version (\S+)/);

    // Check authentication
    const authStatus = await withRetry(() =>
      ghExec(['auth', 'status'], { cwd })
    );
    const userMatch = authStatus.match(/Logged in to .+ as (\S+)/);

    return {
      ok: true,
      version: versionMatch?.[1],
      user: userMatch?.[1],
    };
  } catch (error) {
    if (error instanceof GhCliError) {
      return {
        ok: false,
        message: error.message,
      };
    }
    return {
      ok: false,
      message: String(error),
    };
  }
}

/**
 * Create a GitHub issue.
 *
 * @param options - Issue creation options
 * @returns Created issue info
 * @throws GhCliError on failure
 *
 * @example
 * ```typescript
 * const issue = await createIssue({
 *   title: 'Implement feature X',
 *   body: '## Description\n...',
 *   labels: ['feature', 'enhancement'],
 * });
 * console.log(`Created issue #${issue.number}`);
 * ```
 */
export async function createIssue(
  options: CreateIssueOptions
): Promise<CreatedIssueResult> {
  const args = ['issue', 'create', '--title', options.title];

  if (options.body) {
    args.push('--body', options.body);
  }

  if (options.labels && options.labels.length > 0) {
    args.push('--label', options.labels.join(','));
  }

  if (options.assignees && options.assignees.length > 0) {
    args.push('--assignee', options.assignees.join(','));
  }

  if (options.milestone) {
    args.push('--milestone', String(options.milestone));
  }

  if (options.project) {
    args.push('--project', String(options.project));
  }

  try {
    // gh issue create returns the URL of the created issue
    const url = await withRetry(() => ghExec(args, { cwd: options.cwd }));

    // Extract issue number from URL
    const urlMatch = url.match(/\/issues\/(\d+)$/);
    if (!urlMatch?.[1]) {
      throw new GhCliError(
        `Unexpected response from gh issue create: ${url}`,
        'ISSUE_CREATE_FAILED',
        { retryable: false }
      );
    }

    const number = parseInt(urlMatch[1], 10);

    return {
      number,
      url,
      title: options.title,
    };
  } catch (error) {
    if (error instanceof GhCliError) {
      // Re-classify the error if needed
      if (error.code === 'UNKNOWN_ERROR') {
        throw new GhCliError(error.message, 'ISSUE_CREATE_FAILED', {
          command: error.command,
          retryable: error.retryable,
        });
      }
      throw error;
    }
    throw new GhCliError(String(error), 'ISSUE_CREATE_FAILED', {
      retryable: false,
    });
  }
}

/**
 * Search for GitHub issues.
 *
 * @param options - Search options
 * @returns Array of matching issues
 *
 * @example
 * ```typescript
 * const issues = await searchIssues({
 *   query: 'is:open label:bug',
 *   maxResults: 10,
 * });
 * ```
 */
export async function searchIssues(
  options: SearchIssuesOptions
): Promise<SearchResultItem[]> {
  const args = [
    'search',
    'issues',
    '--limit',
    String(options.maxResults ?? 100),
    '--json',
    'number,title,url,state',
  ];

  if (options.repo) {
    args.push('--repo', options.repo);
  }

  args.push('--', options.query);

  try {
    const result = await withRetry(() => ghExec(args, { cwd: options.cwd }));

    if (!result) {
      return [];
    }

    const items: Array<{
      number: number;
      title: string;
      url: string;
      state: string;
    }> = JSON.parse(result);

    return items.map((item) => ({
      number: item.number,
      title: item.title,
      url: item.url,
      state: item.state.toLowerCase() === 'closed' ? 'closed' : 'open',
    }));
  } catch (error) {
    if (error instanceof GhCliError) {
      throw new GhCliError(error.message, 'SEARCH_FAILED', {
        command: error.command,
        retryable: error.retryable,
      });
    }
    throw new GhCliError(String(error), 'SEARCH_FAILED', {
      retryable: false,
    });
  }
}

/**
 * Get labels from a GitHub issue.
 *
 * @param issueNumber - Issue number
 * @param cwd - Working directory
 * @returns Array of label names
 *
 * @example
 * ```typescript
 * const labels = await getIssueLabels(42);
 * if (labels.includes('type:epic')) {
 *   // Handle epic
 * }
 * ```
 */
export async function getIssueLabels(
  issueNumber: number,
  cwd?: string
): Promise<string[]> {
  try {
    const result = await withRetry(() =>
      ghExec(
        ['issue', 'view', String(issueNumber), '--json', 'labels'],
        { cwd }
      )
    );

    const data: { labels: Array<{ name: string }> } = JSON.parse(result);
    return data.labels.map((l) => l.name).filter(Boolean);
  } catch (error) {
    if (error instanceof GhCliError) {
      throw new GhCliError(error.message, 'LABEL_FETCH_FAILED', {
        command: error.command,
        retryable: error.retryable,
      });
    }
    throw new GhCliError(String(error), 'LABEL_FETCH_FAILED', {
      retryable: false,
    });
  }
}

/**
 * Get repository info from current directory.
 *
 * @param cwd - Working directory
 * @returns Repository info (owner/repo)
 */
export async function getRepoInfo(cwd?: string): Promise<{ owner: string; repo: string }> {
  const result = await withRetry(() =>
    ghExec(['repo', 'view', '--json', 'nameWithOwner'], { cwd })
  );

  const data: { nameWithOwner: string } = JSON.parse(result);
  const [owner, repo] = data.nameWithOwner.split('/');

  if (!owner || !repo) {
    throw new GhCliError(
      'Invalid repository format',
      'UNKNOWN_ERROR',
      { retryable: false }
    );
  }

  return { owner, repo };
}

/**
 * Check if an issue already exists with similar title.
 *
 * Useful for duplicate detection.
 *
 * @param title - Title to search for
 * @param cwd - Working directory
 * @returns Existing issue number if found, null otherwise
 */
export async function findExistingIssue(
  title: string,
  cwd?: string
): Promise<number | null> {
  // Escape special characters for GitHub search
  const escapedTitle = title
    .replace(/"/g, '\\"')
    .replace(/[[\](){}]/g, ' ');

  const results = await searchIssues({
    query: `is:issue in:title "${escapedTitle}"`,
    maxResults: 5,
    cwd,
  });

  // Look for exact or near-exact title match
  for (const result of results) {
    // Normalize both titles for comparison
    const normalizedResult = result.title.toLowerCase().trim();
    const normalizedSearch = title.toLowerCase().trim();

    if (normalizedResult === normalizedSearch) {
      return result.number;
    }
  }

  return null;
}
