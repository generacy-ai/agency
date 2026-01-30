/**
 * Ticket reference auto-detection utility.
 *
 * Parses various ticket reference formats and returns a normalized TicketRef.
 * Supports GitHub, Jira, Shortcut, and local provider formats.
 *
 * @example
 * ```typescript
 * import { detectTicketRef } from './detect-ticket-ref.js';
 *
 * // GitHub URLs
 * detectTicketRef('https://github.com/owner/repo/issues/123', 'github');
 * // => { provider: 'github', id: '123', url: '...', raw: '...' }
 *
 * // GitHub shorthand
 * detectTicketRef('#123', 'github');
 * // => { provider: 'github', id: '123', raw: '#123' }
 *
 * // Jira format
 * detectTicketRef('PROJ-123', 'github');
 * // => { provider: 'jira', id: 'PROJ-123', raw: 'PROJ-123' }
 * ```
 */

import type { TicketRef } from '../types/ticket.js';
import type { BacklogProviderName } from '../providers/types.js';

/**
 * GitHub URL patterns.
 *
 * Matches:
 * - https://github.com/owner/repo/issues/123
 * - https://github.com/owner/repo/pull/123
 * - http://github.com/owner/repo/issues/123
 */
const GITHUB_URL_PATTERN =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/i;

/**
 * GitHub shorthand patterns.
 *
 * Matches:
 * - #123
 * - owner/repo#123
 */
