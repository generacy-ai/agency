/**
 * Facet Binder for Agency
 *
 * Handles startup-time validation of facet requirements after all
 * plugins have been loaded. Ensures all required facets are satisfied
 * and reports any missing or ambiguous facets.
 *
 * @module facets/binder
 */

import type { FacetRequirement } from '@generacy-ai/latency';
import { FacetNotFoundError, AmbiguousFacetError } from '@generacy-ai/latency';
import type { AgencyFacetRegistry } from './registry.js';
import type { PluginManifest } from '../plugins/types.js';

/**
 * Result of facet binding validation.
 */
export interface FacetBindingResult {
  /** Whether all required facets were satisfied */
  success: boolean;

  /** Summary of facets that were successfully bound */
  bound: Array<{
    plugin: string;
    facet: string;
    qualifier?: string;
    provider?: string;
  }>;

  /** Errors for facets that could not be bound */
  errors: Array<{
    plugin: string;
    facet: string;
    qualifier?: string;
    error: FacetNotFoundError | AmbiguousFacetError;
  }>;

  /** Warnings (e.g., optional facets not found, providers not registering declared facets) */
  warnings: string[];
}

/**
 * Validates facet requirements after all plugins have loaded.
 *
 * The binder performs two validation steps:
 * 1. Requirement satisfaction: Verify all `requires` declarations can be resolved
 * 2. Provider verification: Warn if plugins declare `provides` but didn't register
 *
 * @example
 * ```typescript
 * const binder = new FacetBinder(registry);
 * const result = binder.bindAll(loadedPlugins);
 *
 * if (!result.success) {
 *   for (const err of result.errors) {
 *     console.error(`Plugin ${err.plugin} requires ${err.facet} but none found`);
 *   }
 *   throw new Error('Facet binding failed');
 * }
 * ```
 */
export class FacetBinder {
  private readonly registry: AgencyFacetRegistry;

  constructor(registry: AgencyFacetRegistry) {
    this.registry = registry;
  }

  /**
   * Validate all facet requirements for loaded plugins.
   *
   * @param plugins - Array of loaded plugin manifests.
   * @returns Binding result with success status, bound facets, and errors.
   */
  bindAll(plugins: PluginManifest[]): FacetBindingResult {
    const result: FacetBindingResult = {
      success: true,
      bound: [],
      errors: [],
      warnings: [],
    };

    for (const plugin of plugins) {
      // Validate required facets
      for (const req of plugin.requires ?? []) {
        const bindResult = this.bindRequirement(plugin.id, req, false);
        if (bindResult.error) {
          result.success = false;
          result.errors.push({
            plugin: plugin.id,
            facet: req.facet,
            qualifier: req.qualifier,
            error: bindResult.error,
          });
        } else if (bindResult.bound) {
          result.bound.push({
            plugin: plugin.id,
            facet: req.facet,
            qualifier: req.qualifier,
            provider: bindResult.provider,
          });
        }
      }

      // Validate optional facets (uses)
      for (const req of plugin.uses ?? []) {
        const bindResult = this.bindRequirement(plugin.id, req, true);
        if (bindResult.bound) {
          result.bound.push({
            plugin: plugin.id,
            facet: req.facet,
            qualifier: req.qualifier,
            provider: bindResult.provider,
          });
        } else if (!bindResult.bound && !bindResult.error) {
          // Optional facet not found - add warning
          result.warnings.push(
            `Plugin ${plugin.id} uses optional facet '${req.facet}'${req.qualifier ? ` (${req.qualifier})` : ''} which is not available`
          );
        }
      }

      // Verify declared providers were actually registered
      for (const prov of plugin.provides ?? []) {
        if (!this.registry.has(prov.facet, prov.qualifier)) {
          result.warnings.push(
            `Plugin ${plugin.id} declares provides '${prov.facet}'${prov.qualifier ? ` (${prov.qualifier})` : ''} but did not register it`
          );
        }
      }
    }

    return result;
  }

  /**
   * Bind a single facet requirement.
   *
   * @param pluginId - The plugin requesting the facet.
   * @param requirement - The facet requirement to bind.
   * @param optional - Whether this is an optional requirement.
   * @returns Binding result for this requirement.
   */
  private bindRequirement(
    pluginId: string,
    requirement: FacetRequirement,
    optional: boolean
  ): { bound: boolean; provider?: string; error?: FacetNotFoundError | AmbiguousFacetError } {
    const { facet, qualifier } = requirement;

    // Check if the facet exists
    if (!this.registry.has(facet, qualifier)) {
      if (optional || requirement.optional) {
        return { bound: false };
      }
      return {
        bound: false,
        error: new FacetNotFoundError(facet, qualifier),
      };
    }

    // Try to resolve to verify it's not ambiguous
    try {
      this.registry.resolveOrThrow(facet, qualifier);
      // Get the provider qualifier for logging
      const registrations = this.registry.list(facet);
      const match = qualifier
        ? registrations.find((r) => r.qualifier === qualifier)
        : registrations[0];
      return {
        bound: true,
        provider: match?.qualifier ?? '<default>',
      };
    } catch (error) {
      if (error instanceof AmbiguousFacetError) {
        return { bound: false, error };
      }
      if (error instanceof FacetNotFoundError) {
        if (optional || requirement.optional) {
          return { bound: false };
        }
        return { bound: false, error };
      }
      throw error;
    }
  }

  /**
   * Format binding result for logging.
   *
   * @param result - The binding result to format.
   * @returns Formatted log messages.
   */
  static formatResult(result: FacetBindingResult): string[] {
    const lines: string[] = [];

    if (result.bound.length > 0) {
      lines.push('Facets bound:');
      for (const b of result.bound) {
        const qual = b.qualifier ? ` (${b.qualifier})` : '';
        const prov = b.provider ? ` -> ${b.provider}` : '';
        lines.push(`  ✓ ${b.plugin}: ${b.facet}${qual}${prov}`);
      }
    }

    if (result.errors.length > 0) {
      lines.push('Facet binding errors:');
      for (const e of result.errors) {
        const qual = e.qualifier ? ` (${e.qualifier})` : '';
        lines.push(`  ✗ ${e.plugin}: ${e.facet}${qual} - ${e.error.message}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push('Facet warnings:');
      for (const w of result.warnings) {
        lines.push(`  ⚠ ${w}`);
      }
    }

    return lines;
  }
}
