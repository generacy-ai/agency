# Implementation Plan: Epic: Agency VS Code Extension

**Feature**: Build the Agency VS Code Extension - a free tool providing plugin configuration, in-situ MCP testing, and activity monitoring for AI development agents.
**Branch**: `038-epic-agency-vs-code`
**Status**: Complete

## Summary

This plan outlines the implementation of a VS Code extension that serves as the developer interface for Agency. The extension enables configuration, testing, and monitoring of the MCP server that powers AI agents. The extension is FREE with no authentication required.

## Technical Context

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| VS Code Extension API | 1.85+ | Extension framework |
| @modelcontextprotocol/sdk | latest | MCP client for tool testing |
| execa | 8.x | Subprocess management for docker exec |
| zod | 3.x | Runtime schema validation |
| Node.js | 20+ | Runtime environment |

## Project Structure

```
packages/agency-extension/
├── package.json                          # Extension manifest
├── tsconfig.json                         # TypeScript config (extends base)
├── vitest.config.ts                      # Test configuration
├── esbuild.config.mjs                    # Bundle configuration
├── .vscodeignore                         # VS Code publish ignore
├── CHANGELOG.md                          # Version history
├── src/
│   ├── extension.ts                      # Extension entry point
│   ├── constants.ts                      # Shared constants
│   ├── commands/
│   │   ├── index.ts                      # Command registration
│   │   ├── plugin-commands.ts            # Plugin configuration commands
│   │   ├── tool-commands.ts              # Tool testing commands
│   │   ├── container-commands.ts         # Container management commands
│   │   └── mode-commands.ts              # Mode switching commands
│   ├── providers/
│   │   ├── index.ts                      # Provider exports
│   │   ├── PluginTreeProvider.ts         # Plugin list tree view
│   │   ├── ToolTreeProvider.ts           # Tool browser tree view
│   │   ├── ActivityTreeProvider.ts       # Activity feed tree view
│   │   ├── ContainerTreeProvider.ts      # Container list tree view
│   │   └── ModeTreeProvider.ts           # Mode list tree view
│   ├── views/
│   │   ├── index.ts                      # View exports
│   │   ├── webview-base.ts               # Base webview panel class
│   │   ├── plugins/
│   │   │   ├── PluginConfigPanel.ts      # Plugin configuration webview
│   │   │   └── plugin-config.html        # Webview HTML template
│   │   ├── tool-browser/
│   │   │   ├── ToolExecutionPanel.ts     # Tool execution webview
│   │   │   └── tool-execution.html       # Webview HTML template
│   │   ├── activity/
│   │   │   ├── ActivityFeedPanel.ts      # Activity feed webview
│   │   │   └── activity-feed.html        # Webview HTML template
│   │   └── containers/
│   │       ├── ContainerDetailPanel.ts   # Container details webview
│   │       └── container-detail.html     # Webview HTML template
│   ├── services/
│   │   ├── index.ts                      # Service exports
│   │   ├── ConfigService.ts              # Configuration management
│   │   ├── McpClientService.ts           # MCP client for tool testing
│   │   ├── ContainerService.ts           # Container discovery/management
│   │   ├── ActivityService.ts            # Activity event stream
│   │   └── ModeService.ts                # Mode management
│   ├── mcp/
│   │   ├── index.ts                      # MCP exports
│   │   ├── StdioClient.ts                # Stdio transport client
│   │   ├── DockerExecTransport.ts        # Docker exec transport
│   │   └── types.ts                      # MCP type definitions
│   ├── config/
│   │   ├── index.ts                      # Config exports
│   │   ├── ConfigSchema.ts               # Configuration schema (Zod)
│   │   ├── ConfigFile.ts                 # Config file read/write
│   │   └── defaults.ts                   # Default configuration
│   ├── types/
│   │   ├── index.ts                      # Type exports
│   │   ├── plugin.ts                     # Plugin types
│   │   ├── tool.ts                       # Tool types
│   │   ├── activity.ts                   # Activity event types
│   │   └── container.ts                  # Container types
│   ├── utils/
│   │   ├── index.ts                      # Utility exports
│   │   ├── logger.ts                     # Logging utilities
│   │   ├── disposable.ts                 # Disposable helpers
│   │   └── debounce.ts                   # Debounce utilities
│   └── __tests__/
│       ├── extension.test.ts             # Extension tests
│       ├── services/
│       │   ├── ConfigService.test.ts
│       │   ├── McpClientService.test.ts
│       │   └── ContainerService.test.ts
│       └── mcp/
│           ├── StdioClient.test.ts
│           └── DockerExecTransport.test.ts
└── media/
    ├── icons/
    │   ├── agency.svg                    # Extension icon
    │   ├── plugin.svg                    # Plugin icon
    │   ├── tool.svg                      # Tool icon
    │   ├── activity.svg                  # Activity icon
    │   └── container.svg                 # Container icon
    └── styles/
        └── webview.css                   # Shared webview styles
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    VS Code Extension Host                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Commands   │  │  Providers  │  │   Views     │             │
│  │  (actions)  │  │ (tree views)│  │ (webviews)  │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│  ┌───────────────────────┴───────────────────────┐             │
│  │                   Services                     │             │
│  ├───────────┬───────────┬───────────┬──────────┤             │
│  │  Config   │    MCP    │ Container │ Activity │             │
│  │  Service  │  Client   │  Service  │ Service  │             │
│  └─────┬─────┴─────┬─────┴─────┬─────┴────┬─────┘             │
│        │           │           │          │                    │
└────────┼───────────┼───────────┼──────────┼────────────────────┘
         │           │           │          │
         ▼           ▼           ▼          ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │ .agency/│ │  stdio  │ │ Docker  │ │ Event   │
    │ config  │ │  pipe   │ │  API    │ │ Stream  │
    └─────────┘ └────┬────┘ └─────────┘ └─────────┘
                     │
                     ▼
              ┌─────────────┐
              │ Dev Container│
              │ MCP Server   │
              └─────────────┘
```

