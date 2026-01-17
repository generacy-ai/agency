/**
 * Configuration schema definitions using Zod
 *
 * Defines the structure and validation for Agency configuration
 * loaded from multiple sources.
 */

import { z } from 'zod';

/**
 * Schema for plugin-specific configuration
 */
export const PluginConfigSchema = z.object({
  /** Additional paths to scan for plugins (besides node_modules) */
  pluginPaths: z.array(z.string()).default([]),

  /** Explicit plugin paths or package names to load */
  plugins: z.array(z.string()).default([]),

  /** Plugin-specific configuration keyed by plugin ID */
  pluginOptions: z.record(z.unknown()).default({}),
});

/**
 * Schema for Agency configuration
 */
export const AgencyConfigSchema = z.object({
  /** Server name for MCP identification */
  name: z.string().min(1, 'Server name is required'),

  /** List of plugin package names or instances to load */
  plugins: z.array(z.string()).default([]),

  /** Additional paths to scan for plugins (besides node_modules) */
  pluginPaths: z.array(z.string()).default([]),

  /** Plugin-specific configuration keyed by plugin ID */
  pluginOptions: z.record(z.unknown()).default({}),

  /** Mode definitions mapping mode name to tool patterns */
  modes: z
    .record(z.array(z.string()))
    .default({ default: ['*'] }),

  /** Default mode to use on startup */
  defaultMode: z.string().optional(),
});

/**
 * Agency configuration type
 */
export type AgencyConfig = z.infer<typeof AgencyConfigSchema>;

/**
 * Plugin-specific configuration type
 */
export type PluginConfig = z.infer<typeof PluginConfigSchema>;

/**
 * Partial configuration for merging from multiple sources
 */
export type PartialAgencyConfig = Partial<AgencyConfig>;

/**
 * Represents a configuration source with priority
 */
export interface ConfigSource {
  /** Priority (lower = higher priority) */
  priority: number;

  /** Source identifier for debugging */
  name: string;

  /** Partial config from this source */
  config: PartialAgencyConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AgencyConfig = {
  name: 'agency',
  plugins: [],
  pluginPaths: [],
  pluginOptions: {},
  modes: { default: ['*'] },
  defaultMode: 'default',
};
