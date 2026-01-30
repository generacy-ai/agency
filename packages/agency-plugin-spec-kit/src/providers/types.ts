/**
 * BacklogProvider interface and supporting types.
 *
 * This module defines the core abstraction for backlog system integrations,
 * enabling provider-agnostic ticket operations across GitHub, Jira, Shortcut,
 * and local providers.
 *
 * @example
 * ```typescript
 * import type { BacklogProvider, Ticket, TicketCreateParams } from './types.js';
 *
 * class GitHubProvider implements BacklogProvider {
 *   readonly name = 'github';
 *   // ... implement required methods
 * }
 * ```
 */

import type { TicketRef } from '../types/ticket.js';

/**
 * Known backlog provider types.
 *
 * These are the providers that have first-class support.
 * Use string literal union for type-safe provider discrimination.
 */
export type BacklogProviderName = 'github' | 'jira' | 'shortcut' | 'local';

/**
 * Ticket state representing the current lifecycle status.
 *
 * - `open`: Ticket is active and needs work
 * - `closed`: Ticket is completed or resolved
 * - `in_progress`: Ticket is currently being worked on
 */
export type TicketState = 'open' | 'closed' | 'in_progress';

/**
 * Parameters for creating a new ticket.
 *
 * Contains the minimal required fields plus optional metadata
 * that all providers should support.
 *
 * @example
 * ```typescript
 * const params: TicketCreateParams = {
 *   title: 'Add user authentication',
 *   body: '## Description\nImplement OAuth2 login flow...',
 *   labels: ['feature', 'auth'],
 * };
 * ```
 */
export interface TicketCreateParams {
  /**
   * Ticket title (required).
   * Should be concise and descriptive.
   */
  title: string;

  /**
   * Ticket description/body (optional).
   * May contain markdown formatting.
   */
  body?: string;

  /**
   * Initial labels to apply (optional).
   * Labels are strings that providers map to their internal representation.
   */
  labels?: string[];
}

/**
 * Parameters for updating an existing ticket.
 *
 * All fields are optional - only specified fields will be updated.
 * This is a partial version of TicketCreateParams.
 *
 * @example
 * ```typescript
 * // Update just the title
 * const updates: TicketUpdates = { title: 'New title' };
 *
 * // Update labels only
 * const updates: TicketUpdates = { labels: ['done', 'v1.0'] };
 * ```
 */
export type TicketUpdates = Partial<TicketCreateParams>;

/**
 * Represents a ticket/issue in any backlog system.
 *
 * This is the normalized representation returned by all providers,
 * providing a consistent interface regardless of the underlying system.
 *
 * @example
 * ```typescript
 * const ticket: Ticket = {
 *   ref: { provider: 'github', id: '123', raw: '#123' },
 *   title: 'Fix login bug',
 *   body: 'Users cannot log in with SSO...',
 *   state: 'open',
 *   labels: ['bug', 'priority:high'],
 *   url: 'https://github.com/owner/repo/issues/123',
 *   meta: { assignees: ['developer'], milestone: 'v1.0' },
 * };
 * ```
 */
export interface Ticket {
  /**
   * Unique ticket reference.
   * Contains provider, ID, and original input string.
   */
  ref: TicketRef;

  /**
   * Ticket title.
   */
  title: string;

  /**
   * Ticket description/body (optional).
   * May contain markdown formatting.
   */
  body?: string;

  /**
   * Current ticket state.
   */
  state: TicketState;

  /**
   * Labels/tags applied to the ticket.
   * Empty array if no labels.
   */
  labels: string[];

  /**
   * Web URL to view the ticket.
   */
  url: string;

  /**
   * Provider-specific metadata (optional).
   *
   * Use this for provider-specific fields that don't fit
   * in the normalized interface. Examples:
   * - GitHub: { assignees, milestone, project }
   * - Jira: { priority, sprint, epic }
   */
  meta?: Record<string, unknown>;
}

