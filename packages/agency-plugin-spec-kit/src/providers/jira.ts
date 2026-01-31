/**
 * Jira backlog provider implementation.
 *
 * Provides access to Jira Cloud as a ticket/backlog system.
 * Uses Jira REST API v3 for all operations.
 *
 * @example
 * ```typescript
 * import { JiraProvider } from './jira.js';
 *
 * const provider = new JiraProvider(config);
 *
 * // Check authentication
 * const auth = await provider.checkAuth();
 * if (!auth.ok) throw new Error(auth.message);
 *
 * // Fetch a ticket
 * const ticket = await provider.getTicket('PROJ-123');
 * ```
 */

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
 * Jira API response for an issue.
 */
interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description: JiraAdfDocument | null;
    status: {
      name: string;
      statusCategory: {
        key: string;
        name: string;
      };
    };
    labels: string[];
    issuetype: {
      name: string;
      id: string;
    };
    priority?: {
      name: string;
      id: string;
    } | null;
    assignee?: {
      displayName: string;
      accountId: string;
    } | null;
  };
}

/**
 * Atlassian Document Format (ADF) document structure.
 */
interface JiraAdfDocument {
  type: 'doc';
  version: 1;
  content: JiraAdfNode[];
}

/**
 * ADF node structure.
 */
interface JiraAdfNode {
  type: string;
  content?: JiraAdfNode[];
  text?: string;
}

/**
 * Jira current user API response.
 */
interface JiraCurrentUser {
  self: string;
  accountId: string;
  displayName: string;
  emailAddress: string;
  active: boolean;
}

/**
 * Jira error response structure.
 */
interface JiraErrorResponse {
  errorMessages: string[];
  errors: Record<string, string>;
}

/**
 * Map Jira status to normalized TicketState using keyword-based matching.
 *
 * @param status - Jira status name
 * @returns Normalized TicketState
 */
function mapJiraStatusToTicketState(status: string): TicketState {
  const lower = status.toLowerCase();

  // Closed states
  if (/done|closed|resolved|complete/i.test(lower)) {
    return 'closed';
  }

  // In-progress states
  if (/progress|review|testing|qa|dev/i.test(lower)) {
    return 'in_progress';
  }

  // Default to open
  return 'open';
}

/**
 * Extract plain text from Atlassian Document Format (ADF).
 *
 * @param adf - ADF document or null
 * @returns Plain text content
 */
function adfToPlainText(adf: JiraAdfDocument | null): string {
  if (!adf || !adf.content) {
    return '';
  }

  function extractText(nodes: JiraAdfNode[]): string {
    return nodes
      .map((node) => {
        if (node.text) {
          return node.text;
        }
        if (node.content) {
          return extractText(node.content);
        }
        return '';
      })
      .join('');
  }

  return adf.content
    .map((block) => {
      if (block.content) {
        return extractText(block.content);
      }
      return '';
    })
    .join('\n')
    .trim();
}

/**
 * Convert plain text to simple ADF document.
 *
 * @param text - Plain text content
 * @returns ADF document
 */
function textToAdf(text: string): JiraAdfDocument {
  const paragraphs = text.split('\n\n').filter((p) => p.trim());

  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: paragraph,
        },
      ],
    })),
  };
}

/**
 * Jira backlog provider.
 *
 * Implements the BacklogProvider interface for Jira Cloud.
 * Requires JIRA_EMAIL and JIRA_API_TOKEN environment variables for authentication.
 */
export class JiraProvider implements BacklogProvider {
  readonly name: BacklogProviderName = 'jira';

  private readonly config: SpecKitConfig;
  private readonly baseUrl: string;
  private readonly projectKey: string;
  private readonly auth: { email: string; apiToken: string } | null;

