# Research: Complete Container Operations UI

## Technology Decisions

### 1. Event-Based MCP Integration (Recommended)

**Decision**: Use an event-based integration pattern where McpClientService subscribes to container state changes rather than direct coupling.

**Rationale**:
- Maintains separation of concerns between container management and MCP connections
- ContainerService doesn't need to know about MCP
- McpClientService can react to container events independently
- Easier to test each component in isolation
- Follows the observer pattern already established in the codebase

**Alternatives Considered**:
- **Direct coupling**: ContainerService calls McpClientService methods directly
  - Rejected: Creates tight coupling, harder to test, violates SRP
- **Shared state**: Both services read from a central state store
  - Rejected: Adds complexity, introduces potential race conditions

### 2. Docker CLI for Container Operations

**Decision**: Continue using Docker CLI as the primary interface for container operations.

**Rationale**:
- Already implemented in ContainerService
- Works regardless of VS Code Remote Containers extension installation
- Provides consistent behavior across environments
- Simpler than Docker API/SDK integration

**Alternatives Considered**:
- **Docker SDK (dockerode)**: Use Node.js Docker SDK
  - Rejected: Adds dependency, more complex, CLI is sufficient
- **VS Code Remote API only**: Rely solely on Remote Containers extension
  - Rejected: Extension may not be installed, limited operations exposed

### 3. DevContainer.json Detection Strategy

**Decision**: Check for devcontainer.json in the workspace before allowing start/rebuild operations.

**Rationale**:
- Ensures containers are properly configured for the workspace
- Prevents accidental operations on unrelated containers
- Matches the workspace-centric design in the spec

**Implementation**:
```typescript
// Check standard locations
const locations = [
  '.devcontainer/devcontainer.json',
  '.devcontainer.json',
  '.devcontainer/<folder>/devcontainer.json'
];
```

### 4. Log Level Filtering

**Decision**: Separate stdout and stderr in log display with visual differentiation.

**Rationale**:
- Docker logs command can separate stdout/stderr with `--details` flag
- Stderr typically contains errors and warnings
- Visual separation helps debugging

**Implementation**:
- Add dropdown/toggle for log level filter in webview
- Parse Docker logs output to identify stream type
- Apply CSS styling for stderr lines (red/orange color)

## Implementation Patterns

### Progress Notification Pattern

VS Code provides `window.withProgress` for long-running operations:

```typescript
await vscode.window.withProgress(
  {
    location: vscode.ProgressLocation.Notification,
    title: 'Starting container...',
    cancellable: false,
  },
  async (progress) => {
    progress.report({ increment: 0 });
    const result = await containerService.startContainer(id);
    progress.report({ increment: 100 });
    return result;
  }
);
```

### Command Context Pattern

Commands receive context from tree items:

```typescript
vscode.commands.registerCommand('agency.startContainer', async (item?: ContainerTreeItem) => {
  // If item provided, use its container
  // Otherwise, show picker to select container
  const containerId = item?.container.id ?? await selectContainer();
});
```

### Event Subscription Pattern

The codebase uses a custom EventEmitter pattern compatible with VS Code:

```typescript
class McpConnectionManager {
  constructor(
    containerService: ContainerService,
    mcpService: McpClientService
  ) {
    // Subscribe to container state changes
    containerService.onContainerStateChange((event) => {
      if (event.newStatus === 'running') {
        this.handleContainerStarted(event.containerId);
      } else if (event.newStatus === 'exited' || event.newStatus === 'stopped') {
        this.handleContainerStopped(event.containerId);
      }
    });
  }
}
```

## Key Technical Findings

### 1. ContainerTreeProvider Bug

The ContainerTreeProvider has a bug in the constructor:
```typescript
// Current (broken)
this.containerService.onDidChangeState(() => { ... });

// Should be
this.containerService.onContainerStateChange(() => { ... });
```

The ContainerService exposes `onContainerStateChange`, not `onDidChangeState`.

### 2. Log Stream Separation

Docker logs command output combines stdout and stderr by default. To separate them:

```bash
# Get stdout only
docker logs --stdout <container>

# Get stderr only
docker logs --stderr <container>
```

The current ContainerService implementation uses a combined stream. Enhancement would require:
1. Running two separate log streams
2. Merging with stream type annotation
3. Updating the async iterator to yield stream type

### 3. VS Code Remote Containers Integration

When the Remote Containers extension is installed, it provides:
- `remote-containers.rebuildContainer` command for in-place rebuild
- Remote URI context for container detection
- Better container state synchronization

The current implementation correctly checks for this extension and uses it when available.

### 4. Container Status Mapping

Docker container states map to our ContainerStatus as follows:

| Docker State | ContainerStatus | Can Start? | Can Stop? |
|-------------|-----------------|------------|-----------|
| running | running | No | Yes |
| created | created | Yes | No |
| exited | exited | Yes | No |
| paused | paused | No | Yes* |
| restarting | restarting | No | Yes |
| removing | removing | No | No |
| dead | dead | No | No |

*Paused containers can be resumed with `docker unpause`

## References

- [VS Code Extension API - TreeDataProvider](https://code.visualstudio.com/api/references/vscode-api#TreeDataProvider)
- [VS Code Extension API - Progress](https://code.visualstudio.com/api/references/vscode-api#ProgressOptions)
- [Docker CLI - logs command](https://docs.docker.com/engine/reference/commandline/logs/)
- [Dev Containers Specification](https://containers.dev/implementors/spec/)
- [MCP SDK - Client](https://modelcontextprotocol.io/docs/sdk/typescript)

---

*Generated by speckit*
