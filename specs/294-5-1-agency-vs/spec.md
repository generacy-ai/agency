# Feature Specification: Agency VS Code Extension — MVP

**Branch**: `294-5-1-agency-vs` | **Date**: 2026-02-27 | **Status**: Draft

## Summary

Build and publish the MVP of the Agency VS Code extension — a free, auth-free developer tool that provides visual plugin configuration, MCP server connection status, dev container detection, and a "Verify Setup" command. The extension activates when a workspace contains `.agency/agency.config.json` and surfaces plugin state, mode configuration, and MCP connectivity through an activity bar sidebar, status bar items, and webview panels. The MVP delivers the foundational vertical slice: extension scaffolding, plugin configuration UI, and MCP status — enough for a developer to install from the Marketplace, configure their Agency plugins, and confirm their MCP server is running.

### Design Philosophy

**"Agent Empathy Through Experience"** — The Agency extension lets humans experience the agent's MCP tooling firsthand. When an agent fails to use a tool correctly, the human can open the tool testing panel, run the same tool with the same arguments, and see exactly what the agent saw. The MVP establishes the foundation for this workflow.

### Plan Reference

- [onboarding-buildout-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/onboarding-buildout-plan.md) — Issue 5.1
- [agency-vscode-extension-spec.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/agency-vscode-extension-spec.md) — Full UI/UX specification
- [Epic 038 spec](../038-epic-agency-vs-code/spec.md) — Parent epic

### Dependencies

- **generacy-ai/latency#31** — CI/CD for latency repo (npm publishing pipeline)
- **generacy-ai/agency#292** — CI/CD for agency repo (npm publishing pipeline)
- Published `@generacy-ai/agency` core package on npm (Epic 1)

### Execution

**Phase:** 3
**Blocked by:**
- [ ] generacy-ai/latency#31 — CI/CD for latency repo
- [ ] generacy-ai/agency#292 — CI/CD for agency repo

---

## User Stories

### US1: Extension Installation and Activation

**As a** developer adopting Agency for AI-assisted development,
**I want** to install the Agency extension from the VS Code Marketplace and have it activate automatically,
**So that** I can begin configuring my agent's development environment without manual setup.

**Acceptance Criteria**:
- [ ] Extension is published to VS Code Marketplace under publisher `generacy-ai`
- [ ] Extension activates when workspace contains `.agency/agency.config.json`
- [ ] Activity bar shows Agency icon with sidebar containing Plugins, Tools, Activity, Containers, and Modes views
- [ ] Status bar displays current mode and MCP connection status
- [ ] Extension activates in under 2 seconds on a typical workspace
- [ ] No authentication or account creation is required

### US2: Plugin Configuration

**As a** developer using Agency,
**I want** to view and configure Agency plugins through a visual UI,
**So that** I can enable/disable plugins and adjust their settings without editing JSON files directly.

**Acceptance Criteria**:
- [ ] Plugins tree view lists all plugins from `agency.config.json` with enabled/disabled state
- [ ] Can enable a plugin via inline icon or context menu (writes `enabled: true` to config)
- [ ] Can disable a plugin via inline icon or context menu (writes `enabled: false` to config)
- [ ] "Configure Plugin" command opens a webview panel with plugin-specific settings
- [ ] Configuration changes persist to `.agency/agency.config.json` on save
- [ ] "Refresh Plugins" command reloads plugin state from config file
- [ ] Config file changes made externally (e.g., in a text editor) are detected via file watcher

### US3: MCP Server Connection Status

**As a** developer working in a dev container with Agency,
**I want** to see at a glance whether the Agency MCP server is running and connected,
**So that** I know my AI agent has access to its tools before I start a coding session.

**Acceptance Criteria**:
- [ ] Status bar item shows MCP connection state: connected, connecting, disconnected, or error
- [ ] Status bar uses distinct icons/colors per state (e.g., `$(check)` green for connected, `$(error)` red for error)
- [ ] "Connect to MCP Server" command initiates stdio connection to the MCP server
- [ ] "Disconnect from MCP Server" command cleanly terminates the connection
- [ ] Auto-connect on activation when `agency.autoConnect` setting is `true` (default)
- [ ] Connection failures surface a user-visible warning (not a hard error — extension remains functional)

### US4: Dev Container Detection

