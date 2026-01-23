# Implementation Plan: Complete Container Operations UI

**Feature**: Complete Container Operations UI in VS Code extension
**Branch**: `125-complete-container-operations-ui`
**Status**: Complete

## Summary

Replace stub command implementations with fully functional container management operations in the Agency VS Code extension. This includes implementing start, stop, rebuild, and log viewing commands with proper UI integration, progress notifications, and event-based MCP connection synchronization.

## Technical Context

| Component | Technology |
|-----------|------------|
| Language | TypeScript 5.x |
| Platform | VS Code Extension API |
| Runtime | Node.js 20+ |
| Container CLI | Docker CLI |
| Package Manager | pnpm |
| Build System | turborepo |

## Existing Architecture

The extension already has well-structured foundations:

- **ContainerService** (`src/services/ContainerService.ts`): Fully implemented singleton with:
  - Container discovery via Docker CLI and VS Code Remote Containers API
  - `startContainer()`, `stopContainer()`, `rebuildContainer()` methods
  - `getContainerLogs()` async iterator for log streaming
  - `onContainerStateChange` event emitter for state notifications
  - Container caching with automatic invalidation

- **ContainerTreeProvider** (`src/providers/ContainerTreeProvider.ts`): Partially implemented with:
  - Tree item rendering with status icons
  - Context values for command enablement
  - Reference to `containerService.onDidChangeState` (needs fixing - should be `onContainerStateChange`)

- **ContainerDetailPanel** (`src/views/containers/ContainerDetailPanel.ts`): Fully implemented webview with:
  - Container metadata display
  - Log streaming and filtering (text search)
  - Action buttons for start/stop/rebuild
  - Message-based communication with webview

- **McpClientService** (`src/services/McpClientService.ts`): Fully implemented with:
  - `onConnectionStatusChange` event for status updates
  - `connect()` and `disconnect()` methods
  - Auto-reconnect with exponential backoff

## Implementation Approach

### 1. Event-Based MCP Integration Pattern

Rather than coupling ContainerService to McpClientService, we use events:

```
ContainerService.onContainerStateChange → McpConnectionManager (new) → McpClientService
```

The new McpConnectionManager:
- Subscribes to container state changes
- Manages the relationship between containers and MCP connections
- Handles connection lifecycle (connect on start, disconnect on stop)

### 2. Command Implementation Pattern

Each command follows this pattern:
1. Get container from tree item or show picker if not provided
2. Validate operation is allowed (check status, devcontainer.json)
3. Show progress notification
4. Execute operation via ContainerService
5. Handle result (update UI, show notifications)

### 3. Log Filtering Enhancement

Extend the existing text search to include log level filtering:
- Parse Docker log stream to separate stdout/stderr
- Add filter controls to webview UI
- Apply combined filters in log rendering

## Project Structure

```
packages/agency-extension/src/
├── services/
│   ├── ContainerService.ts         # Already implemented
│   ├── McpClientService.ts         # Already implemented
│   └── McpConnectionManager.ts     # NEW: Event bridge for MCP sync
├── providers/
│   └── ContainerTreeProvider.ts    # Fix event subscription
├── views/containers/
│   └── ContainerDetailPanel.ts     # Enhance log filtering
├── commands/
│   └── containerCommands.ts        # NEW: Command implementations
├── utils/
│   └── devcontainerDetector.ts     # NEW: Workspace devcontainer.json detection
└── extension.ts                    # Update command registration
```

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `commands/containerCommands.ts` | Container command implementations |
| `services/McpConnectionManager.ts` | Event-based MCP connection sync |
| `utils/devcontainerDetector.ts` | Detect devcontainer.json in workspace |

### Modified Files

| File | Changes |
|------|---------|
| `extension.ts` | Replace stub commands with real implementations |
| `providers/ContainerTreeProvider.ts` | Fix event subscription name |
| `views/containers/ContainerDetailPanel.ts` | Add log level filter UI |
| `commands/index.ts` | Export container commands |

## Implementation Phases

### Phase 1: Foundation
- Create devcontainer.json detector utility
- Create McpConnectionManager service for event-based integration
- Fix ContainerTreeProvider event subscription bug

### Phase 2: Command Implementation
- Implement `startContainer` command with devcontainer.json validation
- Implement `stopContainer` command with MCP cleanup coordination
- Implement `rebuildContainer` command with progress notifications
- Implement `viewContainerLogs` command

### Phase 3: UI Enhancement
- Add log level (stdout/stderr) filter to ContainerDetailPanel
- Update tree view context menu for operations
- Add command availability based on container status

### Phase 4: Integration & Testing
- Wire up commands in extension.ts
- Add error handling and edge cases
- Write unit tests for new components

## Key Interfaces

### McpConnectionManager

```typescript
interface McpConnectionManager {
  // Subscribe to container events and manage MCP connection lifecycle
  initialize(containerService: ContainerService, mcpService: McpClientService): void;

  // Get current mapping of containers to MCP connections
  getConnectionMapping(): Map<string, McpConnectionInfo>;

  // Manually associate a container with MCP connection
  associateContainer(containerId: string): Promise<void>;

  dispose(): void;
}
```

### Container Command Options

```typescript
interface ContainerCommandContext {
  containerId?: string;         // From tree item or picker
  showProgress?: boolean;       // Show progress notification (default: true)
  skipValidation?: boolean;     // Skip devcontainer.json check (default: false)
}
```

## Dependencies

- Existing: Docker CLI must be available in PATH
- Optional: VS Code Remote Containers extension for enhanced integration
- Required: devcontainer.json in workspace for start/rebuild operations

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Docker not available | Check Docker availability before operations, show helpful error |
| Container state race conditions | Use cache invalidation and re-fetch state after operations |
| Log stream memory issues | Existing 500-line buffer limit in ContainerDetailPanel |
| MCP connection timing | Use event-based coordination, not direct coupling |

## Testing Strategy

- Unit tests for devcontainer detector utility
- Unit tests for McpConnectionManager event handling
- Integration tests for container commands with mock ContainerService
- Manual testing with actual dev containers

---

*Generated by speckit*
