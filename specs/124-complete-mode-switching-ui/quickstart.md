# Quickstart: Mode Switching UI

## Installation

The mode switching UI is part of the Agency VS Code extension. No additional installation required.

## Prerequisites

1. Agency VS Code extension installed and activated
2. `.agency/agency.config.json` in workspace root with mode definitions

Example mode configuration:

```json
{
  "modes": [
    {
      "id": "default",
      "name": "Default",
      "description": "All tools enabled",
      "includedTools": ["*"],
      "excludedTools": [],
      "isDefault": true
    },
    {
      "id": "development",
      "name": "Development",
      "description": "Dev and debug tools only",
      "parentId": "default",
      "includedTools": [],
      "excludedTools": ["deploy", "production"]
    },
    {
      "id": "review",
      "name": "Code Review",
      "description": "Read-only tools for review",
      "includedTools": ["read", "search", "analyze"],
      "excludedTools": []
    }
  ]
}
```

## Usage

### Switch Mode via Command Palette

1. Open Command Palette: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type: `Agency: Switch Mode`
3. Select desired mode from the list
4. Mode switches immediately

### Switch Mode via Status Bar

1. Look at the right side of VS Code status bar
2. Click the mode indicator (shows current mode name)
3. Select desired mode from the quick pick
4. Mode switches immediately

### Switch Mode via Tree View

1. Open Agency sidebar (click Agency icon in activity bar)
2. Expand the "Modes" section
3. Click on any mode to switch to it
4. Active mode shows a filled circle icon

### View Mode Tools

1. Open Command Palette
2. Type: `Agency: View Mode Tools`
3. Select a mode to inspect
4. See categorized tool list:
   - Added tools (new in this mode)
   - Inherited tools (from parent mode)
   - Excluded tools (disabled in this mode)

## Available Commands

| Command | Description |
|---------|-------------|
| `agency.switchMode` | Open mode picker and switch |
| `agency.viewModeTools` | View tools in a mode |
| `agency.refreshModes` | Refresh mode tree view |

## Configuration

### VS Code Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `agency.currentMode` | string | - | Persisted mode (set automatically on switch) |

### Mode Configuration

Modes are defined in `.agency/agency.config.json`:

```typescript
interface ModeConfig {
  id: string;           // Unique identifier
  name: string;         // Display name
  description?: string; // Optional description
  parentId?: string;    // Parent mode for inheritance
  includedTools: string[]; // Tools to include
  excludedTools: string[]; // Tools to exclude
  isDefault?: boolean;  // Mark as default mode
}
```

## Troubleshooting

### Mode not switching

1. Check Output → "Agency" channel for errors
2. Verify mode exists in `agency.config.json`
3. Ensure MCP server is connected

### Status bar not showing mode

1. Check if extension is activated (workspace has `.agency/agency.config.json`)
2. Try reloading VS Code window: `Developer: Reload Window`

### Mode not persisting

1. Check if workspace has write permissions
2. Verify `.vscode/settings.json` is not read-only
3. Check for VS Code settings sync conflicts

### Tree view empty

1. Verify `agency.config.json` has valid mode definitions
2. Check Output → "Agency" for configuration errors
3. Try: `Agency: Refresh Modes` command

## Best Practices

1. **Define a default mode**: Mark one mode as `isDefault: true` for predictable first-launch behavior

2. **Use inheritance**: Create base modes and extend them to reduce duplication:
   ```json
   {
     "id": "base",
     "includedTools": ["read", "write", "search"]
   },
   {
     "id": "extended",
     "parentId": "base",
     "includedTools": ["deploy"]
   }
   ```

3. **Descriptive names**: Use clear names that indicate the mode's purpose

4. **Test mode switches**: After changing config, verify modes work as expected

5. **Document modes**: Add descriptions to help team members understand each mode's purpose
