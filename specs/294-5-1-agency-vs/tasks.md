# Tasks: Agency VS Code Extension — MVP

**Input**: `spec.md`, `plan.md`, `data-model.md`, `clarifications.md`
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Ready

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story / spec gap this task addresses

---

## Phase 1: Schema Alignment (Config + Types)

**Goal**: Align the extension's Zod schema and TypeScript types with the core server's mode and container models (Q1, Q2).

### T001 [DONE] Update ModeConfigSchema Zod schema
**File**: `packages/agency-extension/src/config/ConfigSchema.ts`
- Rename `inherits` field to `parentId` (`z.string().optional()`)
- Split `tools` into `includedTools` (`z.array(z.string()).default([])`) and `excludedTools` (`z.array(z.string()).default([])`)
- Add `description` field (`z.string().optional()`)
- Add `isDefault` field (`z.boolean().optional()`)
- Add descriptive Zod error messages (e.g., `'Mode ID is required'`)

### T002 [DONE] [P] Update ContainerConfigSchema Zod schema
**File**: `packages/agency-extension/src/config/ConfigSchema.ts`
- Add `ConnectionConfigSchema` nested object: `{ command: z.string().min(1), args?: z.array(z.string()), env?: z.record(z.string()) }`
- Replace flat `mcpCommand`/`mcpArgs` with nested `connection: ConnectionConfigSchema.optional()`
- Rename `dockerComposePath` to `devcontainerPath`
- Add descriptive Zod error messages

### T003 [DONE] Update ContainerConfig TypeScript interface
**File**: `packages/agency-extension/src/types/container.ts`
- Add `ConnectionConfig` interface: `{ command: string; args?: string[]; env?: Record<string, string> }`
- Update `ContainerConfig` interface: replace `mcpCommand`/`mcpArgs`/`environment` with `connection?: ConnectionConfig`
- Rename any `dockerComposePath` references to `devcontainerPath`
- Verify `types/mode.ts` already uses `parentId`/`includedTools`/`excludedTools` (no change expected)

### T004 [DONE] Update default config
**File**: `packages/agency-extension/src/config/defaults.ts`
- Update `createDefaultConfig()` default mode: replace `tools: []` with `includedTools: ['*']`, `excludedTools: []`
- Ensure default mode uses new field names

### T005 [DONE] Add schema migration logic to ConfigService
**File**: `packages/agency-extension/src/services/ConfigService.ts`
- Add migration function to detect old-format configs on load
- Migrate `modes[].inherits` → `modes[].parentId`
- Migrate `modes[].tools` → `modes[].includedTools`, add `excludedTools: []`
- Migrate `containers[].mcpCommand` → `containers[].connection.command`
- Migrate `containers[].mcpArgs` → `containers[].connection.args`
- Migrate `containers[].dockerComposePath` → `containers[].devcontainerPath`
- Log migration warnings via logger
- Write migrated config back to disk after migration

### T006 [DONE] Update extension.ts auto-connect fallback chain
**File**: `packages/agency-extension/src/extension.ts`
- Update `autoConnectMcpServer()` to read `containerConfig.connection?.command` instead of `containerConfig.mcpCommand`
- Update args to read `containerConfig.connection?.args` instead of `containerConfig.mcpArgs`
- Implement 3-tier fallback: container `connection.command` → VS Code setting `agency.mcpServerCommand` → `npx @generacy-ai/agency`

### T007 [DONE] [P] Update McpConnectionManager for new container schema
**File**: `packages/agency-extension/src/services/McpConnectionManager.ts`
- Update any references to `containerConfig.mcpCommand`/`mcpArgs` to use `containerConfig.connection?.command`/`connection?.args`
- Update container-to-MCP association logic if it reads flat fields

