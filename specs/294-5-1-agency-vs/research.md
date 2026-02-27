# Technical Research: Agency VS Code Extension — MVP

**Branch**: `294-5-1-agency-vs` | **Date**: 2026-02-27

## 1. Schema Alignment — Core Server vs Extension

### Current Divergence

The core server (`packages/agency`) and the extension (`packages/agency-extension`) evolved separately, resulting in schema mismatches.

#### Mode System

| Aspect | Core Server (`modes/types.ts`) | Extension Zod (`ConfigSchema.ts`) | Extension Types (`types/mode.ts`) |
|--------|-------------------------------|----------------------------------|----------------------------------|
| Parent reference | `extends?: string` | `inherits?: string` | `parentId?: string` |
| Included tools | `includes: string[]` (glob) | `tools: string[]` | `includedTools: string[]` |
| Excluded tools | `excludes?: string[]` (glob) | (missing) | `excludedTools: string[]` |
| Description | `description?: string` | (missing) | `description?: string` |
| Default flag | Via `defaultMode` in root config | (missing) | `isDefault?: boolean` |

**Key finding**: The extension's TypeScript types (`types/mode.ts`) already match the core server model (`parentId`, `includedTools`, `excludedTools`). Only the Zod schema in `ConfigSchema.ts` diverges. This means services like `ModeService` already work with the correct shape — only the config file parsing layer needs updating.

#### Container System

