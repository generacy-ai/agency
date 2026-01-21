# Feature Specification: Epic: Agency VS Code Extension

**Branch**: `038-epic-agency-vs-code` | **Date**: 2026-01-21 | **Status**: Draft

## Summary

Build the Agency VS Code Extension - a free tool providing plugin configuration, in-situ MCP testing, and activity monitoring for AI development agents.

## Purpose

The Agency extension is the **developer interface** for Agency - enabling configuration, testing, and monitoring of the MCP server that powers AI agents. It's FREE with no authentication required.

## Key Features

### 1. Plugin Configuration UI
- Visual plugin browser
- Enable/disable plugins
- Plugin-specific settings
- Mode management (which tools are active)
- Configuration validation
- **Configuration stored in `.agency/agency.config.json`** (versionable, shareable)

### 2. In-Situ MCP Tool Testing
- Connect to **actual MCP server** running in dev container via **stdio transport** (docker exec)
- Browse available tools by category
- Execute tools with parameter input
- View results with syntax highlighting
- Real dev container state (files, git, processes)
- Eliminates mock/real divergence in debugging

### 3. Dev Container Management
- Start/stop dev containers
- View container status
- Access container logs
- Rebuild container
- **Discovery via VS Code Remote Containers extension API** (with Docker API fallback)

### 4. Activity Feed
- Real-time agent tool invocation monitoring via **Agency core event stream**
- Tool call history with timing
- Success/failure indicators
- Expandable details (inputs/outputs)
- Filtering by tool, server, time

### 5. Mode Management
- View current mode
- Switch modes
- See which tools are active in current mode
- Mode inheritance visualization

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MCP Connection | stdio transport via docker exec | Aligns with standard MCP protocol, no additional HTTP endpoints needed |
| Activity Data Source | Agency core event stream | Requires Agency core to emit tool invocation events |
| Config Storage | `.agency/agency.config.json` | Explicit, versionable, shareable across team |
| Container Discovery | VS Code Remote Containers API | Integrates with existing workflows, Docker API as fallback |
| Epic Decomposition | Vertical slices | Delivers working functionality incrementally |

## Delivery Phases (Vertical Slices)

1. **MVP**: Extension scaffold + basic plugin config UI + tool listing
2. **Tool Testing**: MCP connection + in-situ tool execution
3. **Activity Feed**: Real-time monitoring (requires Agency core event stream)
4. **Dev Containers**: Container management and templates
5. **Polish**: Mode visualization, advanced features

## Architecture

```
packages/
├── agency-extension/
│   └── src/
│       ├── extension.ts           # Extension entry point
│       ├── commands/              # VS Code commands
│       ├── views/
│       │   ├── plugins/           # Plugin configuration UI
│       │   ├── tool-browser/      # In-situ MCP testing
│       │   ├── activity/          # Activity feed
│       │   └── containers/        # Dev container management
│       ├── providers/             # Tree view providers
│       ├── mcp/                   # MCP client for testing (stdio)
│       └── utils/
```

## Business Model

**FREE** - No authentication required. Builds ecosystem, drives adoption of Humancy/Generacy.

## Dependencies

- Agency core MCP server
- @generacy-ai/contracts
- VS Code Remote Containers extension (for container discovery)
- Agency core event stream support (for activity feed)

## Completion Criteria

- [ ] Extension activates in VS Code
- [ ] Plugin configuration UI works
- [ ] In-situ MCP testing connects to actual dev container
- [ ] Activity feed shows real-time tool calls
- [ ] Dev container management works
- [ ] Mode switching works
- [ ] Published to VS Code Marketplace

## User Stories

### US1: Plugin Configuration

**As a** developer using Agency,
**I want** to configure plugins through a visual UI,
**So that** I can easily enable/disable plugins and adjust settings without editing config files.

**Acceptance Criteria**:
- [ ] Can browse available plugins
- [ ] Can enable/disable plugins with one click
- [ ] Can edit plugin-specific settings
- [ ] Configuration persists to `.agency/agency.config.json`

### US2: In-Situ MCP Testing

**As a** plugin developer,
**I want** to test MCP tools against the actual dev container,
**So that** I can verify tool behavior in a real environment.

**Acceptance Criteria**:
- [ ] Can browse available tools by category
- [ ] Can execute tools with custom parameters
- [ ] Can view results with syntax highlighting
- [ ] Tests run against actual container state

### US3: Activity Monitoring

**As a** developer debugging agent behavior,
**I want** to see real-time tool invocations,
**So that** I can understand what the agent is doing and troubleshoot issues.

**Acceptance Criteria**:
- [ ] Activity feed updates in real-time
- [ ] Can see tool inputs and outputs
- [ ] Can filter by tool, server, or time
- [ ] Can expand/collapse details

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Extension activates on VS Code startup | P1 | |
| FR-002 | MCP connection via stdio/docker exec | P1 | Clarified: Option A |
| FR-003 | Configuration stored in .agency/ | P1 | Clarified: Option B |
| FR-004 | Container discovery via Remote Containers API | P1 | Clarified: Option B with Docker fallback |
| FR-005 | Activity feed via Agency event stream | P2 | Clarified: Option A, requires Agency core work |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Extension activation time | < 2s | VS Code performance metrics |
| SC-002 | Tool execution success rate | > 95% | Error rate monitoring |
| SC-003 | Activity feed latency | < 500ms | Time from tool call to display |

## Assumptions

- Agency core MCP server is running in the dev container
- VS Code Remote Containers extension is available (or Docker API fallback)
- User has Docker installed and running

## Out of Scope

- Authentication/licensing (extension is free)
- Cloud-based features
- Non-VS Code editors

---

*Generated by speckit*
