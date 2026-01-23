# Data Model: Complete Container Operations UI

## Existing Types (No Changes Needed)

The following types already exist and are sufficient for this feature:

### ContainerInfo

```typescript
interface ContainerInfo {
  id: string;                    // Container ID (short form)
  name: string;                  // Container name
  image: string;                 // Container image name
  status: ContainerStatus;       // Current status
  health: ContainerHealth;       // Health check status
  isDevContainer: boolean;       // Has devcontainer labels
  workspacePath?: string;        // Workspace folder path
  ports: PortMapping[];          // Exposed ports
  labels: Record<string, string>; // Container labels
  createdAt: number;             // Creation timestamp (ms)
  startedAt?: number;            // Start timestamp (ms)
  remoteUri?: string;            // VS Code Remote URI
  hasMcpServer: boolean;         // MCP server available
}
```

### ContainerStatus

```typescript
type ContainerStatus =
  | 'running'
  | 'stopped'
  | 'paused'
  | 'restarting'
  | 'removing'
  | 'exited'
  | 'dead'
  | 'created'
  | 'unknown';
```

### ContainerStateEvent

```typescript
interface ContainerStateEvent {
  containerId: string;           // Container ID
  previousStatus: ContainerStatus;
  newStatus: ContainerStatus;
  timestamp: number;             // Change timestamp
  reason?: string;               // Reason for change
}
```

### ContainerLogEntry

```typescript
interface ContainerLogEntry {
  content: string;               // Log line content
  stream: 'stdout' | 'stderr';   // Log stream
  timestamp: number;             // Log timestamp
}
```

### ContainerLogOptions

```typescript
interface ContainerLogOptions {
  tail?: number;                 // Lines from end
  since?: number;                // Since timestamp (ms)
  until?: number;                // Until timestamp (ms)
  timestamps?: boolean;          // Include timestamps
  follow?: boolean;              // Stream mode
}
```

## New Types

### DevContainerConfig

Configuration parsed from devcontainer.json:

```typescript
interface DevContainerConfig {
  /** Path to the devcontainer.json file */
  configPath: string;

  /** Container name from config (or derived) */
  name?: string;

  /** Docker image to use */
  image?: string;

  /** Dockerfile path (relative to .devcontainer) */
  dockerFile?: string;

  /** Docker Compose file path */
  dockerComposeFile?: string | string[];

  /** Service name in compose file */
  service?: string;

  /** Workspace folder inside container */
  workspaceFolder?: string;

  /** Raw config for additional properties */
  raw: Record<string, unknown>;
}
```

### DevContainerDetectionResult

Result of detecting devcontainer.json in workspace:

```typescript
interface DevContainerDetectionResult {
  /** Whether a devcontainer.json was found */
  found: boolean;

  /** Parsed configuration if found */
  config?: DevContainerConfig;

  /** Path where config was found */
  path?: string;

  /** Error message if detection failed */
  error?: string;
}
```

### ContainerCommandContext

Context passed to container commands:

```typescript
interface ContainerCommandContext {
  /** Container ID from tree item or user selection */
  containerId?: string;

  /** Container info if available */
  container?: ContainerInfo;

  /** Whether to show progress notification */
  showProgress: boolean;

  /** Skip devcontainer.json validation */
  skipValidation: boolean;
}
```

### LogFilterState

State for log filtering in ContainerDetailPanel:

```typescript
interface LogFilterState {
  /** Text search filter */
  textFilter: string;

  /** Stream filter */
  streamFilter: 'all' | 'stdout' | 'stderr';

  /** Whether auto-scroll is enabled */
  autoScroll: boolean;
}
```

### McpContainerAssociation

Association between container and MCP connection:

```typescript
interface McpContainerAssociation {
  /** Container ID */
  containerId: string;

  /** Whether MCP is connected for this container */
  isConnected: boolean;

  /** Last connection attempt timestamp */
  lastAttempt?: number;

  /** Auto-connect on container start */
  autoConnect: boolean;

  /** Error message if connection failed */
  error?: string;
}
```

## Type Relationships

```
DevContainerDetectionResult
    └── DevContainerConfig
           └── Used by containerCommands.ts for validation

ContainerInfo
    └── Used by ContainerTreeProvider for display
    └── Used by ContainerDetailPanel for details
    └── Used by ContainerService for state

ContainerStateEvent
    └── Emitted by ContainerService
    └── Consumed by McpConnectionManager
    └── Consumed by ContainerTreeProvider

ContainerLogEntry
    └── Yielded by ContainerService.getContainerLogs()
    └── Consumed by ContainerDetailPanel
    └── Filtered by LogFilterState

McpContainerAssociation
    └── Managed by McpConnectionManager
    └── Maps containers to MCP connections
```

## Validation Rules

### Container Operations

| Operation | Preconditions |
|-----------|---------------|
| Start | status in ['created', 'exited', 'stopped'], devcontainer.json exists |
| Stop | status in ['running', 'paused', 'restarting'] |
| Rebuild | isDevContainer === true, devcontainer.json exists |
| View Logs | Container exists (any status) |

### DevContainer.json Detection

Priority order for detection:
1. `.devcontainer/devcontainer.json`
2. `.devcontainer.json` (root)
3. `.devcontainer/<subfolder>/devcontainer.json`

### Log Filtering

- Text filter: case-insensitive substring match
- Stream filter: exact match on 'stdout' | 'stderr' | 'all'
- Filters are combined with AND logic

---

*Generated by speckit*