**As a** developer opening a project with Agency configured,
**I want** the extension to detect whether I'm in a dev container and whether the Agency MCP server is available,
**So that** I can quickly tell if my environment is set up correctly.

**Acceptance Criteria**:
- [ ] Containers tree view discovers running dev containers associated with the workspace
- [ ] Each container shows status (running, stopped, etc.) with appropriate icon
- [ ] Container discovery uses VS Code Remote Containers API with Docker API fallback
- [ ] Container tree refreshes on workspace open and can be manually refreshed

### US5: Verify Setup

**As a** developer who has just configured Agency for the first time,
**I want** to run a single command that checks whether everything is set up correctly,
**So that** I can identify and fix configuration problems before starting work.

**Acceptance Criteria**:
- [ ] "Agency: Verify Setup" command is available in the command palette
- [ ] Checks for presence of `.agency/agency.config.json` and validates against schema
- [ ] Checks MCP server connectivity (attempts connection if not already connected)
- [ ] Checks dev container status (if applicable)
- [ ] Displays a summary of results — pass/fail for each check with actionable messages
- [ ] On full pass, shows a success notification confirming the environment is ready

### US6: Mode Display

**As a** developer using Agency modes to control tool availability,
**I want** to see which mode is active and what tools it includes,
**So that** I understand what capabilities my AI agent currently has.

**Acceptance Criteria**:
- [ ] Status bar shows the current active mode name
- [ ] Modes tree view lists all configured modes with the active one highlighted
- [ ] "Switch Mode" command presents a quick-pick of available modes
- [ ] "View Mode Tools" command shows tools enabled in the selected mode
- [ ] Mode changes update the status bar and tree view immediately
- [ ] Mode state persists via `agency.currentMode` VS Code setting

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Extension activates on `workspaceContains:.agency/agency.config.json` | P1 | Core activation trigger |
| FR-002 | Activity bar view container with Agency icon | P1 | Entry point to all features |
| FR-003 | Plugins tree view with enable/disable/configure actions | P1 | Primary MVP feature |
| FR-004 | Plugin configuration webview panel (read/write `agency.config.json`) | P1 | Webview-based settings editor |
| FR-005 | ConfigService: read, write, watch `.agency/agency.config.json` | P1 | Zod schema validation on read/write |
| FR-006 | Status bar: MCP connection state indicator | P1 | Connected/connecting/disconnected/error states |
| FR-007 | Status bar: current mode display | P1 | Clickable — opens mode switcher |
| FR-008 | MCP client: stdio transport connection to Agency MCP server | P1 | Uses `@modelcontextprotocol/sdk` |
| FR-009 | Auto-connect to MCP server on activation (configurable) | P1 | Governed by `agency.autoConnect` setting |
| FR-010 | "Verify Setup" command — validates config, MCP, and container state | P1 | Outputs pass/fail summary |
| FR-011 | Connect/Disconnect MCP commands | P1 | Manual connection lifecycle |
| FR-012 | Container discovery via Docker API | P2 | Lists running containers for workspace |
| FR-013 | Containers tree view with status indicators | P2 | Running/stopped/exited states |
| FR-014 | Mode switching via quick-pick command | P2 | Reads modes from config |
| FR-015 | Modes tree view with active mode indicator | P2 | Shows tool counts per mode |
| FR-016 | Tools tree view (read-only browse of available MCP tools) | P2 | Organized by namespace |
| FR-017 | Activity tree view (placeholder for future real-time feed) | P3 | Skeleton only in MVP |
| FR-018 | VS Code settings: `agency.configPath`, `agency.autoConnect`, `agency.currentMode` | P1 | Extension contribution points |
| FR-019 | Extension bundled with esbuild for Marketplace distribution | P1 | Single-file bundle, no node_modules |
| FR-020 | Output channel for extension logging | P1 | Scoped logger with debug/info/warn/error levels |

---

## Technical Architecture

### Package Identity

```
Name:        @generacy-ai/agency-extension
Display:     Agency
Publisher:   generacy-ai
VS Code:     ^1.85.0
Activation:  workspaceContains:.agency/agency.config.json
Entry:       ./dist/extension.js
```

### Source Structure

