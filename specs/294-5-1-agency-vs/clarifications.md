# Clarification Questions

## Status: Resolved

## Questions

### Q1: Config Schema Divergence — Mode Inheritance
**Context**: The spec's data model (`data-model.md`) defines mode inheritance as `extends?: string[]` (array, multiple parents). The extension implementation uses `inherits?: string` (single parent). The agency core server uses a completely different structure: `modes: Record<string, string[]>` (map of mode name to tool patterns) with `includes`/`excludes` patterns and single `extends?: string`. The spec text references `ModeConfig` but doesn't resolve which schema is canonical. This affects mode switching, tool resolution, and config file compatibility between the extension and server.
**Question**: Which mode inheritance model should the extension implement?
**Options**:
- A) Single parent (`inherits: string`): Matches the current extension implementation and core server's `extends` field. Simpler to resolve, avoids diamond inheritance.
- B) Multiple parents (`extends: string[]`): Matches the data-model.md spec. More flexible but requires defining merge order and conflict resolution rules for overlapping tool patterns.
- C) Align with core server exactly: Use `includes`/`excludes` pattern matching (glob-based) with single `extends`. This ensures the extension config maps 1:1 to the server's mode resolution.
**Answer**: **Option C — Align with core server exactly.** Use single `extends` with glob-based `includes`/`excludes` patterns. The ModeService spec (060) already settled on single-parent inheritance (`parentId`) with `includedTools`/`excludedTools` — the current extension types in `types/mode.ts` already reflect this. The core server's tool resolution is the runtime source of truth; the extension config must map 1:1 to it. Multiple parents introduces diamond inheritance complexity not justified by any current use case. Update data-model.md to match. The Zod schema in `ConfigSchema.ts` needs updating from `inherits` to `parentId` + `includedTools`/`excludedTools` to match the TypeScript types.

### Q2: Config Schema Divergence — Container Configuration
**Context**: Three different container schemas exist. The data model spec defines `ContainerConfig` with a nested `connection: ConnectionConfig` object (`command`, `args`, `env`). The extension implementation uses flat fields (`workspacePath`, `dockerComposePath`, `mcpCommand`, `mcpArgs`) with no `connection` wrapper and no `env` support. The spec text's `AgencyConfig` interface shows the data model version. This divergence means existing config files may not validate correctly depending on which schema is used.
**Question**: Which container configuration schema should be canonical?
**Options**:
- A) Data model spec (nested `connection`): Cleaner separation of concerns, extensible for future connection types (HTTP, WebSocket). Requires updating the extension implementation.
- B) Current extension implementation (flat fields): Simpler config file authoring, fewer nesting levels. Requires updating the spec.
- C) Hybrid: Use `connection` wrapper but add `workspacePath` and `dockerComposePath` at the container level (as in the extension), keeping MCP connection details nested.
**Answer**: **Option C — Hybrid.** Use `connection` wrapper for MCP-specific fields, keep `workspacePath` and `devcontainerPath` at the container level. `workspacePath` and `devcontainerPath` describe the container, not the connection — they belong at the container level. MCP connection details (`command`, `args`, `env`) are logically grouped and may expand to support different transport types (HTTP, WebSocket) later. Update the Zod schema to: `{ id, name, workspacePath, devcontainerPath?, connection: { command, args?, env? } }`.

### Q3: Verify Setup Command — Missing Implementation
**Context**: US5 specifies an "Agency: Verify Setup" command (FR-010, P1) that validates config presence/schema, MCP connectivity, and container status with a pass/fail summary. This command is not registered in `package.json`, not present in any command handler file, and no implementation exists. It's a P1 requirement and the only completely unimplemented user story in the spec.
**Question**: What should the Verify Setup command's output format be?
**Options**:
- A) Output channel log: Write results to the Agency output channel as a structured text report. Low-effort, consistent with extension patterns.
- B) Notification with details: Show a VS Code information/warning message with a "Show Details" button that opens an output channel or webview with the full report.
- C) Webview panel: Render a rich HTML panel with checkmarks/crosses, color coding, and "Fix" action buttons for each failing check. Higher effort but better UX.
- D) Quick-pick walkthrough: Step through each check interactively, showing progress in a quick-pick menu. Allows the user to fix issues between checks.
**Answer**: **Option B — Notification with details.** Show a VS Code info/warning notification with pass/fail summary and a "Show Details" button that opens the output channel with the full report. A notification is immediately visible without requiring the user to find the output channel. "Show Details" provides the full breakdown for debugging. A webview is overkill for MVP; output-channel-only is too hidden for a command the user explicitly runs.