### T008 [DONE] Update schema tests
**Files**:
- `packages/agency-extension/src/__tests__/config/ConfigSchema.test.ts`
- `packages/agency-extension/src/__tests__/config/defaults.test.ts`
- Update all test data using `inherits` → `parentId`, `tools` → `includedTools`/`excludedTools`
- Update all test data using `mcpCommand`/`mcpArgs` → `connection: { command, args }`
- Update `dockerComposePath` → `devcontainerPath`
- Add tests for new fields: `description`, `isDefault`, `connection.env`
- Add test for default config with `includedTools: ['*']`

### T009 [DONE] [P] Update service and provider tests for schema changes
**Files**:
- `packages/agency-extension/src/__tests__/services/ConfigService.test.ts`
- `packages/agency-extension/src/__tests__/services/ContainerService.test.ts`
- `packages/agency-extension/src/__tests__/providers/ModeTreeProvider.test.ts`
- Update all mode fixture data: `inherits` → `parentId`, `tools` → `includedTools`/`excludedTools`
- Update all container fixture data: flat fields → nested `connection`
- Add tests for schema migration (old format → new format)

---

## Phase 2: New Commands (Init + Verify Setup)

**Goal**: Implement `agency.init` and `agency.verifySetup` commands (Q3, Q6).

### T010 [DONE] Add command constants
**File**: `packages/agency-extension/src/constants.ts`
- Add `INIT: 'agency.init'` to `COMMANDS` object
- Add `VERIFY_SETUP: 'agency.verifySetup'` to `COMMANDS` object
- Add `MCP_SERVER_COMMAND: 'agency.mcpServerCommand'` to `CONFIG_KEYS` object

### T011 [DONE] Implement setup commands module
**File**: `packages/agency-extension/src/commands/setup-commands.ts` (new file)
- Implement `initAgency()` command:
  - Check if `.agency/agency.config.json` exists in workspace
  - If exists: show info message "Config already exists" with "Open" action
  - If not: create `.agency/` directory, write `createDefaultConfig()` to `agency.config.json`
  - Show info message "Agency initialized!" with "Open Config" action
  - Trigger extension activation (set context key or reload)
- Implement `verifySetup()` command:
  - Check 1: Config file exists and is valid JSON
  - Check 2: Config schema validation passes (Zod)
  - Check 3: MCP server is reachable (attempt `listTools` or ping)
  - Check 4: Container is running (if configured)
  - Write full results to Agency output channel
  - Show notification: all pass → info `$(check) Agency: Setup verified`; some fail → warning `$(warning) Agency: X of Y checks failed`
  - "Show Details" button opens output channel
- Export `registerSetupCommands()` and `initializeSetupCommands()` functions

### T012 [DONE] Export setup commands from barrel
**File**: `packages/agency-extension/src/commands/index.ts`
- Add barrel export for setup-commands module
- Export `registerSetupCommands`, `initializeSetupCommands`

### T013 [DONE] Register setup commands in extension activation
**File**: `packages/agency-extension/src/extension.ts`
- Import and call `initializeSetupCommands()` during activation
- Register setup commands via `registerSetupCommands()` in `registerAllCommands()`

### T014 [DONE] Update package.json for new commands and activation
**File**: `packages/agency-extension/package.json`
- Add `"onCommand:agency.init"` to `activationEvents` array
- Add to `contributes.commands`:
  - `{ "command": "agency.init", "title": "Initialize Agency", "category": "Agency" }`
  - `{ "command": "agency.verifySetup", "title": "Verify Setup", "category": "Agency" }`

### T015 [DONE] Write setup commands tests
**File**: `packages/agency-extension/src/__tests__/commands/setup-commands.test.ts` (new file)
- Test `initAgency()`:
  - Config doesn't exist → creates directory and config file
  - Config already exists → shows info message with "Open" action
  - Workspace folder not available → shows error
- Test `verifySetup()`:
  - All checks pass → info notification
  - Config missing → warning notification with failure count
  - MCP disconnected → warning with appropriate check result
  - Output channel receives full results

---

## Phase 3: MCP Connection Improvements

