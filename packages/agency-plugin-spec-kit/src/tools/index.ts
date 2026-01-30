/**
 * Tool exports and factory for @generacy-ai/agency-plugin-spec-kit
 */

import type { AgencyTool, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitConfig } from '../config.js';
import { parseConfig } from '../config.js';
import { createGetPathsTool } from './get-paths.js';

// Re-export individual tool creators for direct access
export { createGetPathsTool } from './get-paths.js';

/**
 * Create all spec tools
 *
 * @param config - Plugin configuration (raw or parsed)
 * @param core - Agency core API
 * @returns Array of spec tools
 */
export function createTools(
  config: unknown,
  core: AgencyCoreAPI
): AgencyTool[] {
  // Parse config to ensure defaults are applied
  const parsedConfig: SpecKitConfig = parseConfig(config);

  return [createGetPathsTool(parsedConfig, core)];
}