### Q4: MCP Auto-Reconnection Strategy
**Context**: The spec states that connection failures should "surface a user-visible warning" and that the extension should "remain functional" (US3). The implementation includes reconnection with backoff logic across `McpClientService`, `StdioClient`, and `DockerExecTransport`. However, the spec doesn't define reconnection parameters: max retry attempts, backoff intervals, or when to give up and stay disconnected. This affects user experience — too aggressive reconnection is noisy; too passive means the extension appears broken.
**Question**: What reconnection behavior should the extension use when the MCP server connection drops?
**Options**:
- A) Exponential backoff with cap: Retry at 1s, 2s, 4s, 8s, ... up to 30s intervals, with a maximum of 10 attempts before staying disconnected. Show a "Reconnect" action in the status bar when attempts are exhausted.
- B) Indefinite backoff: Retry forever with exponential backoff capped at 60s. Never give up, but only show the first failure notification to avoid noise.
- C) Manual only: Never auto-reconnect. Show a "Reconnect" notification on disconnect. User must explicitly reconnect via command or status bar click.
- D) Configurable: Add `agency.reconnectAttempts` and `agency.reconnectInterval` settings. Default to option A behavior but let users customize.
**Answer**: **Option A — Exponential backoff with cap.** Retry at 1s, 2s, 4s, 8s... up to 30s intervals, max 10 attempts. Show a "Reconnect" action in the status bar when exhausted. Standard pattern for transient failures (container restarts, process crashes). 10 attempts with exponential backoff covers ~5 minutes, sufficient for most recovery scenarios. The status bar "Reconnect" button gives the user explicit control when auto-recovery fails. Making it configurable is over-engineering for MVP — can be added later if users ask.

### Q5: Plugin Settings Schema Discovery
**Context**: US2 requires a webview panel for "plugin-specific settings" (FR-004). The spec says plugins have `settings: Record<string, unknown>` — an opaque key-value map. The plugin configuration webview needs to render appropriate form controls (text fields, checkboxes, dropdowns) for each setting. The spec doesn't explain how the extension discovers what settings a plugin supports, their types, valid ranges, or display labels. Without a schema, the webview can only show raw JSON editing.
**Question**: How should the plugin configuration webview discover and render plugin settings?
**Options**:
- A) JSON Schema from manifest: Plugins declare a `settingsSchema` in their manifest (JSON Schema format). The webview auto-generates form controls from the schema. Requires plugin authors to provide schemas.
- B) Raw JSON editor: Show a JSON editor (like VS Code's settings.json) for plugin settings. No schema needed, but poor UX for non-technical users.
- C) Convention-based: Define a convention where common setting types (`enabled: boolean`, `path: string`, `level: enum`) are inferred from current values and rendered with appropriate controls. Unknown types fall back to text input.
- D) MCP metadata query: After connecting to the MCP server, query plugin metadata including settings schemas. The server already has the plugin manifests loaded.
**Answer**: **Option D — MCP metadata query, with Option B fallback.** Query the MCP server for plugin metadata including settings schemas. Fall back to a raw JSON editor when disconnected. The MCP server already loads plugin manifests and is the source of truth for what's installed. Adding a `plugins/describe` or `plugins/metadata` MCP method is natural and avoids requiring plugin authors to maintain separate schema files. When disconnected, a raw JSON editor is functional and honest about its limitations. JSON Schema from manifest could be a future enhancement for offline-first scenarios but isn't needed for MVP where the server is expected to be running.

