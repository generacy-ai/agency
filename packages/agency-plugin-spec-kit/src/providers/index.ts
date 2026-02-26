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

import type { z } from 'zod';
import type { BacklogConfigSchema } from '../config.js';
import type { BacklogProvider } from './types.js';
import { ProviderNotFoundError } from './errors.js';

// ============================================================================
// Error Types
// ============================================================================

export {
  ProviderError,
  AuthError,
  NotFoundError,
  ProviderNotFoundError,
} from './errors.js';

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
export {
  GitHubCliProvider,
  GitHubCliError,
  GitHubCliAuthError,
  GitHubCliNotFoundError,
} from './github-cli.js';
export { JiraProvider } from './jira.js';
export { ShortcutProvider } from './shortcut.js';
export { LocalProvider } from './local.js';

// ============================================================================
// Compatibility Layer (for develop branch API)
// ============================================================================

/**
 * Type alias for backlog configuration from Zod schema
 */
export type BacklogConfig = z.infer<typeof BacklogConfigSchema>;

/**
 * Internal cache of provider instances.
 * Uses provider name as key (one instance per provider type).
 */
const providers = new Map<string, BacklogProvider>();

/**
 * Factory function that creates new provider instances based on configuration.
 *
 * This function creates a fresh provider instance each time it's called.
 * For cached/singleton access, use `getConfiguredProvider` instead.
 *
 * @param config - Backlog configuration specifying provider type and settings
 * @returns A new BacklogProvider instance
 * @throws {ProviderNotFoundError} If the provider type is unknown
 *
 * @example
 * ```typescript
 * const provider = createProvider({ provider: 'github', github: {} });
 * ```
 */
export function createProvider(config: BacklogConfig): BacklogProvider {
  const { provider: name } = config;

  switch (name) {
    case 'github':
      // TODO: Import and instantiate GitHubProvider when available
      throw new ProviderNotFoundError(name);
    case 'jira':
      // TODO: Import and instantiate JiraProvider when available
      throw new ProviderNotFoundError(name);
    case 'shortcut':
      // TODO: Import and instantiate ShortcutProvider when available
      throw new ProviderNotFoundError(name);
    case 'local':
      // TODO: Import and instantiate LocalProvider when available
      throw new ProviderNotFoundError(name);
    default:
      throw new ProviderNotFoundError(name as string);
  }
}

/**
 * Retrieve a cached provider instance by name.
 *
 * Returns a provider that was previously created and cached via
 * `getConfiguredProvider`. Useful when you know the provider has
 * already been initialized.
 *
 * @param name - Provider name (e.g., 'github', 'jira')
 * @returns The cached BacklogProvider instance
 * @throws {ProviderNotFoundError} If no provider with that name exists in cache
 *
 * @example
 * ```typescript
 * // After getConfiguredProvider has been called for 'github'
 * const github = getProvider('github');
 * ```
 */
export function getProvider(name: string): BacklogProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new ProviderNotFoundError(name);
  }
  return provider;
}

/**
 * Get or create a provider instance based on configuration.
 *
 * Uses lazy initialization with caching - the provider is created on first
 * access and subsequent calls return the cached instance. Cache key is the
 * provider name, so one instance per provider type is maintained.
 *
 * @param config - Backlog configuration specifying provider type and settings
 * @returns The cached or newly created BacklogProvider instance
 * @throws {ProviderNotFoundError} If the provider type is unknown
 *
 * @example
 * ```typescript
 * // First call creates the provider
 * const github1 = getConfiguredProvider({ provider: 'github', github: {} });
 *
 * // Subsequent calls return the same instance
 * const github2 = getConfiguredProvider({ provider: 'github', github: {} });
 * console.log(github1 === github2); // true
 * ```
 */
export function getConfiguredProvider(config: BacklogConfig): BacklogProvider {
  const name = config.provider;
  if (!providers.has(name)) {
    providers.set(name, createProvider(config));
  }
  return providers.get(name)!;
}

/**
 * Clear the provider cache.
 *
 * Useful for testing or when provider configuration changes require
 * new instances to be created.
 *
 * @internal Primarily for testing purposes
 */
export function clearProviderCache(): void {
  providers.clear();
}