  /**
   * Create a new Jira provider.
   *
   * @param config - SpecKit configuration
   */
  constructor(config: SpecKitConfig) {
    this.config = config;

    // Extract Jira config
    const jiraConfig = config.backlog.jira;
    if (!jiraConfig) {
      throw new ProviderError(
        'Jira configuration missing. Set backlog.jira.baseUrl and backlog.jira.projectKey in config.',
        'jira'
      );
    }

    this.baseUrl = jiraConfig.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.projectKey = jiraConfig.projectKey;

    // Get auth credentials from config or environment
    const email = jiraConfig.email || process.env['JIRA_EMAIL'];
    const apiToken = jiraConfig.apiToken || process.env['JIRA_API_TOKEN'];

    if (email && apiToken) {
      this.auth = { email, apiToken };
    } else {
      this.auth = null;
    }
  }

  /**
   * Make an authenticated request to the Jira API.
   *
   * @param endpoint - API endpoint (without base URL)
   * @param options - Fetch options
   * @returns Response data
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.auth) {
      throw new AuthError(
        'Jira authentication not configured. Set JIRA_EMAIL and JIRA_API_TOKEN environment variables, or configure email and apiToken in config.',
        'jira'
      );
    }

    const url = `${this.baseUrl}/rest/api/3${endpoint}`;
    const authString = Buffer.from(
      `${this.auth.email}:${this.auth.apiToken}`
    ).toString('base64');

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Basic ${authString}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      await this.handleApiError(response, endpoint);
    }

    // Handle empty responses (e.g., 204 No Content)
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  /**
   * Handle Jira API errors and convert to provider errors.
   */
  private async handleApiError(response: Response, ref?: string): Promise<never> {
    const status = response.status;
    let message = `HTTP ${status}`;

    try {
      const errorData = (await response.json()) as JiraErrorResponse;
      if (errorData.errorMessages && errorData.errorMessages.length > 0) {
        message = errorData.errorMessages.join(', ');
      } else if (errorData.errors && Object.keys(errorData.errors).length > 0) {
        message = Object.values(errorData.errors).join(', ');
      }
    } catch {
      // Ignore JSON parse errors
    }

    if (status === 401) {
      throw new AuthError(
        `Jira authentication failed: ${message}`,
        'jira'
      );
    }

    if (status === 403) {
      throw new AuthError(
        `Jira access denied: ${message}`,
        'jira'
      );
    }

    if (status === 404) {
      throw new NotFoundError(
        ref ? `Jira issue ${ref} not found` : 'Jira resource not found',
        'jira',
        ref
      );
    }

    throw new ProviderError(`Jira API error (${status}): ${message}`, 'jira');
  }

  /**
   * Map a Jira issue to normalized Ticket format.
   */
  private mapJiraIssueToTicket(issue: JiraIssue, ref: TicketRef): Ticket {
    return {
      ref: {
        ...ref,
        id: issue.key,
        url: `${this.baseUrl}/browse/${issue.key}`,
      },
      title: issue.fields.summary,
      body: adfToPlainText(issue.fields.description),
      state: mapJiraStatusToTicketState(issue.fields.status.name),
      labels: issue.fields.labels || [],
      url: `${this.baseUrl}/browse/${issue.key}`,
      meta: {
        issueType: issue.fields.issuetype.name,
        priority: issue.fields.priority?.name,
        assignee: issue.fields.assignee?.displayName,
        jiraStatus: issue.fields.status.name,
      },
    };
  }

  /**
   * Check if authentication is valid.
   *
   * @returns Authentication check result
   */
  async checkAuth(): Promise<AuthCheckResult> {
    if (!this.auth) {
      return {
        ok: false,
        message:
          'Jira authentication not configured. Set JIRA_EMAIL and JIRA_API_TOKEN environment variables.',
      };
    }

    try {
      await this.request<JiraCurrentUser>('/myself');
      return { ok: true };
    } catch (error) {
      if (error instanceof Error) {
        return {
          ok: false,
          message: `Jira authentication failed: ${error.message}`,
        };
      }
      return {
        ok: false,
        message: 'Jira authentication failed: Unknown error',
      };
    }
  }

