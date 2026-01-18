/**
 * Connection mode types for Humancy plugin
 *
 * Defines how the plugin connects to the Humancy VS Code extension.
 */

/**
 * Connection modes for Humancy communication
 */
export enum ConnectionMode {
  /** Direct IPC to local VS Code extension */
  DIRECT = 'direct',
  /** Routed through Generacy orchestration layer */
  VIA_GENERACY = 'generacy',
  /** Queue for later delivery (offline mode) */
  OFFLINE = 'offline',
}

/**
 * Connection state information
 */
export interface ConnectionState {
  /** Current connection mode */
  mode: ConnectionMode;
  /** Whether currently connected */
  connected: boolean;
  /** Last successful connection time */
  lastConnected?: Date;
  /** Error if connection failed */
  error?: string;
}
