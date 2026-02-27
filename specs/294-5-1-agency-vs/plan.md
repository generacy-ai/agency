# Implementation Plan: Agency VS Code Extension — MVP

**Branch**: `294-5-1-agency-vs` | **Date**: 2026-02-27 | **Status**: Draft

## Summary

The Agency VS Code extension already has substantial scaffolding (~54 source files, 26 test files, 554 passing tests). The MVP implementation focuses on **closing the gap** between the current codebase and the spec requirements by:

1. Aligning the config schema with the core server (mode inheritance, container connection model)
2. Implementing the missing `agency.verifySetup` and `agency.init` commands
3. Adding MCP metadata query for plugin settings schema discovery
4. Updating reconnection to spec parameters (10 attempts, not 5)
5. Adding the `agency.mcpServerCommand` VS Code setting with fallback chain
6. Fixing `extension.test.ts` to pass
7. Generating the Marketplace icon and configuring publishing
8. Implementing conflict detection for concurrent config edits

## Technical Context

| Aspect | Detail |
|--------|--------|
| Language | TypeScript 5.7+ |
| Runtime | VS Code Extension Host (Node 20) |
| Build | esbuild (CJS bundle → `dist/extension.js`) |
| Test | Vitest 3.2.4 (554 tests, 24 files passing) |
| Package Manager | pnpm (workspace: `packages/agency-extension`) |
| VS Code Engine | ^1.85.0 |
| Key Dependencies | `@modelcontextprotocol/sdk` ^1.5.0, `zod` ^3.24, `execa` ^8.0 |
| Core Server | `@generacy-ai/agency` (packages/agency) — MCP server with modes, plugins, tools |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ VS Code Extension Host                                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ConfigService│  │McpClientSvc  │  │ ModeService  │  │
│  │ (singleton)  │  │ (singleton)  │  │ (singleton)  │  │
│  │              │  │              │  │              │  │
│  │ - load/save  │  │ - connect    │  │ - switch     │  │
│  │ - watch file │  │ - listTools  │  │ - resolve    │  │
│  │ - validate   │  │ - execTool   │  │ - validate   │  │
│  │ - conflict   │◄─┤ - reconnect  │  │ - tree build │  │
│  │   detection  │  │ - metadata   │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐  │
│  │ContainerSvc  │  │ActivitySvc   │  │McpConnMgr    │  │
│  │ (singleton)  │  │ (singleton)  │  │ (singleton)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ UI Layer                                        │    │
│  │ ┌───────────┐ ┌───────────┐ ┌────────────────┐  │    │
│  │ │TreeViews  │ │ Webviews  │ │ StatusBar      │  │    │
│  │ │(5 panels) │ │ (4 panels)│ │ (3 items)      │  │    │
│  │ └───────────┘ └───────────┘ └────────────────┘  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Commands                                        │    │
│  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────┐  │    │
│  │ │Plugin│ │Tool  │ │Mode  │ │Cont. │ │Setup  │  │    │
│  │ │(4)   │ │(4)   │ │(3)   │ │(4)   │ │(2)NEW │  │    │
│  │ └──────┘ └──────┘ └──────┘ └──────┘ └───────┘  │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────┬───────────────────────────────────────┘
                  │ stdio / docker exec
