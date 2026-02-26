/**
 * GitHub CLI (gh) backlog provider implementation.
 *
 * Provides access to GitHub Issues as a ticket/backlog system using
 * the `gh` CLI tool instead of the Octokit REST API.
 *
 * This implementation offers a simpler authentication experience via
 * `gh auth login` compared to managing GITHUB_TOKEN environment variables.
 *
 * @example
 * ```typescript
 * import { GitHubCliProvider } from './github-cli.js';
 *
 * const provider = new GitHubCliProvider(config);
 *
 * // Check authentication
 * const auth = await provider.checkAuth();
 * if (!auth.ok) throw new Error(auth.message);
 *
 * // Fetch a ticket
 * const ticket = await provider.getTicket('#123');
 * ```
 */

import { execFileSync } from 'node:child_process';
import type { TicketRef } from '../types/ticket.js';
import type {
  BacklogProvider,
  BacklogProviderName,
  Ticket,
  TicketCreateParams,
  TicketUpdates,
  TicketState,
  AuthCheckResult,
} from './types.js';
import { AuthError, NotFoundError, ProviderError } from './errors.js';
import type { SpecKitConfig } from '../config.js';
import { registerProviderFactory } from './registry.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error class for gh CLI operations.
 *
 * Extends ProviderError with optional command context for debugging.
 *
 * @example
 * ```typescript
 * throw new GitHubCliError('Failed to execute gh command', 'gh issue view 123');
 * ```
 */
export class GitHubCliError extends ProviderError {
  /**
   * The gh CLI command that caused the error (for debugging).
   */
  readonly command?: string;

  /**
   * Creates a new GitHubCliError.
   *
   * @param message - Human-readable error message
   * @param command - Optional gh CLI command that failed
   */
  constructor(message: string, command?: string) {
    super(message, 'github');
    this.name = 'GitHubCliError';
    this.command = command;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GitHubCliError);
    }
  }
}

/**
 * Error thrown when gh CLI authentication fails.
 *
 * This typically means the user needs to run `gh auth login`.
 *
 * @example
 * ```typescript
 * throw new GitHubCliAuthError('Not authenticated. Run: gh auth login');
 * ```
 */
export class GitHubCliAuthError extends AuthError {
  /**
   * Creates a new GitHubCliAuthError.
   *
   * @param message - Human-readable error message
   */
  constructor(message: string) {
    super(message, 'github');
    this.name = 'GitHubCliAuthError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GitHubCliAuthError);
    }
  }
}

/**
 * Error thrown when a GitHub resource is not found.
 *
 * @example
 * ```typescript
 * throw new GitHubCliNotFoundError('Issue #123 not found', '#123');
 * ```
 */
export class GitHubCliNotFoundError extends NotFoundError {
  /**
   * Creates a new GitHubCliNotFoundError.
   *
   * @param message - Human-readable error message
   * @param ref - Optional reference that was not found
   */
  constructor(message: string, ref?: string) {
    super(message, 'github', ref);
    this.name = 'GitHubCliNotFoundError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GitHubCliNotFoundError);
    }
  }
}

// ============================================================================
// Internal Interfaces
// ============================================================================

/**
 * Repository context for resolving local references like #123.
 */
interface RepoContext {
  owner: string;
  repo: string;
}

/**
 * Options for gh CLI execution.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface GhExecOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Maximum retry attempts for transient errors */
  maxRetries?: number;
}

/**
 * JSON response from `gh issue view --json ...`.
 */
interface GitHubIssueJson {
  number: number;
  title: string;
  body: string | null;
  state: 'OPEN' | 'CLOSED';
  labels: Array<{ name: string }>;
  url: string;
  assignees: Array<{ login: string }>;
  milestone: { title: string; number: number } | null;
}

/**
 * JSON response from `gh repo view --json nameWithOwner`.
 */
interface GitHubRepoJson {
  nameWithOwner: string;
}