/**
 * Result of authentication check.
 *
 * @example
 * ```typescript
 * const result = await provider.checkAuth();
 * if (!result.ok) {
 *   console.error(`Auth failed: ${result.message}`);
 * }
 * ```
 */
export interface AuthCheckResult {
  /**
   * Whether authentication is valid.
   */
  ok: boolean;

  /**
   * Message explaining the result (especially for failures).
   */
  message?: string;
}

/**
 * Main interface for backlog system integrations.
 *
 * Implementations provide access to ticket CRUD operations, optional
 * label management, and search capabilities across different backlog
 * systems.
 *
 * ## Required Methods
 * All implementations must provide:
 * - `getTicket`: Fetch a ticket by reference
 * - `createTicket`: Create a new ticket
 * - `updateTicket`: Update an existing ticket
 * - `checkAuth`: Verify authentication is valid
 * - `getTicketUrl`: Generate URL for a ticket
 * - `parseRef`: Parse user input to TicketRef
 *
 * ## Optional Methods
 * Implementations may optionally provide:
 * - `setLabels`: Replace all labels on a ticket
 * - `getLabels`: Get current labels on a ticket
 * - `searchTickets`: Search for tickets by query
 *
 * @example
 * ```typescript
 * class GitHubProvider implements BacklogProvider {
 *   readonly name = 'github';
 *
 *   async getTicket(ref: string): Promise<Ticket> {
 *     const parsed = this.parseRef(ref);
 *     if (!parsed) throw new Error('Invalid ref');
 *     // ... fetch from GitHub API
 *   }
 *
 *   // ... other required methods
 *
 *   // Optional: GitHub supports labels
 *   async setLabels(ref: string, labels: string[]): Promise<void> {
 *     // ... update labels via GitHub API
 *   }
 * }
 * ```
 */
export interface BacklogProvider {
  /**
   * Provider identifier.
   *
   * Used for discriminating between providers and routing
   * ticket references to the correct implementation.
   */
  readonly name: BacklogProviderName;

  // ==========================================================================
  // CRUD Operations (required)
  // ==========================================================================

  /**
   * Fetch a ticket by reference string.
   *
   * @param ref - Provider-specific reference string (e.g., '#123', 'PROJ-456')
   * @returns The ticket data
   * @throws {NotFoundError} If the ticket doesn't exist
   * @throws {AuthError} If authentication fails
   * @throws {ProviderError} For other provider errors
   *
   * @example
   * ```typescript
   * const ticket = await github.getTicket('#123');
   * const ticket = await jira.getTicket('PROJ-456');
   * ```
   */
  getTicket(ref: string): Promise<Ticket>;

  /**
   * Create a new ticket.
   *
   * @param params - Ticket creation parameters
   * @returns The created ticket
   * @throws {AuthError} If authentication fails or permissions insufficient
   * @throws {ProviderError} For other provider errors
   *
   * @example
   * ```typescript
   * const ticket = await provider.createTicket({
   *   title: 'New feature request',
   *   body: 'Description here',
   *   labels: ['feature'],
   * });
   * ```
   */
  createTicket(params: TicketCreateParams): Promise<Ticket>;

  /**
   * Update an existing ticket.
   *
   * Only specified fields in `updates` will be changed.
   *
   * @param ref - Provider-specific reference string
   * @param updates - Fields to update
   * @returns The updated ticket
   * @throws {NotFoundError} If the ticket doesn't exist
   * @throws {AuthError} If authentication fails or permissions insufficient
   * @throws {ProviderError} For other provider errors
   *
   * @example
   * ```typescript
   * const updated = await provider.updateTicket('#123', {
   *   title: 'Updated title',
   *   labels: ['done'],
   * });
   * ```
   */
  updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket>;

  // ==========================================================================
  // Label Management (optional)
  // ==========================================================================

