/**
 * Plugin Dependency Resolver for Agency
 *
 * Resolves plugin dependencies using Kahn's algorithm for topological sorting.
 * Detects circular dependencies and missing dependencies.
 */

import type { DependencyCheck, PluginManifest } from './types.js';

/**
 * Error thrown when a circular dependency is detected
 */
export class CircularDependencyError extends Error {
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'CircularDependencyError';
    this.cycle = cycle;
  }
}

/**
 * Error thrown when a required dependency is missing
 */
export class MissingDependencyError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing dependencies: ${missing.join(', ')}`);
    this.name = 'MissingDependencyError';
    this.missing = missing;
  }
}

/**
 * Dependency Resolver using Kahn's algorithm for topological sorting
 */
export class DependencyResolver {
  /**
   * Check dependencies for a set of plugins
   *
   * @param manifests Array of plugin manifests to check
   * @returns DependencyCheck with satisfaction status and load order
   */
  check(manifests: PluginManifest[]): DependencyCheck {
    const pluginIds = new Set(manifests.map((m) => m.id));
    const missing: string[] = [];
    const conflicts: DependencyCheck['conflicts'] = [];

    // Check for missing dependencies
    for (const manifest of manifests) {
      for (const dep of manifest.dependencies) {
        if (!pluginIds.has(dep)) {
          missing.push(dep);
        }
      }

      // Check peer dependencies for version conflicts (simplified)
      if (manifest.peerDependencies) {
        for (const [depId, _requiredVersion] of Object.entries(manifest.peerDependencies)) {
          const depManifest = manifests.find((m) => m.id === depId);
          if (depManifest) {
            // Simplified version check - in practice, use semver
            // For now, just note if peer dependency exists
          }
        }
      }
    }

    if (missing.length > 0) {
      return {
        satisfied: false,
        missing: [...new Set(missing)], // Dedupe
        conflicts,
        loadOrder: undefined,
      };
    }

    // Check for cycles and compute load order
    try {
      const loadOrder = this.topologicalSort(manifests);
      return {
        satisfied: true,
        missing: [],
        conflicts,
        loadOrder,
      };
    } catch (error) {
      if (error instanceof CircularDependencyError) {
        return {
          satisfied: false,
          missing: [],
          conflicts,
          loadOrder: undefined,
        };
      }
      throw error;
    }
  }

  /**
   * Resolve plugin load order using topological sort
   *
   * @param manifests Array of plugin manifests
   * @returns Array of plugin IDs in load order
   * @throws CircularDependencyError if a cycle is detected
   */
  resolve(manifests: PluginManifest[]): string[] {
    return this.topologicalSort(manifests);
  }

  /**
   * Topological sort using Kahn's algorithm
   *
   * @param manifests Array of plugin manifests
   * @returns Array of plugin IDs in dependency order (dependencies first)
   */
  private topologicalSort(manifests: PluginManifest[]): string[] {
    const manifestMap = new Map(manifests.map((m) => [m.id, m]));
    const pluginIds = new Set(manifests.map((m) => m.id));

    // Build in-degree map (count of dependencies for each plugin)
    const inDegree = new Map<string, number>();
    // Build adjacency list (dependents for each plugin)
    const dependents = new Map<string, string[]>();

    // Initialize
    for (const manifest of manifests) {
      inDegree.set(manifest.id, 0);
      dependents.set(manifest.id, []);
    }

    // Count in-degrees (only for dependencies that exist in our set)
    for (const manifest of manifests) {
      for (const dep of manifest.dependencies) {
        if (pluginIds.has(dep)) {
          // manifest depends on dep, so manifest's in-degree increases
          inDegree.set(manifest.id, (inDegree.get(manifest.id) ?? 0) + 1);
          // dep has manifest as a dependent
          const deps = dependents.get(dep) ?? [];
          deps.push(manifest.id);
          dependents.set(dep, deps);
        }
      }
    }

    // Queue starts with plugins that have no dependencies (in-degree = 0)
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    // Sort the queue for deterministic output
    queue.sort();

    const result: string[] = [];

    while (queue.length > 0) {
      // Take the first (sorted) element
      const current = queue.shift()!;
      result.push(current);

      // For each dependent of current
      const currentDependents = dependents.get(current) ?? [];
      for (const dependent of currentDependents) {
        const newDegree = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          // Insert in sorted order for determinism
          const insertIndex = queue.findIndex((id) => id > dependent);
          if (insertIndex === -1) {
            queue.push(dependent);
          } else {
            queue.splice(insertIndex, 0, dependent);
          }
        }
      }
    }

    // If result doesn't contain all plugins, there's a cycle
    if (result.length !== manifests.length) {
      const cycleNodes = manifests
        .filter((m) => !result.includes(m.id))
        .map((m) => m.id);
      throw new CircularDependencyError(cycleNodes);
    }

    return result;
  }

  /**
   * Get reverse dependency order (for shutdown)
   *
   * @param manifests Array of plugin manifests
   * @returns Array of plugin IDs in reverse dependency order (dependents first)
   */
  getShutdownOrder(manifests: PluginManifest[]): string[] {
    return this.topologicalSort(manifests).reverse();
  }

  /**
   * Validate that all dependency IDs in a manifest are valid
   *
   * @param manifest The manifest to validate
   * @param availablePlugins Set of available plugin IDs
   * @returns Array of missing dependency IDs
   */
  getMissingDependencies(
    manifest: PluginManifest,
    availablePlugins: Set<string>
  ): string[] {
    return manifest.dependencies.filter((dep) => !availablePlugins.has(dep));
  }
}

/**
 * Convenience function to check dependencies
 */
export function checkDependencies(manifests: PluginManifest[]): DependencyCheck {
  const resolver = new DependencyResolver();
  return resolver.check(manifests);
}

/**
 * Convenience function to resolve load order
 */
export function resolveLoadOrder(manifests: PluginManifest[]): string[] {
  const resolver = new DependencyResolver();
  return resolver.resolve(manifests);
}