/**
 * JSON response from `gh search issues --json ...`.
 */
interface GitHubSearchResultJson {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: Array<{ name: string }>;
  url: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Known transient error patterns that warrant retry.
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
 * Check if an error message indicates a transient/retryable error.
 *
 * @param message - Error message to check
 * @returns True if the error appears transient
 */
function isTransientError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((pattern) =>
    lowerMessage.includes(pattern.toLowerCase())
  );
}

/**
 * Sleep for a specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a gh CLI command safely using execFileSync.
 *
 * Uses execFileSync instead of execSync to avoid shell injection.
 *
 * @param args - Command arguments (passed to gh)
 * @param cwd - Optional working directory
 * @returns Command output as trimmed string
 * @throws GitHubCliError on command failure
 * @throws GitHubCliAuthError on authentication failure
 * @throws GitHubCliNotFoundError on 404-like errors
 */
function ghExec(args: string[], cwd?: string): string {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf-8',
      cwd: cwd ?? process.cwd(),
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

      // Check for auth errors
      if (
        message.includes('not logged in') ||
        message.includes('auth login') ||
        message.includes('authentication') ||
        message.includes('401')
      ) {
        throw new GitHubCliAuthError(
          `GitHub CLI authentication failed. Run: gh auth login\n${message}`
        );
      }

      // Check for not found errors
      if (
        message.includes('not found') ||
        message.includes('404') ||
        message.includes('Could not resolve')
      ) {
        throw new GitHubCliNotFoundError(message);
      }

      throw new GitHubCliError(message, commandStr);
    }

    throw new GitHubCliError(String(error), commandStr);
  }
}

/**
 * Execute a function with exponential backoff retry for transient errors.
 *
 * @param fn - Function to execute
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Function result
 * @throws Original error if not transient or max retries exceeded
 */
async function withRetry<T>(fn: () => T, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Don't retry auth or not-found errors
      if (
        error instanceof GitHubCliAuthError ||
        error instanceof GitHubCliNotFoundError
      ) {
        throw error;
      }

      // Check if error is transient and we have retries left
      if (!isTransientError(message) || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s, ... capped at 10s
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      await sleep(delayMs);
    }
  }

  // TypeScript needs this unreachable statement
  throw new Error('Unreachable');
}

// ============================================================================
// GitHubCliProvider Class
// ============================================================================

/**
 * GitHub backlog provider using the gh CLI.
 *
 * Implements the BacklogProvider interface for GitHub Issues using
 * the gh CLI tool. Requires gh to be installed and authenticated
 * via `gh auth login`.
 *
 * Advantages over Octokit-based GitHubProvider:
 * - Simpler authentication (browser-based via gh auth login)
 * - Automatic credential management via system keychain
 * - Built-in rate limiting feedback
 *
 * @example
 * ```typescript
 * const provider = new GitHubCliProvider(config);
 *
 * // Auto-detects repo from git remote
 * const ticket = await provider.getTicket('#123');
 *
 * // Create a new issue
 * const newTicket = await provider.createTicket({
 *   title: 'New feature request',
 *   body: 'Description here',
 *   labels: ['feature'],
 * });
 * ```
 */
export class GitHubCliProvider implements BacklogProvider {
  readonly name: BacklogProviderName = 'github';

  private readonly config: SpecKitConfig;
  private repoContext: RepoContext | null = null;

  /**
   * Create a new GitHub CLI provider.
   *
   * @param config - SpecKit configuration
   */
  constructor(config: SpecKitConfig) {
    this.config = config;
  }

