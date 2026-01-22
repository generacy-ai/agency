# Implementation Plan: MCP Transport Layer

**Feature**: MCP Transport Layer for VS Code Extension
**Branch**: `049-tg-010-us2-mcp`
**Status**: Complete

## Summary

The MCP Transport Layer provides stdio-based communication with MCP servers running inside Docker containers. It enables the VS Code extension to execute tools provided by MCP servers through a `docker exec -i` transport mechanism.

## Technical Context

- **Language**: TypeScript 5.x
- **Runtime**: Node.js 20+
- **Framework**: VS Code Extension API
- **Key Dependencies**:
  - `@modelcontextprotocol/sdk` - MCP SDK for client implementation
  - `execa` - Process execution for Docker communication
  - `vitest` - Testing framework

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                      │
├─────────────────────────────────────────────────────────┤
│  StdioClient                                             │
│  ├─ High-level MCP client API                           │
│  ├─ Tool listing and execution                          │
│  ├─ Tool result caching                                  │
│  └─ Event emission (state changes, tool calls)          │
├─────────────────────────────────────────────────────────┤
│  TransportAdapter                                        │
│  └─ Bridges DockerExecTransport to MCP SDK Transport    │
├─────────────────────────────────────────────────────────┤
│  DockerExecTransport                                     │
│  ├─ Manages docker exec process lifecycle               │
│  ├─ Handles stdin/stdout communication                  │
│  ├─ JSON-RPC message parsing                            │
│  └─ Reconnection logic                                   │
└─────────────────────────────────────────────────────────┘
              │
              │ docker exec -i
              ▼
┌─────────────────────────────────────────────────────────┐
│              Docker Container                            │
│  ┌───────────────────────────────────────────────┐      │
│  │           MCP Server (stdio)                   │      │
│  │  ├─ Tool definitions                          │      │
│  │  └─ Tool execution                            │      │
│  └───────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
packages/agency-extension/src/mcp/
├── index.ts                    # Module exports
├── types.ts                    # Type definitions and interfaces
├── DockerExecTransport.ts      # Docker exec transport implementation
└── StdioClient.ts              # High-level MCP client

packages/agency-extension/src/__tests__/mcp/
├── DockerExecTransport.test.ts # Transport unit tests
└── StdioClient.test.ts         # Client unit tests

packages/agency-extension/src/types/
└── tool.ts                     # Tool-related type definitions
```

## Key Components

### 1. DockerExecTransport

Low-level transport that manages the `docker exec -i` process:
- Spawns `docker exec` with stdio pipes
- Buffers and parses newline-delimited JSON messages
- Handles process lifecycle (start, stop, reconnect)
- Emits state change, message, and error events

### 2. TransportAdapter

Internal adapter class that bridges `DockerExecTransport` to the MCP SDK's `Transport` interface:
- Converts our event-based API to SDK callbacks
- Enables seamless integration with MCP SDK Client

### 3. StdioClient

High-level client implementing the `McpClient` interface:
- Wraps MCP SDK Client with our transport
- Provides `connect()`, `disconnect()`, `listTools()`, `executeTool()`
- Tool caching for performance
- Event emission for monitoring (connection state, tool calls)
- Timeout and retry support for tool execution

## Key Types

### DockerExecConfig
Configuration for Docker transport including container ID, command, working directory, environment variables, and timeout settings.

### ConnectionState
Union type: `'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'`

### McpErrorCode
Enum of error codes: `CONNECTION_FAILED`, `CONNECTION_TIMEOUT`, `DISCONNECTED`, `EXECUTION_FAILED`, `EXECUTION_TIMEOUT`, `INVALID_RESPONSE`, `PROTOCOL_ERROR`, `DOCKER_ERROR`, `NOT_READY`

### ToolInfo, ToolExecutionRequest, ToolResult
Types for tool discovery and execution, defined in `types/tool.ts`.

## Implementation Details

### Connection Lifecycle

1. **Connect**: Spawns `docker exec -i` process, waits for stdin to be writable
2. **Send**: Writes JSON-RPC message + newline to stdin
3. **Receive**: Reads stdout line by line, parses JSON-RPC messages
4. **Disconnect**: Closes stdin, waits for graceful exit, SIGTERM if needed
5. **Reconnect**: On unexpected disconnection, attempts reconnection with configurable retries

### Error Handling

- All errors are wrapped in `McpTransportError` with appropriate error codes
- Transport errors include cause chain for debugging
- Timeout errors distinguished from connection errors
- Listener errors are caught and logged, don't break other listeners

### Tool Execution

1. Ensures connected state
2. Generates unique call ID
3. Emits start event for monitoring
4. Calls MCP SDK's `callTool` with timeout race
5. Converts SDK response to `ToolResult` format
6. Emits completion/error event
7. Supports retry on transient failures

## Default Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| CONNECTION_TIMEOUT | 30000ms | Time to wait for connection |
| EXECUTION_TIMEOUT | 60000ms | Default tool execution timeout |
| MAX_RECONNECT_ATTEMPTS | 3 | Reconnection attempts before giving up |
| RECONNECT_DELAY | 1000ms | Delay between reconnection attempts |
| MAX_EXECUTION_RETRIES | 2 | Retries for transient tool failures |

## Testing Strategy

- **Unit Tests**: Mock `execa` and MCP SDK to test component logic
- **Mock Streams**: Simulate stdin/stdout data for message handling tests
- **State Machine Tests**: Verify state transitions and event emission
- **Error Path Tests**: Cover timeout, disconnection, and parse errors

## Integration Points

- **ConfigService**: Will provide Docker container configuration
- **ActivityMonitor**: Subscribes to `onToolCall` for activity tracking
- **PluginManager**: Uses client to discover and execute plugin tools
