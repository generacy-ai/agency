/**
 * MCP transport layer exports.
 *
 * This module provides the MCP client and transport implementations
 * for communicating with MCP servers running in Docker containers.
 */

// Types
export type {
  DockerExecConfig,
  ConnectionState,
  ConnectionStateEvent,
  MessageEvent,
  ToolExecutionOptions,
  McpTransport,
  McpClient,
  ToolCallEventInternal,
} from './types';

export { McpErrorCode, createMcpTransportError, DEFAULT_CONFIG } from './types';
export type { McpTransportError } from './types';

// Transport
export { DockerExecTransport } from './DockerExecTransport';

// Client
export { StdioClient, type StdioClientConfig } from './StdioClient';
