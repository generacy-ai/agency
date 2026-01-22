# Agency VS Code Extension

**FREE** developer interface for Agency - enabling configuration, testing, and monitoring of the MCP server that powers AI agents.

## Features

### 1. Plugin Configuration UI
Manage Agency plugins through a visual interface:
- Browse available plugins
- Enable/disable plugins with one click
- Configure plugin-specific settings
- Validate configuration in real-time
- Configuration stored in `.agency/agency.config.json` (versionable, shareable)

### 2. In-Situ MCP Tool Testing
Test MCP tools against your actual dev container:
- Browse tools by category
- Execute tools with custom parameters
- View results with syntax highlighting
- Real dev container state (files, git, processes)
- Eliminates mock/real divergence in debugging

### 3. Dev Container Management
Control your development containers:
- Start/stop dev containers
- View container status and logs
- Rebuild containers
- Integrated with VS Code Remote Containers

### 4. Activity Feed
Monitor agent activity in real-time:
- See tool invocations as they happen
- View inputs and outputs
- Filter by tool, server, or time
- Track success/failure rates

### 5. Mode Management
Switch between tool configurations:
- View and switch modes
- See active tools per mode
- Mode inheritance visualization

## Getting Started

### Prerequisites
- VS Code 1.85.0 or later
- Docker (for dev container support)
- Agency MCP server running in your dev container

### Installation

1. Install from the VS Code Marketplace:
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
   - Search for "Agency"
   - Click Install

2. Initialize Agency in your project:
   ```bash
   mkdir -p .agency
   echo '{"version":"1.0.0","plugins":[],"modes":[],"containers":[]}' > .agency/agency.config.json
   ```

3. Reload VS Code to activate the extension

### Basic Usage

1. **Configure Plugins**:
   - Open the Agency sidebar (activity bar icon)
   - Navigate to the "Plugins" view
   - Click on a plugin to configure it
   - Enable/disable plugins as needed

2. **Test MCP Tools**:
   - Open the "Tools" view
   - Click on a tool to test it
   - Enter parameters (JSON Schema validated)
   - Execute and view results

3. **Monitor Activity**:
   - Open the "Activity" view
   - Watch tool invocations in real-time
   - Expand items to see details
   - Filter by tool or time range

4. **Manage Containers**:
   - Open the "Containers" view
   - Start/stop containers
   - View logs
   - Rebuild when needed

5. **Switch Modes**:
   - Open the "Modes" view
   - Select a mode to switch
   - See which tools are active

## Configuration

Extension settings (File > Preferences > Settings > Agency):

| Setting | Default | Description |
|---------|---------|-------------|
| `agency.configPath` | `.agency/agency.config.json` | Path to Agency configuration file |
| `agency.autoConnect` | `true` | Automatically connect to MCP server on startup |

## Agency Configuration File

Create `.agency/agency.config.json` in your project root:

```json
{
  "version": "1.0.0",
  "currentModeId": "default",
  "plugins": [
    {
      "id": "my-plugin",
      "enabled": true,
      "settings": {}
    }
  ],
  "modes": [
    {
      "id": "default",
      "name": "Default",
      "description": "Default tool configuration",
      "parentId": null,
      "includedTools": [],
      "excludedTools": [],
      "isDefault": true
    }
  ],
  "containers": []
}
```

## Commands

Access commands via the Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

| Command | Description |
|---------|-------------|
| `Agency: Configure Plugin` | Open plugin configuration panel |
| `Agency: Enable Plugin` | Enable selected plugin |
| `Agency: Disable Plugin` | Disable selected plugin |
| `Agency: Refresh Plugins` | Refresh plugin list |
| `Agency: Test Tool` | Open tool execution panel |
| `Agency: Refresh Tools` | Refresh tool list |
| `Agency: Connect to MCP Server` | Connect to MCP server |
| `Agency: Disconnect from MCP Server` | Disconnect from MCP server |
| `Agency: Switch Mode` | Switch active mode |
| `Agency: View Mode Tools` | View tools in selected mode |
| `Agency: Start Container` | Start dev container |
| `Agency: Stop Container` | Stop dev container |
| `Agency: Rebuild Container` | Rebuild dev container |
| `Agency: View Container Logs` | View container logs |

## Architecture

The extension connects to your Agency MCP server via stdio transport (docker exec):

```
┌─────────────────────────────────────┐
│      VS Code Extension Host         │
│  ┌──────────┐  ┌──────────────┐    │
│  │ Commands │  │  Providers   │    │
│  └────┬─────┘  └──────┬───────┘    │
│       └───────────────┼────────┐    │
│                       │        │    │
│              ┌────────┴──────┐ │    │
│              │   Services    │ │    │
│              └────────┬──────┘ │    │
│                       │        │    │
└───────────────────────┼────────┼────┘
                        │        │
                    ┌───┴────┐   │
                    │ stdio  │   │
                    │ pipe   │   │
                    └───┬────┘   │
                        │        │
                  ┌─────┴────────┴─────┐
                  │   Dev Container    │
                  │   MCP Server       │
                  └────────────────────┘
```

## Troubleshooting

### Extension not activating
- Ensure `.agency/agency.config.json` exists in your workspace
- Check VS Code output panel (View > Output > Agency)
- Reload VS Code window

### MCP connection failing
- Verify Agency MCP server is running in your dev container
- Check Docker is running
- Review container logs for errors

### Tools not appearing
- Click "Refresh Tools" in the Tools view
- Verify MCP server is connected
- Check Agency MCP server logs

### Configuration not saving
- Verify `.agency/` directory has write permissions
- Check for JSON syntax errors in config file
- Review VS Code output panel for errors

## Development

For plugin and MCP server development, see:
- [Agency Documentation](https://github.com/generacy-ai/agency)
- [MCP Protocol Specification](https://modelcontextprotocol.io)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](../../LICENSE) for details.

## Support

- [GitHub Issues](https://github.com/generacy-ai/agency/issues)
- [Documentation](https://github.com/generacy-ai/agency)
- [Discord Community](https://discord.gg/generacy)

## About Generacy

Agency is part of the **Generacy** platform - an open-source ecosystem for agent-driven development where agents are the primary workers and humans serve as specialist consultants.

Learn more:
- **agency**: Agent-optimized MCP tooling (this repository)
- **humancy**: Human portal into agent workflows
- **generacy**: Workflow orchestration engine

---

**Made with ❤️ by the Generacy team**
