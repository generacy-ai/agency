/**
 * Configuration schema definitions using Zod
 *
 * Defines the structure and validation for Agency configuration
 * loaded from multiple sources.
 */

import { z } from 'zod';

// Re-export mode schemas and types from modes module
// These are available for consumers who want to use the full mode configuration
export {
  ModeDefinitionSchema,
  ModeConfigSchema,
  type ModeDefinition,
  type ModeConfig,
  type ResolvedMode,
  type ModeDefinitionInput,
  type ModeConfigInput,
} from '../modes/types.js';

/**
 * Default mode → tool-pattern map.
 *
 * Plugins may restrict themselves to named modes via their manifest `modes`
 * field (spec-kit declares `["research","coding"]`, npm declares
 * `["coding","review"]`). The previous default exposed a single `default` mode,
 * which matched none of those names — so an unconfigured server silently
 * dropped every mode-scoped plugin's tools while still reporting a healthy
 * connection. Covering the built-in mode names keeps first-party plugins usable
 * without a per-repo `.agency/config.json`.
 */
export const DEFAULT_MODE_PATTERNS: Record<string, string[]> = {
  default: ['*'],
  research: ['*'],
  coding: ['*'],
  review: ['*'],
  debug: ['*'],
};

/**
 * Mode assumed when a project does not pick one.
 *
 * `coding` is the only built-in mode named by every mode-scoped first-party
 * plugin, so it is the default that exposes the most tools.
 */
export const DEFAULT_MODE = 'coding';

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
    .default(() => ({ ...DEFAULT_MODE_PATTERNS })),

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
  modes: { ...DEFAULT_MODE_PATTERNS },
  defaultMode: DEFAULT_MODE,
};
