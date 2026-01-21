# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-21 18:23

### Q1: MCP Connection Mechanism
**Context**: The extension needs to connect to the MCP server running in the dev container for in-situ testing. The connection method affects architecture and error handling.
**Question**: How should the extension connect to the MCP server in the dev container?
**Options**:
- A: stdio transport - spawn/exec into container and communicate via stdin/stdout
- B: HTTP/WebSocket - expose an HTTP endpoint from the MCP server for the extension to connect
- C: VS Code Remote API - leverage VS Code's existing remote container connection

**Answer**: *Pending*

### Q2: Activity Feed Data Source
**Context**: Real-time monitoring of agent tool invocations requires a data source. This affects whether Agency core needs modifications.
**Question**: How does the extension receive real-time tool invocation data for the activity feed?
**Options**:
- A: Subscribe to events emitted by Agency core (requires Agency to expose event stream)
- B: Poll a status endpoint on the MCP server
- C: Intercept MCP traffic as a proxy between Claude and Agency

**Answer**: *Pending*

### Q3: Configuration Storage Location
**Context**: Plugin enable/disable state and settings need to persist. Storage location affects portability and team sharing.
**Question**: Where should plugin configurations be stored?
**Options**:
- A: VS Code workspace settings (settings.json) - portable with repo
- B: Dedicated config file in .agency/ directory - explicit, versionable
- C: User-level VS Code settings - personal preferences, not shared

**Answer**: *Pending*

### Q4: Dev Container Discovery
**Context**: The extension needs to find running dev containers to connect to. Discovery method affects supported environments.
**Question**: How should the extension discover dev containers?
**Options**:
- A: Docker API directly - works with any Docker environment
- B: VS Code Remote Containers extension API - integrates with existing workflows
- C: Manual configuration - user specifies container ID or URL

**Answer**: *Pending*

### Q5: Epic Decomposition Strategy
**Context**: This is a large epic with multiple features. Breaking it into child issues affects parallelization and delivery.
**Question**: How should this epic be decomposed into child issues?
**Options**:
- A: By feature area (one issue per feature: Plugin UI, Tool Testing, Activity Feed, etc.)
- B: By layer (one for extension scaffold, one for views, one for MCP client, etc.)
- C: By vertical slice (minimal viable extension first, then incremental features)

**Answer**: *Pending*

