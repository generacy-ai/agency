/**
 * Provider registry for backlog provider management.
 *
 * Manages provider instances with lazy instantiation and caching.
 * Provides methods to get providers by name and detect providers from references.
 *
 * @example
 * ```typescript
 * import { ProviderRegistry } from './registry.js';
 * import type { SpecKitConfig } from '../config.js';
 *
 * const registry = new ProviderRegistry(config);
 *
 * // Get default provider
 * const provider = registry.getProvider();
 *
 * // Get specific provider
 * const github = registry.getProvider('github');
 *
 * // Detect provider from reference
 * const detected = registry.detectProvider('PROJ-123');
 * // => 'jira'
 * ```
 */

import type { BacklogProvider, BacklogProviderName } from './types.js';
import type { SpecKitConfig } from '../config.js';
import { detectTicketRef } from '../utils/detect-ticket-ref.js';

/**
 * Factory function type for creating provider instances.
 */
export type ProviderFactory = (config: SpecKitConfig) => BacklogProvider;

/**
 * Registry of provider factory functions.
 *
 * Each provider type has a factory that creates instances on demand.
 * The registry is populated by importing provider modules.
 */
const providerFactories = new Map<BacklogProviderName, ProviderFactory>();

/**
 * Register a provider factory.
 *
 * Called by provider modules to register themselves.
 *
 * @param name - Provider name
 * @param factory - Factory function to create provider instances
 */
export function registerProviderFactory(
  name: BacklogProviderName,
  factory: ProviderFactory
): void {
  providerFactories.set(name, factory);
}

/**
 * Provider registry for managing BacklogProvider instances.
 *
 * Features:
 * - Lazy instantiation of providers
 * - Instance caching per provider type
 * - Automatic fallback to default provider
 * - Provider detection from ticket references
 */
export class ProviderRegistry {
  private readonly config: SpecKitConfig;
  private readonly providers = new Map<BacklogProviderName, BacklogProvider>();

  /**
   * Create a new provider registry.
   *
   * @param config - SpecKit configuration containing provider settings
   */
  constructor(config: SpecKitConfig) {
    this.config = config;
  }

  /**
   * Get or create a provider instance by name.
   *
   * Returns cached instance if available, otherwise creates and caches a new one.
   * Falls back to configured default provider if name not specified.
   *
   * @param name - Provider name (defaults to configured default)
   * @returns BacklogProvider instance
   * @throws Error if provider type is not registered
   *
   * @example
   * ```typescript
   * // Get default provider
   * const provider = registry.getProvider();
   *
   * // Get specific provider
   * const github = registry.getProvider('github');
   * ```
   */
  getProvider(name?: BacklogProviderName): BacklogProvider {
    const providerName = name ?? this.getDefaultProvider();

    // Return cached instance if available
    if (this.providers.has(providerName)) {
      return this.providers.get(providerName)!;
    }

    // Create new instance
    const factory = providerFactories.get(providerName);
    if (!factory) {
      throw new Error(
        `Provider '${providerName}' is not registered. Available providers: ${Array.from(providerFactories.keys()).join(', ')}`
      );
    }

    const provider = factory(this.config);
    this.providers.set(providerName, provider);
    return provider;
  }

  /**
   * Detect provider from a ticket reference string.
   *
   * Uses the detectTicketRef utility to parse the input and extract
   * the provider type. Returns null if the reference format is ambiguous
   * or invalid.
   *
   * @param ref - Ticket reference string (URL or shorthand)
   * @returns Provider name if detected, null if ambiguous or invalid
   *
   * @example
   * ```typescript
   * registry.detectProvider('https://github.com/owner/repo/issues/123');
   * // => 'github'
   *
   * registry.detectProvider('PROJ-123');
   * // => 'jira'
   *
   * registry.detectProvider('#123');
   * // => 'github' (uses default)
   * ```
   */
  detectProvider(ref: string): BacklogProviderName | null {
    const ticketRef = detectTicketRef(ref, this.getDefaultProvider());
    if (!ticketRef) {
      return null;
    }
    return ticketRef.provider as BacklogProviderName;
  }

  /**
   * Get the default provider from configuration.
   *
   * @returns Default provider name
   */
  getDefaultProvider(): BacklogProviderName {
    return this.config.backlog.provider;
  }

  /**
   * Check if a provider is registered.
   *
   * @param name - Provider name to check
   * @returns True if provider factory is registered
   */
  hasProvider(name: BacklogProviderName): boolean {
    return providerFactories.has(name);
  }

  /**
   * Get list of all registered provider names.
   *
   * @returns Array of registered provider names
   */
  getRegisteredProviders(): BacklogProviderName[] {
    return Array.from(providerFactories.keys());
  }
}
