# Data Model: ContainerTreeProvider & Commands

**Feature**: `058-tg-019-containertreeprovider-commands`
**Status**: Complete

## Core Entities

### ContainerTreeItem

Tree item representation of a container for VS Code tree view.

```typescript
class ContainerTreeItem extends vscode.TreeItem {
  /**
   * The underlying container information
   */
  public readonly container: ContainerInfo;

  /**
   * Collapsible state (containers are leaf nodes, so typically None)
   */
  public readonly collapsibleState: vscode.TreeItemCollapsibleState;

  constructor(container: ContainerInfo, collapsibleState: vscode.TreeItemCollapsibleState);
}
```

**Properties derived from ContainerInfo**:
- `label`: Container name
- `description`: Container image name
- `iconPath`: ThemeIcon based on status
- `contextValue`: String for command enablement (e.g., "containerRunning", "containerStopped")
- `tooltip`: Markdown string with container details

### ContainerInfo (from parent types)

Already defined in parent epic (TG-003), referenced here for completeness:

```typescript
interface ContainerInfo {
  id: string;                    // Docker container ID
  name: string;                  // Container name
  image: string;                 // Image name (e.g., "mcr.microsoft.com/devcontainers/typescript-node:20")
  status: ContainerStatus;       // Current status
  state: ContainerState;         // Detailed state
  workspacePath?: string;        // Workspace mount path
  ports: PortMapping[];          // Port mappings
  createdAt: Date;               // Creation timestamp
  startedAt?: Date;              // Last start timestamp
}

enum ContainerStatus {
  Running = 'running',
  Stopped = 'stopped',
  Paused = 'paused',
  Restarting = 'restarting',
  Dead = 'dead',
  Created = 'created',
  Exited = 'exited'
}

interface ContainerState {
  status: ContainerStatus;
  running: boolean;
  paused: boolean;
  restarting: boolean;
  oomKilled: boolean;
  dead: boolean;
  pid: number;
  exitCode: number;
  error: string;
  startedAt: string;
  finishedAt: string;
}

interface PortMapping {
  privatePort: number;
  publicPort?: number;
  type: 'tcp' | 'udp';
}
```

## Command Parameters

### StartContainerParams

```typescript
interface StartContainerParams {
  containerId: string;
}
```

**Validation**:
- `containerId` must be non-empty string
- Container must exist in ContainerService
- Container must be in stopped/created/exited state

### StopContainerParams

```typescript
interface StopContainerParams {
  containerId: string;
  timeout?: number;  // Graceful shutdown timeout in seconds (default: 10)
}
```

**Validation**:
- `containerId` must be non-empty string
- Container must exist in ContainerService
- Container must be in running/paused state

### RebuildContainerParams

```typescript
interface RebuildContainerParams {
  containerId: string;
  noCache?: boolean;  // Force rebuild without cache
}
```

**Validation**:
- `containerId` must be non-empty string
- Container must exist in ContainerService
- User must confirm (destructive operation)

## Tree View State

### ContainerTreeState

Internal state managed by ContainerTreeProvider:

```typescript
interface ContainerTreeState {
  containers: ContainerInfo[];      // Cached container list
  refreshing: boolean;               // Refresh in progress flag
  lastRefresh: Date;                 // Timestamp of last refresh
  error?: Error;                     // Last error, if any
}
```

## Context Values for Command Enablement

| Context Value | Container States | Purpose |
|---------------|-----------------|---------|
| `containerRunning` | Running, Restarting | Enable stop, rebuild commands |
| `containerStopped` | Stopped, Created, Exited | Enable start command |
| `containerPaused` | Paused | Enable stop, rebuild commands |
| `containerAny` | All states | Enable viewLogs command |

**Implementation**:
```typescript
function getContextValue(status: ContainerStatus): string {
  switch (status) {
    case ContainerStatus.Running:
    case ContainerStatus.Restarting:
      return 'containerRunning';
    case ContainerStatus.Paused:
      return 'containerPaused';
    case ContainerStatus.Stopped:
    case ContainerStatus.Created:
    case ContainerStatus.Exited:
      return 'containerStopped';
    default:
      return 'containerAny';
  }
}
```

## Icon Mapping

| Container Status | ThemeIcon | Color |
|-----------------|-----------|-------|
| Running | `debug-start` | Green (`charts.green`) |
| Stopped | `debug-stop` | Gray (`disabledForeground`) |
| Paused | `debug-pause` | Yellow (`charts.yellow`) |
| Restarting | `sync~spin` | Blue (`charts.blue`) |
| Dead / Error | `error` | Red (`charts.red`) |
| Created | `circle-outline` | Gray (`disabledForeground`) |

## Command Results

### ContainerActionResult (from parent types)

```typescript
interface ContainerActionResult {
  success: boolean;
  containerId: string;
  message?: string;
  error?: Error;
  duration?: number;  // Operation duration in milliseconds
}
```

## Event Types

### TreeRefreshEvent

Emitted when tree needs to refresh:

```typescript
type TreeRefreshEvent = ContainerTreeItem | undefined | null | void;
```

- `ContainerTreeItem`: Refresh specific item
- `undefined` / `null` / `void`: Refresh entire tree

## Validation Rules

### Container Operation Validation

```typescript
interface ContainerOperationValidation {
  canStart(container: ContainerInfo): { valid: boolean; reason?: string };
  canStop(container: ContainerInfo): { valid: boolean; reason?: string };
  canRebuild(container: ContainerInfo): { valid: boolean; reason?: string };
}
```

**Rules**:
- **canStart**: Container must not be running/restarting
- **canStop**: Container must be running/paused/restarting
- **canRebuild**: Container can be in any state (will stop first if running)

## Relationships

```
ContainerTreeProvider
  ├─ uses → ContainerService (from TG-018)
  ├─ emits → TreeRefreshEvent
  ├─ creates → ContainerTreeItem[]
  └─ manages → ContainerTreeState

ContainerTreeItem
  ├─ extends → vscode.TreeItem
  ├─ contains → ContainerInfo
  └─ has → contextValue: string

Container Commands
  ├─ consume → ContainerTreeItem
  ├─ call → ContainerService methods
  ├─ trigger → TreeRefreshEvent
  └─ return → ContainerActionResult
```

---

*Generated by speckit*
