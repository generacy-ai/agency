/**
 * GitPlugin class implementing AgencyPlugin interface
 *
 * Provides 12 source control tools for git operations.
 */

import type {
  AgencyPlugin,
  PluginManifest,
  AgencyCoreAPI,
} from '@generacy-ai/agency';
import { type GitPluginConfig, DEFAULT_CONFIG, resolveConfig } from './config.js';
import { createTools } from './tools/index.js';

/**
 * Git plugin for Agency
 *
 * Provides source control operations with:
 * - Structured output (not raw git output)
 * - Categorized error handling
 * - Mode affiliations (research, coding, review)
 * - Humancy escalation for destructive operations
 */
export class GitPlugin implements AgencyPlugin {
  readonly manifest: PluginManifest = {
    id: '@generacy-ai/agency-plugin-git',
    name: 'Git Plugin',
    version: '0.0.0',
    description: 'Source control operations for agents',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    dependencies: [],
    tools: [
      'source_control.status',
      'source_control.diff',
      'source_control.log',
      'source_control.commit',
      'source_control.push',
      'source_control.pull',
      'source_control.checkout',
      'source_control.branch',
      'source_control.stash',
      'source_control.blame',
      'source_control.merge',
      'source_control.rebase',
    ],
    modes: ['research', 'coding', 'review'],
    critical: false,
    provides: [{ facet: 'SourceControl', qualifier: 'git', priority: 10 }],
    requires: [],
    uses: [],
  };

  private config: GitPluginConfig = DEFAULT_CONFIG;
  private core: AgencyCoreAPI | null = null;

  async initialize(core: AgencyCoreAPI): Promise<void> {
    this.core = core;

    // Load plugin configuration
    const userConfig = core.getConfig<Partial<GitPluginConfig>>('plugins.git');
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

  onModeChange?(_mode: string): void {
    // Tools automatically filter based on mode affiliations
    // No additional action needed
  }
}

/**
 * Create a new GitPlugin instance
 */
export function createGitPlugin(): GitPlugin {
  return new GitPlugin();
}
