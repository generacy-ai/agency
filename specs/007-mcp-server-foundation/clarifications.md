# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-17 21:23

### Q1: Plugin Interface Contract
**Context**: The spec references AgencyPlugin for loadPlugin/unloadPlugin but doesn't define the interface. This blocks implementation of the plugin system.
**Question**: What methods and properties should the AgencyPlugin interface require?
**Options**:
- A: Minimal: name, version, tools array, init/destroy lifecycle hooks
- B: Rich: Above plus dependencies, configuration schema, health checks, event handlers
- C: Defer to contracts repo - use whatever is defined in generacy-ai/contracts

**Answer**: **C - Defer to contracts repo**. The `@generacy-ai/contracts` package is designed for shared schemas. Define the AgencyPlugin interface there for versioning and sharing across components. If contracts isn't bootstrapped yet, use **B (Rich)** as the target shape - the architecture requires dependencies, configuration schemas, and event handlers for the channel system.

### Q2: Tool Definition Format
**Context**: registerTool accepts a Tool type but the structure isn't defined. MCP has a specific tool schema format.
**Question**: Should tools follow the standard MCP tool schema or a custom Agency-specific format?
**Options**:
- A: Standard MCP: Use @modelcontextprotocol/sdk Tool type directly
- B: Wrapper: Agency-specific Tool that wraps MCP tool with metadata
- C: Defer to contracts repo

**Answer**: **B - Wrapper**. Agency has specific patterns beyond raw MCP tools: tool naming convention (`source_control.*`, `build.*`, `humancy.*`), terse output pattern (minimal success, detailed failure), and mode association (tools active only in certain modes). A wrapper type preserves MCP compatibility while adding Agency-specific metadata.

### Q3: Configuration File Location
**Context**: The config JSON structure is shown but not where to look for it. Agents need deterministic config loading.
**Question**: Where should the server look for configuration files and in what priority order?
**Options**:
- A: Single location: .agency/config.json in project root
- B: Multiple: .agency/config.json > package.json agency field > env vars
- C: Passed explicitly via constructor only (no auto-discovery)

**Answer**: **B - Multiple locations**. Supports both onboarding paths: `.agency/config.json` > `package.json` agency field > env vars. The Humancy wizard creates `.agency/config.json`, CLI users can use package.json for simplicity, and CI/containers can use env vars.

### Q4: SSE Transport Scope
**Context**: SSE transport is listed for web agents but no details on authentication, CORS, or endpoint structure.
**Question**: Should SSE transport be included in this foundation issue or deferred to a separate issue?
**Options**:
- A: Include: Implement both stdio and SSE in this issue
- B: Defer: Focus on stdio only, SSE becomes a follow-up issue
- C: Stub: Define SSE interface but don't implement

**Answer**: **B - Defer**. Focus this issue on stdio transport. SSE has orthogonal complexity (auth, CORS, endpoints) and the primary use case is dev container agents using stdio. SSE becomes a follow-up issue.

### Q5: Telemetry Event Types
**Context**: Custom notifications for telemetry events are mentioned but the event types aren't specified.
**Question**: What telemetry events should the server emit?
**Options**:
- A: Minimal: server.start, server.stop, tool.call, tool.error
- B: Rich: Above plus connection events, mode changes, plugin lifecycle, timing metrics
- C: Defer: Make telemetry pluggable, define events in a separate telemetry plugin

**Answer**: **C - Pluggable**. Make telemetry a plugin rather than baked into core. Aligns with the plugin-everything philosophy and graceful degradation principle - no telemetry plugin means no overhead. A `@generacy-ai/agency-plugin-telemetry` can define its own event types.

