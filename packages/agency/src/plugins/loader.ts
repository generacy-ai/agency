/**
 * Plugin Loader for Agency
 *
 * Manages plugin lifecycle: loading, initialization, and shutdown.
 * Plugins are initialized in dependency order and shut down in reverse order.
 *
 * Enhanced to support:
 * - Plugin discovery from node_modules and configured paths
 * - Manifest validation with Zod schemas
 * - Dependency resolution with topological sorting
 * - Configurable failure isolation (critical vs non-critical plugins)
 * - CoreAPI-based plugin initialization
 */

import { AgencyError, ErrorCodes } from '../errors/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { CoreAPIFactory } from '../core-api/core-api.js';
import type { ChannelManager } from '../channels/manager.js';
import type { ModeManager } from '../modes/manager.js';
import type {
  AgencyPlugin,
  DiscoveredPlugin,
  PluginManifest,
  PluginState,
  LegacyAgencyPlugin,
} from './types.js';
import { PluginDiscovery, createDiscoveryOptions } from './discovery.js';
import { validateManifest } from './manifest.js';
import { DependencyResolver, checkDependencies } from './dependency-resolver.js';

/**
 * Extended error codes for plugin loading (re-export for convenience)
 */
export const PluginErrorCodes = {
  MANIFEST_INVALID: ErrorCodes.PLUGIN_MANIFEST_INVALID,
  DEPENDENCY_MISSING: ErrorCodes.PLUGIN_MISSING_DEPS,
  DEPENDENCY_CYCLE: ErrorCodes.PLUGIN_DEPENDENCY_CYCLE,
  CRITICAL_PLUGIN_FAILED: ErrorCodes.CRITICAL_PLUGIN_INIT_FAILED,
} as const;

/**
 * Options for loading plugins
 */
export interface PluginLoadOptions {
  /** Project root for discovery */
  projectRoot?: string;

  /** Additional plugin paths to scan */
  pluginPaths?: string[];

  /** Explicit plugin package names to load */
  plugins?: string[];

  /** Plugin-specific configuration */
  pluginOptions?: Record<string, unknown>;
}

/**
 * Dependencies required by PluginLoader
 */
export interface PluginLoaderDependencies {
  /** Tool registry for tool management */
  toolRegistry: ToolRegistry;

  /** Optional CoreAPI factory for enhanced plugins */
  coreAPIFactory?: CoreAPIFactory;

  /** Optional channel manager for cleanup */
  channelManager?: ChannelManager;

  /** Optional mode manager for cleanup */
  modeManager?: ModeManager;
}

/**
 * Enhanced Plugin loader with discovery, validation, and dependency resolution
 */
export class PluginLoader {
  private readonly pluginStates: Map<string, PluginState> = new Map();
  private readonly registry: ToolRegistry;
  private readonly coreAPIFactory?: CoreAPIFactory;
  private readonly channelManager?: ChannelManager;
  private readonly modeManager?: ModeManager;
  private readonly discovery: PluginDiscovery;
  private readonly resolver: DependencyResolver;
  private loadOrder: string[] = [];

  constructor(deps: ToolRegistry | PluginLoaderDependencies) {
    // Support both old signature (just ToolRegistry) and new (dependencies object)
    if ('register' in deps) {
      this.registry = deps;
    } else {
      this.registry = deps.toolRegistry;
      this.coreAPIFactory = deps.coreAPIFactory;
      this.channelManager = deps.channelManager;
      this.modeManager = deps.modeManager;
    }

    this.discovery = new PluginDiscovery();
    this.resolver = new DependencyResolver();
  }

  /**
   * Discover and load all plugins from configured sources
   *
   * @param options Loading options
   * @returns Array of plugin IDs that were loaded
   */
  async discoverAndLoad(options: PluginLoadOptions = {}): Promise<string[]> {
    const projectRoot = options.projectRoot ?? process.cwd();

    // Discover plugins
    const discoveryOptions = createDiscoveryOptions(
      projectRoot,
      options.pluginPaths
    );
    const discovered = await this.discovery.discover(discoveryOptions);

    // Filter to requested plugins if specified
    let pluginsToLoad = discovered;
    if (options.plugins && options.plugins.length > 0) {
      const requestedSet = new Set(options.plugins);
      pluginsToLoad = discovered.filter((p) => requestedSet.has(p.manifest.id));
    }

    // Load discovered plugins
    return this.loadDiscoveredPlugins(pluginsToLoad, options.pluginOptions);
  }

