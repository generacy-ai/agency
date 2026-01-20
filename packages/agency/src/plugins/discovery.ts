/**
 * Plugin Discovery for Agency
 *
 * Discovers plugins from node_modules and configured paths.
 * Reads and validates plugin manifests from package.json files.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { DiscoveredPlugin, DiscoveryOptions, PluginManifest } from './types.js';
import { safeParseManifest } from './manifest.js';

/**
 * Default plugin name pattern for node_modules scanning
 * Matches: @generacy-ai/agency-plugin-* or agency-plugin-* (for local dev)
 */
const DEFAULT_PLUGIN_PATTERN = /^(@generacy-ai\/)?agency-plugin-[\w-]+$/;

/**
 * Agency manifest field name in package.json
 */
const AGENCY_MANIFEST_FIELD = 'agency';

/**
 * Plugin Discovery class for finding plugins in the filesystem
 */
export class PluginDiscovery {
  private readonly pattern: RegExp;

  constructor(pattern: RegExp = DEFAULT_PLUGIN_PATTERN) {
    this.pattern = pattern;
  }

  /**
   * Discover all plugins from the given options
   *
   * @param options Discovery options
   * @returns Array of discovered plugins with manifests
   */
  async discover(options: DiscoveryOptions): Promise<DiscoveredPlugin[]> {
    const discovered: DiscoveredPlugin[] = [];

    // Scan search paths (typically node_modules directories)
    for (const searchPath of options.searchPaths) {
      const fromPath = await this.scanPath(searchPath, 'node_modules');
      discovered.push(...fromPath);
    }

    // Load additional explicit plugin paths
    if (options.additionalPlugins) {
      for (const pluginPath of options.additionalPlugins) {
        const plugin = await this.loadFromPath(pluginPath, 'explicit');
        if (plugin) {
          discovered.push(plugin);
        }
      }
    }

    return discovered;
  }

  /**
   * Discover plugins from a single node_modules path
   *
   * @param nodeModulesPath Path to node_modules directory
   * @returns Array of discovered plugins
   */
  async discoverFromNodeModules(nodeModulesPath: string): Promise<DiscoveredPlugin[]> {
    return this.scanPath(nodeModulesPath, 'node_modules');
  }

  /**
   * Load a plugin from an explicit path
   *
   * @param pluginPath Path to the plugin package directory
   * @returns Discovered plugin or null if invalid
   */
  async loadFromExplicitPath(pluginPath: string): Promise<DiscoveredPlugin | null> {
    return this.loadFromPath(pluginPath, 'explicit');
  }

  /**
   * Scan a directory for plugins matching the pattern
   */
  private async scanPath(
    basePath: string,
    source: 'node_modules' | 'config'
  ): Promise<DiscoveredPlugin[]> {
    const discovered: DiscoveredPlugin[] = [];

    try {
      const entries = await readdir(basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        // Handle scoped packages (@scope/name)
        if (entry.name.startsWith('@')) {
          const scopePath = join(basePath, entry.name);
          const scopedPackages = await this.scanScopedPackages(scopePath, entry.name, source);
          discovered.push(...scopedPackages);
        } else if (this.pattern.test(entry.name)) {
          // Non-scoped package matching pattern
          const plugin = await this.loadFromPath(join(basePath, entry.name), source);
          if (plugin) {
            discovered.push(plugin);
          }
        }
      }
    } catch {
      // Directory doesn't exist or isn't readable - skip silently
    }

    return discovered;
  }

  /**
   * Scan a scoped package directory (@scope/)
   */
  private async scanScopedPackages(
    scopePath: string,
    scopeName: string,
    source: 'node_modules' | 'config'
  ): Promise<DiscoveredPlugin[]> {
    const discovered: DiscoveredPlugin[] = [];

    try {
      const entries = await readdir(scopePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const fullName = `${scopeName}/${entry.name}`;
        if (this.pattern.test(fullName)) {
          const plugin = await this.loadFromPath(join(scopePath, entry.name), source);
          if (plugin) {
            discovered.push(plugin);
          }
        }
      }
    } catch {
      // Scope directory not readable - skip silently
    }

    return discovered;
  }

  /**
   * Load a plugin manifest from a package directory
   */
  private async loadFromPath(
    packagePath: string,
    source: 'node_modules' | 'config' | 'explicit'
  ): Promise<DiscoveredPlugin | null> {
    try {
      const packageJsonPath = join(packagePath, 'package.json');
      const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent) as Record<string, unknown>;

      const manifest = this.extractManifest(packageJson, packagePath);
      if (!manifest) {
        return null;
      }

      return {
        path: packagePath,
        source,
        manifest,
      };
    } catch {
      // Package doesn't exist or has invalid JSON - skip
      return null;
    }
  }

  /**
   * Extract and validate manifest from package.json
   */
  private extractManifest(
    packageJson: Record<string, unknown>,
    packagePath: string
  ): PluginManifest | null {
    // Check for agency-specific manifest field
    const agencyManifest = packageJson[AGENCY_MANIFEST_FIELD];

    if (agencyManifest && typeof agencyManifest === 'object') {
      // Use agency field with package.json fallbacks
      const manifest = {
        id: packageJson['name'] as string,
        name: (agencyManifest as Record<string, unknown>)['name'] ?? packageJson['name'],
        version: packageJson['version'] as string,
        description: packageJson['description'] as string | undefined,
        main: (agencyManifest as Record<string, unknown>)['main'] ?? packageJson['main'] ?? './dist/index.js',
        types: packageJson['types'] as string | undefined,
        ...agencyManifest,
      };

      return safeParseManifest(manifest);
    }

    // Fall back to constructing manifest from package.json
    const manifest = {
      id: packageJson['name'] as string,
      name: packageJson['name'] as string,
      version: packageJson['version'] as string,
      description: packageJson['description'] as string | undefined,
      main: packageJson['main'] as string ?? './dist/index.js',
      types: packageJson['types'] as string | undefined,
      dependencies: [],
      critical: false,
    };

    return safeParseManifest(manifest);
  }
}

/**
 * Find the nearest node_modules directory from a starting path
 *
 * @param startPath Starting directory path
 * @returns Path to node_modules or null if not found
 */
export async function findNodeModules(startPath: string): Promise<string | null> {
  let currentPath = startPath;

  while (currentPath !== dirname(currentPath)) {
    const nodeModulesPath = join(currentPath, 'node_modules');

    try {
      const stats = await stat(nodeModulesPath);
      if (stats.isDirectory()) {
        return nodeModulesPath;
      }
    } catch {
      // Directory doesn't exist, continue up
    }

    currentPath = dirname(currentPath);
  }

  return null;
}

/**
 * Create default discovery options for a project
 *
 * @param projectRoot Root directory of the project
 * @param additionalSearchPaths Optional additional paths to scan for plugins
 * @param additionalPlugins Optional explicit plugin paths
 * @returns Discovery options
 */
export function createDiscoveryOptions(
  projectRoot: string,
  additionalSearchPaths?: string[],
  additionalPlugins?: string[]
): DiscoveryOptions {
  const searchPaths = [join(projectRoot, 'node_modules')];

  // Add additional search paths if provided
  if (additionalSearchPaths) {
    searchPaths.push(...additionalSearchPaths);
  }

  return {
    searchPaths,
    additionalPlugins,
    pattern: DEFAULT_PLUGIN_PATTERN,
  };
}
