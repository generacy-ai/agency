/**
 * Connection mode types for Humancy plugin
 *
 * Defines how the plugin connects to the Humancy service.
 */

/**
 * Connection modes for Humancy communication
 */
export enum ConnectionMode {
  /** Direct IPC to local VS Code extension */
  DIRECT = 'direct',
  /** HTTP to humancy-cloud API (generacy.ai/api/humancy) */
  CLOUD = 'cloud',
  /** Queue for later delivery (offline mode) */
  OFFLINE = 'offline',
}

/**
 * HTTP client info for cloud mode
 */
export interface HttpClientInfo {
  /** Base URL of the humancy-cloud API */
  baseUrl: string;
  /** Whether the client has valid authentication */
  authenticated: boolean;
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
  /** HTTP client info (cloud mode only) */
  httpClientInfo?: HttpClientInfo;
}
