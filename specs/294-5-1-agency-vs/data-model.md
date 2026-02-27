# Data Model: Agency VS Code Extension — MVP

**Branch**: `294-5-1-agency-vs` | **Date**: 2026-02-27

## Overview

This document defines the canonical configuration schemas for the Agency VS Code extension. These schemas align the extension's Zod validation with the core server's runtime model per clarifications Q1 (mode inheritance) and Q2 (container configuration).

## Configuration File

**Path**: `.agency/agency.config.json` (relative to workspace root)

### Root Schema

```typescript
// Zod schema
const AgencyConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  plugins: z.array(PluginConfigSchema).default([]),
  modes: z.array(ModeConfigSchema).default([]),
  containers: z.array(ContainerConfigSchema).default([]),
});
```

```json
{
  "version": "1.0.0",
  "plugins": [],
  "modes": [],
  "containers": []
}
```

---

## Plugin Configuration

No changes from current implementation.

```typescript
const PluginConfigSchema = z.object({
  id: z.string().min(1, 'Plugin ID is required'),
  enabled: z.boolean().default(true),
  settings: z.record(z.unknown()).default({}),
});
```

### Example

```json
{
  "id": "@generacy-ai/plugin-git",
  "enabled": true,
  "settings": {
    "defaultBranch": "develop",
    "autoStage": false
  }
}
```

---

## Mode Configuration (Updated — Q1)

**Change**: Renamed `inherits` → `parentId`. Split `tools` → `includedTools` + `excludedTools`. Added `description` and `isDefault`.

### Before (Current)

```typescript
const ModeConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inherits: z.string().optional(),
  tools: z.array(z.string()).default([]),
});
```

### After (Updated)

```typescript
const ModeConfigSchema = z.object({
  id: z.string().min(1, 'Mode ID is required'),
  name: z.string().min(1, 'Mode name is required'),
  description: z.string().optional(),
  parentId: z.string().optional(),
  includedTools: z.array(z.string()).default([]),
  excludedTools: z.array(z.string()).default([]),
  isDefault: z.boolean().optional(),
});
```

### Alignment with Core Server

| Extension Field | Core Server Field | Notes |
|----------------|-------------------|-------|
| `id` | `name` | Unique identifier |
| `name` | (display only) | Human-readable; core server uses `description` |
| `description` | `description` | Optional |
| `parentId` | `extends` | Single-parent inheritance |
| `includedTools` | `includes` | Glob patterns (minimatch) |
| `excludedTools` | `excludes` | Glob patterns (minimatch), always win over includes |
| `isDefault` | (via `defaultMode` in root config) | Convenience flag |

### Tool Pattern Syntax

Tool patterns use glob syntax (via `minimatch` in the core server):

| Pattern | Matches |
|---------|---------|
| `*` | All tools |
| `source_control.*` | All source_control tools |
| `build.*` | All build tools |
| `!source_control.force_push` | Exclude force_push (in excludedTools) |
| `test.unit_*` | All test tools starting with "unit_" |

### Mode Inheritance Rules

1. **Single parent**: A mode can extend exactly one parent via `parentId`
2. **No cycles**: Circular inheritance is a validation error
3. **Include merge**: Child `includedTools` are unioned with parent's effective includes
4. **Exclude priority**: `excludedTools` always override includes at any level
5. **Resolution order**: Topological sort (parents resolved before children)

### Example

```json
{
  "modes": [
    {
      "id": "research",
      "name": "Research",
      "description": "Read-only research tools",
      "includedTools": ["source_control.status", "source_control.log", "humancy.*"],
      "excludedTools": [],
      "isDefault": false
    },
    {
      "id": "coding",
      "name": "Coding",
      "description": "Full development toolkit",
      "parentId": "research",
      "includedTools": ["source_control.*", "build.*", "test.*"],
      "excludedTools": ["source_control.force_push"],
      "isDefault": true
    },
    {
      "id": "review",
      "name": "Review",
      "description": "Code review tools",
      "parentId": "research",
      "includedTools": ["source_control.diff", "source_control.blame"],
      "excludedTools": []
    }
  ]
}
```

---

## Container Configuration (Updated — Q2)

**Change**: Moved `mcpCommand`/`mcpArgs` into nested `connection` object. Renamed `dockerComposePath` → `devcontainerPath`. Added `env` support.

