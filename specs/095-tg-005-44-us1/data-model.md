# Data Model: Configuration Schema

## Core Entities

### AgencyConfig

The root configuration object stored in `.agency/agency.config.json`.

```typescript
interface AgencyConfig {
  version: string;              // Semantic version (e.g., "1.0.0")
  plugins: PluginConfig[];      // Array of plugin configurations
  modes: ModeConfig[];          // Array of mode definitions
  containers: ContainerConfig[]; // Array of container configurations
}
```

**Validation Rules**:
- `version`: Required, must match semantic version pattern (x.y.z)
- `plugins`: Required, must be an array (can be empty)
- `modes`: Required, must be an array (can be empty)
- `containers`: Required, must be an array (can be empty)

**Default Value**:
```typescript
{
  version: "1.0.0",
  plugins: [],
  modes: [],
  containers: []
}
```

---

### PluginConfig

Represents a plugin's enabled state and settings.

```typescript
interface PluginConfig {
  id: string;                         // Unique plugin identifier (e.g., "backlog", "autodev")
  enabled: boolean;                   // Whether the plugin is active
  settings: Record<string, unknown>;  // Plugin-specific settings
}
```

**Validation Rules**:
- `id`: Required, non-empty string, lowercase-kebab-case pattern recommended
- `enabled`: Required, boolean
- `settings`: Required, must be an object (can be empty)

**Example**:
```typescript
{
  id: "backlog",
  enabled: true,
  settings: {
    "issueTemplateDir": ".github/ISSUE_TEMPLATE"
  }
}
```

---

### ModeConfig

Defines a mode (a set of enabled plugins/tools for a specific workflow).

```typescript
interface ModeConfig {
  id: string;              // Unique mode identifier (e.g., "development", "review")
  name: string;            // Human-readable name
  description?: string;    // Optional description
  enabledPlugins: string[]; // Array of plugin IDs active in this mode
}
```

**Validation Rules**:
- `id`: Required, non-empty string, lowercase-kebab-case pattern
- `name`: Required, non-empty string
- `description`: Optional, string
- `enabledPlugins`: Required, must be an array of non-empty strings (can be empty array)

**Example**:
```typescript
{
  id: "development",
  name: "Development Mode",
  description: "Full toolset for active development",
  enabledPlugins: ["backlog", "autodev", "speckit"]
}
```

---

### ContainerConfig

Represents a dev container or Docker container configuration.

```typescript
interface ContainerConfig {
  id: string;                              // Unique container identifier
  name: string;                            // Human-readable container name
  type: 'devcontainer' | 'docker';         // Container type
  mcpServerPath?: string;                  // Optional path to MCP server in container
}
```

**Validation Rules**:
- `id`: Required, non-empty string
- `name`: Required, non-empty string
- `type`: Required, must be either "devcontainer" or "docker"
- `mcpServerPath`: Optional, string (absolute path or relative to workspace)

**Example**:
```typescript
{
  id: "agency-dev",
  name: "Agency Development Container",
  type: "devcontainer",
  mcpServerPath: "/workspaces/agency/dist/mcp-server.js"
}
```

---

## Type Relationships

```
AgencyConfig
├── plugins: PluginConfig[]
│   ├── id: string
│   ├── enabled: boolean
│   └── settings: Record<string, unknown>
│
├── modes: ModeConfig[]
│   ├── id: string
│   ├── name: string
│   ├── description?: string
│   └── enabledPlugins: string[]  ──┐
│                                   │
│                           (references)
│                                   │
└── containers: ContainerConfig[]   │
    ├── id: string                  │
    ├── name: string                │
    ├── type: enum                  │
    └── mcpServerPath?: string      │
                                    │
                    PluginConfig.id ◄┘
```

## Zod Schema Implementation Strategy

### Schema Definitions

```typescript
// ConfigSchema.ts

import { z } from 'zod';

// Plugin configuration schema
export const PluginConfigSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  settings: z.record(z.unknown()).default({})
});

// Mode configuration schema
export const ModeConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  enabledPlugins: z.array(z.string().min(1)).default([])
});

// Container configuration schema
export const ContainerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['devcontainer', 'docker']),
  mcpServerPath: z.string().optional()
});

// Root configuration schema
export const AgencyConfigSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semantic version (x.y.z)'),
  plugins: z.array(PluginConfigSchema).default([]),
  modes: z.array(ModeConfigSchema).default([]),
  containers: z.array(ContainerConfigSchema).default([])
});

// Type exports
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type ModeConfig = z.infer<typeof ModeConfigSchema>;
export type ContainerConfig = z.infer<typeof ContainerConfigSchema>;
export type AgencyConfig = z.infer<typeof AgencyConfigSchema>;
```

### Validation Strategy

1. **Parse with default handling**: Use `.parse()` for validation with defaults
2. **Safe parsing**: Use `.safeParse()` when errors should be handled gracefully
3. **Partial updates**: Use `.partial()` for allowing incomplete updates
4. **Strict mode**: No unknown keys allowed (Zod default)

---

## Error Cases

| Scenario | Validation Rule | Error Message |
|----------|----------------|---------------|
| Invalid version format | Must match x.y.z pattern | "Must be semantic version (x.y.z)" |
| Empty plugin id | Min length 1 | "String must contain at least 1 character(s)" |
| Invalid container type | Must be enum value | "Invalid enum value. Expected 'devcontainer' \| 'docker'" |
| Non-array plugins | Must be array | "Expected array, received ..." |
| Non-object settings | Must be object | "Expected object, received ..." |

---

*Generated by speckit*