**Goal**: Align reconnection params, server discovery, and status bar behavior with spec (Q4, Q8, Q12).

### T016 [DONE] [P] Update reconnect max attempts
**File**: `packages/agency-extension/src/types/mcp.ts`
- Change `DEFAULT_RECONNECT_CONFIG.maxAttempts` from `5` to `10`

### T017 [DONE] [P] Add mcpServerCommand VS Code setting
**File**: `packages/agency-extension/package.json`
- Add to `contributes.configuration.properties`:
  ```json
  "agency.mcpServerCommand": {
    "type": "string",
    "default": "npx @generacy-ai/agency",
    "description": "Default MCP server command. Used when no per-container connection.command is specified."
  }
  ```

### T018 [DONE] Verify status bar MCP click behavior
**Files**:
- `packages/agency-extension/src/status/StatusBarManager.ts`
- `packages/agency-extension/src/__tests__/status/StatusBarManager.test.ts`
- Verify connected state → click runs `DISCONNECT_MCP`
- Verify disconnected/error state → click runs `CONNECT_MCP`
- Add/update tests confirming toggle behavior
- Verify reconnect exhaustion shows manual "Reconnect" action in status bar

### T019 [DONE] Update reconnect tests
**File**: `packages/agency-extension/src/__tests__/services/McpClientService.test.ts`
- Update tests expecting `maxAttempts: 5` to expect `10`
- Add test verifying 10 retry attempts with exponential backoff
- Verify status bar state after exhausting reconnect attempts

---

## Phase 4: Plugin Settings & Config Conflict Handling

**Goal**: Implement MCP metadata query for plugin schemas and concurrent edit conflict detection (Q5, Q7).

### T020 [DONE] Add getPluginMetadata to McpClientService
**File**: `packages/agency-extension/src/services/McpClientService.ts`
- Add `getPluginMetadata(): Promise<PluginMetadata[]>` method
- Call `executeTool('agency.plugins_describe', {})` when connected
- Parse result into `PluginMetadata[]` (with settings schema info)
- Graceful fallback: catch errors, log warning, return `[]`
- Add `PluginMetadata` type to `types/plugin.ts` if not present

### T021 [DONE] Update PluginConfigPanel for metadata-driven forms
**File**: `packages/agency-extension/src/views/plugins/PluginConfigPanel.ts`
- On panel open: query `McpClientService.getPluginMetadata()`
- If schema available for plugin: render typed form controls from schema
- If no schema (disconnected or no metadata): fall back to JSON editor
- Maintain existing form generation logic as fallback path

### T022 [DONE] Implement config conflict detection
**File**: `packages/agency-extension/src/services/ConfigService.ts`
- Add `_lastSavedHash: string` field (SHA-256 of config content at last read/write)
- Update `_lastSavedHash` on every `loadConfig()` and `writeConfig()` call
- On file watcher event: compute hash of new file content, compare to `_lastSavedHash`
- Add `_webviewDirty: boolean` flag (set by webview via message, cleared on save)
- Add `onConfigConflict: Event<ConfigConflictEvent>` event emitter
- Fire conflict event when external change detected AND webview is dirty
- Add `setWebviewDirty(dirty: boolean)` method for webviews to call

### T023 [DONE] Wire conflict detection to webview UI
**Files**:
- `packages/agency-extension/src/views/plugins/PluginConfigPanel.ts`
- On webview edit: call `ConfigService.setWebviewDirty(true)`
- Subscribe to `ConfigService.onConfigConflict`
- On conflict: show VS Code notification "Config file changed externally. Reload and lose your changes, or keep editing?" with Reload/Keep buttons
- Reload: refresh webview content from disk
- Keep: do nothing (user continues editing)

### T024 Write conflict detection tests
**File**: `packages/agency-extension/src/__tests__/services/ConfigService.test.ts`
- Test: external file change with no dirty webview → no conflict event
- Test: external file change with dirty webview → conflict event fired
- Test: hash updated after save
- Test: hash updated after load

