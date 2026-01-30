/**
 * SpecKitPlugin class implementing AgencyPlugin interface
 *
 * Provides specification management tools for structured feature development.
 */

import type {
  AgencyPlugin,
  PluginManifest,
  AgencyCoreAPI,
} from '@generacy-ai/agency';
import { type SpecKitPluginConfig, DEFAULT_CONFIG, resolveConfig } from './config.js';
import { PLUGIN_MANIFEST } from './manifest.js';
import { createTools } from './tools/index.js';

/**
 * Spec Kit plugin for Agency
 *
 * Provides specification management operations with:
 * - Feature spec creation and validation
 * - Template-based scaffolding
 * - Mode affiliations (research, coding)
 */
export class SpecKitPlugin implements AgencyPlugin {
  readonly manifest: PluginManifest = PLUGIN_MANIFEST;

  private config: SpecKitPluginConfig = DEFAULT_CONFIG;
  private core: AgencyCoreAPI | null = null;

  async initialize(core: AgencyCoreAPI): Promise<void> {
    this.core = core;

    // Load plugin configuration
    const userConfig = core.getConfig<Partial<SpecKitPluginConfig>>('plugins.spec-kit');
    this.config = resolveConfig(userConfig);

    // Create and register all tools
    const tools = createTools(this.config, core);
    for (const tool of tools) {
      core.registerTool(tool);
    }
  }

  async shutdown(): Promise<void> {
    // Unregister all tools
    if (this.core) {
      for (const toolName of this.manifest.tools ?? []) {
        this.core.unregisterTool(toolName);
      }
    }
    this.core = null;
  }

  onModeChange?(mode: string): void {
    // Tools automatically filter based on mode affiliations
    // No additional action needed
  }
}

/**
 * Create a new SpecKitPlugin instance
 */
export function createSpecKitPlugin(): SpecKitPlugin {
  return new SpecKitPlugin();
}