| Aspect | Core Server | Extension Zod | Extension Types |
|--------|------------|--------------|-----------------|
| MCP command | N/A (server doesn't model client containers) | `mcpCommand?: string` | `mcpCommand?: string` |
| MCP args | N/A | `mcpArgs?: string[]` | `mcpArgs?: string[]` |
| Env vars | N/A | (missing) | `environment?: Record<string, string>` |
| Dev container path | N/A | `dockerComposePath?: string` | (not in ContainerConfig type) |

**Key finding**: Container config is extension-only (the server doesn't model client containers). The restructuring from flat fields to `connection: { command, args, env }` is a pure extension concern.

### Migration Strategy

**Approach**: Detect old-format fields during `ConfigService.loadConfig()` and transform to new format before Zod validation.

```typescript
function migrateConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const config = { ...raw };

  // Migrate modes
  if (Array.isArray(config.modes)) {
    config.modes = config.modes.map((mode: Record<string, unknown>) => {
      const migrated = { ...mode };
      // inherits → parentId
      if ('inherits' in migrated && !('parentId' in migrated)) {
        migrated.parentId = migrated.inherits;
        delete migrated.inherits;
      }
      // tools → includedTools
      if ('tools' in migrated && !('includedTools' in migrated)) {
        migrated.includedTools = migrated.tools;
        delete migrated.tools;
      }
      // Ensure excludedTools exists
      if (!('excludedTools' in migrated)) {
        migrated.excludedTools = [];
      }
      return migrated;
    });
  }

  // Migrate containers
  if (Array.isArray(config.containers)) {
    config.containers = config.containers.map((container: Record<string, unknown>) => {
      const migrated = { ...container };
      if (('mcpCommand' in migrated) && !('connection' in migrated)) {
        migrated.connection = {
          command: migrated.mcpCommand,
          args: migrated.mcpArgs,
        };
        delete migrated.mcpCommand;
        delete migrated.mcpArgs;
      }
      if ('dockerComposePath' in migrated && !('devcontainerPath' in migrated)) {
        migrated.devcontainerPath = migrated.dockerComposePath;
        delete migrated.dockerComposePath;
      }
      return migrated;
    });
  }

  return config;
}
```

This migration runs before Zod parsing, so existing config files continue to work. The migrated config is written back to disk with a log warning.

---

## 2. Extension Testing — `extension.test.ts` Analysis

### Root Cause

The test is excluded because it imports `vscode` module directly (via `extension.ts` → `StatusBarManager` → `import * as vscode from 'vscode'`).

The `StatusBarManager` uses a static `import * as vscode from 'vscode'` at the top of the file rather than accepting vscode as a parameter. This breaks in Vitest because the `vscode` module doesn't exist outside VS Code's extension host.

### Fix Strategy

**Option A — Module mock**: Create `src/__tests__/__mocks__/vscode.ts` that exports all needed VS Code APIs as stubs. Configure Vitest to resolve `vscode` to this mock.

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    alias: {
      vscode: path.resolve(__dirname, 'src/__tests__/__mocks__/vscode.ts'),
    },
  },
});
```

**Option B — Dependency injection for StatusBarManager**: Refactor `StatusBarManager` to accept `vscode` module as a parameter (like all other services). This is the cleaner approach but requires touching more code.

**Recommendation**: Option A for MVP. The mock approach is standard for VS Code extension testing and doesn't require refactoring production code. The mock already needs to exist for other tests that import `vscode` transitively.

### VS Code Mock Requirements

The `extension.ts` `activate()` function calls these VS Code APIs:
- `vscode.window.createOutputChannel(name)` → returns `{ appendLine, show, dispose }`
- `vscode.window.createStatusBarItem(alignment, priority)` → returns status bar item mock
- `vscode.window.createTreeView(id, options)` → returns tree view mock
- `vscode.commands.registerCommand(id, handler)` → returns disposable
- `vscode.workspace.workspaceFolders` → array of workspace folders
- `vscode.workspace.getConfiguration(section)` → config object
- `vscode.workspace.createFileSystemWatcher(pattern)` → file watcher mock
- `vscode.Uri.joinPath(base, ...segments)` → URI mock
- `vscode.Uri.file(path)` → URI mock
- `vscode.ViewColumn.One` → enum value

---

## 3. MCP Plugin Metadata Discovery

### Protocol Analysis

The Agency MCP server exposes tools via `tools/list` and `tools/call`. There's no built-in MCP method for querying plugin metadata. The approach is to call a tool that the server provides for plugin introspection.

### Server-Side Tool

The core server's `PluginLoader` has full plugin manifests including:
- `manifest.id`, `manifest.name`, `manifest.version`, `manifest.description`
- `manifest.tools` — list of tools provided
- No `settingsSchema` field in current manifests

**Gap**: Plugin manifests don't currently include settings schemas. This will need to be added to the core server as part of the MCP metadata query implementation.

### Extension-Side Implementation

```typescript
// McpClientService.ts
async getPluginMetadata(): Promise<PluginMetadata[]> {
  if (!this.isConnected()) return [];

  try {
    const result = await this.executeTool('agency.plugins_describe', {});
    if (result.isError) return [];

    const text = result.content.find(c => c.type === 'text');
    if (!text) return [];

    return JSON.parse(text.text);
  } catch {
    return []; // Graceful fallback
  }
}
```

### Fallback Behavior

When metadata is unavailable (server disconnected, tool not found, or parse error), the plugin configuration webview falls back to a raw JSON editor. The JSON editor allows editing `settings: Record<string, unknown>` directly.

This is acceptable for MVP because:
1. The server may not have the `agency.plugins_describe` tool yet
2. JSON editing is functional, just not as user-friendly
3. The metadata query can be improved post-MVP without breaking changes

---

## 4. Content Security Policy — Current State

### WebviewBase Implementation

The `getBaseHtml()` method in `src/views/webview-base.ts` already implements the moderate CSP from Q14:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           style-src ${cspSource} 'unsafe-inline';
           script-src 'nonce-${nonce}';
           font-src ${cspSource};">
```

This matches the Q14 answer exactly:
- Nonce-based scripts (prevents XSS from injected content)
- `unsafe-inline` for styles (required for VS Code theme CSS variables)
- VS Code webview resource URIs via `${cspSource}`
- No external resources (`default-src 'none'`)

**No changes needed.** The CSP is already correctly implemented.

---

## 5. Verify Setup Command — Check Sequence

### Checks to Run

1. **Config file exists**: Check `fs.existsSync(configPath)`
2. **Config is valid JSON**: Try `JSON.parse(fileContent)`
3. **Config passes schema validation**: Run `AgencyConfigSchema.safeParse(parsed)`
4. **MCP server reachable**: Try `mcpService.listTools()` (or ping if available)
5. **Container running** (if configured): Check `containerService.getContainers()` for running containers