┌─────────────────▼───────────────────────────────────────┐
│ Agency MCP Server (@generacy-ai/agency)                 │
│ - Tools (namespaced, glob-pattern filtered)             │
│ - Modes (single-parent inheritance, includes/excludes)  │
│ - Plugins (manifest, lifecycle, facets)                 │
│ - Channels (pub/sub inter-plugin comms)                 │
└─────────────────────────────────────────────────────────┘
```

## Gap Analysis

### What Exists (Working)
- Extension activation with `workspaceContains:.agency/agency.config.json`
- ConfigService: load, save, watch, validate via Zod
- McpClientService: connect (stdio/docker-exec), listTools, executeTool, exponential backoff reconnect
- ModeService: mode management, inheritance resolution, tree building
- ContainerService: Docker discovery, lifecycle management
- ActivityService: tool call monitoring, history, filtering
- McpConnectionManager: auto-connect container→MCP association
- StatusBarManager: MCP, Container, Mode status bar items with click actions
- 5 tree view providers (Plugins, Tools, Activity, Containers, Modes)
- 4 webview panels (PluginConfig, ToolExecution, ActivityFeed, ContainerDetail)
- WebviewBase: nonce-based CSP, message passing, theme-aware styles
- 15 commands registered across 4 command modules
- 554 passing unit tests across 24 test files

### What's Missing (Spec Gaps)
| Gap | Spec Reference | Priority | Effort |
|-----|---------------|----------|--------|
| Config schema: mode `inherits`→`parentId` + `includedTools`/`excludedTools` | Q1 | P1 | M |
| Config schema: container `connection` wrapper | Q2 | P1 | M |
| `agency.verifySetup` command | Q3, FR-010 | P1 | M |
| `agency.init` command + `*` activation event | Q6 | P1 | M |
| Reconnect: 10 max attempts (currently 5) | Q4 | P1 | S |
| MCP metadata query for plugin settings | Q5 | P2 | M |
| Config conflict detection (warn & prompt) | Q7 | P2 | M |
| `agency.mcpServerCommand` VS Code setting + fallback chain | Q8 | P1 | S |
| Fix `extension.test.ts` | Q9 | P1 | M |
| Extension icon (SVG→PNG, package.json `icon` field) | Q11 | P1 | S |
| Marketplace publisher setup (prerequisite task) | Q10 | P1 | External |
| Status bar MCP click toggles connect/disconnect | Q12 | P1 | S (already done) |
| Tools tree "Connect to MCP" message when disconnected | Q13 | P2 | S |
| Zero telemetry (already none — confirm) | Q15 | P0 | S |

**Legend**: S = Small (<2h), M = Medium (2-8h), L = Large (>8h)

## Implementation Phases

### Phase 1: Schema Alignment (Config + Types)
**Goal**: Align the extension's Zod schema and TypeScript types with the core server's mode and container models per Q1 and Q2.

#### 1.1 Update Mode Config Schema (Q1)
**Files**:
- `src/config/ConfigSchema.ts` — Update `ModeConfigSchema`
- `src/config/defaults.ts` — Update default mode config
- `src/types/mode.ts` — Already has `parentId`/`includedTools`/`excludedTools` (verify alignment)

**Changes**:
```typescript
// ConfigSchema.ts — BEFORE
export const ModeConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inherits: z.string().optional(),   // ← rename
  tools: z.array(z.string()).default([]),  // ← split
});

// ConfigSchema.ts — AFTER
export const ModeConfigSchema = z.object({
  id: z.string().min(1, 'Mode ID is required'),
  name: z.string().min(1, 'Mode name is required'),
  description: z.string().optional(),
  parentId: z.string().optional(),
  includedTools: z.array(z.string()).default([]),
  excludedTools: z.array(z.string()).default([]),
  isDefault: z.boolean().optional(),
});
```

**Rationale**: The TypeScript types in `types/mode.ts` already use `parentId`/`includedTools`/`excludedTools`. The Zod schema is the only divergence. This change makes the config file schema match the runtime types and the core server's `ModeDefinition` (which uses `extends`/`includes`/`excludes`).

**Tests to update**:
- `src/__tests__/config/ConfigSchema.test.ts`
- `src/__tests__/config/defaults.test.ts`
- `src/__tests__/services/ConfigService.test.ts`
- `src/__tests__/providers/ModeTreeProvider.test.ts`
- Any test referencing `inherits` or `tools` on mode objects

#### 1.2 Update Container Config Schema (Q2)
**Files**:
- `src/config/ConfigSchema.ts` — Update `ContainerConfigSchema`
- `src/types/container.ts` — Update `ContainerConfig` interface

**Changes**:
```typescript
// ConfigSchema.ts — AFTER
const ConnectionConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

