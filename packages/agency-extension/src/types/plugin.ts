/**
 * Plugin-related type definitions for the Agency VS Code extension.
 */

/**
 * Plugin configuration stored in agency.config.json.
 * Represents user-configurable settings for a plugin.
 */
export interface PluginConfig {
  /** Unique plugin identifier (e.g., 'autodev', 'speckit') */
  id: string;

  /** Whether the plugin is enabled */
  enabled: boolean;

  /** Plugin-specific settings */
  settings: Record<string, unknown>;
}

/**
 * Plugin manifest describing a plugin's capabilities.
 * Typically loaded from the plugin's package or registration.
 */
export interface PluginManifest {
  /** Unique plugin identifier */
  id: string;

  /** Human-readable plugin name */
  name: string;

  /** Plugin description */
  description: string;

  /** Plugin version (semver) */
  version: string;

  /** Plugin author or maintainer */
  author?: string;

  /** Plugin homepage or documentation URL */
  homepage?: string;

  /** Tools provided by this plugin */
  tools: string[];

  /** JSON Schema for plugin settings */
  settingsSchema?: JsonSchemaDefinition;
}

/**
 * Runtime state of a plugin.
 */
export interface PluginState {
  /** Plugin identifier */
  id: string;

  /** Whether the plugin is currently enabled */
  enabled: boolean;

  /** Whether the plugin is currently loaded and active */
  loaded: boolean;

  /** Error message if the plugin failed to load */
  error?: string;

  /** Timestamp of last state change */
  lastUpdated: number;
}

/**
 * Combined plugin information for UI display.
 */
export interface PluginInfo {
  /** Plugin manifest */
  manifest: PluginManifest;

  /** Current configuration */
  config: PluginConfig;

  /** Current runtime state */
  state: PluginState;
}

/**
 * Simplified JSON Schema definition for settings validation.
 * This is a subset of JSON Schema used for plugin settings.
 */
export interface JsonSchemaDefinition {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  description?: string;
}

/**
 * JSON Schema property definition.
 */
export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/**
 * Metadata for a plugin returned from the MCP server via `agency.plugins_describe`.
 * Used to discover plugin settings schemas for rendering typed form controls.
 */
export interface PluginMetadata {
  /** Unique plugin identifier */
  id: string;

  /** Human-readable plugin name */
  name: string;

  /** Plugin description */
  description?: string;

  /** Plugin version (semver) */
  version?: string;

  /** JSON Schema defining the plugin's configurable settings */
  settingsSchema?: JsonSchemaDefinition;
}
