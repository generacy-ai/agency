# Quickstart: ModeService

## Overview

The `ModeService` manages modes in the Agency VS Code extension. Modes control which MCP tools are available to agents. This guide shows how to use the service.

## Installation

No installation needed - `ModeService` is part of the Agency extension.

## Usage

### 1. Initialize the Service

The service is a singleton, initialized during extension activation:

```typescript
import { ModeService } from './services';

// In extension activation
const modeService = ModeService.getInstance();
```

### 2. Get All Modes

```typescript
const modes = modeService.getModes();

for (const mode of modes) {
  console.log(`Mode: ${mode.config.name}`);
  console.log(`  Tools: ${mode.effectiveTools.join(', ')}`);
  console.log(`  Active: ${mode.isActive}`);
}
```

### 3. Get Current Mode

```typescript
const currentMode = modeService.getCurrentMode();
console.log(`Current mode: ${currentMode.config.name}`);
console.log(`Available tools: ${currentMode.effectiveTools.join(', ')}`);
```

### 4. Switch Modes

```typescript
const result = await modeService.setCurrentMode('debug');

if (result.success) {
  console.log(`Switched from ${result.previousModeId} to ${result.newModeId}`);
  console.log(`Added tools: ${result.addedTools.join(', ')}`);
  console.log(`Removed tools: ${result.removedTools.join(', ')}`);
} else {
  console.error(`Failed to switch mode: ${result.error}`);
}
```

### 5. Listen for Mode Changes

```typescript
const disposable = modeService.onModeChange(event => {
  console.log(`Mode event: ${event.type}`);
  console.log(`Mode ID: ${event.modeId}`);

  if (event.type === 'activated') {
    console.log(`Mode activated: ${event.modeInfo?.config.name}`);
  }
});

// Later, clean up
disposable.dispose();
```

### 6. Build Mode Tree for UI

```typescript
const tree = modeService.buildModeTree();

function printTree(nodes: ModeTreeNode[], indent = 0) {
  for (const node of nodes) {
    const prefix = '  '.repeat(indent);
    console.log(`${prefix}${node.name} (${node.toolCount} tools)`);
    if (node.children.length > 0) {
      printTree(node.children, indent + 1);
    }
  }
}

printTree(tree);

// Output:
// Default Mode (5 tools)
//   Debug Mode (7 tools)
//   Restricted Mode (1 tool)
```

### 7. Validate Mode Configurations

```typescript
const validation = modeService.validate();

if (!validation.valid) {
  console.error('Invalid mode configuration:');
  for (const error of validation.errors) {
    console.error(`  ${error.modeId}: ${error.message}`);
  }
}

if (validation.warnings.length > 0) {
  console.warn('Mode configuration warnings:');
  for (const warning of validation.warnings) {
    console.warn(`  ${warning.modeId}: ${warning.message}`);
  }
}
```

## Configuration Example

Modes are configured in `.agency/agency.config.json`:

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
    },
    {
      "id": "restricted",
      "name": "Restricted Mode",
      "description": "Minimal tool access",
      "parentId": "default",
      "includedTools": [],
      "excludedTools": ["Write", "Edit", "Bash"]
    }
  ]
}
```

**Result after inheritance resolution**:
- `default`: 5 tools (Read, Write, Edit, Grep, Glob)
- `debug`: 7 tools (Read, Write, Edit, Grep, Glob, Bash, WebFetch)
- `restricted`: 2 tools (Read, Grep, Glob)

## Common Patterns

### Pattern 1: Check if Tool is Available in Current Mode

```typescript
const currentMode = modeService.getCurrentMode();
const hasWriteAccess = currentMode.effectiveTools.includes('Write');

if (hasWriteAccess) {
  // Proceed with write operation
} else {
  vscode.window.showErrorMessage('Write tool not available in current mode');
}
```

### Pattern 2: React to Mode Changes

```typescript
class MyExtensionComponent {
  private modeDisposable: vscode.Disposable;

  constructor(private modeService: ModeService) {
    this.modeDisposable = modeService.onModeChange(event => {
      if (event.type === 'activated') {
        this.onModeActivated(event.modeInfo!);
      }
    });
  }

  private onModeActivated(mode: ModeInfo): void {
    // Update UI, refresh tool list, etc.
    console.log(`Switched to mode: ${mode.config.name}`);
  }

  dispose(): void {
    this.modeDisposable.dispose();
  }
}
```

### Pattern 3: Programmatically Create Mode Hierarchy

```typescript
// Define modes in ConfigService
await configService.saveModeConfig({
  id: 'base',
  name: 'Base Mode',
  includedTools: ['Read', 'Grep'],
  excludedTools: [],
});

await configService.saveModeConfig({
  id: 'extended',
  name: 'Extended Mode',
  parentId: 'base',
  includedTools: ['Write', 'Edit'],
  excludedTools: [],
});

// ModeService automatically resolves inheritance
const extended = modeService.getMode('extended');
// extended.effectiveTools = ['Read', 'Grep', 'Write', 'Edit']
```

## Troubleshooting

### Error: "Circular inheritance detected"

**Cause**: Mode A inherits from B, which inherits from C, which inherits from A.

**Solution**: Check your mode configurations and break the cycle:
```typescript
const validation = modeService.validate();
console.error(validation.errors); // Shows the circular path
```

### Error: "Missing parent mode"

**Cause**: Mode references a `parentId` that doesn't exist.

**Solution**: Either create the missing parent mode or set `parentId` to null.

### Warning: "Empty mode"

**Cause**: Mode has no effective tools after inheritance resolution.

**Solution**: Add tools to `includedTools` or choose a different parent mode.

## API Reference

| Method | Description | Returns |
|--------|-------------|---------|
| `getModes()` | Get all modes with resolved inheritance | `ModeInfo[]` |
| `getMode(id)` | Get a specific mode by ID | `ModeInfo \| undefined` |
| `getCurrentMode()` | Get the currently active mode | `ModeInfo` |
| `setCurrentMode(id)` | Switch to a different mode | `Promise<ModeSwitchResult>` |
| `buildModeTree()` | Build hierarchical tree for UI | `ModeTreeNode[]` |
| `validate()` | Validate all mode configurations | `ModeValidationResult` |
| `onModeChange` | Event fired when mode changes | `Event<ModeStateEvent>` |
| `dispose()` | Clean up resources | `void` |

## Next Steps

After implementing ModeService:
1. **TG-022**: Implement `ModeTreeProvider` to display modes in VS Code tree view
2. **TG-022**: Implement mode switching commands (`agency.switchMode`)
3. Integrate with tool execution logic to filter available tools

---

*Generated by speckit*
