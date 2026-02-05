/**
 * Agency FacetRegistry implementation
 *
 * Wraps the Latency FacetRegistry interface with Agency-specific
 * functionality for plugin lifecycle integration and scoped cleanup.
 *
 * @module facets/registry
 */

import type {
  FacetRegistry,
  FacetRegistration,
  RegistrationOptions,
} from '@generacy-ai/latency';
import { FacetNotFoundError, AmbiguousFacetError } from '@generacy-ai/latency';

/**
 * Extended registration record that includes the provider implementation
 * and plugin ownership for cleanup.
 */
interface InternalRegistration<T = unknown> extends FacetRegistration {
  /** The provider implementation */
  provider: T;
  /** Plugin that registered this facet */
  pluginId?: string;
}

/**
 * Agency's implementation of the Latency FacetRegistry interface.
 *
 * Provides an in-memory service locator for facet providers with
 * support for:
 * - Qualified providers (e.g., 'SourceControl' with qualifier 'git')
 * - Priority-based resolution when multiple providers exist
 * - Plugin-scoped registration tracking for cleanup
 *
 * @example
 * ```typescript
 * const registry = new AgencyFacetRegistry();
 *
 * // Register a provider
 * registry.register('SourceControl', gitProvider, {
 *   qualifier: 'git',
 *   priority: 10,
 *   pluginId: '@generacy-ai/agency-plugin-git',
 * });
 *
 * // Resolve a provider
 * const sc = registry.resolve<SourceControl>('SourceControl', 'git');
 *
 * // Cleanup on plugin unload
 * registry.unregisterByPlugin('@generacy-ai/agency-plugin-git');
 * ```
 */
export class AgencyFacetRegistry implements FacetRegistry {
  /** Map of facet name to registered providers */
  private readonly registrations = new Map<string, InternalRegistration[]>();

  /** Index of registrations by plugin ID for fast cleanup */
  private readonly pluginIndex = new Map<string, Array<{ facet: string; qualifier?: string }>>();

  /**
   * Register a facet provider.
   *
   * @typeParam T - The provider type being registered.
   * @param facet - The facet identifier (e.g., "IssueTracker").
   * @param provider - The provider instance.
   * @param options - Optional registration settings.
   */
  register<T>(facet: string, provider: T, options?: RegistrationOptions & { pluginId?: string }): void {
    const registration: InternalRegistration<T> = {
      facet,
      provider,
      qualifier: options?.qualifier,
      priority: options?.priority ?? 0,
      metadata: options?.metadata,
      pluginId: options?.pluginId,
    };

    // Add to facet registrations
    const existing = this.registrations.get(facet) ?? [];
    existing.push(registration);
    this.registrations.set(facet, existing);

    // Index by plugin for cleanup
    if (options?.pluginId) {
      const pluginRegs = this.pluginIndex.get(options.pluginId) ?? [];
      pluginRegs.push({ facet, qualifier: options.qualifier });
      this.pluginIndex.set(options.pluginId, pluginRegs);
    }
  }

  /**
   * Resolve a facet to its provider.
   *
   * When multiple providers exist:
   * - If qualifier is specified, returns the matching qualified provider
   * - If no qualifier, returns the highest priority provider
   * - If multiple providers have the same priority and no qualifier, returns undefined
   *   (caller should use resolveOrThrow for strict resolution)
   *
   * @typeParam T - The expected provider type.
   * @param facet - The facet identifier.
   * @param qualifier - Optional qualifier to select a specific implementation.
   * @returns The resolved provider, or undefined if none found.
   */
  resolve<T>(facet: string, qualifier?: string): T | undefined {
    const registrations = this.registrations.get(facet);
    if (!registrations || registrations.length === 0) {
      return undefined;
    }

    // If qualifier specified, find exact match
    if (qualifier !== undefined) {
      const match = registrations.find((r) => r.qualifier === qualifier);
      return match?.provider as T | undefined;
    }

    // No qualifier: find highest priority, or exact match if only one
    if (registrations.length === 1) {
      return registrations[0]!.provider as T;
    }

    // Multiple registrations: sort by priority descending
    const sorted = [...registrations].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const first = sorted[0]!;
    const highestPriority = first.priority ?? 0;
    const topPriority = sorted.filter((r) => (r.priority ?? 0) === highestPriority);

    // If multiple at same priority, resolution is ambiguous
    if (topPriority.length > 1) {
      return undefined;
    }

    return first.provider as T;
  }

