/**
 * Plugin Loader for Agency
 *
 * Manages plugin lifecycle: loading, initialization, and shutdown.
 * Plugins are initialized in load order and shut down in reverse order.
 */

import { AgencyError, ErrorCodes } from '../errors/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { AgencyPlugin } from './types.js';

/**
 * Plugin loader for managing plugin lifecycle
 */
export class PluginLoader {
  private readonly loadedPlugins: AgencyPlugin[] = [];
  private readonly registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Load a plugin instance
   *
   * @param plugin The plugin to load
   * @throws AgencyError if plugin initialization fails
   */
  async loadPlugin(plugin: AgencyPlugin): Promise<void> {
    try {
      // Initialize the plugin if it has an initialize method
      if (plugin.initialize) {
        await plugin.initialize();
      }

      // Register all tools from the plugin
      for (const tool of plugin.tools) {
        this.registry.register(tool);
      }

      // Track the loaded plugin
      this.loadedPlugins.push(plugin);
    } catch (error) {
      throw new AgencyError(
        ErrorCodes.PLUGIN_INIT_FAILED,
        `Failed to initialize plugin: ${plugin.name}`,
        {
          pluginName: plugin.name,
          pluginVersion: plugin.version,
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Unload a plugin by name
   *
   * @param name The plugin name to unload
   * @returns true if the plugin was found and unloaded
   */
  async unloadPlugin(name: string): Promise<boolean> {
    const index = this.loadedPlugins.findIndex((p) => p.name === name);
    if (index === -1) {
      return false;
    }

    const plugin = this.loadedPlugins[index];
    if (!plugin) {
      return false;
    }

    // Unregister all tools from the plugin
    for (const tool of plugin.tools) {
      this.registry.unregister(tool.name);
    }

    // Shutdown the plugin if it has a shutdown method
    if (plugin.shutdown) {
      try {
        await plugin.shutdown();
      } catch {
        // Log but don't throw during cleanup
      }
    }

    // Remove from loaded plugins
    this.loadedPlugins.splice(index, 1);
    return true;
  }

  /**
   * Get a loaded plugin by name
   */
  getPlugin(name: string): AgencyPlugin | undefined {
    return this.loadedPlugins.find((p) => p.name === name);
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): readonly AgencyPlugin[] {
    return this.loadedPlugins;
  }

  /**
   * Shutdown all plugins in reverse order
   */
  async shutdownAll(): Promise<void> {
    // Shutdown in reverse order (last loaded = first shutdown)
    const reversed = [...this.loadedPlugins].reverse();

    for (const plugin of reversed) {
      if (plugin.shutdown) {
        try {
          await plugin.shutdown();
        } catch {
          // Log but continue with other plugins
        }
      }

      // Unregister tools
      for (const tool of plugin.tools) {
        this.registry.unregister(tool.name);
      }
    }

    // Clear the list
    this.loadedPlugins.length = 0;
  }

  /**
   * Get the number of loaded plugins
   */
  get count(): number {
    return this.loadedPlugins.length;
  }
}
