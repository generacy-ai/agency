# Research: Mode Switching UI

## Technology Decisions

### 1. Mode Persistence Storage

**Decision**: Use VS Code workspace settings via `vscode.workspace.getConfiguration()`

**Rationale**:
- Native VS Code API, no additional dependencies
- Workspace-scoped by default, respects user preferences
- Automatically synced if user has Settings Sync enabled
- Already used by other extension settings (`agency.configPath`, `agency.autoConnect`)

**Alternatives Considered**:
- **ExtensionContext.workspaceState**: Simpler but not visible/editable by user
- **File-based (.vscode/settings.json)**: Same as workspace settings but less idiomatic
- **Global user settings only**: Doesn't support per-project preferences

### 2. Status Bar Item Implementation

**Decision**: Extend existing `StatusBarManager` class with mode-specific item

**Rationale**:
- Maintains singleton pattern already established
- Centralized status bar management
- Consistent styling with MCP and Container status items

**Implementation Notes**:
- Create `modeStatusItem` with priority 98 (after container at 99)
- Subscribe to `ModeService.onModeStateChange` for updates
- Use `$(symbol-property)` icon to represent mode/configuration concept

### 3. Command Registration Pattern

**Decision**: Create dedicated `registerModeCommands()` function similar to `registerPluginCommands()`

**Rationale**:
- Consistent with existing command registration patterns
- Encapsulates mode command setup
- Returns disposables for proper cleanup

**Pattern**:
```typescript
export function registerModeCommands(vscodeModule: typeof vscode): vscode.Disposable[] {
  return [
    vscodeModule.commands.registerCommand('agency.switchMode', (item) =>
      switchMode(vscodeModule, item)),
    vscodeModule.commands.registerCommand('agency.viewModeTools', (modeId) =>
      viewModeTools(vscodeModule, modeId)),
    vscodeModule.commands.registerCommand('agency.refreshModes', () =>
      refreshModes()),
  ];
}
```

## Implementation Patterns

### Event-Driven Updates

The mode system uses an event-driven architecture:

```
User Action → ModeService.setCurrentMode() → ModeStateEvent fired
                                                    ↓
                        ┌───────────────────────────┼───────────────────────────┐
                        ↓                           ↓                           ↓
              StatusBarManager          ModeTreeProvider.refresh()      Other subscribers
              updates mode item         refreshes tree view
```

### Initialization Sequence

```
extension.activate()
  ├── ConfigService.initialize()    ← Loads agency.config.json
  ├── ModeService.initialize()      ← Loads modes from config, reads persisted mode
  ├── registerModeTreeView()        ← Creates tree provider, subscribes to events
  ├── registerModeCommands()        ← Registers command handlers
  └── StatusBarManager.initialize() ← Creates status bar items including mode
```

### Error Boundaries

Each layer handles errors independently:

1. **ModeService**: Returns `ModeSwitchResult` with success/error
2. **mode-commands**: Catches errors, shows notifications
3. **StatusBarManager**: Uses fallback display on errors
4. **ModeTreeProvider**: Returns empty array on errors, logs to output

## VS Code Extension API Usage

### Configuration API

```typescript
// Read workspace setting
const config = vscode.workspace.getConfiguration('agency');
const currentMode = config.get<string>('currentMode', 'default');

// Write workspace setting
await config.update('currentMode', modeId, vscode.ConfigurationTarget.Workspace);
```

### Status Bar Item

```typescript
const item = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  98  // Priority (lower = further right)
);
item.text = '$(symbol-property) Mode: Development';
item.tooltip = 'Current mode: Development\nClick to switch';
item.command = 'agency.switchMode';
item.show();
```

### Tree View Registration

```typescript
const treeView = vscode.window.createTreeView('agency.modes', {
  treeDataProvider: provider,
  showCollapseAll: true,
});
```

## Key Sources

1. **VS Code Extension API Reference**: https://code.visualstudio.com/api/references/vscode-api
2. **Existing codebase patterns**: `StatusBarManager.ts`, `PluginTreeProvider.ts`, `plugin-commands.ts`
3. **VS Code Extension Samples**: https://github.com/microsoft/vscode-extension-samples
