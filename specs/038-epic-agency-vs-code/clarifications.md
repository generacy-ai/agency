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

**Answer**: **A (stdio transport)** - The architecture doc explicitly shows `MCP Protocol (stdio via docker exec)` in the communication diagrams. This aligns with the standard MCP protocol transport and keeps things simple - no need to expose additional HTTP endpoints from the container. The extension will spawn/exec into the container and communicate over stdin/stdout.

### Q2: Activity Feed Data Source
**Context**: Real-time monitoring of agent tool invocations requires a data source. This affects whether Agency core needs modifications.
**Question**: How does the extension receive real-time tool invocation data for the activity feed?
**Options**:
- A: Subscribe to events emitted by Agency core (requires Agency to expose event stream)
- B: Poll a status endpoint on the MCP server
- C: Intercept MCP traffic as a proxy between Claude and Agency

**Answer**: **A (Subscribe to events emitted by Agency core)** - The architecture specifies "Activity Feed: Watch agent tool invocations in real-time." This requires Agency core to expose an event stream for tool invocations. This could be implemented as MCP notifications/subscriptions or a separate event stream within the existing MCP connection. Note: This will require corresponding work in Agency core to emit tool invocation events.

### Q3: Configuration Storage Location
**Context**: Plugin enable/disable state and settings need to persist. Storage location affects portability and team sharing.
**Question**: Where should plugin configurations be stored?
**Options**:
- A: VS Code workspace settings (settings.json) - portable with repo
- B: Dedicated config file in .agency/ directory - explicit, versionable
- C: User-level VS Code settings - personal preferences, not shared

**Answer**: **B (Dedicated config file in .agency/ directory)** - The architecture consistently references `agency.config.json` as the primary configuration file. This approach makes configs explicit and versionable, shareable across team members via git, and separate from VS Code editor preferences.

### Q4: Dev Container Discovery
**Context**: The extension needs to find running dev containers to connect to. Discovery method affects supported environments.
**Question**: How should the extension discover dev containers?
**Options**:
- A: Docker API directly - works with any Docker environment
- B: VS Code Remote Containers extension API - integrates with existing workflows
- C: Manual configuration - user specifies container ID or URL

**Answer**: **B (VS Code Remote Containers extension API)** - The architecture shows tight integration with VS Code's dev container workflow. Using the Remote Containers extension API integrates with existing VS Code workflows, handles container lifecycle complexity, and is future-proof for VS Code container implementation changes. Fallback to Docker API directly can be considered for environments without the Remote Containers extension.

### Q5: Epic Decomposition Strategy
**Context**: This is a large epic with multiple features. Breaking it into child issues affects parallelization and delivery.
**Question**: How should this epic be decomposed into child issues?
**Options**:
- A: By feature area (one issue per feature: Plugin UI, Tool Testing, Activity Feed, etc.)
- B: By layer (one for extension scaffold, one for views, one for MCP client, etc.)
- C: By vertical slice (minimal viable extension first, then incremental features)

**Answer**: **C (Vertical slice - minimal viable extension first, then incremental features)** - Given the scope and dependencies on Agency core modifications, a vertical slice approach allows faster value delivery: 1) MVP: Extension scaffold + basic plugin config UI + tool listing, 2) Tool Testing: MCP connection + in-situ tool execution, 3) Activity Feed: Real-time monitoring (requires Agency core event stream), 4) Dev Containers: Container management and templates, 5) Polish: Mode visualization, advanced features.