  /**
   * Load discovered plugins with validation and dependency resolution
   *
   * @param discovered Array of discovered plugins
   * @param pluginOptions Optional plugin-specific configuration
   * @returns Array of plugin IDs that were loaded
   */
  async loadDiscoveredPlugins(
    discovered: DiscoveredPlugin[],
    pluginOptions?: Record<string, unknown>
  ): Promise<string[]> {
    const manifests = discovered.map((d) => d.manifest);

    // Validate all manifests
    for (const manifest of manifests) {
      const validation = validateManifest(manifest);
      if (!validation.valid) {
        throw new AgencyError(
          ErrorCodes.PLUGIN_MANIFEST_INVALID,
          `Invalid manifest for plugin: ${manifest.id}`,
          { pluginId: manifest.id, errors: validation.errors }
        );
      }
    }

    // Check dependencies
    const depCheck = checkDependencies(manifests);
    if (!depCheck.satisfied) {
      if (depCheck.missing.length > 0) {
        throw new AgencyError(
          ErrorCodes.PLUGIN_MISSING_DEPS,
          `Missing plugin dependencies: ${depCheck.missing.join(', ')}`,
          { missing: depCheck.missing }
        );
      }
      throw new AgencyError(
        ErrorCodes.PLUGIN_DEPENDENCY_CYCLE,
        'Circular dependency detected in plugins',
        {}
      );
    }

    // Get load order from dependency check
    this.loadOrder = depCheck.loadOrder ?? [];

    // Load plugins in dependency order
    const loaded: string[] = [];
    const discoveredMap = new Map(discovered.map((d) => [d.manifest.id, d]));

    for (const pluginId of this.loadOrder) {
      const plugin = discoveredMap.get(pluginId);
      if (!plugin) {
        continue;
      }

      try {
        await this.loadFromDiscovered(plugin, pluginOptions);
        loaded.push(pluginId);
      } catch (error) {
        // Check if this is a critical plugin
        if (plugin.manifest.critical) {
          throw new AgencyError(
            ErrorCodes.CRITICAL_PLUGIN_INIT_FAILED,
            `Critical plugin failed to load: ${pluginId}`,
            {
              pluginId,
              originalError: error instanceof Error ? error.message : String(error),
            }
          );
        }
        // Non-critical plugin: log and continue
        console.error(`Plugin ${pluginId} failed to load, disabling:`, error);
      }
    }

    return loaded;
  }

  /**
   * Load a plugin from discovered entry
   */
  private async loadFromDiscovered(
    discovered: DiscoveredPlugin,
    pluginOptions?: Record<string, unknown>
  ): Promise<void> {
    const { path: pluginPath, manifest } = discovered;

    // Import the plugin module
    const modulePath = `${pluginPath}/${manifest.main}`;
    const module = await import(modulePath);

    // Get the plugin factory or class
    const PluginClass = module.default ?? module[manifest.name] ?? module;

    // Create plugin instance
    let plugin: AgencyPlugin;
    if (typeof PluginClass === 'function') {
      plugin = new PluginClass();
    } else {
      plugin = PluginClass;
    }

    // Ensure manifest is attached
    if (!plugin.manifest) {
      plugin.manifest = manifest;
    }

    // Load the plugin
    await this.loadPlugin(plugin, pluginOptions);
  }

