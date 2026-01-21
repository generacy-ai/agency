# Data Model: Agency VS Code Extension

## Core Entities

### Configuration

```typescript
/**
 * Root configuration stored in .agency/agency.config.json
 */
interface AgencyConfig {
  /** Schema version for migration support */
  version: string;
  /** Plugin configurations */
  plugins: PluginConfig[];
  /** Mode definitions */
  modes: ModeConfig[];
  /** Container configurations */
  containers: ContainerConfig[];
}

/**
 * Individual plugin configuration
 */
interface PluginConfig {
  /** Plugin package identifier (e.g., "@generacy-ai/agency-plugin-git") */
  id: string;
  /** Whether the plugin is enabled */
  enabled: boolean;
  /** Plugin-specific settings (schema defined by plugin) */
  settings: Record<string, unknown>;
}

/**
 * Mode configuration
 */
interface ModeConfig {
  /** Mode identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the mode's purpose */
  description?: string;
  /** Modes this mode inherits from */
  extends?: string[];
  /** Tools enabled in this mode */
  tools: string[];
}

/**
 * Container configuration
 */
interface ContainerConfig {
  /** Container identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Dev container config path */
  devcontainerPath?: string;
  /** Default connection settings */
  connection: ConnectionConfig;
}

/**
 * Connection settings for MCP server
 */
interface ConnectionConfig {
  /** Command to start MCP server in container */
  command: string;
  /** Arguments to pass to command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}
```

### Plugin Types

```typescript
/**
 * Plugin metadata from manifest
 */
interface PluginManifest {
  /** Plugin package identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version */
  version: string;
  /** Plugin description */
  description?: string;
  /** Entry point module */
  main: string;
  /** Type definitions entry */
  types?: string;
  /** Plugin dependencies (other plugin IDs) */
  dependencies: string[];
  /** Tools provided by this plugin */
  tools?: string[];
  /** Modes provided by this plugin */
  modes?: string[];
  /** Channels provided by this plugin */
  channels?: string[];
  /** Whether plugin is critical for core functionality */
  critical: boolean;
}

/**
 * Runtime plugin state
 */
interface PluginState {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Current configuration */
  config: PluginConfig;
  /** Whether plugin is currently loaded */
  loaded: boolean;
  /** Last error if plugin failed to load */
  error?: string;
  /** Tools currently registered by this plugin */
  registeredTools: string[];
}
```

### Tool Types

```typescript
/**
 * Tool information from MCP server
 */
interface ToolInfo {
  /** Tool name (namespace.action format) */
  name: string;
  /** Tool description */
  description: string;
  /** Tool namespace (first part of name) */
  namespace: string;
  /** JSON Schema for input parameters */
  inputSchema: JsonSchema;
}

/**
 * Tool execution request
 */
interface ToolExecutionRequest {
  /** Tool name */
  name: string;
  /** Input parameters */
  params: unknown;
  /** Execution options */
  options?: {
    /** Timeout in milliseconds */
    timeout?: number;
  };
}

/**
 * Tool execution result
 */
interface ToolResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Result content (if success) */
  content?: ToolResultContent[];
  /** Error message (if failure) */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
}

/**
 * Tool result content item
 */
interface ToolResultContent {
  /** Content type */
  type: 'text' | 'image' | 'resource';
  /** Text content */
  text?: string;
  /** Image data (base64) */
  data?: string;
  /** Image MIME type */
  mimeType?: string;
  /** Resource URI */
  uri?: string;
}

/**
 * JSON Schema subset for tool parameters
 */
interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  description?: string;
  enum?: unknown[];
  default?: unknown;
}
```

### Activity Types

```typescript
/**
 * Tool call event from activity stream
 */
interface ToolCallEvent {
  /** Unique event identifier */
  id: string;
  /** Event timestamp (Unix ms) */
  timestamp: number;
  /** Tool name */
  tool: string;
  /** Tool namespace */
  namespace: string;
  /** Input parameters */
  params: unknown;
  /** Result content (populated on completion) */
  result?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Current status */
  status: 'pending' | 'success' | 'error';
  /** Source information */
  source?: {
    /** Client identifier */
    client?: string;
    /** Session identifier */
    session?: string;
  };
}

/**
 * Activity filter criteria
 */
interface ActivityFilter {
  /** Filter by tool names */
  tools?: string[];
  /** Filter by namespaces */
  namespaces?: string[];
  /** Filter by status */
  status?: ('pending' | 'success' | 'error')[];
  /** Filter by time range */
  timeRange?: {
    start?: number;
    end?: number;
  };
  /** Maximum number of events */
  limit?: number;
}

/**
 * Activity statistics
 */
interface ActivityStats {
  /** Total events in current filter */
  total: number;
  /** Successful events */
  success: number;
  /** Failed events */
  errors: number;
  /** Average duration in milliseconds */
  avgDuration: number;
  /** Events by namespace */
  byNamespace: Record<string, number>;
}
```

