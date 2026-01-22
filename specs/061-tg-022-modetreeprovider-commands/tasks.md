# Tasks: ModeTreeProvider & Commands

**Input**: Design documents from `/specs/061-tg-022-modetreeprovider-commands/`
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (Mode Management)

## Phase 1: Setup & Core Provider

### T001 Create ModeTreeProvider file structure
**File**: `packages/agency-extension/src/providers/ModeTreeProvider.ts`
- [X] Create new file with class skeleton
- [X] Import required dependencies (vscode, ModeService, types)
- [X] Set up TreeDataProvider interface implementation

---

### T002 [P] Create mode-commands file structure
**File**: `packages/agency-extension/src/commands/mode-commands.ts`
- [X] Create new file with command function exports
- [X] Import required dependencies (vscode, ModeService, types)
- [X] Set up command registration structure

---

### T003 Implement ModeTreeItem class
**File**: `packages/agency-extension/src/providers/ModeTreeProvider.ts`
- [X] Create `ModeTreeItem` extending `vscode.TreeItem`
- [X] Constructor accepting `ModeInfo` and `collapsibleState`
- [X] Set label, description (tool count), tooltip (detailed info)
- [X] Set icon based on active state (circle-filled vs circle-outline)
- [X] Set contextValue ("mode-active" or "mode-inactive")

---

### T004 Implement ModeTreeProvider core methods
**File**: `packages/agency-extension/src/providers/ModeTreeProvider.ts`
- [X] Implement `getTreeItem(element)` returning the ModeTreeItem
- [X] Implement `getChildren(element?)` returning children or roots
- [X] Private method `_buildTree()` calling `modeService.buildModeTree()`
- [X] Private method `_createTreeItem(modeInfo)` creating ModeTreeItem from ModeInfo
- [X] Handle tree structure: roots at top level, children nested

---

## Phase 2: Refresh & Event Handling

### T005 Implement refresh mechanism
**File**: `packages/agency-extension/src/providers/ModeTreeProvider.ts`
- [X] Add `_onDidChangeTreeData` event emitter
- [X] Expose `onDidChangeTreeData` event property
- [X] Implement `refresh()` method that fires the event
- [X] Subscribe to `modeService.onModeStateChange` in constructor
- [X] Call `refresh()` on mode state changes

---

## Phase 3: Mode Commands

### T006 Implement agency.switchMode command
**File**: `packages/agency-extension/src/commands/mode-commands.ts`
- [X] Export `switchMode(modeTreeItem: ModeTreeItem)` function
- [X] Extract mode ID from tree item
- [X] Call `modeService.setCurrentMode({ modeId, persist: false })`
- [X] Show information message with tool changes (added/removed)
- [X] Show error message if switch fails
- [X] Provider auto-refreshes via event listener

---

### T007 Implement agency.viewModeTools command
**File**: `packages/agency-extension/src/commands/mode-commands.ts`
- [X] Export `viewModeTools(modeTreeItem: ModeTreeItem)` function
- [X] Extract mode info from tree item
- [X] Get `effectiveTools` array from mode info
- [X] Calculate inherited vs added tools (compare with parent if exists)
- [X] Show QuickPick with tool list
- [X] Use separators to group inherited vs added tools
- [X] Display tool count in QuickPick title

---

### T008 Implement agency.refreshModes command
**File**: `packages/agency-extension/src/commands/mode-commands.ts`
- [X] Export `refreshModes()` function
- [X] Get ModeTreeProvider instance
- [X] Call `provider.refresh()`
- [X] Show brief info message confirming refresh

---

## Phase 4: Integration & Registration

### T009 Update providers/index.ts
**File**: `packages/agency-extension/src/providers/index.ts`
- [X] Export ModeTreeProvider and ModeTreeItem
- [X] Add JSDoc comments for public API

---

### T010 Update commands/index.ts
**File**: `packages/agency-extension/src/commands/index.ts`
- [X] Import mode commands (switchMode, viewModeTools, refreshModes)
- [X] Register commands in the exported registration function
- [X] Add command registrations:
  - [X] `agency.switchMode` → `switchMode`
  - [X] `agency.viewModeTools` → `viewModeTools`
  - [X] `agency.refreshModes` → `refreshModes`
- [X] Pass ModeTreeProvider instance to commands that need it

---

### T011 Register ModeTreeProvider in extension.ts
**File**: `packages/agency-extension/src/extension.ts`
- [X] Import ModeTreeProvider
- [X] Create provider instance in `activate()`
- [X] Call `vscode.window.registerTreeDataProvider('agency.modes', provider)`
- [X] Add registration to disposables array
- [X] Initialize provider after ModeService is initialized

---

## Phase 5: Tests

### T012 [P] Write ModeTreeProvider tests
**File**: `packages/agency-extension/src/__tests__/providers/ModeTreeProvider.test.ts`
- [X] Test tree structure with flat mode list (no inheritance)
- [X] Test tree structure with simple inheritance (parent → child)
- [X] Test tree structure with deep inheritance (3+ levels)
- [X] Test active mode highlighting (icon, contextValue)
- [X] Test tool count accuracy (matches effectiveTools.length)
- [X] Test refresh mechanism and event firing
- [X] Mock ModeService with test data
- [X] 35 tests passing

---

### T013 [P] Write mode-commands tests
**File**: `packages/agency-extension/src/__tests__/commands/mode-commands.test.ts`
- [X] Test switchMode success: updates active mode, shows success message
- [X] Test switchMode failure: shows error message, no state change
- [X] Test viewModeTools: displays correct tool list
- [X] Test viewModeTools with inheritance: shows inherited vs added grouping
- [X] Test refreshModes: calls provider.refresh()
- [X] Mock VS Code API (showInformationMessage, showQuickPick)
- [X] Mock ModeService for each test scenario
- [X] 23 tests passing

---

## Dependencies & Execution Order

### Sequential Dependencies
1. **T001, T002** (Setup) → Must complete before implementing features
2. **T003, T004** (Provider core) → Required before T005 (refresh)
3. **T005** (Refresh) → Required before T011 (registration)
4. **T006-T008** (Commands) → Can start after T003 (need ModeTreeItem type)
5. **T009-T011** (Integration) → Requires all implementations complete
6. **T012-T013** (Tests) → Can run in parallel, after implementations exist

### Parallel Opportunities

**Phase 1**: T002 can run in parallel with T001 (different files)

**Phase 5**: T012 and T013 can run in parallel (different test files, independent test suites)

### Critical Path
```
T001 → T003 → T004 → T005 → T009 → T011
```

### Off Critical Path (can parallelize)
```
T002 → T006, T007, T008 → T010 → T011
```

### Test Path (parallel with integration)
```
T012 [parallel] T013
```

## Implementation Notes

1. **ModeService Integration**: Use existing `ModeService.getInstance()` singleton
2. **Type Safety**: Use `ModeInfo` and `ModeConfig` types from `types/mode.ts`
3. **Event Handling**: Subscribe to mode state changes in provider constructor
4. **Error Handling**: Gracefully handle missing modes, invalid switches
5. **VS Code Patterns**: Follow VS Code extension best practices (dispose, context)
6. **Inheritance Visualization**: Tree structure automatically shows depth via indentation

## Estimated Completion Time

- **Phase 1**: 1 hour (setup and core provider)
- **Phase 2**: 30 minutes (refresh mechanism)
- **Phase 3**: 1 hour (three commands)
- **Phase 4**: 30 minutes (integration and registration)
- **Phase 5**: 1 hour (comprehensive tests)

**Total**: ~4 hours

---

*Generated by speckit*
