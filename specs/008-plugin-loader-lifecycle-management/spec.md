# Feature Specification: Plugin loader and lifecycle management

**Branch**: `008-plugin-loader-lifecycle-management` | **Date**: 2026-01-17 | **Status**: Draft

## Summary

Implement the plugin discovery, loading, and lifecycle management system for Agency.

## Parent Epic

#6 - Agency Core Package

## Dependencies

- #7 - MCP server foundation
- generacy-ai/contracts#7 - Plugin manifest schema (align locally, migrate later)

## Requirements

### Plugin Interface

```typescript
interface AgencyPlugin {
  // Metadata
  manifest: PluginManifest;

  // Lifecycle
  initialize(core: AgencyCoreAPI): Promise<void>;
  shutdown(): Promise<void>;

  // Optional hooks
  onModeChange?(mode: string): void;
  onToolCall?(tool: string, params: unknown): void;
}
```

### Plugin Loader

```typescript
class PluginLoader {
  // Discovery
  discoverPlugins(paths: string[]): Promise<PluginManifest[]>;

  // Loading
  loadPlugin(manifestOrPath: PluginManifest | string): Promise<AgencyPlugin>;
  unloadPlugin(pluginId: string): Promise<void>;

  // Queries
  getLoadedPlugins(): AgencyPlugin[];
  getPluginById(id: string): AgencyPlugin | undefined;

  // Validation
  validateManifest(manifest: PluginManifest): ValidationResult;
  checkDependencies(manifest: PluginManifest): DependencyCheck;
}
```

### Core API (provided to plugins)

```typescript
interface AgencyCoreAPI {
  // Tool registration
  registerTool(tool: ToolDefinition): void;
  unregisterTool(name: string): void;

  // Mode access
  getCurrentMode(): string;

  // Channel communication
  registerChannel(channel: ChannelDefinition): void;
  sendMessage(channel: string, message: MessageEnvelope): void;
  onMessage(channel: string, handler: MessageHandler): void;

  // Configuration
  getConfig<T>(key: string): T | undefined;

  // Telemetry
  recordEvent(event: TelemetryEvent): void;
}
```

### Plugin Discovery

- Scan `node_modules` for `@generacy-ai/agency-plugin-*`
- Support local plugin paths in config
- Support npm package specifiers

### Dependency Resolution

- Validate plugin dependencies before loading
- Load dependencies in correct order
- Warn on version conflicts
- Fail on missing required dependencies

### Error Handling & Failure Isolation

**Configurable per-plugin** failure isolation:
- Default behavior: isolated - failing plugin is disabled, system continues
- Plugins can declare `critical: true` in manifest to propagate failures
- Critical plugins (e.g., `humancy`) stop the system on failure - escalation capability is essential

### Hot Reload

**No hot-reload** for initial implementation:
- Unload/load requires system restart
- Agents operate in dev containers that restart quickly
- Can be added as future enhancement if needed

### Mode System

**Plugin-extensible** modes:
- Core predefined modes: `research`, `coding`, `review`, `debug`
- Plugins can register additional modes via their manifest
- Mode changes trigger `onModeChange` hook on all plugins

### Channel Communication

**Open access** for MVP:
- Any plugin can send/receive on any channel
- Channel ownership tracked via `owner` field
- Permission-based access can be added later if needed

### PluginManifest Schema

**Define locally, align with contracts schema**:
- No external dependency blocking this work
- Schema designed for future compatibility with `@generacy-ai/contracts`
- Clear migration path when contracts package is ready

## Acceptance Criteria

- [ ] Plugins discovered from node_modules
- [ ] Plugins initialize with core API access
- [ ] Plugins can register tools
- [ ] Plugin shutdown cleans up resources
- [ ] Dependency validation works
- [ ] Error handling for plugin failures (configurable isolation)
- [ ] Mode system supports plugin-extensible modes
- [ ] Channel communication works between plugins

## User Stories

### US1: Plugin Developer Integration

**As a** plugin developer,
**I want** to register my plugin with Agency core,
**So that** my plugin's tools become available to agents.

**Acceptance Criteria**:
- [ ] Plugin discovered from node_modules or local path
- [ ] Plugin initialized with AgencyCoreAPI
- [ ] Plugin can register/unregister tools

### US2: Plugin Mode Handling

**As a** plugin developer,
**I want** to respond to mode changes,
**So that** my plugin can enable/disable features based on current context.

**Acceptance Criteria**:
- [ ] Plugin receives onModeChange callbacks
- [ ] Plugin can query current mode via getCurrentMode()
- [ ] Plugin can register custom modes

### US3: Plugin Communication

**As a** plugin developer,
**I want** to communicate with other plugins via channels,
**So that** plugins can coordinate and share data.

**Acceptance Criteria**:
- [ ] Plugin can register channels
- [ ] Plugin can send messages to channels
- [ ] Plugin can subscribe to channel messages

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Discover plugins from node_modules | P1 | Scan for `@generacy-ai/agency-plugin-*` |
| FR-002 | Support local plugin paths | P1 | Config-based paths |
| FR-003 | Validate plugin manifests | P1 | Zod validation |
| FR-004 | Dependency order loading | P1 | Topological sort |
| FR-005 | Plugin isolation (default) | P1 | Failing plugin disabled |
| FR-006 | Critical plugin propagation | P2 | `critical: true` stops system |
| FR-007 | Mode system with hooks | P1 | Core + plugin modes |
| FR-008 | Channel communication | P1 | Open access model |
| FR-009 | Tool registration API | P1 | Via AgencyCoreAPI |
| FR-010 | Clean shutdown | P1 | Reverse order shutdown |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Plugin load time | <500ms per plugin | Performance test |
| SC-002 | Discovery coverage | 100% of installed plugins | Integration test |
| SC-003 | Failure isolation | Non-critical failures isolated | Unit test |

## Assumptions

- Node.js 20+ environment
- TypeScript 5.x codebase
- Plugins are npm packages following naming convention
- MCP server foundation (#7) provides base infrastructure

## Out of Scope

- Hot-reloading plugins (future enhancement)
- Permission-based channel access (future enhancement)
- Plugin sandboxing/security isolation
- Remote plugin loading

---

*Generated by speckit*