### Q6: Extension Behavior Without Config File
**Context**: The extension activates on `workspaceContains:.agency/agency.config.json` (FR-001). The spec doesn't address what happens when a user manually runs an Agency command (e.g., from the command palette) in a workspace without this file, or when the config file is deleted while the extension is active. Should the extension offer to create a default config? Should commands fail silently, show errors, or prompt for config creation?
**Question**: How should the extension behave when `.agency/agency.config.json` is absent?
**Options**:
- A) No activation, no commands: Extension doesn't activate and commands are not registered. Users must create the config file manually (or via a separate scaffolding tool) before the extension is useful.
- B) Offer initialization: Register an `agency.init` command always (via `*` activation event). When run, it creates a `.agency/agency.config.json` with defaults and activates the full extension. All other commands require the config to exist.
- C) Graceful degradation: Extension activates but tree views show "No configuration found" with a "Create Config" button. MCP and container features are disabled. Plugin view shows a setup wizard.
**Answer**: **Option B — Offer initialization.** Register an `agency.init` command via `*` activation event. All other commands require the config to exist. Standard pattern for dev tools (ESLint `--init`, Prettier init, etc.). No commands at all provides no discoverability — users wouldn't know how to get started. Graceful degradation is more work than justified for MVP. `agency.init` should create `.agency/agency.config.json` with sensible defaults and then activate the full extension.

### Q7: Concurrent Config File Edits
**Context**: The spec acknowledges config file conflicts as a risk and says "last-write-wins" (Risk table). However, US2 states that the extension watches for external changes and reloads. If a user edits the config in a text editor while the plugin configuration webview is open with unsaved changes, the extension needs a conflict resolution strategy. The "last-write-wins" approach could silently discard a user's webview edits.
**Question**: How should the extension handle conflicts between webview edits and external config file changes?
**Options**:
- A) Last-write-wins, silently: External changes overwrite webview state. The webview reloads from disk on file change events. Any unsaved webview edits are lost. Simple but could frustrate users.
- B) Warn and prompt: When an external change is detected while the webview has unsaved edits, show a notification: "Config file changed externally. Reload and lose your changes, or keep editing?" with Reload/Keep options.
- C) Merge strategy: Attempt a 3-way merge of the original state, external changes, and webview changes. Complex but best UX. Fall back to prompt on conflict.
- D) Lock file: Write a `.agency/agency.config.json.lock` while the webview is open. Warn external editors. Remove lock on webview close.
**Answer**: **Option B — Warn and prompt.** When an external change is detected while the webview has unsaved edits, show a notification with Reload/Keep options. Matches VS Code's own behavior for dirty files. Last-write-wins silently discards work — unacceptable UX. 3-way merge is disproportionate complexity for a config file. Lock files are fragile across processes and annoying in practice.

### Q8: MCP Server Binary Location
**Context**: The spec assumes "Dev containers have Agency pre-installed" and the MCP server is "running and accessible via stdio" (Assumptions). US3 mentions a "Connect to MCP Server" command that "initiates stdio connection." However, the spec doesn't specify how the extension locates the MCP server binary. Is it a fixed path (`/usr/local/bin/agency`), resolved from `PATH`, specified in the config file, or configured in VS Code settings? The container config has `mcpCommand`/`mcpArgs` in the implementation but `connection.command` in the data model.
**Question**: How should the extension locate and launch the MCP server process?
**Options**:
- A) Config-driven: Use the `connection.command` / `mcpCommand` field from the container config in `agency.config.json`. Each container specifies its own server command.
- B) VS Code setting: Add an `agency.mcpServerCommand` setting (default: `npx @generacy-ai/agency`). Global across workspaces, overridable per workspace.
- C) Auto-discover: Look for `agency` in `PATH`, then `npx @generacy-ai/agency`, then `./node_modules/.bin/agency`. Use the first one found.
- D) Container-specific + fallback: Use per-container `connection.command` if specified. Fall back to `agency.mcpServerCommand` VS Code setting. Fall back to `npx @generacy-ai/agency`.
**Answer**: **Option D — Container-specific + fallback.** Use per-container `connection.command` if specified. Fall back to `agency.mcpServerCommand` VS Code setting. Final fallback to `npx @generacy-ai/agency`. Different containers may have different server setups (custom builds, different versions). The VS Code setting provides a global override for single-container setups. `npx` fallback ensures it "just works" for standard installations. Aligns with the hybrid container config from Q2 where `connection.command` is per-container.

