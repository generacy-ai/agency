/**
 * MCP transport layer type definitions.
 *
 * These types support the stdio-based communication with MCP servers
 * running inside Docker containers.
 */

import type { ToolInfo, ToolExecutionRequest, ToolResult } from '../types';

/**
 * Configuration for Docker exec transport.
 */
export interface DockerExecConfig {
  /** Docker container ID or name */
  containerId: string;

  /** Command to execute inside the container (e.g., 'node server.js') */
  command: string[];

  /** Working directory inside the container */
  workDir?: string;

  /** Environment variables to pass to the container */
  env?: Record<string, string>;

  /** Timeout for docker exec connection in milliseconds */
  connectionTimeout?: number;

  /** Maximum number of reconnection attempts */
  maxReconnectAttempts?: number;

  /** Delay between reconnection attempts in milliseconds */
  reconnectDelay?: number;
}

/**
 * Connection state for MCP transport.
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Event emitted when connection state changes.
 */
export interface ConnectionStateEvent {
  /** Previous connection state */
  previousState: ConnectionState;

  /** Current connection state */
  currentState: ConnectionState;

  /** Timestamp of state change */
  timestamp: number;

  /** Error if state is 'error' */
  error?: Error;

  /** Reconnection attempt number if reconnecting */
  reconnectAttempt?: number;
}

/**
 * Event emitted when a message is received from the MCP server.
 */
export interface MessageEvent {
  /** Raw message data */
  data: unknown;

  /** Timestamp when message was received */
  timestamp: number;
}

/**
 * Options for tool execution.
 */
export interface ToolExecutionOptions {
  /** Timeout for this specific execution in milliseconds */
  timeout?: number;

  /** Whether to retry on transient failures */
  retry?: boolean;

  /** Maximum retry attempts */
  maxRetries?: number;
}

/**
 * Error codes for MCP transport errors.
 */
export enum McpErrorCode {
  /** Connection failed */
  CONNECTION_FAILED = 'CONNECTION_FAILED',

  /** Connection timed out */
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',

  /** Disconnected unexpectedly */
  DISCONNECTED = 'DISCONNECTED',

  /** Tool execution failed */
  EXECUTION_FAILED = 'EXECUTION_FAILED',

  /** Tool execution timed out */
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',

  /** Invalid response from server */
  INVALID_RESPONSE = 'INVALID_RESPONSE',

  /** Protocol error */
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',

  /** Docker exec failed */
  DOCKER_ERROR = 'DOCKER_ERROR',

  /** Server not ready */
  NOT_READY = 'NOT_READY',
}

/**
 * Interface for MCP transport errors.
 */
export interface McpTransportError extends Error {
  code: McpErrorCode;
  cause?: Error;
}

/**
 * Create an MCP transport error.
 */
export function createMcpTransportError(
  message: string,
  code: McpErrorCode,
  cause?: Error
): McpTransportError {
  const error = new Error(message) as McpTransportError;
  error.name = 'McpTransportError';
  error.code = code;
  error.cause = cause;
  return error;
}

/**
 * Interface for MCP transport implementations.
 * Abstracts the communication channel to the MCP server.
 */
export interface McpTransport {
  /** Start the transport connection */
  start(): Promise<void>;

  /** Stop the transport connection */
  stop(): Promise<void>;

  /** Send a message to the MCP server */
  send(message: unknown): Promise<void>;

  /** Get the current connection state */
  getState(): ConnectionState;

  /** Subscribe to connection state changes */
  onStateChange(callback: (event: ConnectionStateEvent) => void): () => void;

  /** Subscribe to incoming messages */
  onMessage(callback: (event: MessageEvent) => void): () => void;

  /** Subscribe to error events */
  onError(callback: (error: McpTransportError) => void): () => void;
}

/**
 * Interface for MCP client.
 * High-level client for interacting with MCP servers.
 */
export interface McpClient {
  /** Connect to the MCP server */
  connect(): Promise<void>;

  /** Disconnect from the MCP server */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** Get the current connection state */
  getConnectionState(): ConnectionState;

  /** List available tools */
  listTools(): Promise<ToolInfo[]>;

  /** Execute a tool */
  executeTool(
    request: ToolExecutionRequest,
    options?: ToolExecutionOptions
  ): Promise<ToolResult>;

  /** Subscribe to connection state changes */
  onConnectionStateChange(
    callback: (event: ConnectionStateEvent) => void
  ): () => void;

  /** Subscribe to tool call events (for activity monitoring) */
  onToolCall(
    callback: (event: ToolCallEventInternal) => void
  ): () => void;
}

/**
 * Internal tool call event for activity tracking.
 */
export interface ToolCallEventInternal {
  /** Unique ID for this call */
  id: string;

  /** Tool name */
  toolName: string;

  /** Tool arguments */
  arguments: Record<string, unknown>;

  /** Timestamp when call started */
  startedAt: number;

  /** Timestamp when call completed (if completed) */
  completedAt?: number;

  /** Result (if completed) */
  result?: ToolResult;

  /** Error (if failed) */
  error?: Error;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  /** Default connection timeout (30 seconds) */
  CONNECTION_TIMEOUT: 30000,

  /** Default tool execution timeout (60 seconds) */
  EXECUTION_TIMEOUT: 60000,

  /** Default maximum reconnection attempts */
  MAX_RECONNECT_ATTEMPTS: 3,

  /** Default delay between reconnection attempts (1 second) */
  RECONNECT_DELAY: 1000,

  /** Default maximum retries for tool execution */
  MAX_EXECUTION_RETRIES: 2,
} as const;
