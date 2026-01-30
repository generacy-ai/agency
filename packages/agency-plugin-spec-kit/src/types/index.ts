/**
 * Type definitions for @generacy-ai/agency-plugin-spec-kit
 */

// Re-export Agency types for convenience
export type {
  AgencyPlugin,
  AgencyCoreAPI,
  AgencyTool,
  PluginManifest,
} from '@generacy-ai/agency';

// Re-export config type
export type { SpecKitPluginConfig } from '../config.js';

/**
 * Base parameters shared by all spec tools
 */
export interface BaseToolParams {
  /** Working directory. Defaults to process.cwd() */
  cwd?: string;
}
