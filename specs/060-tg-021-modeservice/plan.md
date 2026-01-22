# Implementation Plan: ModeService

**Feature**: Mode management service for the Agency VS Code Extension
**Branch**: `060-tg-021-modeservice`
**Status**: Complete

## Summary

This task implements the `ModeService` - a core service responsible for managing modes (tool availability configurations) in the Agency VS Code extension. The service handles mode retrieval, switching, inheritance resolution, tree building, and validation of mode configurations.

## Technical Context

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| VS Code Extension API | 1.85+ | Extension framework |
| zod | 3.x | Runtime schema validation (for config) |
| Node.js | 20+ | Runtime environment |

## Parent Epic Context

This task is part of **Epic #38: Agency VS Code Extension**, specifically **Phase 7: Mode Management** (TG-021).

The Agency extension provides:
- Plugin configuration UI
- In-situ MCP tool testing
- Activity monitoring
- Dev container management
- **Mode management** (this task)

Modes control which MCP tools are active. They support inheritance, allowing modes to extend parent modes with additional or excluded tools.

## Project Structure

```
packages/agency-extension/
└── src/
    ├── services/
    │   ├── index.ts                      # Service exports (add ModeService)
    │   ├── ConfigService.ts              # Existing - provides mode config access
    │   └── ModeService.ts                # NEW - mode management logic
    ├── types/
    │   └── mode.ts                       # Existing - ModeConfig, ModeInfo, etc.
    └── __tests__/
        └── services/
            └── ModeService.test.ts       # NEW - service unit tests
```

## Architecture

```
┌─────────────────────────────────────────┐
│          ModeService                    │
├─────────────────────────────────────────┤
│                                         │
│  getModes() ──────────┐                │
│  getCurrentMode() ────┼─── Query       │
│  getMode(id)          │                │
│                       │                │
│  setCurrentMode(id)   ├─── Mutation    │
│                       │                │
│  buildModeTree()      ├─── Tree Ops    │
│  resolveInheritance() │                │
│                       │                │
│  validate()           └─── Validation  │
│                                         │
└────────────┬────────────────────────────┘
             │
             ↓
      ┌─────────────┐
      │ConfigService│ (read modes[], write currentModeId)
      └─────────────┘
```

## Key Interfaces

### ModeService Interface
```typescript
interface IModeService {
  /**
   * Get all available modes with inheritance resolved.
   */
  getModes(): ModeInfo[];

  /**
   * Get a specific mode by ID.
   */
  getMode(id: string): ModeInfo | undefined;

  /**
   * Get the currently active mode.
   */
  getCurrentMode(): ModeInfo;

  /**
   * Set the current active mode.
   * Returns result with tool diff (added/removed).
   */
  setCurrentMode(modeId: string): Promise<ModeSwitchResult>;

  /**
   * Build a hierarchical tree of modes for visualization.
   */
  buildModeTree(): ModeTreeNode[];

  /**
   * Validate all mode configurations.
   * Checks for circular inheritance, missing parents, etc.
   */
  validate(): ModeValidationResult;

  /**
   * Event fired when the active mode changes.
   */
  onModeChange: Event<ModeStateEvent>;

  /**
   * Dispose resources.
   */
  dispose(): void;
}
```

### Core Algorithm: Inheritance Resolution

**Goal**: Compute `effectiveTools` for a mode by:
1. Starting with the mode's parent (if any)
2. Applying the parent's `effectiveTools` as the base
3. Adding tools from `includedTools`
4. Removing tools from `excludedTools`

**Pseudocode**:
```
function resolveInheritance(mode: ModeConfig, modes: ModeConfig[]): string[] {
  if mode has no parent:
    return unique(mode.includedTools)

  parentMode = find mode by mode.parentId in modes
  if not found:
    throw error "Missing parent"

  parentEffectiveTools = resolveInheritance(parentMode, modes)

  effectiveTools = new Set(parentEffectiveTools)

  for tool in mode.includedTools:
    effectiveTools.add(tool)

  for tool in mode.excludedTools:
    effectiveTools.delete(tool)

  return Array.from(effectiveTools)
}
```

**Circular Dependency Detection**:
- Track visited mode IDs during recursion
- If a mode ID is seen twice in the same chain, throw "circular inheritance"

### Tree Building

**Goal**: Create a hierarchical `ModeTreeNode[]` for UI display.

**Approach**:
1. Build a map: `modeId -> ModeInfo`
2. Identify root modes (those with no `parentId`)
3. For each root, recursively attach children
4. Compute tool counts (inherited, added, excluded)

**Pseudocode**:
```
function buildModeTree(modes: ModeInfo[]): ModeTreeNode[] {
  modeMap = keyBy(modes, 'config.id')
  roots = modes.filter(m => !m.config.parentId)

  return roots.map(root => buildNode(root, modeMap))
}

function buildNode(mode: ModeInfo, modeMap: Map): ModeTreeNode {
  children = modes.filter(m => m.config.parentId === mode.config.id)

  inheritedTools = mode.parent ? mode.parent.effectiveTools.length : 0
  addedTools = mode.config.includedTools.length
  excludedTools = mode.config.excludedTools.length

  return {
    id: mode.config.id,
    name: mode.config.name,
    description: mode.config.description,
    toolCount: mode.effectiveTools.length,
    inheritedToolCount: inheritedTools,
    addedToolCount: addedTools,
    excludedToolCount: excludedTools,
    isActive: mode.isActive,
    children: children.map(c => buildNode(c, modeMap)),
    parentId: mode.config.parentId,
  }
}
```

