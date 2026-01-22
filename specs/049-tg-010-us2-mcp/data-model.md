# Data Model: MCP Transport Layer

## Core Entities

### DockerExecConfig

Configuration for Docker exec transport.

```typescript
interface DockerExecConfig {
  /** Docker container ID or name */
  containerId: string;

  /** Command to execute inside the container (e.g., ['node', 'server.js']) */
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
```

### StdioClientConfig

Configuration for the high-level MCP client.

```typescript
interface StdioClientConfig extends DockerExecConfig {
  /** Client name for MCP protocol identification */
  clientName?: string;

  /** Client version for MCP protocol identification */
  clientVersion?: string;

  /** Default tool execution timeout in milliseconds */
  defaultExecutionTimeout?: number;
}
```

## State Types

### ConnectionState

Connection lifecycle states.

```typescript
type ConnectionState =
  | 'disconnected'   // Not connected
  | 'connecting'     // Connection in progress
  | 'connected'      // Successfully connected
  | 'reconnecting'   // Reconnection attempt in progress
  | 'error';         // Terminal error state
```

### ConnectionStateEvent

Event emitted on state transitions.

```typescript
interface ConnectionStateEvent {
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
```

## Error Types

### McpErrorCode

Enum of error classification codes.

```typescript
enum McpErrorCode {
  // Connection phase errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',

  // Runtime state errors
  DISCONNECTED = 'DISCONNECTED',
  NOT_READY = 'NOT_READY',

  // Tool execution errors
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',

  // Protocol errors
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',

  // Docker errors
  DOCKER_ERROR = 'DOCKER_ERROR',
}
```

### McpTransportError

Error type with classification code.

```typescript
interface McpTransportError extends Error {
  code: McpErrorCode;
  cause?: Error;
}
```

## Tool Types

### ToolInfo

Tool metadata from MCP server.

```typescript
interface ToolInfo {
  /** Tool name (unique identifier within the server) */
  name: string;

  /** Human-readable tool description */
  description?: string;

  /** JSON Schema for tool input parameters */
  inputSchema: JsonSchema;

  /** Namespace derived from tool name prefix (e.g., 'mcp__server__tool' → 'server') */
  namespace?: string;

  /** Plugin that provides this tool */
  pluginId?: string;
}
```

### ToolExecutionRequest

Request to execute a tool.

```typescript
interface ToolExecutionRequest {
  /** Tool name to execute */
  name: string;

  /** Tool arguments (must conform to inputSchema) */
  arguments: Record<string, unknown>;

  /** Optional timeout in milliseconds */
  timeout?: number;

  /** Request ID for tracking */
  requestId?: string;
}
```

### ToolExecutionOptions

Options for tool execution.

```typescript
interface ToolExecutionOptions {
  /** Timeout for this specific execution in milliseconds */
  timeout?: number;

  /** Whether to retry on transient failures */
  retry?: boolean;

  /** Maximum retry attempts */
  maxRetries?: number;
}
```

### ToolResult

Result of tool execution.

```typescript
interface ToolResult {
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
```

### ToolResultContent

Content types in tool results.

```typescript
type ToolResultContent = TextContent | ImageContent | ResourceContent;

interface TextContent {
  type: 'text';
  text: string;
}

interface ImageContent {
  type: 'image';
  data: string;     // base64 encoded
  mimeType: string; // e.g., 'image/png'
}

interface ResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
}
```

## Event Types

### MessageEvent

Event for incoming MCP messages.

```typescript
interface MessageEvent {
  /** Raw message data (parsed JSON-RPC) */
  data: unknown;

  /** Timestamp when message was received */
  timestamp: number;
}
```

### ToolCallEventInternal

Internal event for tool call tracking.

```typescript
interface ToolCallEventInternal {
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

  /** Result (if completed successfully) */
  result?: ToolResult;

  /** Error (if failed) */
  error?: Error;
}
```

## Interface Contracts

### McpTransport

Low-level transport interface.

```typescript
interface McpTransport {
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
```

### McpClient

High-level client interface.

```typescript
interface McpClient {
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

  /** Subscribe to tool call events */
  onToolCall(
    callback: (event: ToolCallEventInternal) => void
  ): () => void;
}
```

## Default Values

```typescript
const DEFAULT_CONFIG = {
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
};
```

## Relationships

```
DockerExecConfig ─────────────┐
                              │
StdioClientConfig ────────────┼──> StdioClient
                              │       │
                              │       ├── DockerExecTransport (McpTransport)
                              │       │       │
                              │       │       └── ConnectionState
                              │       │       └── ConnectionStateEvent
                              │       │       └── MessageEvent
                              │       │
                              │       └── MCP SDK Client
                              │               │
                              │               └── TransportAdapter
                              │
ToolExecutionRequest ─────────┼──> executeTool() ──> ToolResult
                              │
ToolExecutionOptions ─────────┘

ToolInfo[] <── listTools()

McpTransportError (McpErrorCode) <── errors
```
