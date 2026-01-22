# Data Model: ModeService

## Overview

This document defines the core data structures used by the ModeService. All types are already defined in `/packages/agency-extension/src/types/mode.ts` - this document provides additional context and relationships.

## Core Entities

### ModeConfig
**Definition**: `/packages/agency-extension/src/types/mode.ts:9-30`

Configuration for a mode, stored in `.agency/agency.config.json`.

```typescript
interface ModeConfig {
  id: string;                    // Unique identifier (e.g., "default", "debug")
  name: string;                  // Display name (e.g., "Default Mode")
  description?: string;          // Optional description
  parentId?: string;             // Parent mode for inheritance (null = root)
  includedTools: string[];       // Tools to include (e.g., ["Read", "Write"])
  excludedTools: string[];       // Tools to exclude from parent
  isDefault?: boolean;           // Whether this is the default mode
}
```

**Storage**: Array in `AgencyConfig.modes[]`

**Example**:
```json
{
  "id": "debug",
  "name": "Debug Mode",
  "description": "Extended tool access for debugging",
  "parentId": "default",
  "includedTools": ["Bash", "WebFetch"],
  "excludedTools": [],
  "isDefault": false
}
```

**Constraints**:
- `id` must be unique across all modes
- `parentId` must reference an existing mode (if not null)
- No circular inheritance chains (A → B → A)

---

### ModeInfo
**Definition**: `/packages/agency-extension/src/types/mode.ts:35-53`

Runtime representation of a mode with resolved inheritance.

```typescript
interface ModeInfo {
  config: ModeConfig;            // The original config
  effectiveTools: string[];      // Tools after inheritance resolution
  parent?: ModeInfo;             // Parent mode info (if has parent)
  children: ModeInfo[];          // Child modes
  depth: number;                 // Depth in tree (0 = root)
  isActive: boolean;             // Whether this is the current active mode
}
```

**Computed Fields**:
- `effectiveTools`: Computed by resolving inheritance chain
- `depth`: Computed by counting ancestors
- `isActive`: Set based on `AgencyConfig.currentModeId`

**Example**:
```typescript
{
  config: { id: "debug", parentId: "default", ... },
  effectiveTools: ["Read", "Write", "Edit", "Bash", "WebFetch"],
  parent: { config: { id: "default", ... }, ... },
  children: [],
  depth: 1,
  isActive: true
}
```

---

### ModeTreeNode
**Definition**: `/packages/agency-extension/src/types/mode.ts:58-88`

Node in the mode tree for UI visualization.

```typescript
interface ModeTreeNode {
  id: string;                    // Mode ID
  name: string;                  // Display name
  description?: string;          // Description
  toolCount: number;             // Total effective tools
  inheritedToolCount: number;    // Tools from parent
  addedToolCount: number;        // Tools added in this mode
  excludedToolCount: number;     // Tools excluded in this mode
  isActive: boolean;             // Whether active
  children: ModeTreeNode[];      // Child nodes
  parentId?: string;             // Parent ID (for reference)
}
```

**Computed Fields**:
- `toolCount`: `effectiveTools.length`
- `inheritedToolCount`: `parent.effectiveTools.length` (if has parent)
- `addedToolCount`: `includedTools.length`
- `excludedToolCount`: `excludedTools.length`

---

### ModeSwitchResult
**Definition**: `/packages/agency-extension/src/types/mode.ts:104-125`

Result of switching modes, including tool diff.

```typescript
interface ModeSwitchResult {
  success: boolean;              // Whether switch succeeded
  previousModeId: string;        // Previous mode
  newModeId: string;             // New mode
  addedTools: string[];          // Tools now available
  removedTools: string[];        // Tools now unavailable
  error?: string;                // Error message if failed
  timestamp: number;             // When the switch occurred
}
```

**Usage**: Returned by `setCurrentMode()` to inform caller of changes.

---

### ModeValidationResult
**Definition**: `/packages/agency-extension/src/types/mode.ts:130-139`

Result of validating all mode configurations.

```typescript
interface ModeValidationResult {
  valid: boolean;                // Whether all modes are valid
  errors: ModeValidationError[]; // Critical errors
  warnings: ModeValidationWarning[]; // Non-critical warnings
}
```

