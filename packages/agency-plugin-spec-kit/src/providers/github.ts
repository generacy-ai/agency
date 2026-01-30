/**
 * GitHub backlog provider implementation.
 *
 * Provides access to GitHub Issues as a ticket/backlog system.
 * Uses the Octokit REST API client for GitHub API interactions.
 *
 * @example
 * ```typescript
 * import { GitHubProvider } from './github.js';
 *
 * const provider = new GitHubProvider(config);
 *
 * // Check authentication
 * const auth = await provider.checkAuth();
 * if (!auth.ok) throw new Error(auth.message);
 *
 * // Fetch a ticket
 * const ticket = await provider.getTicket('#123');
 * ```
 */

import { Octokit } from '@octokit/rest';
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
import { detectTicketRef } from '../utils/detect-ticket-ref.js';

/**
 * Default repository context for resolving local references like #123.
 */
interface RepoContext {
  owner: string;
  repo: string;
}

/**
 * GitHub backlog provider.
 *
 * Implements the BacklogProvider interface for GitHub Issues.
 * Requires GITHUB_TOKEN environment variable for authentication.
 */
export class GitHubProvider implements BacklogProvider {
  readonly name: BacklogProviderName = 'github';

  private readonly octokit: Octokit;
  private readonly config: SpecKitConfig;
  private repoContext: RepoContext | null = null;

  /**
   * Create a new GitHub provider.
   *
   * @param config - SpecKit configuration
   */
  constructor(config: SpecKitConfig) {
    this.config = config;

    const token = process.env['GITHUB_TOKEN'];
    if (!token) {
      // Create unauthenticated client - will fail on private repos
      this.octokit = new Octokit();
    } else {
      this.octokit = new Octokit({ auth: token });
    }
  }

  /**
   * Set the repository context for resolving local references.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   */
  setRepoContext(owner: string, repo: string): void {
    this.repoContext = { owner, repo };
  }

