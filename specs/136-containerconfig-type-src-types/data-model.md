# Data Model: ContainerConfig Schema Extension

## Core Entities

### ContainerConfigSchema (Zod)

The runtime validation schema for container configuration.

```typescript
// packages/agency-extension/src/config/ConfigSchema.ts
export const ContainerConfigSchema = z.object({
  id: z.string().min(1, 'Container ID is required'),
  name: z.string().min(1, 'Container name is required'),
  workspacePath: z.string().min(1, 'Workspace path is required'),
  dockerComposePath: z.string().optional(),
  mcpCommand: z.string().optional(),           // NEW
  mcpArgs: z.array(z.string()).optional(),     // NEW
});
```

### ContainerConfig Interface

The TypeScript interface for container configuration (documentation purposes).

```typescript
// packages/agency-extension/src/types/container.ts
export interface ContainerConfig {
  /** Container ID or name pattern */
  id: string;

  /** Display name override */
  displayName?: string;

  /** Whether to auto-connect MCP when this container starts */
  autoConnect: boolean;

  /** Custom MCP server command (if different from default) */
  mcpCommand?: string;

  /** Custom MCP server command arguments */
  mcpArgs?: string[];                          // NEW

  /** Environment variables to set when connecting */
  environment?: Record<string, string>;
}
```

### McpConnectionOptions Interface

Options passed to the MCP client service for connection.

```typescript
// packages/agency-extension/src/types/mcp.ts
export interface McpConnectionOptions {
  /** Container ID to connect to */
  containerId: string;

  /** Custom MCP server command (defaults to standard MCP server) */
  command?: string;

  /** Custom MCP server command arguments */
  args?: string[];                             // NEW

  /** Connection timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Working directory for the MCP server process */
  workingDirectory?: string;

  /** Environment variables to pass to the MCP server */
  environment?: Record<string, string>;
}
```

## Type Relationships

```
┌─────────────────────┐
│ ContainerConfigSchema│ (Zod - runtime validation)
│   mcpCommand?       │
│   mcpArgs?          │
└──────────┬──────────┘
           │ infers
           ▼
┌─────────────────────┐
│ ContainerConfig     │ (TypeScript interface - documentation)
│   mcpCommand?       │
│   mcpArgs?          │
└──────────┬──────────┘
           │ maps to
           ▼
┌─────────────────────┐
│ McpConnectionOptions│ (Connection parameters)
│   command?          │
│   args?             │
└─────────────────────┘
```

## Validation Rules

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| mcpCommand | string | No | No min length (any command is valid) |
| mcpArgs | string[] | No | Array of strings, can be empty |

## Default Values

| Field | Default Behavior |
|-------|------------------|
| mcpCommand | If not set, defaults to `npx` |
| mcpArgs | If not set, defaults to `['@modelcontextprotocol/server']` |

## Example Configurations

### Default (no custom command)
```json
{
  "id": "abc123",
  "name": "my-container",
  "workspacePath": "/workspace"
}
```
Connects with: `docker exec -i abc123 npx @modelcontextprotocol/server`

### Custom command with arguments
```json
{
  "id": "0d89169785b9",
  "name": "orchestrator",
  "workspacePath": "/workspaces/triad-development",
  "mcpCommand": "node",
  "mcpArgs": ["/workspaces/agency/packages/agency/dist/cli.js"]
}
```
Connects with: `docker exec -i 0d89169785b9 node /workspaces/agency/packages/agency/dist/cli.js`