### T025 [P] Write plugin metadata tests
**File**: `packages/agency-extension/src/__tests__/services/McpClientService.test.ts`
- Test: `getPluginMetadata()` calls `executeTool('agency.plugins_describe', {})`
- Test: parses valid metadata response
- Test: returns `[]` when disconnected
- Test: returns `[]` when tool call fails (graceful fallback)

---

## Phase 5: Tree View & UI Polish

**Goal**: Handle disconnected states, add extension icon (Q13, Q11).

### T026 [P] Add disconnected message to ToolTreeProvider
**File**: `packages/agency-extension/src/providers/ToolTreeProvider.ts`
- When MCP is disconnected: return a single tree item "Connect to MCP server to see tools"
- Set click command to `COMMANDS.CONNECT_MCP`
- Use `ThemeIcon('plug')` for the icon
- Ensure the message replaces the empty state (not additional to status header)

### T027 [P] Generate extension icon
**Files**:
- `packages/agency-extension/media/icon.png` (new file — 128x128 PNG)
- Convert from `media/icons/agency.svg` (or `media/icons/icon.png.svg`)
- Use `sharp`, `resvg`, or manual export to generate 128x128 PNG

### T028 Add icon field to package.json
**File**: `packages/agency-extension/package.json`
- Add `"icon": "media/icon.png"` to root

### T029 Update ToolTreeProvider tests
**File**: `packages/agency-extension/src/__tests__/providers/ToolTreeProvider.test.ts`
- Add test: disconnected state shows "Connect to MCP server to see tools" item
- Add test: click on disconnect item triggers `CONNECT_MCP` command
- Verify connected state still shows tools normally

---

## Phase 6: Testing & Quality

**Goal**: Fix skipped tests, ensure new code is covered (Q9).

### T030 Fix extension.test.ts
**File**: `packages/agency-extension/src/__tests__/extension.test.ts`
- Audit the "should register commands" test against actual registered command IDs
- Fix VS Code API mock to properly handle:
  - `vscode.window.createOutputChannel`
  - `vscode.window.createStatusBarItem`
  - `vscode.window.createTreeView`
  - `vscode.commands.registerCommand`
  - `vscode.workspace.workspaceFolders`
  - `vscode.workspace.getConfiguration`
- Update expected command list to include new `agency.init` and `agency.verifySetup`
- Verify `activate()` initializes all services
- Verify `deactivate()` cleans up state

### T031 Remove extension.test.ts exclusion from test script
**File**: `packages/agency-extension/package.json`
- Remove `--exclude 'src/__tests__/extension.test.ts'` from test script
- Keep `--exclude 'src/__tests__/services/ModeService.test.ts'` (deferred to post-MVP per Q9)

### T032 Run full test suite and fix regressions
**Files**: All test files
- Run `pnpm --filter @generacy-ai/agency-extension test`
- Fix any test failures caused by schema changes (Phase 1 cascading updates)
- Fix any test failures caused by new command registration
- Ensure all 554+ tests pass (plus new tests from T008, T009, T015, T019, T024, T025, T029)

---

## Phase 7: Packaging & Marketplace Prep

**Goal**: Prepare for Marketplace publishing (Q10, Q11).

### T033 [P] Update package.json for Marketplace
**File**: `packages/agency-extension/package.json`
- Verify/add `"icon": "media/icon.png"` (from T028)
- Add `"galleryBanner": { "color": "#1e1e1e", "theme": "dark" }`
- Add `"preview": true`
- Add `"pricing": "Free"`
- Verify publisher is `"generacy-ai"`

### T034 [P] Verify .vscodeignore
**File**: `packages/agency-extension/.vscodeignore`
- Verify `src/` is excluded (only `dist/` ships)
- Verify `node_modules/` is excluded
- Verify `*.test.ts` patterns are excluded
- Verify `vitest.config.ts`, `tsconfig.json`, `esbuild.config.mjs` are excluded
- Verify `media/` is included (icons needed)