### Container Types

```typescript
/**
 * Container information
 */
interface ContainerInfo {
  /** Container ID */
  id: string;
  /** Container name */
  name: string;
  /** Current status */
  status: ContainerStatus;
  /** Image name */
  image: string;
  /** Creation timestamp */
  created: number;
  /** Workspace path mounted in container */
  workspacePath?: string;
  /** Dev container configuration path */
  devcontainerPath?: string;
  /** Port mappings */
  ports?: PortMapping[];
  /** Container labels */
  labels?: Record<string, string>;
}

/**
 * Container status
 */
type ContainerStatus =
  | 'running'
  | 'paused'
  | 'exited'
  | 'created'
  | 'restarting'
  | 'removing'
  | 'dead';

/**
 * Port mapping
 */
interface PortMapping {
  /** Port inside container */
  containerPort: number;
  /** Port on host */
  hostPort: number;
  /** Protocol (tcp/udp) */
  protocol: 'tcp' | 'udp';
}

/**
 * Container action result
 */
interface ContainerActionResult {
  /** Whether action succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** New container status */
  status?: ContainerStatus;
}
```

### Mode Types

```typescript
/**
 * Mode information
 */
interface ModeInfo {
  /** Mode identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Mode description */
  description?: string;
  /** Parent modes (inheritance chain) */
  extends?: string[];
  /** Tools directly included in this mode */
  tools: string[];
  /** All tools available (including inherited) */
  effectiveTools: string[];
  /** Whether this is the current active mode */
  active: boolean;
}

/**
 * Mode inheritance tree node
 */
interface ModeTreeNode {
  /** Mode info */
  mode: ModeInfo;
  /** Child modes that extend this one */
  children: ModeTreeNode[];
  /** Depth in inheritance tree */
  depth: number;
}
```

## Validation Schemas (Zod)

```typescript
import { z } from 'zod';

export const PluginConfigSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  settings: z.record(z.unknown()),
});

export const ModeConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  extends: z.array(z.string()).optional(),
  tools: z.array(z.string()),
});

export const ConnectionConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

export const ContainerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  devcontainerPath: z.string().optional(),
  connection: ConnectionConfigSchema,
});

export const AgencyConfigSchema = z.object({
  version: z.string(),
  plugins: z.array(PluginConfigSchema),
  modes: z.array(ModeConfigSchema),
  containers: z.array(ContainerConfigSchema),
});
```

## Entity Relationships

```
┌─────────────────┐
│  AgencyConfig   │
├─────────────────┤
│ version         │
│ plugins[]  ─────┼──────┐
│ modes[]    ─────┼──────┼──┐
│ containers[]────┼──────┼──┼──┐
└─────────────────┘      │  │  │
                         │  │  │
    ┌────────────────────┘  │  │
    ▼                       │  │
┌─────────────────┐         │  │
│  PluginConfig   │         │  │
├─────────────────┤         │  │
│ id              │         │  │
│ enabled         │         │  │
│ settings        │         │  │
└────────┬────────┘         │  │
         │                  │  │
         │ references       │  │
         ▼                  │  │
┌─────────────────┐         │  │
│ PluginManifest  │         │  │
├─────────────────┤         │  │
│ tools[]    ─────┼─────────┼──┼───────┐
│ modes[]    ─────┼─────────┘  │       │
└─────────────────┘            │       │
                               │       │
    ┌──────────────────────────┘       │
    ▼                                  │
┌─────────────────┐                    │
│   ModeConfig    │                    │
├─────────────────┤                    │
│ id              │                    │
│ extends[]  ─────┼─► (self-reference) │
│ tools[]    ─────┼────────────────────┘
└─────────────────┘

┌─────────────────┐
│ ContainerConfig │
├─────────────────┤
│ id              │
│ connection ─────┼──► ConnectionConfig
└────────┬────────┘
         │
         │ runtime
         ▼
┌─────────────────┐       ┌─────────────────┐
│  ContainerInfo  │◄──────│  ToolCallEvent  │
├─────────────────┤       ├─────────────────┤
│ status          │       │ source.session  │
│ workspacePath   │       │ tool ───────────┼──► ToolInfo
└─────────────────┘       └─────────────────┘
```

---

*Generated by speckit*
