# Implementation Plan: ContainerTreeProvider & Commands

**Feature**: Container tree view and lifecycle commands for VS Code extension
**Branch**: `058-tg-019-containertreeprovider-commands`
**Status**: Complete

## Summary

Implement the container tree view provider and associated commands for managing dev containers in the Agency VS Code extension. This task is part of Phase 6: Container Management (TG-019) in the parent epic.

## Technical Context

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| VS Code Extension API | 1.85+ | TreeDataProvider, commands |
| Node.js | 20+ | Runtime environment |

## Parent Epic Context

This task inherits technical decisions and architecture from the parent epic (038-epic-agency-vs-code):
- Extension structure follows established patterns in `packages/agency-extension/`
- Uses `ContainerService` (from TG-018) for backend container operations
- Commands follow naming convention `agency.*`
- Tree providers extend VS Code `TreeDataProvider<T>`

## Scope

**Task Group**: TG-019 (Phase 6: Container Management)
**Estimated Time**: 2-3 hours
**Prerequisites**: TG-018 (ContainerService) must be complete

## Files to Create/Modify

1. **ContainerTreeProvider.ts** (`packages/agency-extension/src/providers/ContainerTreeProvider.ts`)
   - TreeDataProvider implementation for container list
   - Status icons (running, stopped, paused, etc.)
   - Refresh on container state changes

2. **container-commands.ts** (`packages/agency-extension/src/commands/container-commands.ts`)
   - `agency.startContainer` - Start a stopped container
   - `agency.stopContainer` - Stop a running container
   - `agency.rebuildContainer` - Rebuild container from scratch
   - `agency.viewContainerLogs` - Open container logs view

3. **Test Files**
   - `packages/agency-extension/src/providers/__tests__/ContainerTreeProvider.test.ts`
   - `packages/agency-extension/src/commands/__tests__/container-commands.test.ts`

4. **Integration Points**
   - Update `packages/agency-extension/src/providers/index.ts` to export ContainerTreeProvider
   - Update `packages/agency-extension/src/commands/index.ts` to register container commands
   - Update `packages/agency-extension/src/extension.ts` to register tree view and commands

## Architecture

```
┌─────────────────────────────────────────────────┐
│         VS Code Extension Host                  │
├─────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌────────────────────┐  │
│  │ ContainerTree    │  │ Container Commands │  │
│  │ Provider         │  │                    │  │
│  │                  │  │ - start            │  │
│  │ - Tree items     │  │ - stop             │  │
│  │ - Status icons   │  │ - rebuild          │  │
│  │ - Refresh        │  │ - viewLogs         │  │
│  └────────┬─────────┘  └─────────┬──────────┘  │
│           │                      │              │
│           └──────────┬───────────┘              │
│                      ▼                          │
│           ┌─────────────────────┐               │
│           │  ContainerService   │               │
│           │  (from TG-018)      │               │
│           └─────────────────────┘               │
└─────────────────────────────────────────────────┘
```

## Implementation Details

### ContainerTreeProvider

**Class Structure**:
```typescript
export class ContainerTreeProvider implements vscode.TreeDataProvider<ContainerTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ContainerTreeItem | undefined | null | void>;
  readonly onDidChangeTreeData: vscode.Event<ContainerTreeItem | undefined | null | void>;

  constructor(private containerService: ContainerService);

  refresh(): void;
  getTreeItem(element: ContainerTreeItem): vscode.TreeItem;
  getChildren(element?: ContainerTreeItem): Promise<ContainerTreeItem[]>;
}

class ContainerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly container: ContainerInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  );
}
```

**Status Icons**:
- Running: Green circle / play icon
- Stopped: Gray circle / stop icon
- Paused: Yellow circle / pause icon
- Restarting: Blue circle with arrows
- Error: Red circle / alert icon

**Context Values** (for command enablement):
- `containerRunning` - For stop/rebuild commands
- `containerStopped` - For start command
- `containerAny` - For viewLogs command

### Container Commands

**Command Implementations**:

1. `agency.startContainer(container: ContainerTreeItem)`
   - Call `containerService.startContainer(container.id)`
   - Show progress notification
   - Refresh tree on completion

2. `agency.stopContainer(container: ContainerTreeItem)`
   - Call `containerService.stopContainer(container.id)`
   - Show progress notification
   - Refresh tree on completion

3. `agency.rebuildContainer(container: ContainerTreeItem)`
   - Confirm with user (destructive operation)
   - Call `containerService.rebuildContainer(container.id)`
   - Show progress with cancellation token
   - Refresh tree on completion

4. `agency.viewContainerLogs(container: ContainerTreeItem)`
   - Open ContainerDetailPanel (from TG-020) with logs view
   - If TG-020 not yet implemented, show logs in output channel as fallback

**Command Registration** (in package.json contributes):
```json
{
  "command": "agency.startContainer",
  "title": "Start Container",
  "when": "view == agency.containers && viewItem == containerStopped"
},
{
  "command": "agency.stopContainer",
  "title": "Stop Container",
  "when": "view == agency.containers && viewItem == containerRunning"
},
{
  "command": "agency.rebuildContainer",
  "title": "Rebuild Container",
  "when": "view == agency.containers && viewItem =~ /container/"
},
{
  "command": "agency.viewContainerLogs",
  "title": "View Logs",
  "when": "view == agency.containers && viewItem =~ /container/"
}
```

## Integration with Extension

**In `extension.ts` (activate function)**:
```typescript
// Register ContainerTreeProvider
const containerService = new ContainerService();
const containerTreeProvider = new ContainerTreeProvider(containerService);
vscode.window.registerTreeDataProvider('agency.containers', containerTreeProvider);

// Register container commands
context.subscriptions.push(
  vscode.commands.registerCommand('agency.startContainer', startContainer),
  vscode.commands.registerCommand('agency.stopContainer', stopContainer),
  vscode.commands.registerCommand('agency.rebuildContainer', rebuildContainer),
  vscode.commands.registerCommand('agency.viewContainerLogs', viewContainerLogs)
);
```

## Testing Strategy

### Unit Tests

1. **ContainerTreeProvider Tests**:
   - Renders container list from ContainerService
   - Updates tree on refresh
   - Assigns correct context values based on container status
   - Shows appropriate icons for each status

2. **Container Commands Tests**:
   - Commands call correct ContainerService methods
   - Progress notifications shown
   - Tree refreshes after operations
   - Rebuild command shows confirmation dialog

### Integration Tests
- Mock ContainerService with test containers
- Verify tree rendering with different container states
- Verify command enablement conditions

## Error Handling

- Display user-friendly notifications for operation failures
- Show specific errors (e.g., "Container not found", "Docker daemon not running")
- Graceful fallback if ContainerService unavailable
- Timeout handling for long-running operations (rebuild)

## Success Criteria

- [ ] ContainerTreeProvider displays containers with correct status icons
- [ ] Start command successfully starts stopped containers
- [ ] Stop command successfully stops running containers
- [ ] Rebuild command shows confirmation and rebuilds container
- [ ] ViewLogs command opens logs view
- [ ] Commands are enabled/disabled based on container state
- [ ] Tree updates automatically when container state changes
- [ ] All tests pass

## Dependencies

**Requires** (must be complete first):
- TG-018: ContainerService implementation
- TG-001: Extension package setup
- TG-002: Extension entry point

**Enables** (can proceed after this):
- TG-020: Container Detail Webview (consumes ContainerTreeProvider)

---

*Generated by speckit*
