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
import {
  parseConfig,
  type SpecKitConfig,
  type SpecKitPluginConfig,
} from './config.js';
import { manifest } from './manifest.js';
import { createTools } from './tools/index.js';
import { BUILTIN_WORKFLOWS } from './workflows.js';

/** Configuration key for plugin settings in Agency config */
const CONFIG_KEY = 'plugins.speckit';

/**
 * Spec Kit plugin for Agency
 *
 * Provides specification-driven development toolkit with:
 * - Feature spec creation and validation
 * - Template-based scaffolding
 * - Backlog provider abstraction
 * - Mode affiliations (coding, research)
 *
 * @example
 * ```typescript
 * import { createSpecKitPlugin } from '@generacy-ai/agency-plugin-spec-kit';
 *
 * const plugin = createSpecKitPlugin();
 * await agency.loadPlugin(plugin);
 * ```
 */
export class SpecKitPlugin implements AgencyPlugin {
  readonly manifest: PluginManifest = manifest;

  private coreAPI?: AgencyCoreAPI;
  private config?: SpecKitConfig;
  private cleanups: Array<() => void> = [];

  /**
   * Initialize the plugin with core API access
   *
   * Parses configuration from agency config and registers all tools.
   * Tools will be added in subsequent features (F5-F9).
   */
  async initialize(core: AgencyCoreAPI): Promise<void> {
    this.coreAPI = core;

    // Parse configuration from agency config
    const rawConfig = core.getConfig<unknown>(CONFIG_KEY);
    this.config = parseConfig(rawConfig);

    // Create and register all tools
    // Note: createTools currently returns empty array; tools added in F5-F9
    const legacyConfig: SpecKitPluginConfig = {
      specDirectory: this.config.paths.specs,
      templateDirectory: this.config.paths.templates,
    };
    const tools = createTools(legacyConfig, core);
    for (const tool of tools) {
      core.registerTool(tool);
    }

    // Subscribe to mode changes
    const unsubMode = core.onModeChange((mode: string) => {
      this.onModeChange?.(mode);
    });
    this.cleanups.push(unsubMode);

    // Register bundled workflows with engine (when available)
    for (const [name, filePath] of Object.entries(BUILTIN_WORKFLOWS)) {
      try {
        const coreAny = core as unknown as Record<string, unknown>;
        const registerFn = coreAny['registerWorkflow'];
        if (typeof registerFn === 'function') {
          (registerFn as (name: string, path: string, opts: Record<string, unknown>) => void)(
            name, filePath, { priority: 'fallback' },
          );
        }
      } catch (error) {
        core.recordEvent({
          type: 'plugin.workflow.registration_failed',
          timestamp: new Date(),
          data: { workflow: name, error: String(error) },
        });
      }
    }
  }

  /**
   * Clean shutdown of the plugin
   *
   * Unregisters all tools and clears internal state.
   */
  async shutdown(): Promise<void> {
    // Run all cleanup functions
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch {
        // Ignore cleanup errors during shutdown
      }
    }
    this.cleanups = [];

    // Unregister all tools
    if (this.coreAPI) {
      for (const toolName of this.manifest.tools ?? []) {
        try {
          this.coreAPI.unregisterTool(toolName);
        } catch {
          // Ignore unregister errors during shutdown
        }
      }
    }

    this.coreAPI = undefined;
  }

  /**
   * Handle mode changes
   *
   * Mode-specific behavior will be implemented with tools.
   */
  onModeChange?(_mode: string): void {
    // Mode-specific tool filtering handled by mode affiliations
    // Additional behavior can be added here in future features
  }

  /**
   * Get the current plugin configuration
   *
   * @returns The parsed configuration or undefined if not initialized
   */
  getConfig(): SpecKitConfig | undefined {
    return this.config;
  }
}

/**
 * Create a new SpecKitPlugin instance
 *
 * Factory function for consistent plugin creation.
 *
 * @returns A new SpecKitPlugin instance
 */
export function createSpecKitPlugin(): SpecKitPlugin {
  return new SpecKitPlugin();
}
