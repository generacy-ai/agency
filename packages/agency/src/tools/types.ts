/**
 * Tool type definitions for Agency
 *
 * Extends MCP tool format with Agency-specific metadata for mode filtering
 * and output patterns.
 */

/**
 * JSON Schema subset used for tool input schemas
 */
export interface JsonSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

/**
 * Text resource (has text content)
 */
export interface TextResource {
  uri: string;
  text: string;
  mimeType?: string;
}

/**
 * Blob resource (has binary content)
 */
export interface BlobResource {
  uri: string;
  blob: string;
  mimeType?: string;
}

/**
 * Content block types for tool results
 * Aligned with MCP SDK's content types
 */
export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: TextResource | BlobResource };

/**
 * Result of tool execution
 */
export interface ToolResult {
  /** Content blocks for MCP response */
  content: ToolContent[];

  /** Whether the tool execution was successful */
  isError?: boolean;
}

/**
 * Agency tool definition with MCP compatibility and Agency-specific metadata
 *
 * Tools use namespaced naming: "namespace.action" (e.g., "source_control.commit")
 */
export interface AgencyTool {
  /** Namespaced tool name: "namespace.action" */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for input parameters */
  inputSchema: JsonSchema;

  /** Tool category for grouping and mode filtering */
  namespace: string;

  /** Output verbosity pattern */
  outputPattern: 'terse';

  /** Explicit mode list (optional, derived from namespace if not set) */
  modes?: string[];

  /** Execute the tool with validated parameters */
  execute(params: unknown): Promise<ToolResult>;
}

/**
 * MCP-compatible tool format for protocol responses
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JsonSchema>;
    required?: string[];
  };
}

/**
 * Configuration for name validation behavior
 */
export interface ValidationOptions {
  /**
   * When true, custom prefixes are rejected as errors.
   * When false (default), custom prefixes produce warnings.
   */
  strict?: boolean;
}

/**
 * Result of tool name validation
 */
export interface ValidationResult {
  /** Whether the name is valid (no errors) */
  valid: boolean;

  /** Validation errors (name is invalid if any present) */
  errors: string[];

  /** Validation warnings (name is valid but has issues) */
  warnings: string[];
}

/**
 * Grouped catalog of all registered tools
 */
export interface ToolCatalog {
  /** All registered tools */
  tools: AgencyTool[];

  /** Tools grouped by prefix */
  byPrefix: Record<string, AgencyTool[]>;

  /** ISO timestamp when catalog was generated */
  generatedAt: string;
}

/**
 * Convert an AgencyTool to MCP-compatible format
 */
export function toMcpTool(tool: AgencyTool): McpTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties:
        tool.inputSchema.type === 'object'
          ? (tool.inputSchema.properties ?? {})
          : {},
      required:
        tool.inputSchema.type === 'object'
          ? tool.inputSchema.required
          : undefined,
    },
  };
}
