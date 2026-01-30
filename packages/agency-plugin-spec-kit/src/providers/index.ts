/**
 * Provider interfaces and error types for @generacy-ai/agency-plugin-spec-kit
 *
 * This module exports the BacklogProvider interface and supporting types
 * for implementing backlog system integrations.
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