```
packages/agency-extension/
├── src/
│   ├── extension.ts              # Entry point (activate/deactivate)
│   ├── constants.ts              # Shared constants
│   ├── commands/                 # VS Code command handlers
│   │   ├── plugin-commands.ts    # Configure, enable, disable, refresh
│   │   ├── tool-commands.ts      # Test tool, refresh, connect/disconnect
│   │   ├── container-commands.ts # Start, stop, rebuild, logs
│   │   └── mode-commands.ts      # Switch, view tools, refresh
│   ├── providers/                # Tree view data providers
│   │   ├── PluginTreeProvider.ts
│   │   ├── ToolTreeProvider.ts
│   │   ├── ActivityTreeProvider.ts
│   │   ├── ContainerTreeProvider.ts
│   │   └── ModeTreeProvider.ts
│   ├── views/                    # Webview panels
│   │   ├── webview-base.ts       # Base webview class
│   │   └── plugins/              # Plugin configuration webview
│   ├── services/                 # Business logic
│   │   ├── ConfigService.ts      # Config file I/O + Zod validation
│   │   ├── McpClientService.ts   # MCP protocol client wrapper
│   │   ├── McpConnectionManager.ts # Connection lifecycle
│   │   ├── ContainerService.ts   # Container discovery
│   │   ├── ActivityService.ts    # Activity event stream
│   │   └── ModeService.ts        # Mode management
│   ├── mcp/                      # MCP protocol layer
│   │   ├── StdioClient.ts        # stdio transport
│   │   └── DockerExecTransport.ts
│   ├── config/                   # Schema and defaults
│   │   ├── ConfigSchema.ts       # Zod validation schemas
│   │   └── defaults.ts
│   ├── status/                   # Status bar management
│   │   └── StatusBarManager.ts
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Logger, disposables, debounce
├── media/                        # Icons and stylesheets
├── package.json                  # VS Code extension manifest
├── esbuild.config.mjs            # Bundle configuration
└── vitest.config.ts              # Test configuration
```

### Key Technology Choices

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| MCP transport | `@modelcontextprotocol/sdk` | ^1.5.0 | Standard MCP protocol, stdio transport |
| Config validation | Zod | ^3.24.0 | Runtime type safety, clear error messages |
| Bundler | esbuild | ^0.20.0 | Fast bundling, VS Code best practice |
| Test framework | Vitest | ^3.2.4 | Fast, TypeScript-native |
| Process management | execa | ^8.0.0 | Reliable child process handling |
| VS Code API | @types/vscode | ^1.85.0 | Minimum supported VS Code version |
| Publishing | @vscode/vsce | ^2.24.0 | Marketplace packaging and publishing |

### Configuration Schema

The extension reads and writes `.agency/agency.config.json`:

```typescript
interface AgencyConfig {
  version: string;               // Schema version (e.g., "1.0.0")
  plugins: PluginConfig[];       // Plugin enable/disable and settings
  modes: ModeConfig[];           // Tool availability modes
  containers: ContainerConfig[]; // Container connection configs
}
```

See [data-model.md](../038-epic-agency-vs-code/data-model.md) for complete type definitions and Zod validation schemas.

---

## Commands

| Command | ID | Description |
|---------|-----|-------------|
| Agency: Configure Plugin | `agency.configurePlugin` | Opens webview panel for plugin settings |
| Agency: Enable Plugin | `agency.enablePlugin` | Enables a disabled plugin |
| Agency: Disable Plugin | `agency.disablePlugin` | Disables an enabled plugin |
| Agency: Refresh Plugins | `agency.refreshPlugins` | Reloads plugin list from config |
| Agency: Test Tool | `agency.testTool` | Opens tool testing webview |
| Agency: Refresh Tools | `agency.refreshTools` | Reloads tool list from MCP server |
| Agency: Connect to MCP Server | `agency.connectMcp` | Establishes stdio connection |
| Agency: Disconnect from MCP Server | `agency.disconnectMcp` | Terminates MCP connection |
| Agency: Switch Mode | `agency.switchMode` | Quick-pick mode selector |
| Agency: View Mode Tools | `agency.viewModeTools` | Shows tools in selected mode |
| Agency: Refresh Modes | `agency.refreshModes` | Reloads modes from config |
| Agency: Start Container | `agency.startContainer` | Starts a stopped container |
| Agency: Stop Container | `agency.stopContainer` | Stops a running container |
| Agency: Rebuild Container | `agency.rebuildContainer` | Rebuilds a container |
| Agency: View Container Logs | `agency.viewContainerLogs` | Opens container log output |

