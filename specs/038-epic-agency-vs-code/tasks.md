# Tasks: Agency VS Code Extension

**Input**: Design documents from `/specs/038-epic-agency-vs-code/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete
**Mode**: Epic (coarse-grained task groups)

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Task group can run in parallel with other `[P]` groups in the same phase
- **[Story]**: Which user story this task group addresses

---

## Phase 1: Foundation & Extension Scaffold
<!-- Phase boundary: Must complete before Phase 2 -->

### TG-001 [P] Extension Package Setup
**Scope**: 2-4 hours
**Files**:
- `packages/agency-extension/package.json`
- `packages/agency-extension/tsconfig.json`
- `packages/agency-extension/esbuild.config.mjs`
- `packages/agency-extension/vitest.config.ts`
- `packages/agency-extension/.vscodeignore`
- `packages/agency-extension/CHANGELOG.md`
**Tests**: Build verification, package.json validation

- [ ] Create `packages/agency-extension/` directory structure
- [ ] Configure `package.json` with VS Code extension manifest (activation events, contributes)
- [ ] Set up `tsconfig.json` extending monorepo base config
- [ ] Configure `esbuild.config.mjs` for extension bundling
- [ ] Set up `vitest.config.ts` for unit testing
- [ ] Create `.vscodeignore` for marketplace packaging
- [ ] Update root `pnpm-workspace.yaml` and `turbo.json` to include new package

---

### TG-002 [P] Extension Entry Point & Core Infrastructure
**Scope**: 3-4 hours
**Files**:
- `packages/agency-extension/src/extension.ts`
- `packages/agency-extension/src/constants.ts`
- `packages/agency-extension/src/utils/index.ts`
- `packages/agency-extension/src/utils/logger.ts`
- `packages/agency-extension/src/utils/disposable.ts`
- `packages/agency-extension/src/utils/debounce.ts`
**Tests**: `packages/agency-extension/src/__tests__/extension.test.ts`

- [ ] Implement `extension.ts` with `activate()` and `deactivate()` functions
- [ ] Create `constants.ts` with shared extension constants
- [ ] Implement `logger.ts` utility for consistent logging
- [ ] Implement `disposable.ts` helper for VS Code disposable management
- [ ] Implement `debounce.ts` utility for event debouncing
- [ ] Write extension activation tests

---

### TG-003 [P] Type Definitions
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/src/types/index.ts`
- `packages/agency-extension/src/types/plugin.ts`
- `packages/agency-extension/src/types/tool.ts`
- `packages/agency-extension/src/types/activity.ts`
- `packages/agency-extension/src/types/container.ts`
**Tests**: Type compilation verification

- [ ] Define plugin types (`PluginConfig`, `PluginManifest`, `PluginState`)
- [ ] Define tool types (`ToolInfo`, `ToolExecutionRequest`, `ToolResult`, `JsonSchema`)
- [ ] Define activity types (`ToolCallEvent`, `ActivityFilter`, `ActivityStats`)
- [ ] Define container types (`ContainerInfo`, `ContainerStatus`, `ContainerActionResult`)
- [ ] Define mode types (`ModeInfo`, `ModeConfig`, `ModeTreeNode`)
- [ ] Create central type exports in `index.ts`

---

### TG-004 [P] Static Assets & Icons
**Scope**: 1-2 hours
**Files**:
- `packages/agency-extension/media/icons/agency.svg`
- `packages/agency-extension/media/icons/plugin.svg`
- `packages/agency-extension/media/icons/tool.svg`
- `packages/agency-extension/media/icons/activity.svg`
- `packages/agency-extension/media/icons/container.svg`
- `packages/agency-extension/media/styles/webview.css`
**Tests**: Manual visual verification

- [ ] Create `agency.svg` extension icon for activity bar
- [ ] Create `plugin.svg` icon for plugin tree items
- [ ] Create `tool.svg` icon for tool tree items
- [ ] Create `activity.svg` icon for activity feed items
- [ ] Create `container.svg` icon for container tree items
- [ ] Create `webview.css` with shared webview styles (VS Code theme variables)

---

## Phase 2: Configuration System
<!-- Phase boundary: Complete Phase 1 before starting -->

### TG-005 [US1] Configuration Schema & File Management
**Scope**: 3-4 hours
**Files**:
- `packages/agency-extension/src/config/index.ts`
- `packages/agency-extension/src/config/ConfigSchema.ts`
- `packages/agency-extension/src/config/ConfigFile.ts`
- `packages/agency-extension/src/config/defaults.ts`
**Tests**: `packages/agency-extension/src/__tests__/services/ConfigService.test.ts`