### Q9: Extension Testing — Skipped Tests
**Context**: The `package.json` test script explicitly excludes `extension.test.ts` and `ModeService.test.ts`. These are likely skipped due to VS Code API mocking complexity or mode schema mismatches. The spec requires >80% line coverage on services (SC-007). Skipping these test files may put coverage below the target and masks potential bugs in critical code paths (extension activation and mode management).
**Question**: Should the skipped tests be fixed as part of this MVP, or deferred?
**Options**:
- A) Fix for MVP: Both files must pass before shipping. Extension activation and mode management are core MVP features and must be tested.
- B) Fix extension tests only: `extension.test.ts` covers activation (US1, P1). Mode tests can be deferred since mode switching is P2.
- C) Defer both: Ship with the exclusions. Add a follow-up issue to fix them. Prioritize E2E coverage via code-server/Playwright instead.
- D) Replace with integration tests: Delete the unit test files and write integration tests using `@vscode/test-electron` that test against a real VS Code instance.
**Answer**: **Option B — Fix extension tests only.** Fix `extension.test.ts` for MVP. Defer `ModeService.test.ts`. Extension activation is P1 and the entry point for all functionality — it must be tested. Mode management is P2, and the mode schema is still being finalized (per Q1) — writing tests against a moving target wastes effort. E2E tests via code-server/Playwright will provide integration coverage for mode switching in the meantime.

### Q10: Marketplace Publisher Verification
**Context**: The spec says the extension publishes under publisher `generacy-ai` (US1). Publishing to the VS Code Marketplace requires a verified publisher account with an Azure DevOps organization and a Personal Access Token (PAT). The spec doesn't confirm whether this publisher account exists, is verified, or has the necessary PAT configured in CI. This is a hard blocker for Marketplace publication.
**Question**: Is the `generacy-ai` VS Code Marketplace publisher account set up and verified?
**Options**:
- A) Yes, ready to publish: Publisher account exists, PAT is configured in GitHub secrets, CI can publish automatically.
- B) Account exists, needs PAT: Publisher is registered but CI secrets need to be configured before publishing.
- C) Not set up: Publisher account needs to be created. This should be a prerequisite task before the extension can ship.
**Answer**: **Option C — Not set up (needs verification).** Assume not yet set up until confirmed otherwise. Create a prerequisite task to: 1) Register the `generacy-ai` publisher on the VS Code Marketplace, 2) Create an Azure DevOps organization, 3) Generate a PAT and add it to GitHub secrets (`VSCE_PAT`), 4) Verify the publisher identity. This is a hard blocker for Marketplace publication and should be tracked as a separate issue.

### Q11: Extension Icon
**Context**: The VS Code Marketplace requires a 128x128 PNG icon for the extension listing. The extension has an SVG source file (`media/icons/icon.png.svg`) but no PNG file. The `package.json` has no `icon` field. Without this, the extension will display a generic icon on the Marketplace and may fail `vsce` packaging validation in some configurations.
**Question**: Should icon generation be part of this MVP or deferred?
**Options**:
- A) Include in MVP: Convert SVG to PNG, add `"icon": "media/icon.png"` to `package.json`. Required for professional Marketplace presence.
- B) Defer: Ship without a custom icon. Add it in a polish pass before wider promotion.
**Answer**: **Option A — Include in MVP.** Convert the existing SVG to 128x128 PNG and add the `icon` field to `package.json`. Trivial task (single convert command or SVG export). A generic icon on the Marketplace looks unprofessional and undermines trust. The SVG source already exists at `media/icons/icon.png.svg`.

### Q12: Status Bar Interaction — Mode Click Behavior
**Context**: FR-007 states the mode status bar item is "Clickable — opens mode switcher." The spec doesn't define what "mode switcher" means in terms of UI. Is it the quick-pick from the `agency.switchMode` command (US6)? A dedicated webview? The modes tree view? The status bar MCP indicator (FR-006) also doesn't specify click behavior — should clicking it open a connection menu, show logs, or trigger reconnection?
**Question**: What should happen when clicking the status bar items?
**Options**:
- A) Mode: opens quick-pick (reuse `switchMode` command); MCP: toggles connection (connect if disconnected, disconnect if connected).
- B) Mode: opens quick-pick; MCP: opens output channel showing connection logs.
- C) Mode: focuses the Modes tree view in the sidebar; MCP: opens a notification with connection details and Reconnect/Disconnect actions.
- D) Mode: opens quick-pick; MCP: runs Verify Setup command to check overall health.
**Answer**: **Option A.** Mode click opens quick-pick (reuses `switchMode` command). MCP click toggles connection. The `switchMode` quick-pick is already implemented and works well. Toggle-on-click for MCP status is the most intuitive — click when disconnected to connect, click when connected to disconnect. Options involving output channels or notifications add friction for the most common action (reconnecting).

