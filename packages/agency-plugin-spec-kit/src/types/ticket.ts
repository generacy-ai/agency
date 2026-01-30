/**
 * Ticket-related type definitions for spec-kit
 *
 * These types provide a provider-agnostic way to reference and manipulate
 * external issue trackers (GitHub, Jira, Shortcut, Linear, etc.).
 */

/**
 * Known ticket providers with built-in support.
 *
 * These are the providers that have first-class support in spec-kit.
 * Custom providers can also be used via the string-based TicketProvider type.
 */
export const KNOWN_PROVIDERS = [
  'github',
  'jira',
  'shortcut',
  'linear',
  'local',
] as const;

/**
 * Type for known ticket providers.
 */
export type KnownTicketProvider = (typeof KNOWN_PROVIDERS)[number];

/**
 * Ticket provider type - string for extensibility.
 *
 * Uses a string type to allow plugins to register custom ticket providers
 * (e.g., "custom-tracker") without modifying core types.
 *
 * @example
 * ```typescript
 * // Using a known provider
 * const provider: TicketProvider = 'github';
 *
 * // Using a custom provider
 * const customProvider: TicketProvider = 'my-internal-tracker';
 * ```
 */
export type TicketProvider = string;

/**
 * Provider-agnostic ticket reference.
 *
 * Represents a reference to an issue/ticket in any supported provider,
 * enabling cross-provider workflows and local-first development.
 *
 * @example
 * ```typescript
 * // GitHub issue
 * const githubTicket: TicketRef = {
 *   provider: 'github',
 *   id: '123',
 *   url: 'https://github.com/owner/repo/issues/123',
 *   raw: '#123',
 * };
 *
 * // Jira issue
 * const jiraTicket: TicketRef = {
 *   provider: 'jira',
 *   id: 'PROJ-456',
 *   url: 'https://company.atlassian.net/browse/PROJ-456',
 *   raw: 'PROJ-456',
 * };
 * ```
 */
export interface TicketRef {
  /** Provider identifier (github, jira, etc. or custom) */
  provider: TicketProvider;

  /** Ticket ID ("123" or "PROJ-123") */
  id: string;

  /** Full URL if available */
  url?: string;

  /** Original input string */
  raw: string;
}

/**
 * Parameters for ticket operations.
 *
 * Used when creating or querying tickets from a provider.
 *
 * @example
 * ```typescript
 * const params: TicketParams = {
 *   provider: 'github',
 *   repository: 'owner/repo',
 *   labels: ['feature', 'spec'],
 *   assignees: ['developer'],
 * };
 * ```
 */
export interface TicketParams {
  /** Provider to use */
  provider: TicketProvider;

  /** Project identifier (for Jira, etc.) */
  project?: string;

  /** Repository (for GitHub) */
  repository?: string;

  /** Labels to apply */
  labels?: string[];

  /** Assignees */
  assignees?: string[];
}

/**
 * Changes to apply to a ticket.
 *
 * Represents a set of updates that can be applied to an existing ticket.
 *
 * @example
 * ```typescript
 * const updates: TicketUpdates = {
 *   title: 'Updated feature title',
 *   addLabels: ['in-progress'],
 *   removeLabels: ['backlog'],
 *   state: 'open',
 * };
 * ```
 */
export interface TicketUpdates {
  /** New title */
  title?: string;

  /** New description/body */
  body?: string;

  /** Labels to add */
  addLabels?: string[];

  /** Labels to remove */
  removeLabels?: string[];

  /** New assignees */
  assignees?: string[];

  /** New state (open, closed, etc.) */
  state?: string;
}

/**
 * Check if a provider string is a known provider.
 *
 * @param provider - The provider string to check
 * @returns True if the provider is a known provider
 *
 * @example
 * ```typescript
 * isKnownProvider('github'); // true
 * isKnownProvider('custom'); // false
 * ```
 */
export function isKnownProvider(
  provider: TicketProvider
): provider is KnownTicketProvider {
  return KNOWN_PROVIDERS.includes(provider as KnownTicketProvider);
}
