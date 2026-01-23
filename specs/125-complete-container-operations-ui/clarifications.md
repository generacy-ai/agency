# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-23 20:40

### Q1: MCP Connection Sync
**Context**: The spec requires 'Handle MCP connection cleanup' on stop and 'Restart MCP connection after rebuild'. However, there's no McpClientService-ContainerService integration currently. This impacts whether we need to add coupling between these services.
**Question**: Should the ContainerService directly call McpClientService methods, or should there be an event-based integration where McpClientService listens to container state changes?
**Options**:
- A: Direct coupling: ContainerService calls McpClientService.disconnect()/reconnect() directly
- B: Event-based: McpClientService subscribes to onContainerStateChange and handles its own lifecycle

**Answer**: *Pending*

### Q2: devcontainer.json Detection
**Context**: The spec says 'Detect devcontainer.json in workspace' for Start Container, but the current ContainerService detects containers via Docker labels. The workspace-to-container mapping may not be straightforward.
**Question**: Should Start Container work only when a devcontainer.json exists in the current workspace, or should it also work for containers discovered via Docker that may not have an active workspace?
**Options**:
- A: Require devcontainer.json - only start containers that match the current workspace
- B: Allow any container - show all dev containers and let user start any of them

**Answer**: *Pending*

### Q3: Log Filtering Scope
**Context**: The spec mentions 'Support log filtering' but doesn't define what filtering criteria should be supported. This impacts UI complexity.
**Question**: What log filtering capabilities are needed?
**Options**:
- A: Text search only - simple keyword filtering in output
- B: Text search + log level - filter by stdout/stderr plus text search
- C: Full filtering - text, log level, time range, regex support

**Answer**: *Pending*