**Error Codes**:
- `circular_inheritance`: Mode A → B → C → A
- `missing_parent`: Parent mode doesn't exist
- `duplicate_id`: Two modes have the same ID
- `invalid_tool`: Tool doesn't exist (warning only)

---

### ModeStateEvent
**Definition**: `/packages/agency-extension/src/types/mode.ts:172-184`

Event emitted when mode state changes.

```typescript
interface ModeStateEvent {
  type: 'activated' | 'deactivated' | 'updated' | 'created' | 'deleted';
  modeId: string;
  modeInfo?: ModeInfo;
  timestamp: number;
}
```

**Event Types**:
- `activated`: Mode became active via `setCurrentMode()`
- `deactivated`: Mode is no longer active
- `updated`: Mode config changed
- `created`: New mode added
- `deleted`: Mode removed

---

## Relationships

```
AgencyConfig (ConfigService)
    │
    ├─ modes: ModeConfig[]         // Raw config
    └─ currentModeId: string       // Active mode ID

                ↓ (ModeService processes)

ModeInfo[]                         // Runtime representation
    │
    ├─ parent → ModeInfo           // Inheritance link
    ├─ children → ModeInfo[]       // Reverse link
    └─ effectiveTools: string[]    // Resolved tools

                ↓ (ModeService.buildModeTree)

ModeTreeNode[]                     // Tree for UI
    │
    └─ children → ModeTreeNode[]   // Hierarchical structure
```

## Inheritance Resolution Algorithm

**Input**: `ModeConfig` + array of all `ModeConfig[]`

**Output**: `effectiveTools: string[]`

**Algorithm**:
```
function resolveInheritance(
  mode: ModeConfig,
  allModes: ModeConfig[],
  visited: Set<string> = new Set()
): string[] {
  // Detect circular inheritance
  if (visited.has(mode.id)) {
    throw new Error(`Circular inheritance detected: ${Array.from(visited).join(' → ')} → ${mode.id}`);
  }

  visited.add(mode.id);

  // Base case: root mode (no parent)
  if (!mode.parentId) {
    return Array.from(new Set(mode.includedTools));
  }

  // Find parent
  const parent = allModes.find(m => m.id === mode.parentId);
  if (!parent) {
    throw new Error(`Missing parent mode: ${mode.parentId}`);
  }

  // Recursively resolve parent
  const parentTools = resolveInheritance(parent, allModes, visited);

  // Apply inheritance
  const effectiveTools = new Set(parentTools);

  // Add included tools
  for (const tool of mode.includedTools) {
    effectiveTools.add(tool);
  }

  // Remove excluded tools
  for (const tool of mode.excludedTools) {
    effectiveTools.delete(tool);
  }

  return Array.from(effectiveTools);
}
```

**Example**:
```
Modes:
  - default: includedTools: ["Read", "Write"]
  - debug: parentId: "default", includedTools: ["Bash"], excludedTools: []
  - restricted: parentId: "default", includedTools: [], excludedTools: ["Write"]

Resolved:
  - default.effectiveTools = ["Read", "Write"]
  - debug.effectiveTools = ["Read", "Write", "Bash"]
  - restricted.effectiveTools = ["Read"]
```

## Validation Rules

| Rule | Severity | Check |
|------|----------|-------|
| Unique IDs | Error | No two modes have the same `id` |
| Valid parent | Error | `parentId` references an existing mode |
| No circular inheritance | Error | No mode inheritance cycles |
| Non-empty mode | Warning | At least one tool in `effectiveTools` |
| Valid tool names | Warning | Tools exist in available tool list |

## Storage Format

Modes are stored in `.agency/agency.config.json`:

```json
{
  "version": "1.0.0",
  "currentModeId": "default",
  "modes": [
    {
      "id": "default",
      "name": "Default Mode",
      "description": "Standard tool access",
      "includedTools": ["Read", "Write", "Edit", "Grep", "Glob"],
      "excludedTools": [],
      "isDefault": true
    },
    {
      "id": "debug",
      "name": "Debug Mode",
      "description": "Extended tool access for debugging",
      "parentId": "default",
      "includedTools": ["Bash", "WebFetch"],
      "excludedTools": []
    }
  ],
  "plugins": [...],
  "containers": [...]
}
```

---

*Generated by speckit*
