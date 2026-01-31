/**
 * Tool exports and factory for @generacy-ai/agency-plugin-spec-kit
 */

import type { AgencyTool, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitPluginConfig, SpecKitConfig } from '../config.js';
import { parseConfig } from '../config.js';
import { ProviderRegistry } from '../providers/registry.js';
import { createGetTicketTool } from './get-ticket.js';
import { createGetPathsTool } from './get-paths.js';
import { createCreateTicketTool } from './create-ticket.js';
import { createCheckPrereqsTool } from './check-prereqs.js';

// Import providers to register their factories
import '../providers/github.js';
import '../providers/jira.js';
import '../providers/shortcut.js';
import '../providers/local.js';

// Re-export individual tool creators for direct access
export { createGetPathsTool } from './get-paths.js';
export { createGetTicketTool, createGetTicketToolWithRegistry } from './get-ticket.js';
export { createCreateTicketTool } from './create-ticket.js';
export { createCheckPrereqsTool } from './check-prereqs.js';

/**
 * Create all spec tools
 *
 * @param config - Plugin configuration (legacy or new format)
 * @param core - Agency core API
 * @returns Array of spec tools
 */
export function createTools(
  config: SpecKitPluginConfig | SpecKitConfig | unknown,
  core: AgencyCoreAPI
): AgencyTool[] {
  // Handle both legacy and new config formats
  const resolvedConfig = isLegacyConfig(config)
    ? parseConfig({
        paths: {
          specs: config.specDirectory,
          templates: config.templateDirectory,
        },
      })
    : parseConfig(config);

  // Create provider registry
  const registry = new ProviderRegistry(resolvedConfig);

  // Create and return all tools
  return [
    createGetPathsTool(resolvedConfig, core),
    createGetTicketTool(resolvedConfig, (name) =>
      registry.getProvider(name as Parameters<typeof registry.getProvider>[0])
    ),
    createCreateTicketTool(resolvedConfig, () => registry.getProvider()),
    createCheckPrereqsTool(resolvedConfig, core),
  ];
}

/**
 * Check if config is legacy format
 */
function isLegacyConfig(
  config: SpecKitPluginConfig | SpecKitConfig | unknown
): config is SpecKitPluginConfig {
  return (
    typeof config === 'object' &&
    config !== null &&
    ('specDirectory' in config || 'templateDirectory' in config)
  );
}