  /**
   * Auto-detect repository context from the current git directory.
   *
   * Uses `gh repo view --json nameWithOwner` to determine the owner/repo.
   * Results are cached for subsequent calls.
   *
   * @returns Repository context with owner and repo
   * @throws GitHubCliError if not in a git repo with GitHub remote
   */
  private async ensureRepoContext(): Promise<RepoContext> {
    if (this.repoContext) {
      return this.repoContext;
    }

    try {
      const result = await withRetry(() =>
        ghExec(['repo', 'view', '--json', 'nameWithOwner'])
      );
      const data: GitHubRepoJson = JSON.parse(result);
      const [owner, repo] = data.nameWithOwner.split('/');

      if (!owner || !repo) {
        throw new GitHubCliError(
          'Invalid repository format returned from gh repo view'
        );
      }

      this.repoContext = { owner, repo };
      return this.repoContext;
    } catch (error) {
      if (
        error instanceof GitHubCliError ||
        error instanceof GitHubCliAuthError
      ) {
        throw error;
      }
      throw new GitHubCliError(
        'Failed to detect repository context. Ensure you are in a git repository with a GitHub remote.',
        'gh repo view'
      );
    }
  }

  /**
   * Set the repository context manually.
   *
   * Use this to override auto-detection or when working outside a git repo.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   */
  setRepoContext(owner: string, repo: string): void {
    this.repoContext = { owner, repo };
  }

  // ==========================================================================
  // Ref Parsing and URL Generation
  // ==========================================================================

  /**
   * Parse user input to a TicketRef.
   *
   * Handles various GitHub input formats:
   * - `#123` - Local issue number
   * - `123` - Plain issue number
   * - `owner/repo#123` - Cross-repo reference
   * - `https://github.com/owner/repo/issues/123` - Full URL
   *
   * @param input - User-provided reference string
   * @returns Parsed TicketRef or null if invalid for this provider
   */
  parseRef(input: string): TicketRef | null {
    const trimmed = input.trim();

    // Match full GitHub URL
    const urlMatch = trimmed.match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/
    );
    if (urlMatch && urlMatch[1] && urlMatch[2] && urlMatch[3]) {
      return {
        provider: 'github',
        id: urlMatch[3],
        url: trimmed,
        raw: trimmed,
      };
    }

