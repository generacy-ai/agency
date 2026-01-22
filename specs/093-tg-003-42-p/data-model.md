# Data Model: Type Definitions

## Core Entities

### Plugin Domain

```typescript
// Plugin identifier (branded type)
type PluginId = string & { readonly __brand: 'PluginId' }

// Plugin configuration
interface PluginConfig {
  readonly id: PluginId
  readonly enabled: boolean
  readonly settings: Record<string, unknown>
}

// Plugin manifest (metadata from plugin package)
interface PluginManifest {
  readonly id: PluginId
  readonly name: string
  readonly version: string
  readonly description?: string
  readonly author?: string
  readonly tools: readonly ToolInfo[]
  readonly dependencies?: readonly PluginId[]
}

// Plugin runtime state (discriminated union)
type PluginState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly manifest: PluginManifest }
  | { readonly status: 'error'; readonly error: Error }
```

### Tool Domain

```typescript
// Tool identifier
type ToolId = string & { readonly __brand: 'ToolId' }

// Tool metadata
interface ToolInfo {
  readonly id: ToolId
  readonly name: string
  readonly description: string
  readonly inputSchema: JsonSchema
  readonly category?: string
}

// Tool execution request
interface ToolExecutionRequest {
  readonly toolId: ToolId
  readonly parameters: Record<string, unknown>
  readonly context?: ToolExecutionContext
}

// Tool execution result (discriminated union)
type ToolResult =
  | { readonly status: 'success'; readonly data: unknown }
  | { readonly status: 'error'; readonly error: ToolError }

// JSON Schema representation
interface JsonSchema {
  readonly type: string
  readonly properties?: Record<string, JsonSchema>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean | JsonSchema
  readonly items?: JsonSchema
  readonly enum?: readonly unknown[]
  readonly description?: string
}

// Tool execution context
interface ToolExecutionContext {
  readonly workspaceRoot?: string
  readonly activeFile?: string
  readonly selection?: { start: number; end: number }
}

// Tool error details
interface ToolError {
  readonly code: string
  readonly message: string
  readonly details?: unknown
}
```

### Activity Domain

```typescript
// Activity event identifier
type ActivityEventId = string & { readonly __brand: 'ActivityEventId' }

// Tool call event
interface ToolCallEvent {
  readonly id: ActivityEventId
  readonly timestamp: Date
  readonly toolId: ToolId
  readonly toolName: string
  readonly server: string
  readonly request: ToolExecutionRequest
  readonly result?: ToolResult
  readonly duration?: number
}

// Activity filter criteria
interface ActivityFilter {
  readonly toolIds?: readonly ToolId[]
  readonly servers?: readonly string[]
  readonly status?: 'success' | 'error'
  readonly startDate?: Date
  readonly endDate?: Date
}

// Activity statistics
interface ActivityStats {
  readonly totalCalls: number
  readonly successCount: number
  readonly errorCount: number
  readonly averageDuration: number
  readonly callsByTool: Record<ToolId, number>
  readonly callsByServer: Record<string, number>
}
```

### Container Domain

```typescript
// Container identifier
type ContainerId = string & { readonly __brand: 'ContainerId' }

// Container information
interface ContainerInfo {
  readonly id: ContainerId
  readonly name: string
  readonly image: string
  readonly workspaceFolder: string
  readonly status: ContainerStatus
}

// Container status (discriminated union)
type ContainerStatus =
  | { readonly state: 'running'; readonly uptime: number }
  | { readonly state: 'stopped' }
  | { readonly state: 'starting' }
  | { readonly state: 'error'; readonly error: string }

// Container action result
interface ContainerActionResult {
  readonly success: boolean
  readonly message?: string
  readonly containerId?: ContainerId
}
```

### Mode Domain

```typescript
// Mode identifier
type ModeId = string & { readonly __brand: 'ModeId' }

// Mode information
interface ModeInfo {
  readonly id: ModeId
  readonly name: string
  readonly description?: string
  readonly enabledTools: readonly ToolId[]
  readonly parent?: ModeId
}

// Mode configuration
interface ModeConfig {
  readonly id: ModeId
  readonly enabled: boolean
  readonly toolOverrides?: Record<ToolId, boolean>
}

// Mode tree node (for hierarchical visualization)
interface ModeTreeNode {
  readonly mode: ModeInfo
  readonly children: readonly ModeTreeNode[]
  readonly isActive: boolean
}
```

## Relationships

### Plugin → Tool
- One plugin provides zero or more tools
- Each tool belongs to exactly one plugin
- Plugin manifest contains array of ToolInfo

### Tool → Activity
- Each tool call generates one ActivityEvent
- Activity events reference tools by ToolId
- Historical activity persists after tool unloaded

### Container → Tool Execution
- Tool execution happens within a container context
- Container provides workspace and file system access
- Container status affects tool availability

### Mode → Tool
- Mode defines which tools are enabled
- Modes can inherit from parent modes
- Mode switching changes available tool set

## Validation Rules

### Plugin Validation
- Plugin ID must be unique across all loaded plugins
- Plugin ID format: `@scope/package-name` or `package-name`
- Dependencies must reference existing plugins

### Tool Validation
- Tool ID must be unique within plugin namespace
- Tool input schema must be valid JSON Schema
- Tool name must be non-empty string

### Activity Validation
- Timestamp must be valid Date
- Duration must be non-negative number
- Tool ID must reference existing tool (or historical tool)

### Container Validation
- Container ID must match Docker container ID format
- Workspace folder must be absolute path
- Container name must be valid Docker name

### Mode Validation
- Mode ID must be unique
- Parent mode must exist if specified
- No circular parent references
- Enabled tools must reference existing tools

## Type Guards

```typescript
// Type guard for PluginState
function isPluginReady(state: PluginState): state is { status: 'ready'; manifest: PluginManifest } {
  return state.status === 'ready'
}

// Type guard for ToolResult
function isToolSuccess(result: ToolResult): result is { status: 'success'; data: unknown } {
  return result.status === 'success'
}

// Type guard for ContainerStatus
function isContainerRunning(status: ContainerStatus): status is { state: 'running'; uptime: number } {
  return status.state === 'running'
}
```

---

*Generated by speckit*