### T035 [P] Confirm zero telemetry
**Files**: All source files
- Search codebase for any telemetry imports (`@vscode/extension-telemetry`, `TelemetryService`, etc.)
- Confirm no outbound network calls exist outside MCP protocol
- Document finding (pass/fail) in PR description

### T036 Add CI publish step
**File**: `.github/workflows/` (existing CI workflow)
- Add conditional publish step for `develop` branch:
  ```yaml
  - name: Publish Extension
    if: github.ref == 'refs/heads/develop'
    run: pnpm --filter @generacy-ai/agency-extension publish --pre-release
    env:
      VSCE_PAT: ${{ secrets.VSCE_PAT }}
  ```
- Ensure the publish step depends on build + test passing

### T037 Track publisher setup (external prerequisite)
**Note**: This is an external/manual task, not code.
- Register `generacy-ai` publisher on VS Code Marketplace
- Create Azure DevOps organization
- Generate PAT → add to GitHub secrets as `VSCE_PAT`
- Verify publisher identity
- Track as a separate issue/blocker

---

## Dependencies & Execution Order

### Phase dependencies (sequential)

```
Phase 1 (Schema Alignment) ──► Phase 2 (New Commands)
                              ──► Phase 3 (MCP Connection)
                              ──► Phase 4 (Plugin & Conflict)
                              ──► Phase 5 (UI Polish)

Phases 2-5 ────────────────────► Phase 6 (Testing & Quality)

Phase 6 ───────────────────────► Phase 7 (Packaging)
```

- **Phase 1 must complete first**: Schema changes cascade into every other phase
- **Phases 2, 3, 4, 5 can run in parallel** after Phase 1 (different files, independent features)
- **Phase 6 must follow 2-5**: Tests validate all implementation work
- **Phase 7 follows Phase 6**: Only package after tests pass

### Parallel opportunities within phases

| Phase | Parallel Tasks | Reason |
|-------|---------------|--------|
| 1 | T001 ∥ T002 | Different schema sections, same file but independent objects |
| 1 | T007 ∥ T008 ∥ T009 | Different files (McpConnectionManager, test files) |
| 3 | T016 ∥ T017 | Different files (types/mcp.ts vs package.json) |
| 4 | T025 ∥ T024 | Different test files |
| 5 | T026 ∥ T027 | Different files (ToolTreeProvider vs media) |
| 7 | T033 ∥ T034 ∥ T035 | Independent verification tasks |

### Critical path

```
T001/T002 → T003 → T004 → T005 → T006 → T008/T009 → T010 → T011 → T013 → T030 → T031 → T032 → T033
```

**Longest path estimated**: Phase 1 (2-3 days) + Phase 2 (2-3 days) + Phase 6 (2-3 days) + Phase 7 (1 day) = **7-10 days**

**With parallelism**: Phases 2-5 run concurrently (~3 days), total **~8-12 days**

---

## Summary

| Phase | Tasks | New Files | Modified Files |
|-------|-------|-----------|----------------|
| 1: Schema Alignment | T001–T009 | 0 | 10+ (schema, types, services, tests) |
| 2: New Commands | T010–T015 | 2 (`setup-commands.ts`, test) | 4 (constants, index, extension, package.json) |
| 3: MCP Connection | T016–T019 | 0 | 4 (types/mcp, package.json, status bar, tests) |
| 4: Plugin & Config | T020–T025 | 0 | 5 (McpClientService, ConfigService, PluginConfigPanel, tests) |
| 5: UI Polish | T026–T029 | 1 (`media/icon.png`) | 3 (ToolTreeProvider, package.json, tests) |
| 6: Testing | T030–T032 | 0 | 2+ (extension.test.ts, package.json) |
| 7: Packaging | T033–T037 | 0 | 3 (package.json, .vscodeignore, CI workflow) |
| **Total** | **37 tasks** | **3 new files** | **~20 modified files** |
