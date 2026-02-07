/**
 * Plugin type definitions for Agency
 *
 * Plugins extend the server with additional tools and lifecycle hooks.
 * This interface is defined locally for forward compatibility with the
 * contracts repo (generacy-ai/contracts#7).
 */

import type { AgencyTool } from '../tools/types.js';
import type { FacetProvider, FacetRequirement } from '@generacy-ai/latency';

/**
 * Plugin manifest metadata describing a plugin
 *
 * Read from package.json or dedicated manifest file during discovery.
 */
export interface PluginManifest {
  /** Unique identifier (npm package name format: @scope/name) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Semantic version */
  version: string;

  /** Plugin description */
  description?: string;

  /** Entry point relative to package root */
  main: string;

  /** TypeScript types file */
  types?: string;

  /** Plugin dependencies (other plugin IDs) */
  dependencies: string[];

  /** Peer dependencies with version ranges */
  peerDependencies?: Record<string, string>;

  /** Tool names this plugin provides */
  tools?: string[];

  /** Mode names this plugin registers */
  modes?: string[];

  /** Channel names this plugin registers */
  channels?: string[];

  /** If true, plugin failure stops the system */
  critical: boolean;

  // === Facet Declarations (Latency integration) ===

  /** Facets this plugin provides (implements) */
  provides?: FacetProvider[];

  /** Facets this plugin requires (must be available at startup) */
  requires?: FacetRequirement[];

  /** Optional facets this plugin can use if available */
  uses?: FacetRequirement[];
}

/**
 * Core API provided to plugins for interacting with Agency
 *
 * Each plugin receives a scoped instance during initialization that
 * provides controlled access to tools, modes, channels, config, and telemetry.
 */
export interface AgencyCoreAPI {
  /** Register a tool with the tool registry */
  registerTool(tool: AgencyTool): void;

  /** Unregister a tool by name */
  unregisterTool(name: string): void;

  /** Get the current mode */
  getCurrentMode(): string;

  /** Register a new mode */
  registerMode(mode: string): void;

  /** Subscribe to mode changes, returns unsubscribe function */
  onModeChange(callback: (mode: string) => void): () => void;

  /** Register a communication channel */
  registerChannel(channel: ChannelDefinition): void;

  /** Send a message to a channel */
  sendMessage<T>(channel: string, message: MessageEnvelope<T>): void;

  /** Subscribe to channel messages, returns unsubscribe function */
  onMessage<T>(channel: string, handler: (msg: MessageEnvelope<T>) => void): () => void;

  /** Get configuration value by key */
  getConfig<T>(key: string): T | undefined;

  /** Record a telemetry event */
  recordEvent(event: TelemetryEvent): void;

  /** Get the plugin ID for this API instance */
  getPluginId(): string;

  // === Facet Methods (Latency integration) ===

  /**
   * Register a facet implementation.
   *
   * Called during plugin initialization to provide a facet implementation.
   * The registration is tracked for cleanup when the plugin is unloaded.
   *
   * @typeParam T - The facet implementation type.
   * @param facet - The facet identifier (e.g., "SourceControl").
   * @param implementation - The facet implementation instance.
   * @param qualifier - Optional qualifier for this implementation (e.g., "git").
   */
  provide<T>(facet: string, implementation: T, qualifier?: string): void;

  /**
   * Request a required facet.
   *
   * Use this to obtain a facet that your plugin requires. If the facet
   * is not available, an error is thrown.
   *
   * @typeParam T - The expected facet type.
   * @param facet - The facet identifier.
   * @param qualifier - Optional qualifier to request a specific implementation.
   * @returns The facet implementation.
   * @throws FacetNotFoundError if the facet is not available.
   * @throws AmbiguousFacetError if multiple providers exist without qualifier.
   */
  require<T>(facet: string, qualifier?: string): T;

  /**
   * Request an optional facet.
   *
   * Use this to obtain a facet that your plugin can use if available.
   * Returns undefined if the facet is not available.
   *
   * @typeParam T - The expected facet type.
   * @param facet - The facet identifier.
   * @param qualifier - Optional qualifier to request a specific implementation.
   * @returns The facet implementation, or undefined if not available.
   */
  optional<T>(facet: string, qualifier?: string): T | undefined;
}

/**
 * Channel definition for inter-plugin communication
 */
