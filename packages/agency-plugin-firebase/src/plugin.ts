/**
 * Firebase Plugin Implementation
 *
 * Agent-optimized tools for Firebase emulator management and deployments.
 */

import type { AgencyPlugin, AgencyCoreAPI, PluginManifest } from '@generacy-ai/agency';
import { ProcessManager } from './process/manager.js';
import { FirebasePluginConfigSchema } from './config/schema.js';
import type { FirebasePluginConfig } from './config/types.js';
import {
  createEmulatorsStartTool,
  createEmulatorsStopTool,
  createEmulatorsStatusTool,
  createDeployTool,
  createFunctionsLogTool,
} from './tools/index.js';

/**
 * Default plugin configuration
 */
const DEFAULT_CONFIG: FirebasePluginConfig = {
  cleanup: 'session',
};

/**
 * Firebase Plugin Manifest
 */
export const manifest: PluginManifest = {
  id: '@generacy-ai/agency-plugin-firebase',
  name: 'Firebase Plugin',
  version: '0.0.0',
  description: 'Agent-optimized tools for Firebase emulator management and deployments',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  dependencies: [],
  tools: [
    'run.firebase_emulators_start',
    'run.firebase_emulators_stop',
    'run.firebase_emulators_status',
    'run.firebase_deploy',
    'run.firebase_functions_log',
  ],
  modes: ['debug', 'coding'],
  critical: false,
  provides: [
    { facet: 'SecretStore', qualifier: 'firebase', priority: 10 },
    { facet: 'StateStore', qualifier: 'firebase', priority: 10 },
  ],
  requires: [],
  uses: [],
};

/**
 * Firebase Plugin
 *
 * Provides agent-optimized tools for:
 * - Starting/stopping Firebase emulators
 * - Querying emulator status
 * - Deploying to Firebase
 * - Viewing function logs
 */
export class FirebasePlugin implements AgencyPlugin {
  readonly manifest = manifest;
  private processManager: ProcessManager;
  private config: FirebasePluginConfig = DEFAULT_CONFIG;

  constructor() {
    this.processManager = new ProcessManager();
  }

  /**
   * Initialize the plugin
   *
   * Loads configuration and registers all tools with the core API.
   */
  async initialize(core: AgencyCoreAPI): Promise<void> {
    // Load and validate configuration
    const rawConfig = core.getConfig<Partial<FirebasePluginConfig>>('plugins.firebase');
    if (rawConfig) {
      const parsed = FirebasePluginConfigSchema.safeParse(rawConfig);
      if (parsed.success) {
        this.config = parsed.data;
      }
    }

    // Register emulator tools
    core.registerTool(createEmulatorsStartTool(this.processManager, this.config));
    core.registerTool(createEmulatorsStopTool(this.processManager));
    core.registerTool(createEmulatorsStatusTool(this.processManager));

    // Register deploy and log tools
    core.registerTool(createDeployTool(this.config));
    core.registerTool(createFunctionsLogTool(this.config));
  }

  /**
   * Shutdown the plugin
   *
   * Cleans up any running emulator processes based on cleanup mode.
   */
  async shutdown(): Promise<void> {
    await this.processManager.cleanup();
  }

  /**
   * Handle mode changes
   *
   * Currently no mode-specific behavior needed.
   */
  onModeChange(_mode: string): void {
    // No mode-specific behavior needed
  }
}

/**
 * Create a new Firebase plugin instance
 */
export function createFirebasePlugin(): FirebasePlugin {
  return new FirebasePlugin();
}