- [ ] Implement Zod schemas for `AgencyConfig`, `PluginConfig`, `ModeConfig`, `ContainerConfig`
- [ ] Implement `ConfigFile.ts` for reading/writing `.agency/agency.config.json`
- [ ] Implement file watcher for external config changes
- [ ] Define default configuration values in `defaults.ts`
- [ ] Write unit tests for schema validation and file operations

---

### TG-006 [US1] ConfigService Implementation
**Scope**: 3-4 hours
**Files**:
- `packages/agency-extension/src/services/index.ts`
- `packages/agency-extension/src/services/ConfigService.ts`
**Tests**: `packages/agency-extension/src/__tests__/services/ConfigService.test.ts`

- [ ] Implement `ConfigService` class with singleton pattern
- [ ] Add methods: `getConfig()`, `getPlugins()`, `getModes()`, `getContainers()`
- [ ] Add methods: `savePluginConfig()`, `saveModeConfig()`, `saveContainerConfig()`
- [ ] Implement `onConfigChange` event emitter for config updates
- [ ] Implement config migration support for version changes
- [ ] Write comprehensive unit tests

---

## Phase 3: Plugin Configuration UI
<!-- Phase boundary: Complete Phase 2 before starting -->

### TG-007 [US1] PluginTreeProvider
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/src/providers/index.ts`
- `packages/agency-extension/src/providers/PluginTreeProvider.ts`
**Tests**: Provider unit tests

- [ ] Implement `PluginTreeProvider` extending `TreeDataProvider<PluginItem>`
- [ ] Implement `PluginItem` tree item class with enabled/disabled state icons
- [ ] Wire up `onConfigChange` to refresh tree on config updates
- [ ] Register tree view in extension activation
- [ ] Add context menu support for plugin actions

---

### TG-008 [US1] Plugin Configuration Commands
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/src/commands/index.ts`
- `packages/agency-extension/src/commands/plugin-commands.ts`
**Tests**: Command registration tests

- [ ] Implement `agency.configurePlugin` command to open plugin config panel
- [ ] Implement `agency.enablePlugin` command
- [ ] Implement `agency.disablePlugin` command
- [ ] Implement `agency.refreshPlugins` command
- [ ] Register all commands in extension activation

---

### TG-009 [US1] Plugin Configuration Webview
**Scope**: 4-5 hours
**Files**:
- `packages/agency-extension/src/views/index.ts`
- `packages/agency-extension/src/views/webview-base.ts`
- `packages/agency-extension/src/views/plugins/PluginConfigPanel.ts`
- `packages/agency-extension/src/views/plugins/plugin-config.html`
**Tests**: Webview messaging tests

- [ ] Implement `WebviewBase` abstract class for shared webview functionality
- [ ] Implement `PluginConfigPanel` webview panel class
- [ ] Create HTML template with dynamic form generation from plugin settings schema
- [ ] Implement bidirectional message passing (save config, load config)
- [ ] Add form validation before saving
- [ ] Style using VS Code CSS variables for theme consistency

---

## Phase 4: MCP Client & Tool Testing
<!-- Phase boundary: Complete Phase 3 before starting -->

### TG-010 [US2] MCP Transport Layer
**Scope**: 4-5 hours
**Files**:
- `packages/agency-extension/src/mcp/index.ts`
- `packages/agency-extension/src/mcp/types.ts`
- `packages/agency-extension/src/mcp/StdioClient.ts`
- `packages/agency-extension/src/mcp/DockerExecTransport.ts`
**Tests**: `packages/agency-extension/src/__tests__/mcp/StdioClient.test.ts`, `DockerExecTransport.test.ts`

- [ ] Define MCP-related types in `types.ts`
- [ ] Implement `DockerExecTransport` using `execa` for `docker exec -i` communication
- [ ] Implement `StdioClient` wrapping `@modelcontextprotocol/sdk` Client
- [ ] Handle connection lifecycle (connect, disconnect, reconnect)
- [ ] Implement timeout and error handling for tool execution
- [ ] Write unit tests with mock stdio streams

---

### TG-011 [US2] McpClientService
**Scope**: 3-4 hours
**Files**:
- `packages/agency-extension/src/services/McpClientService.ts`
**Tests**: `packages/agency-extension/src/__tests__/services/McpClientService.test.ts`