  /**
   * Load a plugin instance
   *
   * @param plugin The plugin to load
   * @param pluginOptions Optional plugin-specific configuration
   * @throws AgencyError if plugin initialization fails (for critical plugins)
   */
  async loadPlugin(
    plugin: AgencyPlugin | LegacyAgencyPlugin,
    _pluginOptions?: Record<string, unknown>
  ): Promise<void> {
    const pluginId = this.getPluginId(plugin);

    // Check if already loaded
    if (this.pluginStates.has(pluginId)) {
      return;
    }

    // Create plugin state
    const state: PluginState = {
      manifest: this.getOrCreateManifest(plugin),
      instance: plugin as AgencyPlugin,
      status: 'initializing',
      cleanups: [],
    };
    this.pluginStates.set(pluginId, state);

    try {
      // Initialize the plugin
      if (this.isEnhancedPlugin(plugin)) {
        // Enhanced plugin with CoreAPI
        if (this.coreAPIFactory) {
          const coreAPI = this.coreAPIFactory.createForPlugin(pluginId);
          await plugin.initialize(coreAPI);
        } else {
          throw new AgencyError(
            ErrorCodes.PLUGIN_INIT_FAILED,
            `Plugin ${pluginId} requires CoreAPI but no factory was provided`,
            { pluginId }
          );
        }
      } else {
        // Legacy plugin
        const legacyPlugin = plugin as LegacyAgencyPlugin;
        if (legacyPlugin.initialize) {
          await legacyPlugin.initialize();
        }
        // Register tools for legacy plugins
        if (legacyPlugin.tools) {
          for (const tool of legacyPlugin.tools) {
            this.registry.register(tool);
          }
        }
      }

      state.status = 'active';
    } catch (error) {
      state.status = 'failed';
      state.error = error instanceof Error ? error : new Error(String(error));

      // Remove from states
      this.pluginStates.delete(pluginId);

      // Check if critical
      const isCritical = state.manifest.critical;
      if (isCritical) {
        throw new AgencyError(
          ErrorCodes.CRITICAL_PLUGIN_INIT_FAILED,
          `Critical plugin failed to initialize: ${pluginId}`,
          {
            pluginId,
            originalError: error instanceof Error ? error.message : String(error),
          }
        );
      }

      throw new AgencyError(
        ErrorCodes.PLUGIN_INIT_FAILED,
        `Failed to initialize plugin: ${pluginId}`,
        {
          pluginId,
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Unload a plugin by ID
   *
   * @param pluginId The plugin ID to unload
   * @returns true if the plugin was found and unloaded
   */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    const state = this.pluginStates.get(pluginId);
    if (!state) {
      // Try legacy lookup by name
      for (const [id, s] of this.pluginStates) {
        if (s.manifest.name === pluginId) {
          return this.unloadPlugin(id);
        }
      }
      return false;
    }

    state.status = 'shutting_down';

    try {
      // Run cleanup functions
      for (const cleanup of state.cleanups) {
        try {
          await cleanup();
        } catch {
          // Ignore cleanup errors
        }
      }

      // Cleanup channel subscriptions
      if (this.channelManager) {
        this.channelManager.unregisterChannelsByOwner(pluginId);
      }

      // Cleanup mode registrations
      if (this.modeManager) {
        this.modeManager.unregisterModesByPlugin(pluginId);
      }

      // Shutdown the plugin
      if (state.instance.shutdown) {
        try {
          await state.instance.shutdown();
        } catch {
          // Log but don't throw during cleanup
        }
      }

      // For legacy plugins, unregister tools
      if (!this.isEnhancedPlugin(state.instance)) {
        const legacyPlugin = state.instance as unknown as LegacyAgencyPlugin;
        if (legacyPlugin.tools) {
          for (const tool of legacyPlugin.tools) {
            this.registry.unregister(tool.name);
          }
        }
      }

      state.status = 'unloaded';
    } finally {
      this.pluginStates.delete(pluginId);
    }

    return true;
  }

  /**
   * Get a loaded plugin by ID or name
   */
  getPlugin(idOrName: string): AgencyPlugin | undefined {
    const state = this.pluginStates.get(idOrName);
    if (state) {
      return state.instance;
    }

    // Try lookup by name
    for (const s of this.pluginStates.values()) {
      if (s.manifest.name === idOrName) {
        return s.instance;
      }
    }

    return undefined;
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): readonly AgencyPlugin[] {
    return [...this.pluginStates.values()].map((s) => s.instance);
  }

  /**
   * Get plugin state by ID
   */
  getPluginState(pluginId: string): PluginState | undefined {
    return this.pluginStates.get(pluginId);
  }

  /**
   * Shutdown all plugins in reverse dependency order
   */
  async shutdownAll(): Promise<void> {
    // Get shutdown order (reverse of load order)
    const shutdownOrder = [...this.loadOrder].reverse();

    // If no load order, use all plugins in reverse insertion order
    if (shutdownOrder.length === 0) {
      shutdownOrder.push(...[...this.pluginStates.keys()].reverse());
    }

    for (const pluginId of shutdownOrder) {
      await this.unloadPlugin(pluginId);
    }

    // Clear any remaining state
    this.pluginStates.clear();
    this.loadOrder = [];
  }

  /**
   * Get the number of loaded plugins
   */
  get count(): number {
    return this.pluginStates.size;
  }

  /**
   * Notify all plugins of a mode change
   */
  notifyModeChange(mode: string): void {
    for (const state of this.pluginStates.values()) {
      if (state.status === 'active' && state.instance.onModeChange) {
        try {
          state.instance.onModeChange(mode);
        } catch {
          // Ignore notification errors
        }
      }
    }
  }

  /**
   * Notify all plugins of a tool call
   */
  notifyToolCall(tool: string, params: unknown): void {
    for (const state of this.pluginStates.values()) {
      if (state.status === 'active' && state.instance.onToolCall) {
        try {
          state.instance.onToolCall(tool, params);
        } catch {
          // Ignore notification errors
        }
      }
    }
  }

  /**
   * Check if a plugin is the enhanced type
   */
  private isEnhancedPlugin(plugin: AgencyPlugin | LegacyAgencyPlugin): plugin is AgencyPlugin {
    return 'manifest' in plugin && typeof plugin.initialize === 'function' &&
           plugin.initialize.length === 1; // Takes coreAPI parameter
  }

  /**
   * Get plugin ID from plugin instance
   */
  private getPluginId(plugin: AgencyPlugin | LegacyAgencyPlugin): string {
    if ('manifest' in plugin && plugin.manifest) {
      return plugin.manifest.id;
    }
    return (plugin as LegacyAgencyPlugin).name;
  }

  /**
   * Create a manifest for legacy plugins
   */
  private getOrCreateManifest(plugin: AgencyPlugin | LegacyAgencyPlugin): PluginManifest {
    if ('manifest' in plugin && plugin.manifest) {
      return plugin.manifest;
    }

    const legacy = plugin as LegacyAgencyPlugin;
    return {
      id: legacy.name,
      name: legacy.name,
      version: legacy.version,
      main: '',
      dependencies: [],
      critical: false,
    };
  }
}