const GITHUB_SHORTHAND_PATTERN = /^(?:([^/]+)\/([^#]+))?#(\d+)$/;

/**
 * Jira ticket pattern.
 *
 * Matches:
 * - PROJ-123
 * - ABC-1
 */
const JIRA_PATTERN = /^([A-Z][A-Z0-9_]*)-(\d+)$/;

/**
 * Jira URL pattern.
 *
 * Matches:
 * - https://company.atlassian.net/browse/PROJ-123
 * - https://jira.example.com/browse/ABC-456
 */
const JIRA_URL_PATTERN =
  /^https?:\/\/[^/]+\/browse\/([A-Z][A-Z0-9_]*-\d+)/i;

/**
 * Shortcut ticket pattern.
 *
 * Matches:
 * - sc-123
 * - SC-456
 */
const SHORTCUT_PATTERN = /^sc-(\d+)$/i;

/**
 * Shortcut URL pattern.
 *
 * Matches:
 * - https://app.shortcut.com/workspace/story/123
 */
const SHORTCUT_URL_PATTERN =
  /^https?:\/\/app\.shortcut\.com\/[^/]+\/story\/(\d+)/i;

/**
 * Detect a ticket reference from user input.
 *
 * Parses various ticket reference formats and returns a normalized TicketRef.
 * Detection order:
 * 1. Full URLs (most specific) - check domain
 * 2. Provider-specific formats (e.g., PROJ-123 for Jira)
 * 3. Ambiguous formats (e.g., #123) - use default provider
 *
 * @param input - User-provided ticket reference string
 * @param defaultProvider - Provider to use for ambiguous references like #123
 * @returns Parsed TicketRef or null if input is invalid
 *
 * @example
 * ```typescript
 * // GitHub URL
 * detectTicketRef('https://github.com/owner/repo/issues/123', 'github');
 * // => { provider: 'github', id: '123', url: '...', raw: '...' }
 *
 * // Ambiguous shorthand uses default provider
 * detectTicketRef('#123', 'github');
 * // => { provider: 'github', id: '123', raw: '#123' }
 *
 * // Invalid input
 * detectTicketRef('invalid', 'github');
 * // => null
 * ```
 */
export function detectTicketRef(
  input: string,
  defaultProvider: BacklogProviderName
): TicketRef | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Try URL detection first (most specific)
  const urlRef = detectFromUrl(trimmed);
  if (urlRef) {
    return urlRef;
  }

  // 2. Try provider-specific patterns
  // Check shortcut before Jira since "SC-xxx" matches both patterns
  const shortcutRef = detectShortcut(trimmed);
  if (shortcutRef) {
    return shortcutRef;
  }

  const jiraRef = detectJira(trimmed);
  if (jiraRef) {
    return jiraRef;
  }

  // 3. Try GitHub shorthand (can be ambiguous)
  const githubRef = detectGitHubShorthand(trimmed);
  if (githubRef) {
    return githubRef;
  }

  // 4. Try bare number with default provider
  const bareNumberRef = detectBareNumber(trimmed, defaultProvider);
  if (bareNumberRef) {
    return bareNumberRef;
  }

  return null;
}

/**
 * Detect provider from a URL.
 *
 * @param url - URL to parse
 * @returns TicketRef if URL matches a known provider, null otherwise
 */
function detectFromUrl(url: string): TicketRef | null {
  // GitHub URL
  const githubMatch = url.match(GITHUB_URL_PATTERN);
  if (githubMatch && githubMatch[3]) {
    return {
      provider: 'github',
      id: githubMatch[3],
      url: githubMatch[0],
      raw: url,
    };
  }

  // Jira URL
  const jiraMatch = url.match(JIRA_URL_PATTERN);
  if (jiraMatch && jiraMatch[1]) {
    return {
      provider: 'jira',
      id: jiraMatch[1],
      url,
      raw: url,
    };
  }

  // Shortcut URL
  const shortcutMatch = url.match(SHORTCUT_URL_PATTERN);
  if (shortcutMatch && shortcutMatch[1]) {
    return {
      provider: 'shortcut',
      id: shortcutMatch[1],
      url,
      raw: url,
    };
  }

  return null;
}

/**
 * Detect Jira ticket format.
 *
 * @param input - Input string (e.g., "PROJ-123")
 * @returns TicketRef if matches Jira format, null otherwise
 */
function detectJira(input: string): TicketRef | null {
  const match = input.match(JIRA_PATTERN);
  if (match && match[1] && match[2]) {
    return {
      provider: 'jira',
      id: `${match[1]}-${match[2]}`,
      raw: input,
    };
  }
  return null;
}

/**
 * Detect Shortcut ticket format.
 *
 * @param input - Input string (e.g., "sc-123")
 * @returns TicketRef if matches Shortcut format, null otherwise
 */
function detectShortcut(input: string): TicketRef | null {
  const match = input.match(SHORTCUT_PATTERN);
  if (match && match[1]) {
    return {
      provider: 'shortcut',
      id: match[1],
      raw: input,
    };
  }
  return null;
}

/**
 * Detect GitHub shorthand format.
 *
 * @param input - Input string (e.g., "#123" or "owner/repo#123")
 * @returns TicketRef if matches GitHub shorthand, null otherwise
 */
function detectGitHubShorthand(input: string): TicketRef | null {
  const match = input.match(GITHUB_SHORTHAND_PATTERN);
  if (match && match[3]) {
    const ref: TicketRef = {
      provider: 'github',
      id: match[3],
      raw: input,
    };

    // If owner/repo provided, construct URL
    if (match[1] && match[2]) {
      ref.url = `https://github.com/${match[1]}/${match[2]}/issues/${match[3]}`;
    }

    return ref;
  }
  return null;
}

/**
 * Detect bare number format (e.g., "123").
 *
 * Uses the default provider since bare numbers are ambiguous.
 *
 * @param input - Input string (e.g., "123")
 * @param defaultProvider - Provider to assign to bare numbers
 * @returns TicketRef if matches bare number, null otherwise
 */
function detectBareNumber(
  input: string,
  defaultProvider: BacklogProviderName
): TicketRef | null {
  const match = input.match(/^(\d+)$/);
  if (match && match[1]) {
    return {
      provider: defaultProvider,
      id: match[1],
      raw: input,
    };
  }
  return null;
}