    // Match owner/repo#123 format
    const crossRepoMatch = trimmed.match(/^([^/]+)\/([^#]+)#(\d+)$/);
    if (crossRepoMatch && crossRepoMatch[1] && crossRepoMatch[2] && crossRepoMatch[3]) {
      const owner = crossRepoMatch[1];
      const repo = crossRepoMatch[2];
      const num = crossRepoMatch[3];
      return {
        provider: 'github',
        id: num,
        url: `https://github.com/${owner}/${repo}/issues/${num}`,
        raw: trimmed,
      };
    }

    // Match #123 format
    const hashMatch = trimmed.match(/^#(\d+)$/);
    if (hashMatch && hashMatch[1]) {
      return {
        provider: 'github',
        id: hashMatch[1],
        raw: trimmed,
      };
    }

    // Match plain number
    const plainMatch = trimmed.match(/^(\d+)$/);
    if (plainMatch && plainMatch[1]) {
      return {
        provider: 'github',
        id: plainMatch[1],
        raw: trimmed,
      };
    }

    // Not a valid GitHub reference
    return null;
  }

  /**
   * Generate the web URL for a ticket.
   *
   * @param ref - GitHub reference
   * @returns Full URL to view the issue
   */
  getTicketUrl(ref: string): string {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new GitHubCliError(`Invalid GitHub reference: ${ref}`);
    }

    // If URL is already present, return it
    if (parsed.url) {
      return parsed.url;
    }

    // Need repo context for local refs
    if (!this.repoContext) {
      throw new GitHubCliError(
        'Repository context not set. Call setRepoContext(owner, repo) or use full references like owner/repo#123'
      );
    }

    return `https://github.com/${this.repoContext.owner}/${this.repoContext.repo}/issues/${parsed.id}`;
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  /**
   * Check if gh CLI authentication is valid.
   *
   * Uses `gh auth status` to verify the user is logged in.
   *
   * @returns Authentication check result
   */
  async checkAuth(): Promise<AuthCheckResult> {
    try {
      await withRetry(() => ghExec(['auth', 'status']));
      return { ok: true };
    } catch (error) {
      if (error instanceof GitHubCliAuthError) {
        return {
          ok: false,
          message: error.message,
        };
      }
      if (error instanceof Error) {
        return {
          ok: false,
          message: `GitHub CLI authentication check failed: ${error.message}`,
        };
      }
      return {
        ok: false,
        message: 'GitHub CLI authentication check failed: Unknown error',
      };
    }
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Fetch a ticket by reference string.
   *
   * @param ref - GitHub reference (#123, owner/repo#123, or full URL)
   * @returns Normalized Ticket object
   * @throws GitHubCliNotFoundError if issue doesn't exist
   * @throws GitHubCliAuthError if authentication fails
   */
  async getTicket(ref: string): Promise<Ticket> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new GitHubCliError(`Invalid GitHub reference: ${ref}`);
    }

    // Resolve repo context if needed
    let repoArg: string[] = [];
    if (parsed.url) {
      // Extract owner/repo from URL
      const urlMatch = parsed.url.match(
        /github\.com\/([^/]+)\/([^/]+)\/issues/
      );
      if (urlMatch && urlMatch[1] && urlMatch[2]) {
        repoArg = ['--repo', `${urlMatch[1]}/${urlMatch[2]}`];
      }
    } else if (parsed.raw.includes('/')) {
      // Cross-repo reference like owner/repo#123
      const crossRepoMatch = parsed.raw.match(/^([^/]+)\/([^#]+)#/);
      if (crossRepoMatch && crossRepoMatch[1] && crossRepoMatch[2]) {
        repoArg = ['--repo', `${crossRepoMatch[1]}/${crossRepoMatch[2]}`];
      }
    }

    const jsonFields = 'number,title,body,state,labels,url,assignees,milestone';

    try {
      const result = await withRetry(() =>
        ghExec([
          'issue',
          'view',
          parsed.id,
          '--json',
          jsonFields,
          ...repoArg,
        ])
      );

      const issue: GitHubIssueJson = JSON.parse(result);
      return this.mapIssueToTicket(issue, parsed);
    } catch (error) {
      if (error instanceof GitHubCliNotFoundError) {
        throw new GitHubCliNotFoundError(`Issue ${ref} not found`, ref);
      }
      throw error;
    }
  }

  /**
   * Create a new ticket.
   *
   * @param params - Ticket creation parameters
   * @returns Created Ticket object
   * @throws GitHubCliAuthError if authentication fails
   */
  async createTicket(params: TicketCreateParams): Promise<Ticket> {
    await this.ensureRepoContext();

    const args = ['issue', 'create', '--title', params.title];

    if (params.body) {
      args.push('--body', params.body);
    }

    if (params.labels && params.labels.length > 0) {
      args.push('--label', params.labels.join(','));
    }

    try {
      // gh issue create returns the URL of the created issue
      const url = await withRetry(() => ghExec(args));

      // Extract issue number from URL
      const urlMatch = url.match(/\/issues\/(\d+)$/);
      if (!urlMatch || !urlMatch[1]) {
        throw new GitHubCliError(
          `Unexpected response from gh issue create: ${url}`
        );
      }

      const issueNumber = urlMatch[1];

      // Fetch the created issue to return full ticket data
      return this.getTicket(issueNumber);
    } catch (error) {
      if (
        error instanceof GitHubCliError ||
        error instanceof GitHubCliAuthError
      ) {
        throw error;
      }
      throw new GitHubCliError(
        `Failed to create ticket: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update an existing ticket.
   *
   * @param ref - GitHub reference
   * @param updates - Fields to update
   * @returns Updated Ticket object
   * @throws GitHubCliNotFoundError if issue doesn't exist
   * @throws GitHubCliAuthError if authentication fails
   */
  async updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new GitHubCliError(`Invalid GitHub reference: ${ref}`);
    }

    const args = ['issue', 'edit', parsed.id];

    // Build repo arg if needed
    if (parsed.url) {
      const urlMatch = parsed.url.match(
        /github\.com\/([^/]+)\/([^/]+)\/issues/
      );
      if (urlMatch && urlMatch[1] && urlMatch[2]) {
        args.push('--repo', `${urlMatch[1]}/${urlMatch[2]}`);
      }
    }

    if (updates.title !== undefined) {
      args.push('--title', updates.title);
    }

    if (updates.body !== undefined) {
      args.push('--body', updates.body);
    }

    // Note: labels via updateTicket replaces all labels
    if (updates.labels !== undefined) {
      // gh issue edit doesn't have a direct "set labels" option
      // We need to use --add-label and --remove-label
      // For simplicity, we'll set labels via a separate setLabels call
      // if the caller wants to update labels
    }

    try {
      await withRetry(() => ghExec(args));

      // If labels need updating, do that separately
      if (updates.labels !== undefined) {
        await this.setLabels(ref, updates.labels);
      }

      // Fetch the updated issue to return full ticket data
      return this.getTicket(ref);
    } catch (error) {
      if (
        error instanceof GitHubCliNotFoundError ||
        error instanceof GitHubCliAuthError ||
        error instanceof GitHubCliError
      ) {
        throw error;
      }
      throw new GitHubCliError(
        `Failed to update ticket: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ==========================================================================
  // Label Operations
  // ==========================================================================

  /**
   * Get current labels on a ticket.
   *
   * @param ref - GitHub reference
   * @returns Array of label names
   * @throws GitHubCliNotFoundError if issue doesn't exist
   */
  async getLabels(ref: string): Promise<string[]> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new GitHubCliError(`Invalid GitHub reference: ${ref}`);
    }

    let repoArg: string[] = [];
    if (parsed.url) {
      const urlMatch = parsed.url.match(
        /github\.com\/([^/]+)\/([^/]+)\/issues/
      );
      if (urlMatch && urlMatch[1] && urlMatch[2]) {
        repoArg = ['--repo', `${urlMatch[1]}/${urlMatch[2]}`];
      }
    }

    try {
      const result = await withRetry(() =>
        ghExec(['issue', 'view', parsed.id, '--json', 'labels', ...repoArg])
      );

      const data: { labels: Array<{ name: string }> } = JSON.parse(result);
      return data.labels.map((label) => label.name).filter(Boolean);
    } catch (error) {
      if (error instanceof GitHubCliNotFoundError) {
        throw new GitHubCliNotFoundError(`Issue ${ref} not found`, ref);
      }
      throw error;
    }
  }

  /**
   * Replace all labels on a ticket.
   *
   * This implementation calculates the diff between current and desired labels,
   * then uses --add-label and --remove-label to apply the changes.
   *
   * @param ref - GitHub reference
   * @param labels - Labels to set (replaces all existing labels)
   * @throws GitHubCliNotFoundError if issue doesn't exist
   * @throws GitHubCliAuthError if authentication fails
   */
  async setLabels(ref: string, labels: string[]): Promise<void> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new GitHubCliError(`Invalid GitHub reference: ${ref}`);
    }

    // Get current labels
    const currentLabels = await this.getLabels(ref);

    // Calculate diff
    const labelsToAdd = labels.filter(
      (label) => !currentLabels.includes(label)
    );
    const labelsToRemove = currentLabels.filter(
      (label) => !labels.includes(label)
    );

    // If no changes needed, return early
    if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
      return;
    }

    const args = ['issue', 'edit', parsed.id];

    // Build repo arg if needed
    if (parsed.url) {
      const urlMatch = parsed.url.match(
        /github\.com\/([^/]+)\/([^/]+)\/issues/
      );
      if (urlMatch && urlMatch[1] && urlMatch[2]) {
        args.push('--repo', `${urlMatch[1]}/${urlMatch[2]}`);
      }
    }

    // Add labels to add
    for (const label of labelsToAdd) {
      args.push('--add-label', label);
    }

    // Add labels to remove
    for (const label of labelsToRemove) {
      args.push('--remove-label', label);
    }

    try {
      await withRetry(() => ghExec(args));
    } catch (error) {
      if (
        error instanceof GitHubCliNotFoundError ||
        error instanceof GitHubCliAuthError ||
        error instanceof GitHubCliError
      ) {
        throw error;
      }
      throw new GitHubCliError(
        `Failed to set labels: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ==========================================================================
  // Search (Optional)
  // ==========================================================================

  /**
   * Search for tickets matching a query.
   *
   * Uses `gh search issues` with GitHub search syntax.
   *
   * @param query - GitHub search syntax (e.g., 'is:open label:bug')
   * @returns Array of matching tickets
   * @throws GitHubCliAuthError if authentication fails
   */
  async searchTickets(query: string): Promise<Ticket[]> {
    const { owner, repo } = await this.ensureRepoContext();

    const jsonFields = 'number,title,body,state,labels,url';

    try {
      const result = await withRetry(() =>
        ghExec([
          'search',
          'issues',
          '--repo',
          `${owner}/${repo}`,
          '--limit',
          '100',
          '--json',
          jsonFields,
          '--',
          query,
        ])
      );

      const issues: GitHubSearchResultJson[] = JSON.parse(result);

      return issues.map((issue) => {
        const ticketRef: TicketRef = {
          provider: 'github',
          id: String(issue.number),
          url: issue.url,
          raw: `#${issue.number}`,
        };

        return {
          ref: ticketRef,
          title: issue.title,
          body: issue.body || undefined,
          state: this.mapSearchState(issue.state),
          labels: issue.labels.map((l) => l.name).filter(Boolean),
          url: issue.url,
        };
      });
    } catch (error) {
      if (
        error instanceof GitHubCliAuthError ||
        error instanceof GitHubCliError
      ) {
        throw error;
      }
      throw new GitHubCliError(
        `Failed to search tickets: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Map a GitHub issue JSON response to normalized Ticket format.
   */
  private mapIssueToTicket(issue: GitHubIssueJson, ref: TicketRef): Ticket {
    return {
      ref: {
        ...ref,
        id: String(issue.number),
        url: issue.url,
      },
      title: issue.title,
      body: issue.body ?? undefined,
      state: this.mapState(issue),
      labels: issue.labels.map((label) => label.name).filter(Boolean),
      url: issue.url,
      meta: {
        assignees: issue.assignees.map((a) => a.login),
        milestone: issue.milestone
          ? {
              title: issue.milestone.title,
              number: issue.milestone.number,
            }
          : undefined,
      },
    };
  }

  /**
   * Map GitHub issue state to normalized TicketState.
   */
  private mapState(issue: GitHubIssueJson): TicketState {
    if (issue.state === 'CLOSED') {
      return 'closed';
    }

    // Check for in-progress indicators in labels
    const inProgressLabels = [
      'in progress',
      'in-progress',
      'wip',
      'agent:in-progress',
    ];
    const labelNames = issue.labels.map((label) => label.name.toLowerCase());

    if (labelNames.some((name) => inProgressLabels.includes(name))) {
      return 'in_progress';
    }

    return 'open';
  }

  /**
   * Map search result state string to TicketState.
   */
  private mapSearchState(state: string): TicketState {
    if (state.toLowerCase() === 'closed') {
      return 'closed';
    }
    return 'open';
  }
}

// Register the provider factory
// Note: Using 'github' as the name to make it an alternative to the Octokit provider
// Users can select which implementation to use via configuration
registerProviderFactory('github', (config) => new GitHubCliProvider(config));
