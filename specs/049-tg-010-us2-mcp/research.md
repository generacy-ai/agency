# Research: MCP Transport Layer

## Technology Decisions

### 1. Docker Communication: `execa` over native `child_process`

**Decision**: Use `execa` for spawning `docker exec` processes.

**Rationale**:
- Better error handling with proper exit code detection
- Promise-based API integrates well with async/await
- Built-in stream handling for stdin/stdout/stderr
- Configurable timeout and cleanup options
- Widely adopted with good TypeScript support

**Alternatives Considered**:
- `child_process.spawn`: Lower-level, requires more boilerplate for error handling
- `dockerode`: Full Docker API client, overkill for just exec functionality

### 2. MCP Client: Wrap `@modelcontextprotocol/sdk` Client

**Decision**: Use the official MCP SDK Client with a custom transport adapter.

**Rationale**:
- Official SDK ensures protocol compliance
- Handles JSON-RPC message framing
- Provides well-tested tool calling implementation
- Maintains compatibility with MCP spec updates

**Alternatives Considered**:
- Custom JSON-RPC implementation: More control but higher maintenance burden
- Direct protocol implementation: Reinventing the wheel, prone to spec drift

### 3. Transport Architecture: Layered Design

**Decision**: Three-layer architecture: DockerExecTransport → TransportAdapter → StdioClient

**Rationale**:
- Separation of concerns: transport vs protocol vs application
- DockerExecTransport can be unit tested in isolation
- TransportAdapter bridges to SDK without modifying transport
- StdioClient provides clean API for extension use
- Easy to add alternative transports (SSH, local process) later

### 4. Event System: Callback-based with Unsubscribe

**Decision**: Use callback subscription pattern with unsubscribe function return.

**Rationale**:
- Familiar pattern from VS Code extension API
- Easy to integrate with VS Code Disposable pattern
- No external event emitter dependency
- Type-safe callback signatures

**Pattern**:
```typescript
const unsubscribe = client.onConnectionStateChange((event) => {...});
// Later:
unsubscribe();
```

### 5. Error Handling: Typed Error Codes

**Decision**: Create `McpTransportError` with enum error codes.

**Rationale**:
- Machine-readable error classification
- UI can show appropriate messages based on code
- Easy to retry certain error types (timeout) but not others (protocol)
- Preserves error cause chain for debugging

**Error Codes**:
- `CONNECTION_FAILED`, `CONNECTION_TIMEOUT`: Connection phase errors
- `DISCONNECTED`, `NOT_READY`: Runtime state errors
- `EXECUTION_FAILED`, `EXECUTION_TIMEOUT`: Tool execution errors
- `INVALID_RESPONSE`, `PROTOCOL_ERROR`: Protocol errors
- `DOCKER_ERROR`: Docker-specific errors

## Implementation Patterns

### Newline-Delimited JSON (NDJSON)

MCP uses newline-delimited JSON for message framing over stdio:
- Each message is a complete JSON object
- Messages separated by newline (`\n`)
- Buffer incoming data, split on newlines
- Parse each line as JSON separately

### Connection State Machine

```
disconnected → connecting → connected
     ↑              ↓           ↓
     └─────────────←─ reconnecting ←───┘
                         ↓
                      error
```

### Tool Caching

- Cache tool list after first `listTools()` call
- Clear cache on disconnect/reconnect
- Explicit `clearToolCache()` for manual refresh
- Avoids redundant server calls during session

### Timeout Implementation

Use `Promise.race()` pattern for execution timeouts:
```typescript
const result = await Promise.race([
  sdkClient.callTool(request),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new TimeoutError()), timeout)
  )
]);
```

## Key Sources

1. **MCP Specification**: https://spec.modelcontextprotocol.io/
2. **MCP SDK**: https://github.com/modelcontextprotocol/sdk
3. **execa**: https://github.com/sindresorhus/execa
4. **JSON-RPC 2.0**: https://www.jsonrpc.org/specification

## Future Considerations

### Alternative Transports

The layered architecture supports adding:
- **SSH Transport**: Remote container execution
- **Local Process Transport**: Direct MCP server spawning
- **WebSocket Transport**: Network-based MCP communication

### Connection Pooling

For multiple plugin containers:
- Pool of StdioClient instances
- Connection manager for lifecycle
- Health checking and rotation

### Telemetry Integration

Tool call events (`onToolCall`) designed for:
- Activity monitoring in UI
- Execution time tracking
- Error rate monitoring