export const ContainerConfigSchema = z.object({
  id: z.string().min(1, 'Container ID is required'),
  name: z.string().min(1, 'Container name is required'),
  workspacePath: z.string().min(1, 'Workspace path is required'),
  devcontainerPath: z.string().optional(),
  connection: ConnectionConfigSchema.optional(),
});
```

**Rationale**: Per Q2, `workspacePath` and `devcontainerPath` describe the container; MCP connection details (`command`, `args`, `env`) are grouped under `connection` for extensibility.

**Cascade updates**:
- `src/extension.ts` — `autoConnectMcpServer()` reads `containerConfig.mcpCommand` → `containerConfig.connection?.command`
- `src/services/McpConnectionManager.ts` — Container-to-MCP association logic
- `src/__tests__/config/ConfigSchema.test.ts`
- `src/__tests__/services/ContainerService.test.ts`

#### 1.3 Update Default Config
**File**: `src/config/defaults.ts`

```typescript
export function createDefaultConfig(): AgencyConfig {
  return {
    version: DEFAULT_CONFIG_VERSION,
    plugins: [],
    modes: [
      {
        id: 'default',
        name: 'Default',
        includedTools: ['*'],  // All tools by default
        excludedTools: [],
      },
    ],
    containers: [],
  };
}
```

---

### Phase 2: New Commands (Init + Verify Setup)
**Goal**: Implement `agency.init` and `agency.verifySetup` commands per Q3 and Q6.

#### 2.1 Add `agency.init` Command (Q6)
**New file**: `src/commands/setup-commands.ts`
**Modify**: `src/commands/index.ts` (add barrel export)

**Behavior**:
1. Check if `.agency/agency.config.json` exists
2. If exists, show info message "Config already exists" with "Open" action
3. If not, create `.agency/` directory and write `createDefaultConfig()` to `agency.config.json`
4. Show info message "Agency initialized!" with "Open Config" action
5. Trigger extension activation (set context key or reload)

**Activation change** in `package.json`:
```json
"activationEvents": [
  "workspaceContains:.agency/agency.config.json",
  "onCommand:agency.init"
]
```

**New command in `package.json` contributes.commands**:
```json
{
  "command": "agency.init",
  "title": "Initialize Agency",
  "category": "Agency"
}
```

#### 2.2 Add `agency.verifySetup` Command (Q3)
**File**: `src/commands/setup-commands.ts` (same file as init)

**Behavior**:
1. Run checks sequentially:
   - Config file exists and is valid JSON
   - Config schema validation passes
   - MCP server is reachable (ping or listTools)
   - Container is running (if configured)
2. Write full results to the Agency output channel
3. Show VS Code notification:
   - All pass: `$(check) Agency: Setup verified` (info) with "Show Details" button
   - Some fail: `$(warning) Agency: X of Y checks failed` (warning) with "Show Details" button
4. "Show Details" button reveals the output channel

**New command in `package.json`**:
```json
{
  "command": "agency.verifySetup",
  "title": "Verify Setup",
  "category": "Agency"
}
```

**Constants update** (`src/constants.ts`):
```typescript
export const COMMANDS = {
  // ... existing
  INIT: 'agency.init',
  VERIFY_SETUP: 'agency.verifySetup',
} as const;
```

---

### Phase 3: MCP Connection Improvements
**Goal**: Align reconnection, server discovery, and status bar behavior with spec.

#### 3.1 Update Reconnect Config (Q4)
**File**: `src/types/mcp.ts`

```typescript
export const DEFAULT_RECONNECT_CONFIG: McpReconnectConfig = {
  enabled: true,
  maxAttempts: 10,      // was 5
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};
```

**Status bar on exhaustion**: When max attempts reached, update status bar to show "Reconnect" action (already mapped to `COMMANDS.CONNECT_MCP` in error state — verify this works).

#### 3.2 Add `agency.mcpServerCommand` Setting (Q8)
**File**: `package.json` (contributes.configuration)

```json
"agency.mcpServerCommand": {
  "type": "string",
  "default": "npx @generacy-ai/agency",
  "description": "Default MCP server command. Used when no per-container connection.command is specified."
}
```

**File**: `src/constants.ts`
```typescript
export const CONFIG_KEYS = {
  // ... existing
  MCP_SERVER_COMMAND: 'agency.mcpServerCommand',
} as const;
```

**File**: `src/extension.ts` — Update `autoConnectMcpServer()` fallback chain:
```typescript
// 1. Per-container connection.command
const containerCommand = containerConfig?.connection?.command;
// 2. VS Code setting
const settingCommand = vscodeModule.workspace.getConfiguration('agency').get<string>('mcpServerCommand');
// 3. Final fallback
const mcpCommand = containerCommand ?? settingCommand ?? 'npx';
const mcpArgs = containerConfig?.connection?.args ?? (settingCommand ? [] : ['@generacy-ai/agency']);
```

#### 3.3 MCP Status Bar Click Behavior (Q12)
**Already implemented**: `StatusBarManager` maps connected→`DISCONNECT_MCP`, disconnected/error→`CONNECT_MCP`. Verify and add tests.

---

### Phase 4: Plugin Settings & Config Conflict Handling
**Goal**: Implement MCP metadata query for plugin schemas and concurrent edit conflict detection.

#### 4.1 Plugin Settings via MCP Metadata (Q5)
**File**: `src/services/McpClientService.ts` — Add `getPluginMetadata()` method

```typescript
async getPluginMetadata(): Promise<PluginMetadata[]> {
  this._ensureConnected();
  // Use MCP tools/call to invoke a metadata query
  // Fallback: return empty array (webview falls back to JSON editor)
  try {
    const result = await this.executeTool('agency.plugins_describe', {});
    // Parse result into PluginMetadata[]
    return this._parsePluginMetadata(result);
  } catch {
    log.warn('Plugin metadata query not available');
    return [];
  }
}
```

**File**: `src/views/plugins/PluginConfigPanel.ts` — Update to:
1. Query metadata on open
2. If schema available: render typed form controls
3. If no schema (disconnected or no metadata): show JSON editor

#### 4.2 Config Conflict Detection (Q7)
**File**: `src/services/ConfigService.ts` — Add dirty tracking

**Approach**:
- Track a `_lastSavedHash` (SHA-256 of config content at last read/write)
- On file watcher event, compare current file hash to `_lastSavedHash`
- If different AND a webview has unsaved changes, fire a conflict event
- Webview subscribes to conflict events and shows notification

**New event**: `onConfigConflict: Event<ConfigConflictEvent>`
```typescript
interface ConfigConflictEvent {
  externalChanges: boolean;
  webviewDirty: boolean;
}
```

**Webview handling**: Show VS Code notification "Config file changed externally. Reload and lose your changes, or keep editing?" with Reload/Keep buttons.

---

### Phase 5: Tree View & UI Polish
**Goal**: Handle disconnected states, improve tree view UX.

#### 5.1 Tools Tree — Disconnected Message (Q13)
**File**: `src/providers/ToolTreeProvider.ts`

When MCP is disconnected, return a single tree item:
```typescript
if (!mcpService.isConnected()) {
  return [new TreeItem('Connect to MCP server to see tools', {
    command: COMMANDS.CONNECT_MCP,
    iconPath: new ThemeIcon('plug'),
  })];
}
```

#### 5.2 Extension Icon (Q11)
**Action**: Generate `media/icon.png` (128x128) from `media/icons/agency.svg`

**package.json** update:
```json
"icon": "media/icon.png"
```

**Method**: Use a build script or manual conversion (SVG → PNG at 128x128). Can use `sharp` or `resvg` in a script, or convert manually.

---

### Phase 6: Testing & Quality
**Goal**: Fix skipped tests, ensure >80% coverage on services.

#### 6.1 Fix `extension.test.ts` (Q9)
**File**: `src/__tests__/extension.test.ts`

**Root cause**: Likely VS Code API mocking issues. The test needs proper mocks for:
- `vscode.window.createOutputChannel`
- `vscode.window.createStatusBarItem`
- `vscode.window.createTreeView`
- `vscode.commands.registerCommand`
- `vscode.workspace.workspaceFolders`
- `vscode.workspace.getConfiguration`

**Approach**: Create a comprehensive VS Code mock that returns disposables for all registration calls. Focus on testing:
- `activate()` initializes all services
- `activate()` registers all commands
- `deactivate()` cleans up state
- Auto-connect behavior

#### 6.2 Add Tests for New Code
- `src/__tests__/commands/setup-commands.test.ts` — Test init and verifySetup
- Update `src/__tests__/config/ConfigSchema.test.ts` — Test new schema shapes
- Update `src/__tests__/services/McpClientService.test.ts` — Test plugin metadata, reconnect with 10 attempts

#### 6.3 Remove Test Exclusions
**File**: `package.json`

```json
"test": "vitest run"  // Remove --exclude flags for extension.test.ts
```

Note: `ModeService.test.ts` stays excluded per Q9 (defer to post-MVP).

---

### Phase 7: Packaging & Marketplace Prep
**Goal**: Prepare for Marketplace publishing.

#### 7.1 Publisher Setup (Q10 — External Task)
**Prerequisite** (tracked separately):
1. Register `generacy-ai` publisher on VS Code Marketplace
2. Create Azure DevOps organization
3. Generate PAT → add to GitHub secrets as `VSCE_PAT`
4. Verify publisher identity

#### 7.2 Package Configuration
**File**: `package.json`

Ensure these fields are correct:
```json
{
  "icon": "media/icon.png",
  "galleryBanner": { "color": "#1e1e1e", "theme": "dark" },
  "badges": [],
  "preview": true,
  "pricing": "Free"
}
```

**File**: `.vscodeignore` — Verify exclusions are correct (no `src/`, `node_modules/`, `*.test.ts`).

#### 7.3 CI Publishing Workflow
Add to existing CI/CD (GitHub Actions):
```yaml
- name: Publish Extension
  if: github.ref == 'refs/heads/develop'
  run: pnpm --filter @generacy-ai/agency-extension publish --pre-release
  env:
    VSCE_PAT: ${{ secrets.VSCE_PAT }}
