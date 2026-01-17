/**
 * Configuration schema definitions using Zod
 *
 * Defines the structure and validation for Agency configuration
 * loaded from multiple sources.
 */

import { z } from 'zod';

/**
 * Schema for Agency configuration
 */
export const AgencyConfigSchema = z.object({
  /** Server name for MCP identification */
  name: z.string().min(1, 'Server name is required'),

  /** List of plugin package names or instances to load */
  plugins: z.array(z.string()).default([]),

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
  modes: { default: ['*'] },
  defaultMode: 'default',
};
