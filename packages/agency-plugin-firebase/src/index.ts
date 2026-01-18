/**
 * @generacy-ai/agency-plugin-firebase
 *
 * Agent-optimized tools for Firebase emulator management and deployments.
 *
 * @packageDocumentation
 */

// Plugin exports
export { FirebasePlugin, createFirebasePlugin, manifest } from './plugin.js';

// Type exports
export type {
  EmulatorType,
  DeployTarget,
  CleanupMode,
  FirebasePluginConfig,
  EmulatorConfig,
  DeployConfig,
} from './config/types.js';

export type {
  ProcessHandle,
  ProcessOptions,
  ProcessStatus,
  EmulatorInfo,
} from './process/types.js';

// Tool exports (for advanced usage)
export {
  createEmulatorsStartTool,
  createEmulatorsStopTool,
  createEmulatorsStatusTool,
  createDeployTool,
  createFunctionsLogTool,
} from './tools/index.js';

// Default export is the plugin factory
export { createFirebasePlugin as default } from './plugin.js';
