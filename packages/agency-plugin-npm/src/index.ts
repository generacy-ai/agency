/**
 * @generacy-ai/agency-plugin-npm
 *
 * NPM operations plugin for Agency - provides MCP tools for npm-ecosystem operations.
 * Supports npm, yarn, and pnpm with automatic package manager detection.
 */

import type { AgencyPlugin, AgencyCoreAPI } from '@generacy-ai/agency';
import { manifest } from './manifest.js';
import { mergeConfig, type NpmPluginConfig } from './config.js';
import { createTools } from './tools/index.js';

/** Plugin configuration key */
const CONFIG_KEY = 'plugins.npm';

/**
 * NPM Plugin for Agency
 *
 * Provides tools for:
 * - build.install_dependencies - Install project dependencies
 * - build.compile - Run build script
 * - build.lint - Run linter
 * - build.format - Run formatter
 * - test.run_unit - Run unit tests
 * - test.run_integration - Run integration tests
 * - test.run_e2e - Run E2E tests
 * - test.run_coverage - Run tests with coverage
 */
export const plugin: AgencyPlugin = {
  manifest,

  async initialize(core: AgencyCoreAPI): Promise<void> {
    // Get plugin configuration from Agency config
    const userConfig = core.getConfig<Partial<NpmPluginConfig>>(CONFIG_KEY);
    const config = mergeConfig(userConfig);

    // Create and register all tools
    const tools = createTools(config);
    for (const tool of tools) {
      core.registerTool(tool);
    }

    // Note: Modes in manifest are declarative - they indicate which modes
    // this plugin's tools are available in. The modes themselves should be
    // configured in the Agency config, not registered by plugins.
  },

  async shutdown(): Promise<void> {
    // No cleanup needed for this plugin
  },

  onModeChange(_mode: string): void {
    // Mode changes are handled automatically via tool filtering
  },
};

// Default export for plugin loading
export default plugin;

// Re-export types and utilities for external use
export type { NpmPluginConfig } from './config.js';
export { DEFAULT_CONFIG, mergeConfig } from './config.js';
export { manifest } from './manifest.js';
export type { PackageManager, DetectionResult, DetectionOutcome } from './pm/index.js';
export { detectPackageManager, isDetectionSuccess } from './pm/index.js';
