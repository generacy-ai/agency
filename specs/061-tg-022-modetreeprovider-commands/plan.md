# Implementation Plan: ModeTreeProvider & Commands

**Feature**: ModeTreeProvider & Commands - Visual tree view for mode management with inheritance display and mode switching commands
**Branch**: `061-tg-022-modetreeprovider-commands`
**Status**: Complete

## Summary

Implement a VS Code tree view provider (`ModeTreeProvider`) that visualizes the mode hierarchy with inheritance relationships, shows tool counts, and highlights the active mode. Add commands for switching modes and viewing mode-specific tools.

This is part of **Phase 7: Mode Management** in the Agency VS Code extension epic (issue #38), completing the mode management UI layer that connects to the existing `ModeService`.

## Technical Context

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| VS Code Extension API | 1.85+ | TreeDataProvider, TreeItem, commands |
| ModeService | existing | Mode state management and inheritance |
| Node.js | 20+ | Runtime environment |

## Project Structure

```
packages/agency-extension/src/
├── providers/
│   ├── index.ts                      # Provider exports (update)
│   └── ModeTreeProvider.ts           # NEW: Mode tree view provider
├── commands/
│   ├── index.ts                      # Command registration (update)
│   └── mode-commands.ts              # NEW: Mode switching commands
├── types/
│   └── mode.ts                       # Mode types (existing, use ModeInfo)
├── services/
│   └── ModeService.ts                # Mode service (existing, use buildModeTree)
└── __tests__/
    ├── providers/
    │   └── ModeTreeProvider.test.ts  # NEW: Provider tests
    └── commands/
        └── mode-commands.test.ts     # NEW: Command tests
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              VS Code Extension Host                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐          ┌──────────────────┐    │
│  │ ModeTreeProvider │          │  mode-commands   │    │
│  │ (tree view)      │◄─────────┤  (actions)       │    │
│  └────────┬─────────┘          └────────┬─────────┘    │
│           │                             │               │
│           └────────────┬────────────────┘               │
│                        │                                │
│           ┌────────────▼────────────┐                   │
│           │     ModeService         │                   │
│           │  - getCurrentMode()     │                   │
│           │  - buildModeTree()      │                   │
│           │  - setCurrentMode()     │                   │
│           │  - onModeStateChange    │                   │
│           └────────────┬────────────┘                   │
│                        │                                │
└────────────────────────┼────────────────────────────────┘
                         │
                         ▼
                ┌────────────────┐
                │  ConfigService  │
                │  (modes config) │
                └────────────────┘
```

## Implementation Details

### 1. ModeTreeProvider

**Responsibilities:**
- Visualize mode hierarchy as tree
- Show tool counts (total effective tools)
- Highlight active mode with icon/label
- Display inheritance relationships through tree structure
- Refresh on mode state changes

**Key Methods:**
```typescript
class ModeTreeProvider implements vscode.TreeDataProvider<ModeTreeItem> {
  // TreeDataProvider interface
  getTreeItem(element: ModeTreeItem): vscode.TreeItem
  getChildren(element?: ModeTreeItem): ModeTreeItem[]

  // Refresh mechanism
  refresh(): void

  // Private helpers
  private _buildTree(): ModeTreeItem[]
  private _createTreeItem(modeInfo: ModeInfo): ModeTreeItem
}
```

**ModeTreeItem:**
```typescript
class ModeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly modeInfo: ModeInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  )

  // Visual properties
  label: string                    // Mode name
  description: string              // Tool count (e.g., "12 tools")
  tooltip: string                  // Detailed info (inherited, added, excluded counts)
  iconPath: vscode.ThemeIcon       // Active: "circle-filled", Inactive: "circle-outline"
  contextValue: string             // For command enablement ("mode-active" | "mode-inactive")
}
```

**Tree Structure:**
- Root modes (no parent) at top level
- Child modes nested under parent
- Use `collapsibleState` to show/hide children
- Indentation automatically handled by VS Code

### 2. Mode Commands

**Command: `agency.switchMode`**
- **ID:** `agency.switchMode`
- **Title:** "Switch to Mode"
- **Context:** Available on any mode tree item
- **Implementation:**
  1. Get mode ID from tree item
  2. Confirm switch if current mode will change
  3. Call `modeService.setCurrentMode({ modeId, persist: false })`
  4. Show success/error message with tool changes
  5. Provider auto-refreshes via event listener

**Command: `agency.viewModeTools`**
- **ID:** `agency.viewModeTools`
- **Title:** "View Mode Tools"
- **Context:** Available on any mode tree item
- **Implementation:**
  1. Get mode from tree item
  2. Show QuickPick with list of effective tools
  3. Display inherited vs added tools
  4. Group by source (inherited/added) with separators

**Command: `agency.refreshModes`**
- **ID:** `agency.refreshModes`
- **Title:** "Refresh Modes"
- **Context:** Available in view title
- **Implementation:**
  1. Call `provider.refresh()`
  2. Updates tree from current config

### 3. Mode Inheritance Visualization

**Visual Indicators:**
- **Icon:**
  - Active mode: `$(circle-filled)` (ThemeIcon: "circle-filled")
  - Inactive mode: `$(circle-outline)` (ThemeIcon: "circle-outline")
- **Label:** Mode name
- **Description:** Tool count (e.g., "8 tools")
- **Tooltip:** Detailed breakdown:
  ```
  Mode: debug
  Status: Active
  Total Tools: 12
  Inherited: 8 (from 'default')
  Added: 4
  Excluded: 0
  ```

**Tree Depth:**
- Automatically shown via VS Code tree indentation
- Use `ModeInfo.depth` to validate tree structure

## Integration Points

### With ModeService
- **Read:** `buildModeTree()` to get hierarchy
- **Read:** `getCurrentMode()` to highlight active
- **Write:** `setCurrentMode()` to switch modes
- **Listen:** `onModeStateChange` to auto-refresh tree

### With VS Code Extension
- **Register provider:** `vscode.window.registerTreeDataProvider('agency.modes', provider)`
- **Register commands:** `vscode.commands.registerCommand(...)`
- **Contribute views:** Already defined in parent epic's package.json manifest

### With ConfigService
- Indirectly via ModeService (no direct dependency)
- Config changes trigger ModeService events → tree refresh

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tree structure | Use ModeInfo.children | Aligns with ModeService.buildModeTree() output |
| Tool counts | Show effective tools | Most useful for users to see final count |
| Refresh strategy | Event-driven | Auto-update on mode changes, manual refresh available |
| Mode persistence | Memory-only (persist: false) | Config schema doesn't support isDefault field yet |
| Icon library | VS Code Codicons | Consistent with extension ecosystem |

## Dependencies

### Runtime
- **ModeService** (existing): Mode state and tree building
- **VS Code Extension API**: TreeDataProvider, commands

### Types
- **mode.ts** (existing): ModeInfo, ModeConfig, ModeSwitchRequest, ModeSwitchResult
- **vscode**: TreeDataProvider, TreeItem, ThemeIcon, Event

## Testing Strategy

| Layer | Test Cases | Tools |
|-------|------------|-------|
| ModeTreeProvider | Tree structure, item creation, refresh, event handling | vitest + mock ModeService |
| mode-commands | Switch mode, view tools, error handling | vitest + mock ModeService + mock VS Code API |
| Integration | Full flow: render → switch → refresh | vitest + VS Code test helpers |

**Key Test Scenarios:**
1. **Flat mode list** (no inheritance): All items at root level
2. **Simple inheritance** (parent → child): Child nested under parent
3. **Deep inheritance** (parent → child → grandchild): Multiple nesting levels
4. **Active mode highlight**: Correct icon and contextValue
5. **Tool count accuracy**: Matches ModeInfo.effectiveTools.length
6. **Mode switch success**: Updates active mode, refreshes tree
7. **Mode switch failure**: Shows error, no state change
8. **View tools**: Displays correct tool list with grouping

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tree render time | < 100ms | Extension host profiling |
| Mode switch latency | < 50ms | Command execution time |
| Test coverage | > 90% | vitest coverage report |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large mode trees (100+ modes) | Medium | Lazy loading (already handled by VS Code TreeDataProvider) |
| Circular inheritance | High | ModeService already validates, provider displays validation errors |
| Mode config changes during render | Low | Use event-driven refresh, atomic state reads |

---

*Generated by speckit*
