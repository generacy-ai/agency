/**
 * MCP (Model Context Protocol) connection types for the Agency VS Code extension.
 * These types support MCP client connection management.
 */

/**
 * Connection status for MCP client.
 */
export type McpConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Transport type for MCP connection.
 */
export type McpTransportType = 'stdio' | 'docker-exec';

/**
 * Options for establishing an MCP connection.
 */
export interface McpConnectionOptions {
  /** Transport type (default: 'stdio' for direct local connection) */
  transport?: McpTransportType;

  /** Container ID to connect to (required for docker-exec transport) */
  containerId?: string;

  /** MCP server command to run */
  command: string;

  /** Arguments to pass to the MCP server command */
  args?: string[];

  /** Connection timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Working directory for the MCP server process */
  workingDirectory?: string;

  /** Environment variables to pass to the MCP server */
  environment?: Record<string, string>;
}

/**
 * Event emitted when MCP connection status changes.
 */
export interface McpConnectionStatusChangeEvent {
  /** Previous connection status */
  previousStatus: McpConnectionStatus;

  /** New connection status */
  newStatus: McpConnectionStatus;

  /** Error that caused the status change (if applicable) */
  error?: Error;

  /** Timestamp when the change occurred (ms since epoch) */
  timestamp: number;

  /** Container ID associated with the connection */
  containerId?: string;
}

/**
 * Configuration for auto-reconnect behavior.
 */
export interface McpReconnectConfig {
  /** Whether auto-reconnect is enabled (default: true) */
  enabled: boolean;

  /** Maximum number of reconnect attempts (default: 10) */
  maxAttempts: number;

  /** Initial delay between reconnect attempts in ms (default: 1000) */
  initialDelay: number;

  /** Maximum delay between reconnect attempts in ms (default: 30000) */
  maxDelay: number;

  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
}

/**
 * Default reconnect configuration.
 */
export const DEFAULT_RECONNECT_CONFIG: McpReconnectConfig = {
  enabled: true,
  maxAttempts: 10,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * MCP connection information.
 */
export interface McpConnectionInfo {
  /** Current connection status */
  status: McpConnectionStatus;

  /** Container ID if connected */
  containerId?: string;

  /** Timestamp when connection was established */
  connectedAt?: number;

  /** Number of reconnect attempts made */
  reconnectAttempts: number;

  /** Error message if status is 'error' */
  errorMessage?: string;

  /** Server capabilities (if connected) */
  serverCapabilities?: McpServerCapabilities;
}

/**
 * MCP server capabilities reported during initialization.
 */
export interface McpServerCapabilities {
  /** Whether the server supports tools */
  tools?: boolean;

  /** Whether the server supports resources */
  resources?: boolean;

  /** Whether the server supports prompts */
  prompts?: boolean;

  /** Whether the server supports logging */
  logging?: boolean;

  /** Server name */
  name?: string;

  /** Server version */
  version?: string;
}