  /**
   * Fetch a ticket by reference string.
   *
   * @param ref - GitHub reference (#123, owner/repo#123, or full URL)
   * @returns Normalized Ticket object
   * @throws NotFoundError if issue doesn't exist
   * @throws AuthError if authentication fails
   */
  async getTicket(ref: string): Promise<Ticket> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new ProviderError(`Invalid GitHub reference: ${ref}`, 'github');
    }

    const { owner, repo, number } = this.resolveRef(parsed);

    try {
      const { data: issue } = await this.octokit.issues.get({
        owner,
        repo,
        issue_number: number,
      });

      return this.mapIssueToTicket(issue, parsed);
    } catch (error) {
      this.handleApiError(error, ref);
      throw error; // TypeScript needs this
    }
  }

  /**
   * Create a new ticket.
   *
   * @param params - Ticket creation parameters
   * @returns Created Ticket object
   * @throws AuthError if authentication fails
   */
  async createTicket(params: TicketCreateParams): Promise<Ticket> {
    const { owner, repo } = this.getRepoContext();

    try {
      const { data: issue } = await this.octokit.issues.create({
        owner,
        repo,
        title: params.title,
        body: params.body,
        labels: params.labels,
      });

      const ref: TicketRef = {
        provider: 'github',
        id: String(issue.number),
        url: issue.html_url,
        raw: `#${issue.number}`,
      };

      return this.mapIssueToTicket(issue, ref);
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Update an existing ticket.
   *
   * @param ref - GitHub reference
   * @param updates - Fields to update
   * @returns Updated Ticket object
   * @throws NotFoundError if issue doesn't exist
   * @throws AuthError if authentication fails
   */
  async updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new ProviderError(`Invalid GitHub reference: ${ref}`, 'github');
    }

    const { owner, repo, number } = this.resolveRef(parsed);

    try {
      const { data: issue } = await this.octokit.issues.update({
        owner,
        repo,
        issue_number: number,
        title: updates.title,
        body: updates.body,
        labels: updates.labels,
      });

      return this.mapIssueToTicket(issue, parsed);
    } catch (error) {
      this.handleApiError(error, ref);
      throw error;
    }
  }

  /**
   * Replace all labels on a ticket.
   *
   * @param ref - GitHub reference
   * @param labels - Labels to set
   */
  async setLabels(ref: string, labels: string[]): Promise<void> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new ProviderError(`Invalid GitHub reference: ${ref}`, 'github');
    }

    const { owner, repo, number } = this.resolveRef(parsed);

    try {
      await this.octokit.issues.setLabels({
        owner,
        repo,
        issue_number: number,
        labels,
      });
    } catch (error) {
      this.handleApiError(error, ref);
    }
  }

  /**
   * Get current labels on a ticket.
   *
   * @param ref - GitHub reference
   * @returns Array of label names
   */
  async getLabels(ref: string): Promise<string[]> {
    const ticket = await this.getTicket(ref);
    return ticket.labels;
  }

  /**
   * Search for tickets matching a query.
   *
   * @param query - GitHub search syntax (e.g., 'is:open label:bug')
   * @returns Array of matching tickets
   */
  async searchTickets(query: string): Promise<Ticket[]> {
    const { owner, repo } = this.getRepoContext();
    const fullQuery = `repo:${owner}/${repo} ${query}`;

    try {
      const { data } = await this.octokit.search.issuesAndPullRequests({
        q: fullQuery,
        per_page: 100,
      });

      return data.items.map((issue) => {
        const ref: TicketRef = {
          provider: 'github',
          id: String(issue.number),
          url: issue.html_url,
          raw: `#${issue.number}`,
        };
        return this.mapIssueToTicket(issue, ref);
      });
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Check if authentication is valid.
   *
   * @returns Authentication check result
   */
  async checkAuth(): Promise<AuthCheckResult> {
    if (!process.env['GITHUB_TOKEN']) {
      return {
        ok: false,
        message:
          'GITHUB_TOKEN environment variable not set. Set it to access private repos and increase rate limits.',
      };
    }

    try {
      await this.octokit.users.getAuthenticated();
      return { ok: true };
    } catch (error) {
      if (error instanceof Error) {
        return {
          ok: false,
          message: `GitHub authentication failed: ${error.message}`,
        };
      }
      return {
        ok: false,
        message: 'GitHub authentication failed: Unknown error',
      };
    }
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
      throw new ProviderError(`Invalid GitHub reference: ${ref}`, 'github');
    }

    if (parsed.url) {
      return parsed.url;
    }

    const { owner, repo, number } = this.resolveRef(parsed);
    return `https://github.com/${owner}/${repo}/issues/${number}`;
  }

  /**
   * Parse user input to a TicketRef.
   *
   * Handles various GitHub input formats:
   * - #123
   * - owner/repo#123
   * - https://github.com/owner/repo/issues/123
   *
   * @param input - User-provided reference string
   * @returns Parsed TicketRef or null if invalid
   */
  parseRef(input: string): TicketRef | null {
    const ref = detectTicketRef(input, 'github');
    if (!ref || ref.provider !== 'github') {
      return null;
    }
    return ref;
  }

  /**
   * Resolve a TicketRef to owner, repo, and issue number.
   */
  private resolveRef(ref: TicketRef): {
    owner: string;
    repo: string;
    number: number;
  } {
    // If URL is present, extract owner/repo from it
    if (ref.url) {
      const match = ref.url.match(
        /github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/
      );
      if (match && match[1] && match[2] && match[3]) {
        return {
          owner: match[1],
          repo: match[2],
          number: parseInt(match[3], 10),
        };
      }
    }

    // Check if raw input has owner/repo
    const shorthandMatch = ref.raw.match(/^([^/]+)\/([^#]+)#(\d+)$/);
    if (shorthandMatch && shorthandMatch[1] && shorthandMatch[2] && shorthandMatch[3]) {
      return {
        owner: shorthandMatch[1],
        repo: shorthandMatch[2],
        number: parseInt(shorthandMatch[3], 10),
      };
    }

    // Fall back to repo context
    const { owner, repo } = this.getRepoContext();
    return {
      owner,
      repo,
      number: parseInt(ref.id, 10),
    };
  }

  /**
   * Get the repository context, throwing if not set.
   */
  private getRepoContext(): RepoContext {
    if (!this.repoContext) {
      throw new ProviderError(
        'Repository context not set. Call setRepoContext(owner, repo) or use full references like owner/repo#123',
        'github'
      );
    }
    return this.repoContext;
  }

  /**
   * Map a GitHub issue to normalized Ticket format.
   */
  private mapIssueToTicket(
    issue: {
      number: number;
      title: string;
      body?: string | null;
      state: string;
      labels: Array<string | { name?: string }>;
      html_url: string;
      assignees?: Array<{ login: string }> | null;
      milestone?: { title: string; number: number } | null;
    },
    ref: TicketRef
  ): Ticket {
    return {
      ref: {
        ...ref,
        id: String(issue.number),
        url: issue.html_url,
      },
      title: issue.title,
      body: issue.body ?? undefined,
      state: this.mapState(issue),
      labels: issue.labels.map((label) =>
        typeof label === 'string' ? label : (label.name ?? '')
      ).filter(Boolean),
      url: issue.html_url,
      meta: {
        assignees:
          issue.assignees?.map((a) => a.login) ?? [],
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
  private mapState(issue: {
    state: string;
    labels: Array<string | { name?: string }>;
  }): TicketState {
    if (issue.state === 'closed') {
      return 'closed';
    }

    // Check for in-progress indicators in labels
    const inProgressLabels = ['in progress', 'in-progress', 'wip', 'agent:in-progress'];
    const labelNames = issue.labels.map((label) =>
      (typeof label === 'string' ? label : (label.name ?? '')).toLowerCase()
    );

    if (labelNames.some((name) => inProgressLabels.includes(name))) {
      return 'in_progress';
    }

    return 'open';
  }

  /**
   * Handle Octokit API errors and convert to provider errors.
   */
  private handleApiError(error: unknown, ref?: string): never {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status;
      const message =
        'message' in error ? String((error as { message: string }).message) : 'Unknown error';

      if (status === 401 || status === 403) {
        throw new AuthError(
          `GitHub authentication failed: ${message}`,
          'github'
        );
      }

      if (status === 404) {
        throw new NotFoundError(
          ref ? `GitHub issue ${ref} not found` : 'GitHub resource not found',
          'github',
          ref
        );
      }

      throw new ProviderError(`GitHub API error (${status}): ${message}`, 'github');
    }

    if (error instanceof Error) {
      throw new ProviderError(`GitHub error: ${error.message}`, 'github');
    }

    throw new ProviderError('Unknown GitHub error', 'github');
  }
}

// Register the provider factory
registerProviderFactory('github', (config) => new GitHubProvider(config));
