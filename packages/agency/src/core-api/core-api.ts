/**
 * Core API Implementation for Agency
 *
 * Provides the AgencyCoreAPI implementation that is passed to plugins
 * during initialization. Each plugin receives a scoped instance.
 */

import type { AgencyTool } from '../tools/types.js';
import type {
  AgencyCoreAPI,
  ChannelDefinition,
  MessageEnvelope,
  TelemetryEvent,
} from '../plugins/types.js';
import type {
  CoreAPIDependencies,
  MessageHandler,
  ModeChangeCallback,
  Unsubscribe,
} from './types.js';

/**
 * CoreAPI factory for creating plugin-scoped API instances
 */
export class CoreAPIFactory {
  private readonly dependencies: CoreAPIDependencies;

  constructor(dependencies: CoreAPIDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Create a CoreAPI instance scoped to a specific plugin
   *
   * @param pluginId The plugin ID for scoping
   * @returns A CoreAPI instance with plugin-scoped operations
   */
  createForPlugin(pluginId: string): AgencyCoreAPI {
    return new PluginCoreAPI(pluginId, this.dependencies);
  }
}

/**
 * Plugin-scoped CoreAPI implementation
 *
 * Provides controlled access to core Agency functionality.
 * Operations are scoped to the plugin for tracking and cleanup.
 */
class PluginCoreAPI implements AgencyCoreAPI {
  private readonly pluginId: string;
  private readonly dependencies: CoreAPIDependencies;
  private readonly registeredTools: Set<string> = new Set();
  private readonly registeredChannels: Set<string> = new Set();
  private readonly subscriptions: Set<Unsubscribe> = new Set();

  constructor(pluginId: string, dependencies: CoreAPIDependencies) {
    this.pluginId = pluginId;
    this.dependencies = dependencies;
  }

  /**
   * Get the plugin ID for this API instance
   */
  getPluginId(): string {
    return this.pluginId;
  }

  /**
   * Register a tool with the tool registry
   *
   * Tools are tracked for cleanup during plugin unload.
   */
  registerTool(tool: AgencyTool): void {
    this.dependencies.toolRegistry.register(tool);
    this.registeredTools.add(tool.name);
  }

  /**
   * Unregister a tool by name
   *
   * Only allows unregistering tools that were registered by this plugin.
   */
  unregisterTool(name: string): void {
    if (this.registeredTools.has(name)) {
      this.dependencies.toolRegistry.unregister(name);
      this.registeredTools.delete(name);
    }
  }

  /**
   * Get the current mode
   */
  getCurrentMode(): string {
    return this.dependencies.modeManager.getMode();
  }

  /**
   * Register a new mode
   *
   * The mode is associated with this plugin for tracking.
   */
  registerMode(mode: string): void {
    this.dependencies.modeManager.registerMode(mode, ['*'], this.pluginId);
  }

  /**
   * Subscribe to mode changes
   *
   * Returns an unsubscribe function. Subscriptions are tracked
   * for cleanup during plugin unload.
   */
  onModeChange(callback: ModeChangeCallback): Unsubscribe {
    const unsubscribe = this.dependencies.modeManager.onModeChange(callback);
    this.subscriptions.add(unsubscribe);

    // Return a wrapped unsubscribe that also removes from tracking
    return () => {
      unsubscribe();
      this.subscriptions.delete(unsubscribe);
    };
  }

  /**
   * Register a communication channel
   *
   * The channel is owned by this plugin.
   */
  registerChannel(channel: ChannelDefinition): void {
    // Ensure owner is set to this plugin
    const ownedChannel: ChannelDefinition = {
      ...channel,
      owner: this.pluginId,
    };
    this.dependencies.channelManager.registerChannel(ownedChannel);
    this.registeredChannels.add(channel.name);
  }

  /**
   * Send a message to a channel
   */
  sendMessage<T>(channel: string, message: MessageEnvelope<T>): void {
    // Ensure sender is set to this plugin
    const ownedMessage: MessageEnvelope<T> = {
      ...message,
      sender: this.pluginId,
    };
    this.dependencies.channelManager.send(channel, ownedMessage);
  }

  /**
   * Subscribe to channel messages
   *
   * Returns an unsubscribe function. Subscriptions are tracked
   * for cleanup during plugin unload.
   */
  onMessage<T>(channel: string, handler: MessageHandler<T>): Unsubscribe {
    const unsubscribe = this.dependencies.channelManager.subscribe(channel, handler);
    this.subscriptions.add(unsubscribe);

    // Return a wrapped unsubscribe that also removes from tracking
    return () => {
      unsubscribe();
      this.subscriptions.delete(unsubscribe);
    };
  }

  /**
   * Get configuration value by key
   *
   * Looks up in both plugin-specific options and global config.
   */
  getConfig<T>(key: string): T | undefined {
    // First check plugin-specific options
    const pluginOptions = this.dependencies.config['pluginOptions'] as
      | Record<string, unknown>
      | undefined;
    if (pluginOptions && this.pluginId in pluginOptions) {
      const pluginConfig = pluginOptions[this.pluginId] as Record<string, unknown>;
      if (key in pluginConfig) {
        return pluginConfig[key] as T;
      }
    }

    // Fall back to global config
    return this.dependencies.config[key] as T | undefined;
  }

  /**
   * Record a telemetry event
   *
   * Automatically adds plugin ID to event data.
   */
  recordEvent(event: TelemetryEvent): void {
    const enrichedEvent: TelemetryEvent = {
      ...event,
      data: {
        ...event.data,
        pluginId: this.pluginId,
      },
    };
    this.dependencies.recordEvent(enrichedEvent);
  }

  /**
   * Get all tools registered by this plugin
   */
  getRegisteredTools(): string[] {
    return [...this.registeredTools];
  }

  /**
   * Get all channels registered by this plugin
   */
  getRegisteredChannels(): string[] {
    return [...this.registeredChannels];
  }

  /**
   * Cleanup all resources registered by this plugin
   *
   * Called during plugin unload to clean up tools, channels,
   * and subscriptions.
   */
  cleanup(): void {
    // Unsubscribe from all subscriptions
    for (const unsubscribe of this.subscriptions) {
      try {
        unsubscribe();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.subscriptions.clear();

    // Unregister all tools
    for (const toolName of this.registeredTools) {
      try {
        this.dependencies.toolRegistry.unregister(toolName);
      } catch {
        // Ignore cleanup errors
      }
    }
    this.registeredTools.clear();

    // Note: Channels are cleaned up by ChannelManager.unregisterChannelsByOwner
    this.registeredChannels.clear();
  }
}

/**
 * Create a CoreAPI factory with the given dependencies
 */
export function createCoreAPIFactory(dependencies: CoreAPIDependencies): CoreAPIFactory {
  return new CoreAPIFactory(dependencies);
}
