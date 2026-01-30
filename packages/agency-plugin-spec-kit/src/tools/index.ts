/**
 * Tool exports and factory for @generacy-ai/agency-plugin-spec-kit
 */

import type { AgencyTool, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitPluginConfig, SpecKitConfig } from '../config.js';
import { parseConfig } from '../config.js';
import { ProviderRegistry } from '../providers/registry.js';
import { createGetTicketTool } from './get-ticket.js';

// Import providers to register their factories
import '../providers/github.js';
import '../providers/jira.js';
import '../providers/shortcut.js';
import '../providers/local.js';

/**
 * Create all spec tools
 *
 * @param config - Plugin configuration (legacy or new format)
 * @param core - Agency core API
 * @returns Array of spec tools
 */
export function createTools(
  config: SpecKitPluginConfig | SpecKitConfig,
  _core: AgencyCoreAPI
): AgencyTool[] {
  // Handle both legacy and new config formats
  const resolvedConfig = isLegacyConfig(config)
    ? parseConfig({
        paths: {
          specs: config.specDirectory,
          templates: config.templateDirectory,
        },
      })
    : config;

  // Create provider registry
  const registry = new ProviderRegistry(resolvedConfig);

  // Create and return all tools
  return [
    createGetTicketTool(resolvedConfig, (name) =>
      registry.getProvider(name as Parameters<typeof registry.getProvider>[0])
    ),
  ];
}

/**
 * Check if config is legacy format
 */
function isLegacyConfig(
  config: SpecKitPluginConfig | SpecKitConfig
): config is SpecKitPluginConfig {
  return 'specDirectory' in config || 'templateDirectory' in config;
}

// Re-export tool creation functions for direct usage
export { createGetTicketTool, createGetTicketToolWithRegistry } from './get-ticket.js';