  /**
   * Replace all labels on a ticket.
   *
   * **Optional**: Some providers may not support label management.
   *
   * @param ref - Provider-specific reference string
   * @param labels - Labels to set (replaces all existing labels)
   * @throws {NotFoundError} If the ticket doesn't exist
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * if (provider.setLabels) {
   *   await provider.setLabels('#123', ['bug', 'priority:high']);
   * }
   * ```
   */
  setLabels?(ref: string, labels: string[]): Promise<void>;

  /**
   * Get current labels on a ticket.
   *
   * **Optional**: Some providers may not support label management.
   *
   * @param ref - Provider-specific reference string
   * @returns Array of label strings
   * @throws {NotFoundError} If the ticket doesn't exist
   *
   * @example
   * ```typescript
   * if (provider.getLabels) {
   *   const labels = await provider.getLabels('#123');
   *   console.log('Labels:', labels);
   * }
   * ```
   */
  getLabels?(ref: string): Promise<string[]>;

  // ==========================================================================
  // Search (optional)
  // ==========================================================================

  /**
   * Search for tickets matching a query.
   *
   * **Optional**: Some providers may not support search.
   *
   * Query syntax is provider-specific:
   * - GitHub: GitHub search syntax (e.g., 'is:open label:bug')
   * - Jira: JQL (e.g., 'project = PROJ AND status = Open')
   *
   * @param query - Provider-specific search query
   * @returns Array of matching tickets
   * @throws {AuthError} If authentication fails
   *
   * @example
   * ```typescript
   * if (provider.searchTickets) {
   *   const bugs = await github.searchTickets('is:open label:bug');
   *   const openTasks = await jira.searchTickets('status = Open');
   * }
   * ```
   */
  searchTickets?(query: string): Promise<Ticket[]>;

  // ==========================================================================
  // Authentication (required)
  // ==========================================================================

  /**
   * Check if authentication is valid.
   *
   * Use this to verify credentials before performing operations,
   * or to provide helpful error messages to users.
   *
   * @returns Authentication check result
   *
   * @example
   * ```typescript
   * const auth = await provider.checkAuth();
   * if (!auth.ok) {
   *   console.error(`Please configure ${provider.name}: ${auth.message}`);
   *   return;
   * }
   * ```
   */
  checkAuth(): Promise<AuthCheckResult>;

  // ==========================================================================
  // URL and Reference Handling (required)
  // ==========================================================================

  /**
   * Generate the web URL for a ticket.
   *
   * @param ref - Provider-specific reference string
   * @returns Full URL to view the ticket in a browser
   *
   * @example
   * ```typescript
   * const url = github.getTicketUrl('#123');
   * // => 'https://github.com/owner/repo/issues/123'
   *
   * const url = jira.getTicketUrl('PROJ-456');
   * // => 'https://company.atlassian.net/browse/PROJ-456'
   * ```
   */
  getTicketUrl(ref: string): string;

  /**
   * Parse user input to a TicketRef.
   *
   * Handles various input formats for the provider:
   * - GitHub: '#123', 'owner/repo#123', full issue URL
   * - Jira: 'PROJ-123', full browse URL
   * - Shortcut: 'sc-123', story URL
   *
   * Returns null if the input cannot be parsed for this provider.
   * This enables chaining parsers across multiple providers:
   *
   * ```typescript
   * const ref = github.parseRef(input)
   *          ?? jira.parseRef(input)
   *          ?? local.parseRef(input);
   * ```
   *
   * @param input - User-provided reference string
   * @returns Parsed TicketRef or null if invalid for this provider
   *
   * @example
   * ```typescript
   * // GitHub examples
   * github.parseRef('#123');
   * // => { provider: 'github', id: '123', raw: '#123' }
   *
   * github.parseRef('owner/repo#123');
   * // => { provider: 'github', id: '123', raw: 'owner/repo#123', url: '...' }
   *
   * // Invalid input returns null
   * github.parseRef('PROJ-123');
   * // => null (not a GitHub reference)
   * ```
   */
  parseRef(input: string): TicketRef | null;
}
