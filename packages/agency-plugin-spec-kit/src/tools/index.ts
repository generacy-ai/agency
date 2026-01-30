/**
 * Tool exports and factory for @generacy-ai/agency-plugin-spec-kit
 */

import type { AgencyTool, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitPluginConfig } from '../config.js';

/**
 * Create all spec tools
 *
 * @param config - Plugin configuration
 * @param core - Agency core API
 * @returns Array of spec tools (empty for skeleton)
 */
export function createTools(
  _config: SpecKitPluginConfig,
  _core: AgencyCoreAPI
): AgencyTool[] {
  // Tools will be added here in subsequent features
  return [];
}