  /**
   * Resolve a facet or throw if not found or ambiguous.
   *
   * @typeParam T - The expected provider type.
   * @param facet - The facet identifier.
   * @param qualifier - Optional qualifier to select a specific implementation.
   * @returns The resolved provider.
   * @throws FacetNotFoundError if no provider is registered.
   * @throws AmbiguousFacetError if multiple providers match with same priority.
   */
  resolveOrThrow<T>(facet: string, qualifier?: string): T {
    const registrations = this.registrations.get(facet);
    if (!registrations || registrations.length === 0) {
      throw new FacetNotFoundError(facet, qualifier);
    }

    // If qualifier specified, find exact match
    if (qualifier !== undefined) {
      const match = registrations.find((r) => r.qualifier === qualifier);
      if (!match) {
        throw new FacetNotFoundError(facet, qualifier);
      }
      return match.provider as T;
    }

    // No qualifier: find highest priority
    if (registrations.length === 1) {
      return registrations[0]!.provider as T;
    }

    // Multiple registrations: sort by priority descending
    const sorted = [...registrations].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const first = sorted[0]!;
    const highestPriority = first.priority ?? 0;
    const topPriority = sorted.filter((r) => (r.priority ?? 0) === highestPriority);

    // If multiple at same priority, throw ambiguous error
    if (topPriority.length > 1) {
      const qualifiers = topPriority.map((r) => r.qualifier ?? '<default>');
      throw new AmbiguousFacetError(facet, qualifiers);
    }

    return first.provider as T;
  }

  /**
   * List all registered providers for a facet.
   *
   * @param facet - The facet identifier.
   * @returns An array of registration records.
   */
  list(facet: string): FacetRegistration[] {
    const registrations = this.registrations.get(facet) ?? [];
    // Return without provider field (matches FacetRegistration interface)
    return registrations.map(({ facet, qualifier, priority, metadata }) => ({
      facet,
      qualifier,
      priority,
      metadata,
    }));
  }

  /**
   * Check if a facet has any registered providers.
   *
   * @param facet - The facet identifier.
   * @param qualifier - Optional qualifier to check for a specific implementation.
   * @returns true if at least one matching provider is registered.
   */
  has(facet: string, qualifier?: string): boolean {
    const registrations = this.registrations.get(facet);
    if (!registrations || registrations.length === 0) {
      return false;
    }

    if (qualifier === undefined) {
      return true;
    }

    return registrations.some((r) => r.qualifier === qualifier);
  }

  /**
   * Unregister a provider.
   *
   * @param facet - The facet identifier.
   * @param qualifier - Optional qualifier to target a specific implementation.
   * @returns true if a provider was removed.
   */
  unregister(facet: string, qualifier?: string): boolean {
    const registrations = this.registrations.get(facet);
    if (!registrations) {
      return false;
    }

    const index = registrations.findIndex((r) =>
      qualifier === undefined ? r.qualifier === undefined : r.qualifier === qualifier
    );

    if (index === -1) {
      return false;
    }

    const [removed] = registrations.splice(index, 1);
    if (!removed) {
      return false;
    }

    // Update plugin index
    if (removed.pluginId) {
      const pluginRegs = this.pluginIndex.get(removed.pluginId);
      if (pluginRegs) {
        const idx = pluginRegs.findIndex(
          (r) => r.facet === facet && r.qualifier === qualifier
        );
        if (idx !== -1) {
          pluginRegs.splice(idx, 1);
        }
        if (pluginRegs.length === 0) {
          this.pluginIndex.delete(removed.pluginId);
        }
      }
    }

    return true;
  }

  /**
   * Unregister all facets registered by a specific plugin.
   *
   * Called during plugin unload to clean up all facet registrations
   * made by that plugin.
   *
   * @param pluginId - The plugin ID whose registrations should be removed.
   */
  unregisterByPlugin(pluginId: string): void {
    const pluginRegs = this.pluginIndex.get(pluginId);
    if (!pluginRegs) {
      return;
    }

    // Remove each registration
    for (const { facet, qualifier } of pluginRegs) {
      const registrations = this.registrations.get(facet);
      if (registrations) {
        const index = registrations.findIndex(
          (r) => r.pluginId === pluginId && r.qualifier === qualifier
        );
        if (index !== -1) {
          registrations.splice(index, 1);
        }
      }
    }

    // Clear the plugin index
    this.pluginIndex.delete(pluginId);
  }

  /**
   * Get all facets registered by a specific plugin.
   *
   * @param pluginId - The plugin ID to query.
   * @returns Array of facet/qualifier pairs registered by the plugin.
   */
  getByPlugin(pluginId: string): Array<{ facet: string; qualifier?: string }> {
    return [...(this.pluginIndex.get(pluginId) ?? [])];
  }

  /**
   * Get a summary of all registered facets.
   *
   * @returns Map of facet names to their registered qualifiers and priorities.
   */
  getSummary(): Map<string, Array<{ qualifier?: string; priority: number }>> {
    const summary = new Map<string, Array<{ qualifier?: string; priority: number }>>();
    for (const [facet, registrations] of this.registrations) {
      summary.set(
        facet,
        registrations.map((r) => ({ qualifier: r.qualifier, priority: r.priority }))
      );
    }
    return summary;
  }

  /**
   * Clear all registrations.
   */
  clear(): void {
    this.registrations.clear();
    this.pluginIndex.clear();
  }
}
