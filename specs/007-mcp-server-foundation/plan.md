# Implementation Plan: MCP Server Foundation

**Feature**: Core MCP server that serves as the foundation for Agency
**Branch**: `007-mcp-server-foundation`
**Status**: Complete

## Summary

Implement the `AgencyServer` class - a thin wrapper around the MCP SDK's `McpServer` that adds:
- Plugin-based tool registration
- Mode-based tool filtering
- Multi-source configuration loading
- Graceful lifecycle management

The server delegates protocol handling to the MCP SDK while providing Agency-specific abstractions for plugins and modes.

## Technical Context

| Aspect | Choice |
|--------|--------|
| Language | TypeScript 5.x (ES2022 target) |
| Runtime | Node.js 20+ |
| Module System | ESM (Node16 resolution) |
| MCP SDK | `@modelcontextprotocol/sdk` ^1.5.0 |
| Validation | Zod ^3.24.1 |
| Testing | Vitest ^3.0.4 |
| Build | TypeScript compiler (tsc) |

## Project Structure

```
packages/agency/
├── src/
│   ├── index.ts                    # Public exports
│   ├── server/
│   │   ├── agency-server.ts        # Main AgencyServer class
│   │   └── index.ts                # Server module exports
│   ├── config/
│   │   ├── loader.ts               # Multi-source config loading
│   │   ├── schema.ts               # Zod schemas for config
│   │   └── index.ts                # Config module exports
│   ├── tools/
│   │   ├── registry.ts             # Tool registration & filtering
│   │   ├── types.ts                # AgencyTool interface
│   │   └── index.ts                # Tools module exports
│   ├── plugins/
│   │   ├── loader.ts               # Plugin lifecycle management
│   │   ├── types.ts                # AgencyPlugin interface
│   │   └── index.ts                # Plugin module exports
│   ├── modes/
│   │   ├── manager.ts              # Mode switching logic
│   │   └── index.ts                # Modes module exports
│   └── errors/
│       ├── agency-error.ts         # Base error class
│       └── index.ts                # Error exports
├── package.json
└── tsconfig.json
```

## Architecture Decisions

### AD-001: Thin Wrapper over MCP SDK

**Decision**: Use the low-level `Server` class from MCP SDK rather than `McpServer`.

**Rationale**: The low-level `Server` provides `setRequestHandler()` which allows us to intercept `tools/list` and filter by mode before responding. The high-level `McpServer` registers tools directly without a filtering hook.

**Implementation**:
```typescript
// Use low-level Server for control
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Set custom handlers for filtering
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: this.registry.getToolsForMode(this.currentMode) };
});
```

### AD-002: Plugin Interface

**Decision**: Define a minimal `AgencyPlugin` interface locally until contracts repo is available.

**Rationale**: The contracts repo dependency (generacy-ai/contracts#7) may not be ready. Define interface locally with same shape for forward compatibility.

```typescript
interface AgencyPlugin {
  name: string;
  version: string;
  tools: AgencyTool[];
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
}
```

### AD-003: Configuration Priority

**Decision**: Load config from multiple sources with explicit priority order.

**Rationale**: Different deployment contexts need different config sources.

**Priority** (highest to lowest):
1. `.agency/config.json` - Project-specific (Humancy wizard)
2. `package.json` "agency" field - npm package config
3. Environment variables - CI/container overrides

### AD-004: Mode Filtering with Glob Patterns

**Decision**: Use minimatch-style glob patterns for mode tool filtering.

**Rationale**: Patterns like `source_control.*` are intuitive and match the spec.

```typescript
// Mode config
modes: {
  default: ["source_control.*", "build.*"]
}

// Tool matching
// "source_control.commit" matches "source_control.*"
// "build.run" matches "build.*"
```

## Implementation Phases

### Phase 1: Core Types and Errors
- Define `AgencyTool` interface
- Define `AgencyPlugin` interface
- Define `AgencyConfig` schema with Zod
- Implement `AgencyError` base class

### Phase 2: Configuration
- Implement `ConfigLoader` class
- Support `.agency/config.json` file
- Support `package.json` "agency" field
- Support environment variable overrides
- Merge configs by priority

### Phase 3: Tool Registry
- Implement `ToolRegistry` class
- Register/unregister tools
- Glob pattern matching for modes
- Filter tools by current mode

### Phase 4: Plugin System
- Implement `PluginLoader` class
- Load plugin by name/instance
- Initialize plugins in order
- Shutdown plugins in reverse order
- Register plugin tools

### Phase 5: Server Implementation
- Implement `AgencyServer` class
- Integrate MCP SDK `Server`
- Set up stdio transport
- Wire up `tools/list` with mode filtering
- Wire up `tools/call` execution
- Implement `ping` handler
- Graceful shutdown

### Phase 6: Testing
- Unit tests for each module
- Integration test for server lifecycle
- Mock transport for protocol testing

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.5.0 | MCP protocol implementation |
| `zod` | ^3.24.1 | Runtime config validation |
| `minimatch` | ^10.0.0 | Glob pattern matching for modes |

## File Mapping

| Requirement | File(s) |
|-------------|---------|
| FR-001: MCP connections | `server/agency-server.ts` |
| FR-002: Mode filtering | `tools/registry.ts`, `modes/manager.ts` |
| FR-003: Tool execution | `server/agency-server.ts` |
| FR-004: Config loading | `config/loader.ts`, `config/schema.ts` |
| FR-005: Plugin management | `plugins/loader.ts` |
| FR-006: Graceful shutdown | `server/agency-server.ts` |
| FR-007: Error handling | `errors/agency-error.ts` |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| MCP SDK API changes | Pin to specific version, wrap SDK calls |
| Contracts repo delay | Define interfaces locally, match expected shape |
| Plugin initialization failures | Catch errors, continue with partial functionality |

## Success Metrics

| Metric | Target | Validation |
|--------|--------|------------|
| Server startup | < 500ms | Performance test |
| Tool overhead | < 10ms | Benchmark test |
| Test coverage | > 80% | Coverage report |

---

*Generated by speckit*