---

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Extension activation time | < 2 seconds | VS Code extension host performance metrics |
| SC-002 | Marketplace install success | 100% clean install | Test install on VS Code 1.85+ (Linux, macOS, Windows) |
| SC-003 | Config read/write correctness | Zero data loss on round-trip | Unit tests: read config, modify, write, re-read, assert equality |
| SC-004 | MCP connection establishment | < 5 seconds to connected state | Timer from activation to `connected` status bar state |
| SC-005 | Verify Setup accuracy | All checks report correct state | Integration test: correct pass/fail for valid and invalid configs |
| SC-006 | Plugin enable/disable persistence | Changes survive extension reload | Functional test: toggle plugin, reload, verify state persists |
| SC-007 | Unit test coverage | > 80% line coverage on services | Vitest coverage report |
| SC-008 | Bundle size | < 500 KB (extension.js) | esbuild output size check |

---

## Assumptions

- **Agency core MCP server is published to npm** — The `@generacy-ai/agency` package is available for installation in dev containers before the extension ships.
- **Dev containers have Agency pre-installed** — The MCP server is running and accessible via stdio within the container; the extension does not install it.
- **VS Code 1.85+** — Minimum supported version, aligning with current LTS and webview API stability.
- **`.agency/agency.config.json` is the single source of truth** — All configuration flows through this file; the extension does not maintain separate state.
- **No authentication required** — The extension is entirely free and local. No network calls to external services (except npm registry for plugin metadata, if implemented in a future phase).
- **Docker is available** — For container detection features, Docker CLI or Docker socket is accessible from the host.
- **One workspace folder** — MVP targets single-root workspaces; multi-root workspace support is deferred.

---

## Out of Scope

The following are explicitly **not** part of this MVP and are deferred to subsequent phases of the epic:

- **In-situ MCP tool execution** — The tool testing webview with parameter input and result display (Epic Phase 2)
- **Real-time activity feed** — Live monitoring of agent tool invocations via Agency core event stream (Epic Phase 3)
- **Dev container creation wizard** — Template selection and Dockerfile generation for new dev containers (Epic Phase 4)
- **Mode editing UI** — Creating/editing mode definitions through a webview (Epic Phase 5)
- **Authentication or licensing** — Agency is free; auth is Humancy/Generacy's concern
- **Cloud-based features** — No remote APIs, cloud storage, or telemetry
- **Multi-root workspace support** — Single-root workspace only
- **Non-VS Code editors** — JetBrains, Neovim, etc.
- **Marketplace analytics dashboard** — Install metrics and usage analytics
- **Localization / i18n** — English only
- **Plugin installation from within the extension** — MVP reads existing plugins from config; installing new plugins from a registry is deferred

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| CI/CD blockers not resolved (latency#31, agency#292) | Cannot publish to npm or Marketplace | Medium | Phase 3 dependency; blocked issues are actively being worked |
| MCP server process instability | Extension reports incorrect connection status | Low | Reconnection with backoff; status bar always reflects actual state |
| Config file conflicts (concurrent edits) | Data loss or stale UI | Low | File watcher triggers reload; last-write-wins; Zod validation on every read |
| VS Code API deprecations (1.85 baseline) | Extension may break on newer VS Code | Low | Pin to stable APIs; test across versions in CI |
| Bundle size growth from MCP SDK | Slow activation or install | Low | esbuild tree-shaking; bundle size check in CI |

---

## Testing Strategy

### Unit Tests (Vitest)
- **ConfigService**: Read, write, validate, watch `.agency/agency.config.json`
- **McpClientService**: Connection lifecycle, status events, reconnection
- **ContainerService**: Container discovery, status mapping
- **ModeService**: Mode switching, effective tool calculation
- **StatusBarManager**: State transitions, icon/text rendering
- **Tree providers**: Data transformation, tree item rendering

### Integration Tests
- **Extension activation**: Verify activation in a mock workspace with config file present
- **Plugin enable/disable round-trip**: Toggle plugin, verify config file change, verify tree view update
- **MCP connection lifecycle**: Connect, verify status bar, disconnect, verify cleanup
- **Verify Setup command**: Run against valid and invalid configurations

### E2E Tests (Playwright via code-server)
- Install from VSIX in code-server
- Verify all commands appear in command palette
- Verify status bar items render correctly
- Verify plugin configuration webview opens and saves

---

*Generated by speckit*