### Validation Rules

| Rule | Error Code | Description |
|------|------------|-------------|
| Circular inheritance | `circular_inheritance` | Mode A → B → C → A |
| Missing parent | `missing_parent` | Mode references parentId that doesn't exist |
| Duplicate ID | `duplicate_id` | Two modes with same ID |
| Invalid tool reference | `invalid_tool` | Tool name doesn't exist in available tools (warning only) |

## Implementation Steps

### 1. Implement ModeService Core (2-3 hours)

**File**: `packages/agency-extension/src/services/ModeService.ts`

**Tasks**:
- [ ] Create `ModeService` class with singleton pattern
- [ ] Inject `ConfigService` dependency
- [ ] Implement `getModes()`:
  - Load mode configs from ConfigService
  - Resolve inheritance for each mode
  - Determine which mode is active (from config or default)
  - Build `ModeInfo[]` array
- [ ] Implement `getMode(id)`: Filter `getModes()` by ID
- [ ] Implement `getCurrentMode()`: Return the active mode from `getModes()`
- [ ] Implement `setCurrentMode(modeId)`:
  - Validate mode exists
  - Compute tool diff (added/removed)
  - Save `currentModeId` to ConfigService
  - Emit `ModeStateEvent`
  - Return `ModeSwitchResult`
- [ ] Implement `resolveInheritance(mode, allModes)`:
  - Recursive resolution with visited tracking
  - Throw error on circular dependency
- [ ] Implement `buildModeTree()`:
  - Build hierarchy from root modes
  - Compute tool counts for each node
- [ ] Implement `validate()`:
  - Check for circular inheritance
  - Check for missing parents
  - Check for duplicate IDs
  - Return `ModeValidationResult`
- [ ] Implement event emitter for `onModeChange`
- [ ] Implement `dispose()` to clean up event listeners

### 2. Write Unit Tests (1 hour)

**File**: `packages/agency-extension/src/__tests__/services/ModeService.test.ts`

**Test Cases**:
- [ ] `getModes()` returns all modes with resolved inheritance
- [ ] `getMode(id)` returns specific mode or undefined
- [ ] `getCurrentMode()` returns the active mode
- [ ] `setCurrentMode(id)` switches mode and fires event
- [ ] `resolveInheritance()` handles simple inheritance (A → B)
- [ ] `resolveInheritance()` handles deep inheritance (A → B → C)
- [ ] `resolveInheritance()` applies includedTools and excludedTools correctly
- [ ] `resolveInheritance()` detects circular inheritance
- [ ] `buildModeTree()` creates correct hierarchy
- [ ] `buildModeTree()` computes correct tool counts
- [ ] `validate()` detects circular inheritance
- [ ] `validate()` detects missing parent
- [ ] `validate()` detects duplicate IDs
- [ ] `onModeChange` event fires when mode switches

### 3. Export from index.ts (5 minutes)

**File**: `packages/agency-extension/src/services/index.ts`

**Tasks**:
- [ ] Export `ModeService` from the services barrel file

## Dependencies

### Internal Dependencies
- `ConfigService` - for reading mode configs and saving currentModeId
- `types/mode.ts` - for `ModeConfig`, `ModeInfo`, `ModeTreeNode`, etc.
- `utils/logger.ts` - for scoped logging
- `utils/disposable.ts` - for event listener cleanup

### External Dependencies
None (uses existing dependencies).

## Testing Strategy

| Layer | Approach | Tools |
|-------|----------|-------|
| Unit tests | Service methods with mock ConfigService | vitest |
| Integration tests | N/A (service is pure logic) | - |

**Test Data**: Create fixture mode configs with various inheritance patterns:
- Root modes (no parent)
- Single-level inheritance
- Multi-level inheritance
- Circular inheritance (for error cases)
- Missing parent (for error cases)

## Success Criteria

- [ ] All unit tests pass
- [ ] Service handles circular inheritance without crashing
- [ ] Service correctly resolves multi-level inheritance
- [ ] Service validates mode configurations
- [ ] Service emits events on mode switch
- [ ] `buildModeTree()` produces correct hierarchy
- [ ] Code passes TypeScript strict checks
- [ ] Code follows existing service patterns (singleton, event emitters)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Circular inheritance causes stack overflow | High | Implement visited tracking in resolveInheritance |
| Large mode trees cause performance issues | Low | Keep tree building lazy (only when requested) |
| Mode config schema changes | Medium | Use Zod validation in ConfigService |

## Integration Points

After ModeService is implemented, the following will integrate with it:
- **TG-022**: `ModeTreeProvider` will call `getModes()` and `buildModeTree()`
- **TG-022**: `mode-commands.ts` will call `setCurrentMode()`
- Extension activation will initialize ModeService singleton

---

*Generated by speckit*
