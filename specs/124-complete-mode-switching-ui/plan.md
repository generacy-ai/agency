# Implementation Plan: Complete Mode Switching UI

**Feature**: Complete Mode Switching UI in VS Code extension
**Branch**: `124-complete-mode-switching-ui`
**Status**: Complete

## Summary

Wire up existing mode switching functionality to the VS Code UI. The core implementation (ModeService, ModeTreeProvider, mode-commands) already exists but is not connected. This feature requires:
1. Replacing stub command registrations with real implementations
2. Adding mode status bar item to StatusBarManager
3. Registering ModeTreeProvider in extension activation
4. Implementing mode persistence via VS Code workspace/user settings

## Technical Context

- **Language**: TypeScript 5.x
- **Framework**: VS Code Extension API
- **Runtime**: Node.js 20+
- **Key Dependencies**:
  - `vscode` - VS Code Extension API
  - `zod` - Runtime validation (already used for config)

## Project Structure

```text
packages/agency-extension/
├── src/
│   ├── extension.ts              # MODIFY: Wire mode commands and tree view
│   ├── services/
│   │   └── ModeService.ts        # MODIFY: Add workspace settings persistence
│   ├── providers/
│   │   ├── ModeTreeProvider.ts   # EXISTS: Already implemented
│   │   └── index.ts              # MODIFY: Export registerModeTreeView
│   ├── commands/
│   │   ├── mode-commands.ts      # EXISTS: Already implemented
│   │   └── index.ts              # MODIFY: Export mode command registrations
│   ├── status/
│   │   └── StatusBarManager.ts   # MODIFY: Add mode status bar item
│   └── constants.ts              # MODIFY: Add MODE_COMMANDS constants
```

## Key Components

### 1. Command Wiring (extension.ts)

Replace stub registrations with actual implementations:
- `agency.switchMode` → calls `switchMode()` from mode-commands.ts
- `agency.viewModeTools` → calls `viewModeTools()` from mode-commands.ts
- `agency.refreshModes` → new command for tree refresh

### 2. Mode Status Bar Item (StatusBarManager.ts)

Add third status bar item showing current mode:
- Position: Right side, priority 98 (after MCP and Container)
- Icon: `$(symbol-property)` (default) or `$(gear)` (active)
- Click: Opens mode picker (same as switchMode command)
- Updates: Listen to ModeService.onModeStateChange

### 3. Tree View Registration (extension.ts)

Register ModeTreeProvider during activation:
- Call `registerModeTreeView(vscodeModule)` from providers
- Add to disposables for cleanup

### 4. Mode Persistence (ModeService.ts)

Store last-used mode in VS Code settings:
- Workspace-scoped by default (per-project)
- Setting key: `agency.currentMode`
- Load on initialization, save on mode switch

## Design Decisions

### Decision 1: Persistence Scope
**Choice**: Workspace-scoped (per-project) as default
**Rationale**: Different projects may use different modes; matches clarification Q1 option A
**Trade-offs**: Cannot share mode preference across workspaces without explicit configuration

### Decision 2: Error Handling
**Choice**: Show error notification with retry option
**Rationale**: Users need feedback on failures; matches clarification Q2 option A
**Trade-offs**: Slightly noisier UX but provides actionable feedback

### Decision 3: Initial Mode Selection
**Choice**: Use first mode or mode marked `isDefault: true` in config
**Rationale**: Predictable behavior without requiring user action; matches Q3 option A/B
**Trade-offs**: User doesn't get to choose on first launch

### Decision 4: Status Bar Position
**Choice**: Right side, priority 98
**Rationale**: Consistent with existing status bar items; less prominent than system indicators
**Trade-offs**: May be hidden on narrow windows

### Decision 5: Mode Switch Confirmation
**Choice**: No confirmation - switch immediately
**Rationale**: Faster workflow; modes can always be switched back; matches Q5 option A
**Trade-offs**: Accidental switches possible but easily reversible

## Implementation Order

1. **Update exports** - Add mode exports to commands/index.ts and providers/index.ts
2. **Add constants** - Add mode command constants to constants.ts
3. **Update StatusBarManager** - Add mode status bar item with ModeService integration
4. **Update extension.ts** - Wire commands, register tree view, initialize services
5. **Enhance ModeService** - Add workspace settings persistence for last-used mode
6. **Update package.json** - Add agency.currentMode configuration property
7. **Add tests** - Unit tests for new functionality

## Acceptance Verification

| Criterion | How to Verify |
|-----------|---------------|
| Can switch modes via command palette | Ctrl+Shift+P → "Agency: Switch Mode" → select mode |
| Status bar shows current mode | Check right side of status bar |
| Mode tree view displays correctly | Open Agency sidebar → Modes section |
| Tools list updates when mode changes | Switch mode → check effective tools in tree |
| Mode persists across VS Code restarts | Switch mode → reload window → verify same mode |

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ModeService not initialized when commands called | Low | High | Add initialization guards, helpful error messages |
| Status bar overcrowding | Medium | Low | Use compact text, tooltip for details |
| Config service race condition | Low | Medium | Await initialization before accessing modes |