  /**
   * Parse user input to a TicketRef.
   *
   * Handles various Jira input formats:
   * - PROJ-123
   * - https://company.atlassian.net/browse/PROJ-123
   *
   * @param input - User-provided reference string
   * @returns Parsed TicketRef or null if invalid
   */
  parseRef(input: string): TicketRef | null {
    const ref = detectTicketRef(input, 'jira');
    if (!ref || ref.provider !== 'jira') {
      return null;
    }

    // Validate that the project key matches our configured project
    const issueKey = ref.id;
    const projectPrefix = issueKey.split('-')[0];
    if (projectPrefix !== this.projectKey) {
      return null;
    }

    return ref;
  }

  /**
   * Generate the web URL for a ticket.
   *
   * @param ref - Jira reference (e.g., PROJ-123)
   * @returns Full URL to view the issue in Jira
   */
  getTicketUrl(ref: string): string {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      // Fallback: construct URL from raw ref
      return `${this.baseUrl}/browse/${ref}`;
    }
    return `${this.baseUrl}/browse/${parsed.id}`;
  }

  /**
   * Fetch a ticket by reference string.
   *
   * @param ref - Jira reference (PROJ-123 or full URL)
   * @returns Normalized Ticket object
   * @throws NotFoundError if issue doesn't exist
   * @throws AuthError if authentication fails
   */
  async getTicket(ref: string): Promise<Ticket> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new ProviderError(`Invalid Jira reference: ${ref}`, 'jira');
    }

    const issue = await this.request<JiraIssue>(`/issue/${parsed.id}`);
    return this.mapJiraIssueToTicket(issue, parsed);
  }

  /**
   * Create a new ticket.
   *
   * @param params - Ticket creation parameters
   * @returns Created Ticket object
   * @throws AuthError if authentication fails
   */
  async createTicket(params: TicketCreateParams): Promise<Ticket> {
    const body: {
      fields: {
        project: { key: string };
        summary: string;
        description?: JiraAdfDocument;
        issuetype: { name: string };
        labels?: string[];
      };
    } = {
      fields: {
        project: { key: this.projectKey },
        summary: params.title,
        issuetype: { name: 'Story' }, // Default to Story per spec
      },
    };

    if (params.body) {
      body.fields.description = textToAdf(params.body);
    }

    if (params.labels && params.labels.length > 0) {
      body.fields.labels = params.labels;
    }

    const response = await this.request<{ id: string; key: string; self: string }>(
      '/issue',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    // Fetch the created issue to get full details
    return this.getTicket(response.key);
  }

  /**
   * Update an existing ticket.
   *
   * @param ref - Jira reference
   * @param updates - Fields to update
   * @returns Updated Ticket object
   * @throws NotFoundError if issue doesn't exist
   * @throws AuthError if authentication fails
   */
  async updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new ProviderError(`Invalid Jira reference: ${ref}`, 'jira');
    }

    const body: {
      fields: {
        summary?: string;
        description?: JiraAdfDocument;
        labels?: string[];
      };
    } = { fields: {} };

    if (updates.title !== undefined) {
      body.fields.summary = updates.title;
    }

    if (updates.body !== undefined) {
      body.fields.description = textToAdf(updates.body);
    }

    if (updates.labels !== undefined) {
      body.fields.labels = updates.labels;
    }

    await this.request<void>(`/issue/${parsed.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    // Fetch the updated issue to get full details
    return this.getTicket(ref);
  }

  /**
   * Replace all labels on a ticket.
   *
   * @param ref - Jira reference
   * @param labels - Labels to set
   */
  async setLabels(ref: string, labels: string[]): Promise<void> {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new ProviderError(`Invalid Jira reference: ${ref}`, 'jira');
    }

    await this.request<void>(`/issue/${parsed.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        fields: {
          labels,
        },
      }),
    });
  }

  /**
   * Get current labels on a ticket.
   *
   * @param ref - Jira reference
   * @returns Array of label names
   */
  async getLabels(ref: string): Promise<string[]> {
    const ticket = await this.getTicket(ref);
    return ticket.labels;
  }
}

// Register the provider factory
registerProviderFactory('jira', (config) => new JiraProvider(config));