### Before (Current)

```typescript
const ContainerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  workspacePath: z.string().min(1),
  dockerComposePath: z.string().optional(),
  mcpCommand: z.string().optional(),
  mcpArgs: z.array(z.string()).optional(),
});
```

### After (Updated)

```typescript
const ConnectionConfigSchema = z.object({
  command: z.string().min(1, 'Connection command is required'),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const ContainerConfigSchema = z.object({
  id: z.string().min(1, 'Container ID is required'),
  name: z.string().min(1, 'Container name is required'),
  workspacePath: z.string().min(1, 'Workspace path is required'),
  devcontainerPath: z.string().optional(),
  connection: ConnectionConfigSchema.optional(),
});
```

### Field Semantics

| Field | Level | Purpose |
|-------|-------|---------|
| `id` | Container | Unique identifier for the container |
| `name` | Container | Human-readable display name |
| `workspacePath` | Container | Mounted workspace path inside the container |
| `devcontainerPath` | Container | Path to `.devcontainer/devcontainer.json` (optional) |
| `connection.command` | Connection | MCP server binary/script to execute |
| `connection.args` | Connection | Arguments to pass to the command |
| `connection.env` | Connection | Environment variables for the MCP process |

### MCP Server Discovery Fallback Chain (Q8)

When connecting to an MCP server, the extension resolves the command in this order:

1. **Per-container**: `container.connection.command` + `container.connection.args`
2. **VS Code setting**: `agency.mcpServerCommand` (default: `npx @generacy-ai/agency`)
3. **Final fallback**: `npx @generacy-ai/agency` (hardcoded)

### Example

```json
{
  "containers": [
    {
      "id": "dev-main",
      "name": "Main Dev Container",
      "workspacePath": "/workspaces/my-project",
      "devcontainerPath": ".devcontainer/devcontainer.json",
      "connection": {
        "command": "node",
        "args": ["/usr/local/lib/agency/dist/cli.js"],
        "env": {
          "AGENCY_DEFAULT_MODE": "coding"
        }
      }
    },
    {
      "id": "dev-minimal",
      "name": "Minimal Container",
      "workspacePath": "/workspaces/other-project"
    }
  ]
}
```

In the second container (no `connection`), the extension falls back to the `agency.mcpServerCommand` VS Code setting, then to `npx @generacy-ai/agency`.

---

## Reconnect Configuration (Updated — Q4)

```typescript
interface McpReconnectConfig {
  enabled: boolean;       // default: true
  maxAttempts: number;    // default: 10 (was 5)
  initialDelay: number;   // default: 1000ms
  maxDelay: number;       // default: 30000ms
  backoffMultiplier: number; // default: 2
}
```

### Retry Sequence

| Attempt | Delay |
|---------|-------|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5 | 16s |
| 6 | 30s (capped) |
| 7 | 30s |
| 8 | 30s |
| 9 | 30s |
| 10 | 30s |
| — | Give up. Show "Reconnect" in status bar. |

Total recovery window: ~3.5 minutes.

---

## Config Conflict Model (New — Q7)

```typescript
interface ConfigConflictEvent {
  /** The external file content hash changed */
  externalChanges: boolean;
  /** A webview currently has unsaved modifications */
  webviewDirty: boolean;
  /** Timestamp of the external change detection */
  timestamp: number;
}
```

When both `externalChanges` and `webviewDirty` are true, the extension shows a notification:

> "Agency config file changed externally. Reload and discard your changes, or keep editing?"
> [Reload] [Keep Editing]

---

## Schema Migration

The ConfigService will detect old-format configs and auto-migrate:

| Old Field | New Field | Migration |
|-----------|-----------|-----------|
| `modes[].inherits` | `modes[].parentId` | Rename |
| `modes[].tools` | `modes[].includedTools` | Rename |
| (missing) | `modes[].excludedTools` | Default to `[]` |
| `containers[].mcpCommand` | `containers[].connection.command` | Nest |
| `containers[].mcpArgs` | `containers[].connection.args` | Nest |
| `containers[].dockerComposePath` | `containers[].devcontainerPath` | Rename |

Migration is applied on config load. A warning is logged. The migrated config is written back to disk.

---

*Generated for spec 294-5-1-agency-vs*
