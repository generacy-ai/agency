# Implementation Plan: Plugin Loader and Lifecycle Management

**Feature**: Plugin discovery, loading, and lifecycle management for Agency
**Branch**: `008-plugin-loader-lifecycle-management`
**Status**: Complete

## Summary

Extend the existing `PluginLoader` to support full plugin lifecycle management including:
- Plugin discovery from node_modules and configured paths
- Manifest validation with Zod schemas
- Dependency resolution with topological sorting
- Mode system integration with plugin-extensible modes
- Channel-based inter-plugin communication
- Configurable failure isolation (default isolated, critical plugins propagate)

## Technical Context

- **Language**: TypeScript 5.x
- **Runtime**: Node.js 20+
- **Framework**: MCP SDK for protocol layer
- **Validation**: Zod for schema validation
- **Build**: turborepo with pnpm workspaces

## Existing Infrastructure

The codebase already has foundational components:

| Component | Location | Status |
|-----------|----------|--------|
| `PluginLoader` | `packages/agency/src/plugins/loader.ts` | Basic implementation - needs extension |
| `AgencyPlugin` | `packages/agency/src/plugins/types.ts` | Simple interface - needs enhancement |
| `ModeManager` | `packages/agency/src/modes/manager.ts` | Exists - needs plugin mode registration |
| `ToolRegistry` | `packages/agency/src/tools/registry.ts` | Complete - can be reused |
| `AgencyServer` | `packages/agency/src/server/agency-server.ts` | Exists - needs CoreAPI integration |
| `AgencyError` | `packages/agency/src/errors/agency-error.ts` | Complete - can be reused |
| `ConfigLoader` | `packages/agency/src/config/loader.ts` | Exists - needs plugin path config |

## Project Structure

```
packages/agency/src/
├── plugins/
│   ├── index.ts                    # Barrel export
│   ├── types.ts                    # AgencyPlugin, PluginManifest (EXTEND)
│   ├── loader.ts                   # PluginLoader (EXTEND)
│   ├── loader.test.ts              # Tests (EXTEND)
│   ├── discovery.ts                # NEW: Plugin discovery
│   ├── discovery.test.ts           # NEW: Discovery tests
│   ├── manifest.ts                 # NEW: Manifest validation
│   ├── manifest.test.ts            # NEW: Manifest tests
│   ├── dependency-resolver.ts      # NEW: Dependency resolution
│   └── dependency-resolver.test.ts # NEW: Dependency tests
├── core-api/
│   ├── index.ts                    # NEW: Barrel export
│   ├── types.ts                    # NEW: AgencyCoreAPI interface
│   ├── core-api.ts                 # NEW: CoreAPI implementation
│   └── core-api.test.ts            # NEW: CoreAPI tests
├── channels/
│   ├── index.ts                    # NEW: Barrel export
│   ├── types.ts                    # NEW: Channel types
│   ├── manager.ts                  # NEW: ChannelManager
│   └── manager.test.ts             # NEW: Channel tests
├── modes/
│   ├── index.ts                    # Barrel export
│   ├── manager.ts                  # ModeManager (EXTEND)
│   └── manager.test.ts             # Tests (EXTEND)
├── config/
│   ├── schema.ts                   # AgencyConfigSchema (EXTEND)
│   └── loader.ts                   # ConfigLoader (minor updates)
└── server/
    └── agency-server.ts            # AgencyServer (EXTEND)
```

## Implementation Phases

### Phase 1: Core Type Definitions

Extend and create type definitions for the full plugin system.

**Files**:
- `plugins/types.ts` - Enhanced AgencyPlugin, new PluginManifest
- `core-api/types.ts` - AgencyCoreAPI interface
- `channels/types.ts` - Channel communication types

### Phase 2: Manifest Validation

Implement Zod-based manifest validation.

**Files**:
- `plugins/manifest.ts` - PluginManifestSchema, validateManifest()
- `plugins/manifest.test.ts` - Validation tests

### Phase 3: Plugin Discovery

Implement discovery from node_modules and configured paths.

**Files**:
- `plugins/discovery.ts` - PluginDiscovery class
- `plugins/discovery.test.ts` - Discovery tests
- `config/schema.ts` - Add pluginPaths config option

### Phase 4: Dependency Resolution

Implement topological sorting for load order.

**Files**:
- `plugins/dependency-resolver.ts` - DependencyResolver class
- `plugins/dependency-resolver.test.ts` - Resolution tests

### Phase 5: Channel Communication

Implement inter-plugin messaging.

**Files**:
- `channels/types.ts` - ChannelDefinition, MessageEnvelope
- `channels/manager.ts` - ChannelManager class
- `channels/manager.test.ts` - Channel tests

### Phase 6: Mode System Enhancement

Extend ModeManager for plugin-registered modes.

**Files**:
- `modes/manager.ts` - Add registerMode(), mode change callbacks
- `modes/manager.test.ts` - Extended tests

### Phase 7: CoreAPI Implementation

Implement the API provided to plugins.

**Files**:
- `core-api/core-api.ts` - AgencyCoreAPI implementation
- `core-api/core-api.test.ts` - CoreAPI tests

### Phase 8: Loader Enhancement

Extend PluginLoader with discovery, validation, and dependency resolution.

**Files**:
- `plugins/loader.ts` - Extend with new capabilities
- `plugins/loader.test.ts` - Extended tests

### Phase 9: Server Integration

Wire everything together in AgencyServer.

**Files**:
- `server/agency-server.ts` - Integrate CoreAPI, channels, enhanced loader
- `server/agency-server.test.ts` - Integration tests

## Key Technical Decisions

1. **No hot-reload**: Plugin updates require restart (simplifies state management)
2. **Open channel access**: Any plugin can use any channel (MVP simplicity)
3. **Local manifest schema**: Defined locally, aligned with future contracts package
4. **Configurable isolation**: Default isolated, `critical: true` propagates failures
5. **Topological dependency sort**: Ensures correct initialization order

## Dependencies

- **Internal**: Builds on existing tools, modes, config infrastructure
- **External**: @modelcontextprotocol/sdk, zod (already in project)

## Testing Strategy

- Unit tests adjacent to source files (`*.test.ts`)
- Integration tests for loader + discovery + dependency resolution
- Mock plugins for testing isolation and failure scenarios

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Circular dependencies between plugins | Dependency resolver detects cycles |
| Plugin discovery slow on large node_modules | Cache discovered manifests |
| Message routing complexity | Keep channel model simple (pub/sub) |

## Next Steps

After plan approval, generate task list with `/speckit:tasks`.