### Q13: Tool Tree View — Data Source When Disconnected
**Context**: FR-016 specifies a "Tools tree view (read-only browse of available MCP tools)" organized by namespace. Tools are discovered via the MCP `tools/list` protocol call, which requires an active connection. The spec doesn't define what the Tools tree view shows when the MCP server is disconnected — empty? A "Connect to see tools" message? Cached tools from the last connection?
**Question**: What should the Tools tree view display when the MCP server is disconnected?
**Options**:
- A) Empty with message: Show a single tree item "Connect to MCP server to see tools" with a click action to trigger connection.
- B) Cached tools: Show tools from the last successful connection, grayed out, with a "Stale — reconnect to refresh" indicator.
- C) Config-derived tools: Show tools listed in mode configurations from `agency.config.json` (tool names only, no descriptions or schemas). This works without MCP but is incomplete.
**Answer**: **Option A — Empty with message.** Show a single tree item "Connect to MCP server to see tools" with a click action to trigger connection. Cached tools would be stale and potentially misleading about what's actually available. Config-derived tools are incomplete (no descriptions, no schemas) and could confuse users. A clear message with an actionable click is the most honest and helpful UX.

### Q14: Webview Security — Content Security Policy
**Context**: The plugin configuration webview (FR-004) renders HTML within VS Code. VS Code webviews require a Content Security Policy (CSP) to prevent XSS attacks. The spec doesn't specify CSP requirements. The implementation has a `webview-base.ts` class, but the CSP configuration isn't detailed in the spec. Poor CSP could allow malicious plugin settings to inject scripts.
**Question**: What CSP policy should webviews use?
**Options**:
- A) Strict CSP: Only allow scripts from the extension bundle (`nonce`-based), styles from the extension, no inline styles/scripts, no external resources. Most secure.
- B) Moderate CSP: Allow nonce-based scripts, VS Code's webview resource URIs, and `style-src 'unsafe-inline'` (needed for dynamic theming). Balances security and flexibility.
- C) Follow VS Code defaults: Use whatever CSP VS Code's webview API provides by default with no customization. Simplest but may be too permissive.
**Answer**: **Option B — Moderate CSP.** Nonce-based scripts, VS Code webview resource URIs, and `style-src 'unsafe-inline'`. VS Code theming requires inline styles (`--vscode-*` CSS custom properties injected at runtime), so `'unsafe-inline'` for styles is necessary for proper theme integration. Nonce-based scripts prevent XSS from plugin settings rendering. Standard approach used by most VS Code extensions (e.g., GitHub Copilot, GitLens).

### Q15: Extension Telemetry and Error Reporting
**Context**: The spec explicitly says "No cloud-based features — No remote APIs, cloud storage, or telemetry" (Out of Scope). However, VS Code extensions commonly use `vscode.env.isTelemetryEnabled` to respect the user's telemetry setting. The spec doesn't clarify whether the extension should integrate with VS Code's built-in telemetry infrastructure for crash reporting or extension health metrics (local-only), or whether "no telemetry" means zero instrumentation of any kind.
**Question**: Should the extension include any telemetry or error reporting instrumentation?
**Options**:
- A) Zero telemetry: No telemetry of any kind. Errors go to the output channel only. Users must manually report issues.
- B) VS Code telemetry only: Use `@vscode/extension-telemetry` respecting the user's global telemetry setting. Sends anonymized crash reports and activation metrics to the Marketplace. Standard practice for published extensions.
- C) Local metrics only: Track extension performance metrics (activation time, connection success rate) locally in the output channel for debugging. No data leaves the machine.
**Answer**: **Option A — Zero telemetry.** No telemetry of any kind. Errors go to the output channel only. The spec explicitly states "No cloud-based features — No remote APIs, cloud storage, or telemetry." For a tool in the agent/MCP space, trust and transparency are paramount. Users can report issues via GitHub. The output channel provides sufficient local debugging. Can be revisited post-MVP with an opt-in model if needed.
