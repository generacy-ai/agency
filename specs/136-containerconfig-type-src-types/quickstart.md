# Quickstart: Custom MCP Server Command Configuration

## Overview

This feature allows you to configure custom MCP server commands for containers, enabling connection to MCP servers that don't use the default `npx @modelcontextprotocol/server` command.

## Configuration

Add `mcpCommand` and `mcpArgs` to your container configuration:

```json
{
  "containers": [
    {
      "id": "0d89169785b9",
      "name": "orchestrator",
      "workspacePath": "/workspaces/triad-development",
      "mcpCommand": "node",
      "mcpArgs": ["/workspaces/agency/packages/agency/dist/cli.js"]
    }
  ]
}
```

## Examples

### Default MCP Server (no configuration needed)

```json
{
  "id": "abc123",
  "name": "my-container",
  "workspacePath": "/workspace"
}
```

Runs: `docker exec -i abc123 npx @modelcontextprotocol/server`

### Custom Node.js MCP Server

```json
{
  "id": "abc123",
  "name": "my-container",
  "workspacePath": "/workspace",
  "mcpCommand": "node",
  "mcpArgs": ["/path/to/mcp-server.js"]
}
```

Runs: `docker exec -i abc123 node /path/to/mcp-server.js`

### Python MCP Server

```json
{
  "id": "abc123",
  "name": "my-container",
  "workspacePath": "/workspace",
  "mcpCommand": "python",
  "mcpArgs": ["-m", "my_mcp_server"]
}
```

Runs: `docker exec -i abc123 python -m my_mcp_server`

### Custom Command Only (no arguments)

```json
{
  "id": "abc123",
  "name": "my-container",
  "workspacePath": "/workspace",
  "mcpCommand": "/usr/local/bin/mcp-server"
}
```

Runs: `docker exec -i abc123 /usr/local/bin/mcp-server`

## Fields Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mcpCommand` | string | No | Custom command to run (defaults to `npx`) |
| `mcpArgs` | string[] | No | Arguments for the command (defaults to `['@modelcontextprotocol/server']` when no custom command) |

## Troubleshooting

### Command not found

Ensure the command exists in the container's PATH or use an absolute path:

```json
{
  "mcpCommand": "/usr/local/bin/node",
  "mcpArgs": ["/app/mcp-server.js"]
}
```

### Permission denied

Check that the command is executable in the container:

```bash
docker exec -it <container-id> ls -la /path/to/command
```

### Connection timeout

Increase the timeout in your connection options if the MCP server takes time to start.
