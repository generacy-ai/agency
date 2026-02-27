/**
 * Central type exports for the Agency VS Code extension.
 *
 * This module re-exports all type definitions used throughout the extension.
 * Import types from this module for consistency:
 *
 * @example
 * import type { PluginConfig, ToolInfo, ContainerStatus } from './types';
 */

// Plugin types
export type {
  PluginConfig,
  PluginManifest,
  PluginState,
  PluginInfo,
  PluginMetadata,
  JsonSchemaDefinition,
  JsonSchemaProperty,
} from './plugin';

// Tool types
export type {
  JsonSchema,
  JsonSchemaItem,
  ToolInfo,
  ToolExecutionRequest,
  ToolResultContentType,
  TextContent,
  ImageContent,
  ResourceContent,
  ToolResultContent,
  ToolResult,
  ToolExecutionStatus,
  ToolExecutionRecord,
} from './tool';

// Activity types
export type {
  ToolCallStatus,
  ToolCallEvent,
  ActivityFilter,
  ActivityStats,
  ToolUsageStats,
  ActivityFeedConfig,
  ActivityEventBatch,
} from './activity';

// Container types
export type {
  ContainerStatus,
  ContainerHealth,
  ContainerInfo,
  PortMapping,
  ContainerActionResult,
  ContainerAction,
  ContainerLogEntry,
  ContainerLogOptions,
  ContainerDiscoverySource,
  ConnectionConfig,
  ContainerConfig,
  ContainerStateEvent,
} from './container';

// Mode types
export type {
  ModeConfig,
  ModeInfo,
  ModeTreeNode,
  ModeSwitchRequest,
  ModeSwitchResult,
  ModeValidationResult,
  ModeValidationError,
  ModeValidationWarning,
  ModeStateEvent,
} from './mode';

// MCP types
export type {
  McpConnectionStatus,
  McpConnectionOptions,
  McpConnectionStatusChangeEvent,
  McpReconnectConfig,
  McpConnectionInfo,
  McpServerCapabilities,
} from './mcp';

export { DEFAULT_RECONNECT_CONFIG } from './mcp';

// Config types
export type { ConfigConflictEvent } from '../services/ConfigService';