```

---

## Data Model Changes

See [data-model.md](./data-model.md) for the updated configuration schemas.

### Key Changes Summary

| Entity | Field | Before | After |
|--------|-------|--------|-------|
| ModeConfig (Zod) | `inherits` | `z.string().optional()` | Renamed to `parentId` |
| ModeConfig (Zod) | `tools` | `z.array(z.string())` | Split to `includedTools` + `excludedTools` |
| ModeConfig (Zod) | `description` | (missing) | Added `z.string().optional()` |
| ModeConfig (Zod) | `isDefault` | (missing) | Added `z.boolean().optional()` |
| ContainerConfig (Zod) | `mcpCommand`, `mcpArgs` | Flat fields | Moved under `connection: { command, args?, env? }` |
| ContainerConfig (Zod) | `dockerComposePath` | Present | Renamed to `devcontainerPath` |
| ReconnectConfig | `maxAttempts` | `5` | `10` |

## API Contracts

### MCP Protocol — No New Endpoints
The extension uses standard MCP protocol (`tools/list`, `tools/call`). Plugin metadata is queried via a tool call to `agency.plugins_describe` (if the server supports it), not a custom MCP method.

### Extension Commands (Final List)

| Command | Title | Exists | New |
|---------|-------|--------|-----|
| `agency.configurePlugin` | Configure Plugin | Yes | |
| `agency.enablePlugin` | Enable Plugin | Yes | |
| `agency.disablePlugin` | Disable Plugin | Yes | |
| `agency.refreshPlugins` | Refresh Plugins | Yes | |
| `agency.testTool` | Test Tool | Yes | |
| `agency.refreshTools` | Refresh Tools | Yes | |
| `agency.connectMcp` | Connect to MCP Server | Yes | |
| `agency.disconnectMcp` | Disconnect from MCP Server | Yes | |
| `agency.switchMode` | Switch Mode | Yes | |
| `agency.viewModeTools` | View Mode Tools | Yes | |
| `agency.refreshModes` | Refresh Modes | Yes | |
| `agency.startContainer` | Start Container | Yes | |
| `agency.stopContainer` | Stop Container | Yes | |
| `agency.rebuildContainer` | Rebuild Container | Yes | |
| `agency.viewContainerLogs` | View Container Logs | Yes | |
| `agency.init` | Initialize Agency | | **New** |
| `agency.verifySetup` | Verify Setup | | **New** |

### VS Code Settings (Final List)

| Setting | Type | Default | Exists | New |
|---------|------|---------|--------|-----|
| `agency.configPath` | string | `.agency/agency.config.json` | Yes | |
| `agency.autoConnect` | boolean | `true` | Yes | |
| `agency.currentMode` | string | `""` | Yes | |
| `agency.mcpServerCommand` | string | `npx @generacy-ai/agency` | | **New** |

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mode inheritance | Single parent (`parentId`) | Q1: Matches core server, avoids diamond inheritance complexity |
| Container config | Hybrid (flat + `connection` wrapper) | Q2: Logical separation — container props vs MCP connection props |
| Verify Setup output | Notification + output channel | Q3: Immediately visible; details available on demand |
| Reconnect strategy | Exponential backoff, 10 attempts, 30s cap | Q4: Covers ~5min recovery window; status bar shows manual reconnect after |
| Plugin settings | MCP metadata query + JSON editor fallback | Q5: Server is source of truth; offline fallback is functional |
| No config → init | `agency.init` command via `onCommand` activation | Q6: Standard dev tool pattern; discoverable via command palette |
| Config conflicts | Warn and prompt (Reload/Keep) | Q7: Matches VS Code's own dirty file behavior |
| Server discovery | Container `connection.command` → setting → `npx` fallback | Q8: Flexible per-container override with sensible defaults |
| Webview CSP | Nonce scripts + `unsafe-inline` styles | Q14: Already implemented in `WebviewBase.getBaseHtml()` |
| Telemetry | Zero | Q15: Explicit spec requirement; builds trust |
| Testing | Fix extension.test.ts; defer ModeService.test.ts | Q9: Extension activation is P1; mode schema still stabilizing |

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Config schema migration breaks existing files | Medium | High | Add migration logic in ConfigService to detect old schema (presence of `inherits`, `mcpCommand`) and auto-migrate. Log migration warnings. |
| Marketplace publisher not ready | High | Medium | Extension can be sideloaded via `.vsix` for testing. Publisher setup tracked as separate prerequisite issue. |
| `agency.plugins_describe` tool not available on server | Medium | Low | Graceful fallback to JSON editor already planned. No hard dependency. |
| Extension activation regression | Low | High | Fixing `extension.test.ts` + adding comprehensive VS Code API mocks provides safety net. |
| Reconnect storms during container restarts | Low | Medium | 30s max interval + 10 attempt cap limits blast radius. Status bar shows manual control. |

## Implementation Order

```
Phase 1 ─── Schema Alignment ──────────── (2-3 days)
  ├── 1.1 Mode config schema
  ├── 1.2 Container config schema
  └── 1.3 Default config + migration

