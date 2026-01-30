/**
 * @generacy-ai/agency-plugin-spec-kit
 *
 * Specification management plugin providing structured feature development tools for agents.
 *
 * Tools (to be added):
 * - spec.create - Create new feature spec
 * - spec.validate - Validate spec structure
 * - spec.list - List feature specs
 */

// Plugin
export { SpecKitPlugin, createSpecKitPlugin } from './plugin.js';

// Configuration
export { DEFAULT_CONFIG, resolveConfig } from './config.js';

// Manifest
export { PLUGIN_MANIFEST } from './manifest.js';

// Types
export type {
  BaseToolParams,
  SpecKitPluginConfig,
  // Re-exported Agency types
  AgencyPlugin,
  AgencyCoreAPI,
  AgencyTool,
  PluginManifest,
} from './types/index.js';

// Default export for plugin
import { SpecKitPlugin } from './plugin.js';
export default SpecKitPlugin;