### Output Format

```
=== Agency Setup Verification ===
[PASS] Configuration file found at .agency/agency.config.json
[PASS] Configuration is valid JSON
[PASS] Configuration schema validation passed
[FAIL] MCP server not reachable (disconnected)
[SKIP] No containers configured

Result: 3/4 checks passed, 1 failed
```

### Notification

- All pass: `$(pass-filled) Agency: All checks passed` — info notification
- Some fail: `$(warning) Agency: 3/4 checks passed` — warning notification
- Both include "Show Details" button → `outputChannel.show()`

---

## 6. Concurrent Config Edits — Implementation

### File Hash Tracking

Use a simple content hash to detect external changes:

```typescript
import { createHash } from 'crypto';

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
```

### State Machine

```
                    ┌─────────────┐
                    │   Clean     │ (hash matches file)
                    └──────┬──────┘
                           │ webview edit
                    ┌──────▼──────┐
                    │   Dirty     │ (webview has unsaved changes)
                    └──────┬──────┘
                           │ file watcher fires
                    ┌──────▼──────┐
                    │  Conflict   │ (file changed + webview dirty)
                    └──────┬──────┘
                      ┌────┴────┐
                      │         │
                ┌─────▼──┐  ┌──▼─────┐
                │ Reload │  │  Keep  │
                │ (Clean)│  │ (Dirty)│
                └────────┘  └────────┘
```

### Integration Points

- `ConfigService.onConfigChange` — fires when file watcher detects change
- Webview sends `{ type: 'dirty', payload: true }` when user modifies form
- Webview sends `{ type: 'dirty', payload: false }` after successful save
- `ConfigService` tracks `_webviewDirty: boolean` and `_fileHash: string`
- On conflict: fire `onConfigConflict` event → webview shows notification

---

## 7. Extension Icon Generation

### Current State
- SVG source: `media/icons/agency.svg` (563 bytes)
- No PNG exists
- `package.json` has no `icon` field

### Generation Approach

**Option A — Build-time script** using `sharp`:
```bash
npx sharp -i media/icons/agency.svg -o media/icon.png -w 128 -h 128
```

**Option B — Manual export**: Open SVG in browser/editor, export as 128x128 PNG.

**Option C — CI step**: Add `generate-icon` script that runs before packaging.

**Recommendation**: Option B (manual) for MVP. The icon is a one-time artifact. Add a comment in `package.json` noting the source SVG.

### Marketplace Requirements
- Format: PNG
- Size: 128x128 pixels minimum (256x256 recommended)
- Background: transparent or solid color
- The `icon` field in `package.json` is relative to the extension root

---

## 8. Activation Event Strategy

### Current

```json
"activationEvents": ["workspaceContains:.agency/agency.config.json"]
```

### Required (Q6)

```json
"activationEvents": [
  "workspaceContains:.agency/agency.config.json",
  "onCommand:agency.init"
]
```

The `onCommand:agency.init` event ensures the `agency.init` command is available even when no config file exists. VS Code will lazy-activate the extension when the user runs the init command from the command palette.

### Activation Flow

```
User opens workspace
  ├─ Has .agency/agency.config.json?
  │   └─ Yes → Full activation (all services, commands, tree views)
  │
  └─ No → Extension NOT activated
      └─ User runs "Agency: Initialize" from command palette
          └─ onCommand:agency.init activates extension
              └─ init command creates config file
                  └─ Full activation continues
```

### Implementation Detail

In `activate()`, check for config file existence early:
```typescript
export async function activate(context: vscode.ExtensionContext) {
  // Always register the init command
  context.subscriptions.push(
    vscode.commands.registerCommand('agency.init', () => initCommand(vscodeModule))
  );

  // Check if config exists — if not, only init is available
  const configExists = await configFileExists(vscodeModule);
  if (!configExists) {
    log.info('No config file found. Only agency.init is available.');
    return;
  }

  // Full activation...
}
```

---

*Generated for spec 294-5-1-agency-vs*