Phase 2 ─── New Commands ──────────────── (2-3 days)
  ├── 2.1 agency.init command
  └── 2.2 agency.verifySetup command

Phase 3 ─── MCP Connection ────────────── (1-2 days)
  ├── 3.1 Reconnect config (10 attempts)
  ├── 3.2 mcpServerCommand setting
  └── 3.3 Status bar verification

Phase 4 ─── Plugin & Config ───────────── (2-3 days)
  ├── 4.1 Plugin metadata via MCP
  └── 4.2 Config conflict detection

Phase 5 ─── UI Polish ─────────────────── (1 day)
  ├── 5.1 Tools tree disconnected message
  └── 5.2 Extension icon

Phase 6 ─── Testing & Quality ─────────── (2-3 days)
  ├── 6.1 Fix extension.test.ts
  ├── 6.2 New test coverage
  └── 6.3 Remove test exclusion

Phase 7 ─── Packaging ─────────────────── (1 day)
  ├── 7.1 Publisher setup (external)
  ├── 7.2 Package config
  └── 7.3 CI workflow
```

**Total estimated effort**: 11-16 days

## File Change Summary

### New Files
| File | Purpose |
|------|---------|
| `src/commands/setup-commands.ts` | `agency.init` and `agency.verifySetup` implementations |
| `src/__tests__/commands/setup-commands.test.ts` | Tests for setup commands |
| `media/icon.png` | 128x128 PNG icon for Marketplace |

### Modified Files
| File | Changes |
|------|---------|
| `package.json` | New commands, new setting, icon field, activation events, remove test exclusion |
| `src/constants.ts` | Add `INIT`, `VERIFY_SETUP` commands; `MCP_SERVER_COMMAND` config key |
| `src/config/ConfigSchema.ts` | Mode: `inherits`→`parentId`, `tools`→`includedTools`/`excludedTools`. Container: add `connection` wrapper, rename `dockerComposePath`→`devcontainerPath` |
| `src/config/defaults.ts` | Update default mode to use `includedTools`/`excludedTools` |
| `src/types/mcp.ts` | `DEFAULT_RECONNECT_CONFIG.maxAttempts` 5→10 |
| `src/types/container.ts` | Update `ContainerConfig` interface to match new schema |
| `src/extension.ts` | Register setup commands, update `autoConnectMcpServer` fallback chain, `onCommand:agency.init` support |
| `src/commands/index.ts` | Export setup commands |
| `src/services/McpClientService.ts` | Add `getPluginMetadata()` method |
| `src/services/ConfigService.ts` | Add dirty tracking, conflict detection, schema migration |
| `src/providers/ToolTreeProvider.ts` | Show "Connect to MCP" message when disconnected |
| `src/views/plugins/PluginConfigPanel.ts` | Integrate plugin metadata for schema-driven forms |
| `src/__tests__/extension.test.ts` | Fix VS Code API mocks to make tests pass |
| `src/__tests__/config/ConfigSchema.test.ts` | Update for new schema shapes |
| `src/__tests__/config/defaults.test.ts` | Update for new default config |
| `src/__tests__/services/ConfigService.test.ts` | Add conflict detection tests |
| `src/__tests__/services/McpClientService.test.ts` | Add metadata query tests, reconnect 10 attempts |

---

*Generated for spec 294-5-1-agency-vs*
