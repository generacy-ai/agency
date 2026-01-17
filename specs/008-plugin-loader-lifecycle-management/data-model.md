# Data Model: Plugin Loader and Lifecycle Management

## Core Entities

### PluginManifest

Metadata describing a plugin, read from package.json or dedicated manifest file.

```typescript
interface PluginManifest {
  /** Unique identifier (npm package name format: @scope/name) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Semantic version */
  version: string;

  /** Plugin description */
  description?: string;

  /** Entry point relative to package root */
  main: string;

  /** TypeScript types file */
  types?: string;

  /** Plugin dependencies (other plugin IDs) */
  dependencies: string[];

  /** Peer dependencies with version ranges */
  peerDependencies?: Record<string, string>;

  /** Tool names this plugin provides */
  tools?: string[];

  /** Mode names this plugin registers */
  modes?: string[];

  /** Channel names this plugin registers */
  channels?: string[];

  /** If true, plugin failure stops the system */
  critical: boolean;
}
```

### AgencyPlugin

Runtime plugin instance with lifecycle methods.

```typescript
interface AgencyPlugin {
  /** Plugin metadata */
  manifest: PluginManifest;

  /** Initialize plugin with core API access */
  initialize(core: AgencyCoreAPI): Promise<void>;

  /** Clean shutdown */
  shutdown(): Promise<void>;

  /** Called when mode changes */
  onModeChange?(mode: string): void;

  /** Called when any tool is invoked (for monitoring) */
  onToolCall?(tool: string, params: unknown): void;
}
```

### AgencyCoreAPI

API provided to plugins for interacting with the core system.

```typescript
interface AgencyCoreAPI {
  // Tool management
  registerTool(tool: ToolDefinition): void;
  unregisterTool(name: string): void;

  // Mode access
  getCurrentMode(): string;
  registerMode(mode: string): void;
  onModeChange(callback: (mode: string) => void): () => void;

  // Channel communication
  registerChannel(channel: ChannelDefinition): void;
  sendMessage<T>(channel: string, message: MessageEnvelope<T>): void;
  onMessage<T>(channel: string, handler: (msg: MessageEnvelope<T>) => void): () => void;

  // Configuration
  getConfig<T>(key: string): T | undefined;

  // Telemetry
  recordEvent(event: TelemetryEvent): void;

  // Plugin info
  getPluginId(): string;
}
```

### ToolDefinition

Tool definition for registration (extends existing AgencyTool).

```typescript
interface ToolDefinition {
  /** Namespaced tool name */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for input parameters */
  inputSchema: JsonSchema;

  /** Tool category for grouping */
  namespace: string;

  /** Output pattern (always 'terse' for agent tools) */
  outputPattern: 'terse';

  /** Modes this tool is available in */
  modes?: string[];

  /** Execute the tool */
  execute(params: unknown): Promise<ToolResult>;
}
```

## Channel Types

### ChannelDefinition

Defines a communication channel.

```typescript
interface ChannelDefinition {
  /** Channel identifier */
  name: string;

  /** Human-readable description */
  description: string;

  /** Plugin that owns/created this channel */
  owner: string;

  /** Message schema for validation (optional) */
  messageSchema?: JsonSchema;
}
```

### MessageEnvelope

Wrapper for messages sent on channels.

```typescript
interface MessageEnvelope<T = unknown> {
  /** Message unique identifier */
  id: string;

  /** Channel name */
  channel: string;

  /** Sender plugin ID */
  sender: string;

  /** Message timestamp */
  timestamp: Date;

  /** Message payload */
  payload: T;

  /** Optional correlation ID for request/response patterns */
  correlationId?: string;
}
```

## Validation Types

### ValidationResult

Result of manifest validation.

```typescript
interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors if any */
  errors?: Array<{
    path: string;
    message: string;
  }>;
}
```

### DependencyCheck

Result of dependency resolution.

```typescript
interface DependencyCheck {
  /** Whether all dependencies are satisfied */
  satisfied: boolean;

  /** Missing required dependencies */
  missing: string[];

  /** Version conflicts */
  conflicts: Array<{
    pluginId: string;
    required: string;
    available: string;
  }>;

  /** Load order if satisfied */
  loadOrder?: string[];
}
```

## Discovery Types

### DiscoveredPlugin

Plugin found during discovery phase.

```typescript
interface DiscoveredPlugin {
  /** File path to the plugin package */
  path: string;

  /** Source of discovery */
  source: 'node_modules' | 'config' | 'explicit';

  /** Parsed manifest */
  manifest: PluginManifest;
}
```

### DiscoveryOptions

Options for plugin discovery.

```typescript
interface DiscoveryOptions {
  /** Paths to scan for plugins */
  searchPaths: string[];

  /** Additional explicit plugin paths */
  additionalPlugins?: string[];

  /** Package name pattern to match */
  pattern?: RegExp;
}
```

## Plugin State

### PluginState

Internal state tracking for loaded plugins.

```typescript
interface PluginState {
  /** Plugin manifest */
  manifest: PluginManifest;

  /** Plugin instance */
  instance: AgencyPlugin;

  /** Current lifecycle state */
  status: 'initializing' | 'active' | 'failed' | 'shutting_down' | 'unloaded';

  /** Error if status is 'failed' */
  error?: Error;

  /** Registered cleanup functions */
  cleanups: Array<() => void | Promise<void>>;
}
```

## Configuration Types

### PluginConfig

Plugin-related configuration (extends AgencyConfig).

```typescript
interface PluginConfig {
  /** Additional plugin search paths */
  pluginPaths?: string[];

  /** Explicit plugins to load */
  plugins?: string[];

  /** Plugin-specific configuration */
  pluginOptions?: Record<string, unknown>;
}
```

## Entity Relationships

```
┌─────────────────┐
│ PluginManifest  │
│                 │
│ - id            │
│ - dependencies  │──────┐
│ - tools         │      │
│ - modes         │      │
│ - channels      │      │
└────────┬────────┘      │
         │               │
         │ describes     │ depends on
         ▼               ▼
┌─────────────────┐    ┌─────────────────┐
│ AgencyPlugin    │    │ AgencyPlugin    │
│                 │    │ (dependency)    │
│ - initialize()  │    └─────────────────┘
│ - shutdown()    │
│ - onModeChange()│
└────────┬────────┘
         │
         │ receives
         ▼
┌─────────────────┐
│ AgencyCoreAPI   │
│                 │
│ - registerTool()│
│ - sendMessage() │
│ - getConfig()   │
└─────────────────┘
         │
         │ manages
         ▼
┌─────────────────┐
│ ChannelManager  │
│ ModeManager     │
│ ToolRegistry    │
└─────────────────┘
```

## Validation Rules

### Manifest Validation

| Field | Rule |
|-------|------|
| id | Must match `^@[\w-]+\/[\w-]+$` |
| version | Must be valid semver |
| main | Must be relative path |
| dependencies | Each must be valid plugin ID |
| critical | Boolean, defaults to false |

### Dependency Validation

| Condition | Result |
|-----------|--------|
| Missing dependency | DependencyCheck.missing populated |
| Circular dependency | DependencyCheck.satisfied = false |
| Version mismatch | DependencyCheck.conflicts populated |
| All satisfied | DependencyCheck.loadOrder contains topological order |

### Channel Validation

| Rule | Enforcement |
|------|-------------|
| Channel name unique | ChannelManager throws on duplicate registration |
| Message has sender | Envelope populated automatically |
| Message has timestamp | Envelope populated automatically |
