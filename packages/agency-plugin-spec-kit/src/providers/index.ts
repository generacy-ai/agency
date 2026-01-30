/**
 * Provider interfaces and implementations for @generacy-ai/agency-plugin-spec-kit
 *
 * This module exports the BacklogProvider interface, supporting types,
 * error classes, and provider implementations.
 *
 * @example
 * ```typescript
 * import {
 *   BacklogProvider,
 *   Ticket,
 *   TicketCreateParams,
 *   ProviderError,
 *   AuthError,
 *   NotFoundError,
 *   ProviderRegistry,
 *   GitHubProvider,
 * } from '@generacy-ai/agency-plugin-spec-kit/providers';
 * ```
 */

// ============================================================================
// Error Types
// ============================================================================

export { ProviderError, AuthError, NotFoundError } from './errors.js';

// ============================================================================
// Interface Types
// ============================================================================

export type {
  BacklogProviderName,
  TicketState,
  TicketCreateParams,
  TicketUpdates,
  Ticket,
  AuthCheckResult,
  BacklogProvider,
} from './types.js';

// ============================================================================
// Registry
// ============================================================================

export {
  ProviderRegistry,
  registerProviderFactory,
  type ProviderFactory,
} from './registry.js';

// ============================================================================
// Provider Implementations
// ============================================================================

export { GitHubProvider } from './github.js';
export { JiraProvider } from './jira.js';
export { ShortcutProvider } from './shortcut.js';
export { LocalProvider } from './local.js';