## Delivery Phases

### Phase 1: MVP - Extension Foundation
**Goal**: Basic extension that activates, shows plugin list, and has config UI shell

Components:
- Extension scaffold with proper activation
- PluginTreeProvider with static plugin list
- ConfigService for reading/writing `.agency/agency.config.json`
- Basic plugin configuration webview
- Commands for opening config panel

### Phase 2: MCP Tool Testing
**Goal**: Connect to actual MCP server and execute tools

Components:
- StdioClient for MCP protocol
- DockerExecTransport for container communication
- ToolTreeProvider for browsing available tools
- Tool execution webview with parameter input
- Result display with syntax highlighting

### Phase 3: Activity Feed
**Goal**: Real-time monitoring of tool invocations

Components:
- ActivityService subscribing to Agency event stream
- ActivityTreeProvider showing recent tool calls
- Activity feed webview with filtering
- Expandable details for inputs/outputs

### Phase 4: Dev Container Management
**Goal**: Container lifecycle management

Components:
- ContainerService for discovery (VS Code Remote API + Docker fallback)
- ContainerTreeProvider showing container status
- Commands for start/stop/rebuild
- Container logs webview

### Phase 5: Polish & Marketplace
**Goal**: Final features and marketplace publish

Components:
- Mode management UI
- Mode inheritance visualization
- Performance optimizations
- Marketplace packaging and publishing

## Key Interfaces

### Configuration Schema
```typescript
interface AgencyConfig {
  version: string;
  plugins: PluginConfig[];
  modes: ModeConfig[];
  containers: ContainerConfig[];
}

interface PluginConfig {
  id: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}
```

### MCP Client Interface
```typescript
interface McpClient {
  connect(container: ContainerInfo): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<ToolInfo[]>;
  executeTool(name: string, params: unknown): Promise<ToolResult>;
  onToolCall(callback: (event: ToolCallEvent) => void): Disposable;
}
```

### Container Service Interface
```typescript
interface ContainerService {
  listContainers(): Promise<ContainerInfo[]>;
  getContainer(id: string): Promise<ContainerInfo | undefined>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string): Promise<void>;
  rebuildContainer(id: string): Promise<void>;
  getContainerLogs(id: string): AsyncIterable<string>;
}
```

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Build tool | esbuild | Fast bundling, native VS Code extension support |
| State management | Service classes | Simple, testable, no external dependencies |
| Webview framework | Plain HTML/CSS/JS | Minimal bundle size, no framework overhead |
| MCP transport | stdio via docker exec | Matches MCP protocol, no HTTP overhead |
| Configuration format | JSON with Zod schema | Type-safe, versionable, shareable |

## Dependencies

### Runtime Dependencies
```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",
  "execa": "^8.0.0",
  "zod": "^3.24.0"
}
```

### Peer Dependencies
```json
{
  "vscode": "^1.85.0"
}
```

### Dev Dependencies
```json
{
  "@types/vscode": "^1.85.0",
  "@types/node": "^20.17.0",
  "@vscode/vsce": "^2.24.0",
  "esbuild": "^0.20.0",
  "typescript": "^5.7.0",
  "vitest": "^3.0.0"
}
```

## Extension Manifest (package.json contributes)

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "agency",
        "title": "Agency",
        "icon": "media/icons/agency.svg"
      }]
    },
    "views": {
      "agency": [
        { "id": "agency.plugins", "name": "Plugins" },
        { "id": "agency.tools", "name": "Tools" },
        { "id": "agency.activity", "name": "Activity" },
        { "id": "agency.containers", "name": "Containers" },
        { "id": "agency.modes", "name": "Modes" }
      ]
    },
    "commands": [
      { "command": "agency.configurePlugin", "title": "Configure Plugin" },
      { "command": "agency.testTool", "title": "Test Tool" },
      { "command": "agency.refreshTools", "title": "Refresh Tools" },
      { "command": "agency.switchMode", "title": "Switch Mode" },
      { "command": "agency.startContainer", "title": "Start Container" },
      { "command": "agency.stopContainer", "title": "Stop Container" },
      { "command": "agency.rebuildContainer", "title": "Rebuild Container" },
      { "command": "agency.viewContainerLogs", "title": "View Logs" }
    ],
    "configuration": {
      "title": "Agency",
      "properties": {
        "agency.configPath": {
          "type": "string",
          "default": ".agency/agency.config.json",
          "description": "Path to Agency configuration file"
        },
        "agency.autoConnect": {
          "type": "boolean",
          "default": true,
          "description": "Automatically connect to MCP server on startup"
        }
      }
    }
  }
}
```

## Testing Strategy

| Layer | Approach | Tools |
|-------|----------|-------|
| Unit tests | Service/utility functions | vitest |
| Integration tests | MCP client with mock server | vitest + mock stdio |
| E2E tests | Extension activation | @vscode/test-electron |

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Extension activation time | < 2s | VS Code performance metrics |
| Tool execution success rate | > 95% | Error rate monitoring |
| Activity feed latency | < 500ms | Time from tool call to display |
| Bundle size | < 1MB | Build output size |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP protocol changes | High | Pin SDK version, comprehensive tests |
| Docker API variations | Medium | Abstract container service, multiple discovery methods |
| VS Code API deprecations | Low | Follow VS Code release notes, test on insiders |
| Event stream backpressure | Medium | Implement buffering and throttling |

---

*Generated by speckit*