- [ ] Implement `McpClientService` managing MCP connection state
- [ ] Add methods: `connect()`, `disconnect()`, `isConnected()`
- [ ] Add methods: `listTools()`, `executeTool()`
- [ ] Implement connection status events
- [ ] Handle auto-reconnect on container restart
- [ ] Write integration tests with mock MCP server

---

### TG-012 [US2] ToolTreeProvider
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/src/providers/ToolTreeProvider.ts`
**Tests**: Provider unit tests

- [ ] Implement `ToolTreeProvider` for tool browser tree view
- [ ] Group tools by namespace in tree hierarchy
- [ ] Display tool name, description, and parameter schema preview
- [ ] Wire up to `McpClientService` for tool list refresh
- [ ] Show connection status in tree view header

---

### TG-013 [US2] Tool Execution Commands
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/src/commands/tool-commands.ts`
**Tests**: Command tests

- [ ] Implement `agency.testTool` command to open tool execution panel
- [ ] Implement `agency.refreshTools` command to refresh tool list
- [ ] Implement `agency.connectMcp` command to connect to MCP server
- [ ] Implement `agency.disconnectMcp` command
- [ ] Register commands with proper enablement conditions

---

### TG-014 [US2] Tool Execution Webview
**Scope**: 4-5 hours
**Files**:
- `packages/agency-extension/src/views/tool-browser/ToolExecutionPanel.ts`
- `packages/agency-extension/src/views/tool-browser/tool-execution.html`
**Tests**: Webview messaging tests

- [ ] Implement `ToolExecutionPanel` webview for tool testing
- [ ] Generate parameter input form from JSON Schema
- [ ] Implement tool execution with loading state
- [ ] Display results with syntax highlighting (JSON, text)
- [ ] Show execution timing and success/failure status
- [ ] Add execution history within session

---

## Phase 5: Activity Monitoring
<!-- Phase boundary: Complete Phase 4 before starting -->

### TG-015 [US3] ActivityService
**Scope**: 3-4 hours
**Files**:
- `packages/agency-extension/src/services/ActivityService.ts`
**Tests**: Service unit tests

- [ ] Implement `ActivityService` subscribing to Agency event stream
- [ ] Parse and validate incoming `ToolCallEvent` messages
- [ ] Maintain in-memory event buffer with configurable size limit
- [ ] Implement filtering methods matching `ActivityFilter` interface
- [ ] Emit events for new tool calls
- [ ] Calculate activity statistics

---

### TG-016 [US3] ActivityTreeProvider
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/src/providers/ActivityTreeProvider.ts`
**Tests**: Provider unit tests

- [ ] Implement `ActivityTreeProvider` for recent tool calls
- [ ] Display tool name, status icon, and timestamp
- [ ] Group by time (last minute, last 5 minutes, older)
- [ ] Wire up to `ActivityService` for real-time updates
- [ ] Add inline expand for quick details view

---

### TG-017 [US3] Activity Feed Webview
**Scope**: 4-5 hours
**Files**:
- `packages/agency-extension/src/views/activity/ActivityFeedPanel.ts`
- `packages/agency-extension/src/views/activity/activity-feed.html`
**Tests**: Webview tests

- [ ] Implement `ActivityFeedPanel` for full activity view
- [ ] Create real-time updating list with virtual scrolling
- [ ] Implement filter controls (by tool, namespace, status, time)
- [ ] Show expandable details (full inputs/outputs with syntax highlighting)
- [ ] Display activity statistics summary
- [ ] Add clear/export functionality

---

## Phase 6: Container Management
<!-- Phase boundary: Complete Phase 5 before starting -->

### TG-018 ContainerService
**Scope**: 4-5 hours
**Files**:
- `packages/agency-extension/src/services/ContainerService.ts`
**Tests**: `packages/agency-extension/src/__tests__/services/ContainerService.test.ts`

- [ ] Implement `ContainerService` with VS Code Remote Containers API integration
- [ ] Implement Docker API fallback (via `dockerode` or raw CLI)
- [ ] Add methods: `listContainers()`, `getContainer()`, `getContainerStatus()`
- [ ] Add methods: `startContainer()`, `stopContainer()`, `rebuildContainer()`
- [ ] Implement `getContainerLogs()` as async iterable
- [ ] Detect dev containers by labels/config paths

---

### TG-019 ContainerTreeProvider & Commands
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/src/providers/ContainerTreeProvider.ts`
- `packages/agency-extension/src/commands/container-commands.ts`
**Tests**: Provider and command tests

