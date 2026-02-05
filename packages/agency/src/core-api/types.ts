/**
 * Core API type definitions for Agency
 *
 * The AgencyCoreAPI provides plugins with controlled access to
 * core Agency functionality during initialization and runtime.
 */

import type { AgencyTool } from '../tools/types.js';
import type {
  AgencyCoreAPI,
  ChannelDefinition,
  MessageEnvelope,
  TelemetryEvent,
} from '../plugins/types.js';
import type { AgencyFacetRegistry } from '../facets/registry.js';

// Re-export the core types from plugins/types.ts for convenience
export type {
  AgencyCoreAPI,
  ChannelDefinition,
  MessageEnvelope,
  TelemetryEvent,
};

/**
 * Factory for creating scoped CoreAPI instances per plugin
 */
export interface CoreAPIFactory {
  /**
   * Create a CoreAPI instance scoped to a specific plugin
   *
   * @param pluginId The plugin ID for scoping
   * @returns A CoreAPI instance with plugin-scoped operations
   */
  createForPlugin(pluginId: string): AgencyCoreAPI;
}

/**
 * Message handler function type for channel subscriptions
 */
export type MessageHandler<T = unknown> = (message: MessageEnvelope<T>) => void;

/**
 * Mode change callback function type
 */
export type ModeChangeCallback = (mode: string) => void;

/**
 * Unsubscribe function returned by subscription methods
 */
export type Unsubscribe = () => void;

/**
 * Dependencies required to create a CoreAPI implementation
 */
export interface CoreAPIDependencies {
  /** Tool registry for tool operations */
  toolRegistry: {
    register(tool: AgencyTool): void;
    unregister(name: string): boolean;
  };

  /** Mode manager for mode operations */
  modeManager: {
    getMode(): string;
    registerMode(mode: string, patterns?: string[], pluginId?: string): void;
    onModeChange(callback: ModeChangeCallback): Unsubscribe;
  };

  /** Channel manager for channel operations */
  channelManager: {
    registerChannel(channel: ChannelDefinition): void;
    send<T>(channel: string, message: MessageEnvelope<T>): Promise<{ successCount: number; errors: Array<{ handler: string; error: Error }> }>;
    sendAndWait<T, R = unknown>(channelId: string, message: MessageEnvelope<T>, timeout?: number): Promise<MessageEnvelope<R>>;
    subscribe<T>(channel: string, handler: MessageHandler<T>): Unsubscribe;
    getChannels(): ChannelDefinition[];
    findChannel(id: string, minVersion?: string): ChannelDefinition | undefined;
    findPair(channel: ChannelDefinition): ChannelDefinition[];
  };

  /** Configuration access */
  config: Record<string, unknown>;

  /** Telemetry recording function */
  recordEvent(event: TelemetryEvent): void;

  /** Facet registry for facet operations */
  facetRegistry: AgencyFacetRegistry;
}
