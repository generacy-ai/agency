# Quickstart: Agency VS Code Extension

## Installation

### From VS Code Marketplace (Recommended)

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Agency"
4. Click Install

### From Source (Development)

```bash
# Clone the repository
git clone https://github.com/generacy-ai/agency.git
cd agency

# Install dependencies
pnpm install

# Build the extension
pnpm --filter @generacy-ai/agency-extension build

# Package the extension
cd packages/agency-extension
pnpm package

# Install the VSIX
code --install-extension agency-extension-*.vsix
```

## Initial Setup

### 1. Open a Project with Agency

The extension activates automatically in workspaces that have Agency configured.

### 2. Configure Plugins

1. Click the Agency icon in the Activity Bar (left sidebar)
2. Expand the "Plugins" section
3. Click on any plugin to configure it
4. Toggle plugins on/off as needed
5. Configuration is saved to `.agency/agency.config.json`

### 3. Connect to Dev Container

1. Ensure your dev container is running
2. In the "Containers" section, your container should appear
3. Click "Connect" to establish MCP connection
4. The "Tools" section will populate with available tools

## Usage

### Testing MCP Tools

1. **Browse Tools**: Expand the "Tools" section to see available tools by namespace
2. **Execute Tool**: Click on a tool to open the execution panel
3. **Enter Parameters**: Fill in the tool parameters (JSON editor with schema validation)
4. **Run**: Click "Execute" to run the tool
5. **View Results**: Results appear with syntax highlighting

```
Example: Testing the "source_control.commit" tool

1. Click "source_control.commit" in Tools panel
2. Enter parameters:
   {
     "message": "test commit",
     "files": ["README.md"]
   }
3. Click "Execute"
4. View the result in the output panel
```

### Monitoring Activity

1. **Open Activity Feed**: Click on the "Activity" section
2. **Real-time Updates**: Tool calls appear as they happen
3. **Filter**: Use the filter bar to narrow by:
   - Tool name
   - Namespace
   - Status (success/error)
   - Time range
4. **Expand Details**: Click any event to see inputs/outputs

### Managing Containers

| Action | How |
|--------|-----|
| Start Container | Right-click container → "Start" |
| Stop Container | Right-click container → "Stop" |
| Rebuild | Right-click container → "Rebuild" |
| View Logs | Right-click container → "View Logs" |

### Switching Modes

1. Open the "Modes" section
2. Current mode is highlighted
3. Click a different mode to switch
4. Tools panel updates to show available tools

## Configuration File

The extension stores configuration in `.agency/agency.config.json`:

```json
{
  "version": "1.0",
  "plugins": [
    {
      "id": "@generacy-ai/agency-plugin-git",
      "enabled": true,
      "settings": {}
    },
    {
      "id": "@generacy-ai/agency-plugin-npm",
      "enabled": true,
      "settings": {
        "registry": "https://registry.npmjs.org"
      }
    }
  ],
  "modes": [
    {
      "id": "development",
      "name": "Development",
      "tools": ["*"]
    },
    {
      "id": "readonly",
      "name": "Read Only",
      "tools": ["*.read", "*.list", "*.get"]
    }
  ],
  "containers": [
    {
      "id": "default",
      "name": "Dev Container",
      "devcontainerPath": ".devcontainer/devcontainer.json",
      "connection": {
        "command": "npx",
        "args": ["@generacy-ai/agency", "serve"]
      }
    }
  ]
}
```

## Commands

Access commands via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

| Command | Description |
|---------|-------------|
| `Agency: Configure Plugin` | Open plugin configuration panel |
| `Agency: Test Tool` | Open tool execution panel |
| `Agency: Refresh Tools` | Refresh tool list from MCP server |
| `Agency: Switch Mode` | Change active mode |
| `Agency: Start Container` | Start selected container |
| `Agency: Stop Container` | Stop selected container |
| `Agency: Rebuild Container` | Rebuild selected container |
| `Agency: View Container Logs` | Open container log viewer |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+A` | Focus Agency sidebar |
| `F5` (in tool panel) | Execute tool |
| `Escape` | Close current panel |

## Troubleshooting

### Extension Not Activating

1. Ensure you have a `.agency/` directory or `agency.config.json`
2. Check VS Code Output panel → "Agency" for errors
3. Try reloading VS Code window

### Cannot Connect to Container

1. Verify container is running: `docker ps`
2. Check container has MCP server installed
3. Verify connection settings in config file
4. Check container logs for MCP server errors

### Tools Not Appearing

1. Ensure MCP connection is established (green status indicator)
2. Click "Refresh Tools" button
3. Check if current mode allows the tools
4. Verify plugins are enabled

### Activity Feed Empty

1. Ensure you're connected to an MCP server
2. Execute a tool to see events
3. Check filter settings aren't hiding events
4. Verify Agency core is emitting events

## Getting Help

- **Documentation**: [https://agency.generacy.ai/docs](https://agency.generacy.ai/docs)
- **Issues**: [GitHub Issues](https://github.com/generacy-ai/agency/issues)
- **Community**: [Discord](https://discord.gg/generacy)

---

*Generated by speckit*