- [ ] Implement `ContainerTreeProvider` showing container list with status
- [ ] Add status icons (running, stopped, etc.)
- [ ] Implement `agency.startContainer`, `agency.stopContainer` commands
- [ ] Implement `agency.rebuildContainer` command
- [ ] Implement `agency.viewContainerLogs` command
- [ ] Register commands with enablement based on container state

---

### TG-020 Container Detail Webview
**Scope**: 3-4 hours
**Files**:
- `packages/agency-extension/src/views/containers/ContainerDetailPanel.ts`
- `packages/agency-extension/src/views/containers/container-detail.html`
**Tests**: Webview tests

- [ ] Implement `ContainerDetailPanel` for container details and logs
- [ ] Display container info (image, ports, workspace path)
- [ ] Show real-time log streaming
- [ ] Add log filtering and search
- [ ] Include action buttons (start/stop/rebuild)

---

## Phase 7: Mode Management
<!-- Phase boundary: Complete Phase 6 before starting -->

### TG-021 ModeService
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/src/services/ModeService.ts`
**Tests**: Service unit tests

- [ ] Implement `ModeService` for mode management
- [ ] Add methods: `getModes()`, `getCurrentMode()`, `setCurrentMode()`
- [ ] Resolve mode inheritance to compute `effectiveTools`
- [ ] Build mode inheritance tree structure
- [ ] Validate mode configurations (no circular inheritance)

---

### TG-022 ModeTreeProvider & Commands
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/src/providers/ModeTreeProvider.ts`
- `packages/agency-extension/src/commands/mode-commands.ts`
**Tests**: Provider and command tests

- [ ] Implement `ModeTreeProvider` showing modes as tree (with inheritance)
- [ ] Highlight current active mode
- [ ] Show tool count per mode
- [ ] Implement `agency.switchMode` command
- [ ] Implement `agency.viewModeTools` command
- [ ] Add mode inheritance visualization

---

## Phase 8: Polish & Marketplace
<!-- Phase boundary: Complete Phase 7 before starting -->

### TG-023 [P] Performance Optimization
**Scope**: 2-3 hours
**Files**: Various service and provider files
**Tests**: Performance benchmarks

- [ ] Implement lazy loading for tree providers
- [ ] Add debouncing for config file writes
- [ ] Optimize webview message batching
- [ ] Profile extension activation time (target < 2s)
- [ ] Review and optimize bundle size (target < 1MB)

---

### TG-024 [P] Error Handling & UX Polish
**Scope**: 2-3 hours
**Files**: Various files across extension
**Tests**: Error scenario tests

- [ ] Implement consistent error notifications
- [ ] Add user-friendly error messages for common failures
- [ ] Implement connection status indicators in status bar
- [ ] Add welcome view for first-time users
- [ ] Create getting started walkthrough

---

### TG-025 Marketplace Publishing
**Scope**: 2-3 hours
**Files**:
- `packages/agency-extension/README.md`
- `packages/agency-extension/CHANGELOG.md`
- `packages/agency-extension/package.json` (marketplace metadata)
**Tests**: Package validation with vsce

- [ ] Write comprehensive README with features, screenshots, usage
- [ ] Create extension gallery icon and banner
- [ ] Configure marketplace categories and keywords
- [ ] Set up automated publish workflow (GitHub Actions)
- [ ] Publish to VS Code Marketplace
- [ ] Verify marketplace listing and installation

---

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

**Parallel opportunities within phases**:
- Phase 1: TG-001, TG-002, TG-003, TG-004 can all run in parallel
- Phase 8: TG-023, TG-024 can run in parallel

**Cross-phase dependencies**:
- TG-005, TG-006 (Config) must complete before TG-007, TG-008, TG-009 (Plugin UI)
- TG-010, TG-011 (MCP Client) must complete before TG-012, TG-013, TG-014 (Tool Testing)
- TG-011 (McpClientService) must complete before TG-015 (ActivityService)
- TG-018 (ContainerService) must complete before TG-010 (DockerExecTransport can use it)

**User story coverage**:
- US1 (Plugin Configuration): TG-005, TG-006, TG-007, TG-008, TG-009
- US2 (MCP Tool Testing): TG-010, TG-011, TG-012, TG-013, TG-014
- US3 (Activity Monitoring): TG-015, TG-016, TG-017

---

*Generated by speckit*
