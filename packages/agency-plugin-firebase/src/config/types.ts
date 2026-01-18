/**
 * Firebase Plugin Configuration Types
 */

/**
 * Available Firebase emulator types
 */
export type EmulatorType =
  | 'auth'
  | 'firestore'
  | 'database'
  | 'functions'
  | 'hosting'
  | 'pubsub'
  | 'storage';

/**
 * Available Firebase deploy targets
 */
export type DeployTarget =
  | 'functions'
  | 'rules'
  | 'hosting'
  | 'storage'
  | 'firestore'
  | 'database';

/**
 * Cleanup mode for emulator resources
 * - 'session': Clean up when session ends (default)
 * - 'persist': Keep data between sessions
 * - 'explicit': Only clean up when explicitly requested
 */
export type CleanupMode = 'session' | 'persist' | 'explicit';

/**
 * Emulator configuration options
 */
export interface EmulatorConfig {
  /** Specific emulators to start (defaults to all if not specified) */
  only?: EmulatorType[];
}

/**
 * Deploy configuration options
 */
export interface DeployConfig {
  /** Deploy targets to include */
  targets: DeployTarget[];
}

/**
 * Firebase plugin configuration
 */
export interface FirebasePluginConfig {
  /** Firebase project ID */
  project?: string;

  /** Resource cleanup mode (default: 'session') */
  cleanup: CleanupMode;

  /** Emulator configuration */
  emulators?: EmulatorConfig;

  /** Deploy configuration */
  deploy?: DeployConfig;
}
