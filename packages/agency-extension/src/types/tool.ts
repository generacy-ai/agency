/**
 * Tool-related type definitions for the Agency VS Code extension.
 * These types support MCP tool browsing and execution.
 */

/**
 * JSON Schema definition for tool parameters.
 * Aligned with MCP SDK's tool input schema format.
 */
export interface JsonSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null';
  properties?: Record<string, JsonSchemaItem>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean | JsonSchemaItem;
}

/**
 * JSON Schema item for nested properties.
 */
export interface JsonSchemaItem {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: JsonSchemaItem;
  properties?: Record<string, JsonSchemaItem>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  oneOf?: JsonSchemaItem[];
  anyOf?: JsonSchemaItem[];
}

/**
 * Information about an MCP tool.
 * Represents a tool as returned by the MCP server's listTools.
 */
export interface ToolInfo {
  /** Tool name (unique identifier within the server) */
  name: string;

  /** Human-readable tool description */
  description?: string;

  /** JSON Schema for tool input parameters */
  inputSchema: JsonSchema;

  /** Namespace or category for grouping (derived from tool name prefix) */
  namespace?: string;

  /** Plugin that provides this tool */
  pluginId?: string;
}

/**
 * Request to execute an MCP tool.
 */
export interface ToolExecutionRequest {
  /** Tool name to execute */
  name: string;

  /** Tool arguments (must conform to inputSchema) */
  arguments: Record<string, unknown>;

  /** Optional timeout in milliseconds */
  timeout?: number;

  /** Request ID for tracking */
  requestId?: string;
}

/**
 * Result content types from MCP tool execution.
 */
export type ToolResultContentType = 'text' | 'image' | 'resource';

/**
 * Text content in tool result.
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image content in tool result.
 */
export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

/**
 * Resource content in tool result.
 */
export interface ResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
}

/**
 * Union of all content types.
 */
export type ToolResultContent = TextContent | ImageContent | ResourceContent;

/**
 * Result of an MCP tool execution.
 */
export interface ToolResult {
  /** Whether the execution was successful */
  isError: boolean;

  /** Result content (text, images, resources) */
  content: ToolResultContent[];

  /** Error message if isError is true */
  errorMessage?: string;

  /** Execution duration in milliseconds */
  duration?: number;

  /** Timestamp when execution completed */
  timestamp: number;

  /** Request ID for correlation */
  requestId?: string;
}

/**
 * Tool execution status for UI display.
 */
export type ToolExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'timeout';

/**
 * Tool execution record for history tracking.
 */
export interface ToolExecutionRecord {
  /** Unique execution ID */
  id: string;

  /** Tool execution request */
  request: ToolExecutionRequest;

  /** Execution result (null if still running) */
  result: ToolResult | null;

  /** Current status */
  status: ToolExecutionStatus;

  /** Timestamp when execution started */
  startedAt: number;

  /** Timestamp when execution completed */
  completedAt?: number;
}
