# Quickstart: MCP Transport Layer

## Overview

The MCP Transport Layer provides a client for communicating with MCP servers running in Docker containers via stdio.

## Installation

The MCP transport is part of the `@generacy-ai/agency-extension` package:

```typescript
import {
  StdioClient,
  DockerExecTransport,
  McpErrorCode,
  type StdioClientConfig,
  type ConnectionState,
  type ToolInfo,
  type ToolResult,
} from '@generacy-ai/agency-extension/mcp';
```

## Basic Usage

### Creating a Client

```typescript
import { StdioClient, type StdioClientConfig } from '@generacy-ai/agency-extension/mcp';

const config: StdioClientConfig = {
  // Required: Docker container ID or name
  containerId: 'my-mcp-server',

  // Required: Command to run in container
  command: ['node', '/app/server.js'],

  // Optional: Working directory
  workDir: '/app',

  // Optional: Environment variables
  env: {
    NODE_ENV: 'production',
  },

  // Optional: Client identification
  clientName: 'my-extension',
  clientVersion: '1.0.0',

  // Optional: Timeout settings
  connectionTimeout: 30000,
  defaultExecutionTimeout: 60000,
};

const client = new StdioClient(config);
```

### Connecting and Listing Tools

```typescript
try {
  // Connect to the MCP server
  await client.connect();
  console.log('Connected to MCP server');

  // List available tools
  const tools = await client.listTools();
  console.log('Available tools:', tools.map(t => t.name));

} catch (error) {
  console.error('Failed to connect:', error);
}
```

### Executing Tools

```typescript
import type { ToolExecutionRequest, ToolResult } from '@generacy-ai/agency-extension/mcp';

const request: ToolExecutionRequest = {
  name: 'mcp__plugin__read_file',
  arguments: {
    path: '/app/data/config.json',
  },
};

try {
  const result: ToolResult = await client.executeTool(request, {
    timeout: 10000,      // 10 second timeout
    retry: true,         // Retry on transient failures
    maxRetries: 2,       // Up to 2 retries
  });

  if (result.isError) {
    console.error('Tool failed:', result.errorMessage);
  } else {
    for (const content of result.content) {
      if (content.type === 'text') {
        console.log('Result:', content.text);
      }
    }
  }

  console.log(`Duration: ${result.duration}ms`);

} catch (error) {
  // Execution threw (timeout, disconnection, etc.)
  console.error('Execution error:', error);
}
```

### Monitoring Connection State

```typescript
const unsubscribe = client.onConnectionStateChange((event) => {
  console.log(`State: ${event.previousState} → ${event.currentState}`);

  if (event.currentState === 'error' && event.error) {
    console.error('Connection error:', event.error.message);
  }

  if (event.currentState === 'reconnecting') {
    console.log(`Reconnect attempt ${event.reconnectAttempt}`);
  }
});

// Later: stop listening
unsubscribe();
```

### Monitoring Tool Calls

```typescript
const unsubscribe = client.onToolCall((event) => {
  if (event.completedAt) {
    // Tool call completed
    const duration = event.completedAt - event.startedAt;
    console.log(`Tool ${event.toolName} completed in ${duration}ms`);

    if (event.error) {
      console.error('Tool error:', event.error);
    }
  } else {
    // Tool call started
    console.log(`Tool ${event.toolName} started`);
  }
});
```

### Disconnecting

```typescript
// Graceful disconnect
await client.disconnect();
console.log('Disconnected');
```

## Error Handling

```typescript
import { McpErrorCode } from '@generacy-ai/agency-extension/mcp';

try {
  await client.executeTool(request);
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error) {
    const mcpError = error as { code: McpErrorCode; message: string };

    switch (mcpError.code) {
      case McpErrorCode.EXECUTION_TIMEOUT:
        console.error('Tool execution timed out');
        break;
      case McpErrorCode.DISCONNECTED:
        console.error('Lost connection to server');
        break;
      case McpErrorCode.EXECUTION_FAILED:
        console.error('Tool execution failed:', mcpError.message);
        break;
      default:
        console.error('MCP error:', mcpError.code, mcpError.message);
    }
  } else {
    throw error;
  }
}
```

## Using Low-Level Transport

For advanced use cases, you can use `DockerExecTransport` directly:

```typescript
import { DockerExecTransport, type DockerExecConfig } from '@generacy-ai/agency-extension/mcp';

const config: DockerExecConfig = {
  containerId: 'my-container',
  command: ['node', 'server.js'],
};

const transport = new DockerExecTransport(config);

// Subscribe to events
transport.onMessage((event) => {
  console.log('Received:', event.data);
});

transport.onStateChange((event) => {
  console.log('State:', event.currentState);
});

transport.onError((error) => {
  console.error('Error:', error);
});

// Start and send
await transport.start();
await transport.send({ jsonrpc: '2.0', method: 'initialize', id: 1 });

// Stop
await transport.stop();
```

## Integration with VS Code

```typescript
import * as vscode from 'vscode';
import { StdioClient } from '@generacy-ai/agency-extension/mcp';

export function activate(context: vscode.ExtensionContext) {
  const client = new StdioClient({
    containerId: 'plugin-container',
    command: ['npx', '@generacy-ai/my-plugin'],
  });

  // Connect on activation
  client.connect().catch(console.error);

  // Register tool command
  const disposable = vscode.commands.registerCommand(
    'agency.executeTool',
    async (toolName: string, args: Record<string, unknown>) => {
      try {
        const result = await client.executeTool({ name: toolName, arguments: args });
        return result;
      } catch (error) {
        vscode.window.showErrorMessage(`Tool failed: ${error}`);
      }
    }
  );

  // Cleanup on deactivation
  context.subscriptions.push({
    dispose: () => client.disconnect(),
  });

  context.subscriptions.push(disposable);
}
```

## Troubleshooting

### Connection Timeout

If connection times out:
1. Verify container is running: `docker ps | grep <containerId>`
2. Verify command works: `docker exec -i <containerId> <command>`
3. Increase `connectionTimeout` if server has slow startup

### Tool Execution Timeout

If tools timeout:
1. Increase `timeout` in execution options
2. Check if tool requires more time for specific operations
3. Monitor with `onToolCall` to see where time is spent

### Reconnection Failures

If reconnection fails after disconnect:
1. Check container health
2. Increase `maxReconnectAttempts` for unstable containers
3. Adjust `reconnectDelay` based on container restart time