export interface ChannelDefinition {
  /** Channel identifier */
  name: string;

  /** Channel schema version (semver format) */
  version?: string;

  /** Human-readable description */
  description: string;

  /** Plugin that owns/created this channel */
  owner: string;

  /** Supported message type identifiers */
  messageTypes?: string[];

  /** Cross-component pairing configuration */
  pairedWith?: {
    component: 'agency' | 'humancy' | 'generacy';
    channelId: string;
  };

  /** Message schema for validation (optional) */
  messageSchema?: Record<string, unknown>;
}

/**
 * Message envelope for channel communication
 */
export interface MessageEnvelope<T = unknown> {
  /** Message unique identifier */
  id: string;

  /** Channel name */
  channel: string;

  /** Sender plugin ID */
  sender: string;

  /** Message timestamp */
  timestamp: Date;

  /** Message payload */
  payload: T;

  /** Optional correlation ID for request/response patterns */
  correlationId?: string;
}

/**
 * Telemetry event recorded by plugins
 */
export interface TelemetryEvent {
  /** Event type identifier */
  type: string;

  /** Event timestamp */
  timestamp: Date;

  /** Event payload */
  data: Record<string, unknown>;
}

/**
 * Plugin interface for extending the Agency server
 *
 * Plugins provide tools and optional lifecycle hooks for initialization
 * and cleanup. The enhanced interface supports the full plugin lifecycle
 * including manifest-based discovery and CoreAPI access.
 */
export interface AgencyPlugin {
  /** Plugin metadata manifest */
  manifest: PluginManifest;

  /**
   * Initialize the plugin with core API access
   *
   * Called during plugin loading after dependencies are initialized.
   * Use the core API to register tools, modes, and channels.
   */
  initialize(core: AgencyCoreAPI): Promise<void>;

  /**
   * Clean shutdown of the plugin
   *
   * Called during server shutdown in reverse dependency order.
   * Clean up any resources, subscriptions, or connections.
   */
  shutdown(): Promise<void>;

  /**
   * Optional hook called when mode changes
   *
   * Allows plugins to react to mode changes without explicit subscription.
   */
  onModeChange?(mode: string): void;

  /**
   * Optional hook called when any tool is invoked
   *
   * Useful for monitoring, logging, or audit purposes.
   */
  onToolCall?(tool: string, params: unknown): void;
}

/**
 * Legacy plugin interface for backwards compatibility
 *
 * @deprecated Use AgencyPlugin with manifest instead
 */
export interface LegacyAgencyPlugin {
  /** Unique plugin identifier */
  name: string;

  /** Semantic version */
  version: string;

  /** Tools provided by this plugin */
  tools: AgencyTool[];

  /** Called when plugin is loaded */
  initialize?(): Promise<void>;

  /** Called when plugin is unloaded or server shuts down */
  shutdown?(): Promise<void>;
}

/**
 * Result of manifest validation
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors if any */
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Result of dependency resolution
 */
export interface DependencyCheck {
  /** Whether all dependencies are satisfied */
  satisfied: boolean;

  /** Missing required dependencies */
  missing: string[];

  /** Version conflicts */
  conflicts: Array<{
    pluginId: string;
    required: string;
    available: string;
  }>;

  /** Load order if satisfied (topologically sorted) */
  loadOrder?: string[];
}

/**
 * Plugin discovered during discovery phase
 */
export interface DiscoveredPlugin {
  /** File path to the plugin package */
  path: string;

  /** Source of discovery */
  source: 'node_modules' | 'config' | 'explicit';

  /** Parsed manifest */
  manifest: PluginManifest;
}

/**
 * Options for plugin discovery
 */
export interface DiscoveryOptions {
  /** Paths to scan for plugins */
  searchPaths: string[];

  /** Additional explicit plugin paths */
  additionalPlugins?: string[];

  /** Package name pattern to match */
  pattern?: RegExp;
}

/**
 * Internal state tracking for loaded plugins
 */
export interface PluginState {
  /** Plugin manifest */
  manifest: PluginManifest;

  /** Plugin instance */
  instance: AgencyPlugin;

  /** Current lifecycle state */
  status: 'initializing' | 'active' | 'failed' | 'shutting_down' | 'unloaded';

  /** Error if status is 'failed' */
  error?: Error;

  /** Registered cleanup functions */
  cleanups: Array<() => void | Promise<void>>;
}
