# Implementation Plan: [P] Error Handling & UX Polish

**Feature**: Error Handling & UX Polish - Implement consistent error notifications, user-friendly messages, connection status indicators, welcome views, and getting started walkthrough.
**Branch**: `063-tg-024-p-error`
**Status**: Complete

## Summary

This feature adds polish and professional error handling to the Agency VS Code extension. It implements:
1. Consistent error notification patterns across all services
2. User-friendly error messages for common failure scenarios
3. Connection status indicators in the VS Code status bar
4. Welcome view for first-time users
5. Getting started walkthrough

This is a polish phase task that enhances the UX without changing core functionality.

## Technical Context

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| VS Code Extension API | 1.85+ | Extension framework |
| VS Code StatusBarItem | - | Connection status indicators |
| VS Code TreeView | - | Welcome view rendering |
| Error types | - | Custom error classes for categorization |

## Implementation Approach

### 1. Error Notification Service

Create a centralized error notification service that:
- Categorizes errors (network, config, docker, mcp, validation)
- Maps error categories to user-friendly messages
- Shows appropriate VS Code notifications (error/warning/info)
- Logs detailed errors to output channel
- Provides "View Logs" action for debugging

### 2. Status Bar Connection Indicator

Add status bar items for:
- MCP connection status (connected, disconnected, connecting, error)
- Container status (running, stopped, starting, error)
- Click action to view details or reconnect

### 3. Welcome View

Create a welcome tree view that:
- Shows when no config file exists
- Displays getting started steps
- Provides quick actions (create config, view docs, etc.)
- Hides automatically after first configuration

### 4. Getting Started Walkthrough

Implement VS Code walkthrough contribution:
- Step 1: Create configuration file
- Step 2: Configure first plugin
- Step 3: Connect to container
- Step 4: Test a tool
- Step 5: View activity feed

### 5. Common Error Scenarios

Handle these common errors gracefully:
- Docker not running → "Docker is not running. Please start Docker Desktop."
- Container not found → "No dev container found. Create one with [Create Container]."
- MCP connection failed → "Could not connect to MCP server. Check container status."
- Config file invalid → "Configuration file is invalid. [View Errors] [Reset to Default]"
- Permission denied → "Permission denied accessing [resource]. Check file permissions."

## Project Structure

```
packages/agency-extension/src/
├── errors/
│   ├── ErrorNotificationService.ts   # Centralized error handling
│   ├── ErrorTypes.ts                  # Custom error classes
│   └── index.ts                       # Error exports
├── status/
│   ├── StatusBarManager.ts            # Status bar indicators
│   └── index.ts                       # Status exports
├── welcome/
│   ├── WelcomeViewProvider.ts         # Welcome tree view
│   └── index.ts                       # Welcome exports
└── walkthrough/
    └── getting-started.md             # Walkthrough content
```

## New Files

### ErrorTypes.ts
```typescript
// Base error class with categorization
export abstract class AgencyError extends Error {
  abstract readonly category: ErrorCategory;
  abstract getUserMessage(): string;
  abstract getAction(): ErrorAction | null;
}

// Specific error types
export class DockerNotRunningError extends AgencyError { ... }
export class ContainerNotFoundError extends AgencyError { ... }
export class McpConnectionError extends AgencyError { ... }
export class ConfigValidationError extends AgencyError { ... }
```

### ErrorNotificationService.ts
```typescript
export class ErrorNotificationService {
  static showError(error: Error): Promise<void> {
    // Categorize error
    // Show user-friendly notification
    // Log detailed error
    // Provide action buttons
  }
}
```

### StatusBarManager.ts
```typescript
export class StatusBarManager {
  private mcpStatusItem: StatusBarItem;
  private containerStatusItem: StatusBarItem;

  updateMcpStatus(status: ConnectionStatus): void { ... }
  updateContainerStatus(status: ContainerStatus): void { ... }
}
```

### WelcomeViewProvider.ts
```typescript
export class WelcomeViewProvider implements TreeDataProvider<WelcomeItem> {
  getChildren(): WelcomeItem[] {
    // Return getting started items
  }
}
```

## Modified Files

### extension.ts
- Initialize ErrorNotificationService
- Initialize StatusBarManager
- Register WelcomeViewProvider
- Add error handlers to all service initializations

### All Services (ConfigService, McpClientService, ContainerService, etc.)
- Replace generic error throws with typed errors
- Replace generic try-catch with ErrorNotificationService calls
- Update status indicators on state changes

### package.json
- Add walkthrough contribution
- Add welcome view contribution

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Error categorization | Custom error classes | Type-safe, allows specific handling |
| Notification approach | VS Code window.showErrorMessage | Native UX, consistent with VS Code |
| Status bar location | Right side | Matches VS Code convention for status |
| Welcome view | TreeView with custom provider | Reuses existing pattern, flexible |
| Walkthrough | VS Code walkthroughs API | Native onboarding, discoverable |

## Error Message Templates

| Error Category | Template | Actions |
|----------------|----------|---------|
| Docker not running | "Docker is not running. Agency requires Docker to manage dev containers." | ["Start Docker", "View Docs"] |
| Container not found | "No dev container found. Create one to test MCP tools." | ["Create Container", "Learn More"] |
| MCP connection failed | "Could not connect to MCP server in container." | ["Retry", "View Logs", "Check Container"] |
| Config invalid | "Configuration file has errors and could not be loaded." | ["View Errors", "Reset to Default"] |
| Permission denied | "Permission denied accessing {resource}." | ["View Logs", "Check Permissions"] |

## Status Bar States

### MCP Connection Status
| State | Icon | Text | Tooltip | Color |
|-------|------|------|---------|-------|
| Connected | $(plug) | MCP | "Connected to MCP server" | Default |
| Disconnected | $(debug-disconnect) | MCP | "Disconnected from MCP server" | Gray |
| Connecting | $(loading~spin) | MCP | "Connecting to MCP server..." | Default |
| Error | $(error) | MCP | "MCP connection error" | Error |

### Container Status
| State | Icon | Text | Tooltip | Color |
|-------|------|------|---------|-------|
| Running | $(vm-active) | Container | "Container running" | Default |
| Stopped | $(vm-outline) | Container | "Container stopped" | Gray |
| Starting | $(loading~spin) | Container | "Starting container..." | Default |
| Error | $(error) | Container | "Container error" | Error |

## Welcome View Items

1. **Create Configuration** → Command: `agency.initConfig`
2. **Browse Plugins** → Command: `agency.showPlugins`
3. **Connect to Container** → Command: `agency.connectMcp`
4. **View Documentation** → Opens docs URL
5. **Watch Tutorial** → Opens walkthrough

## Dependencies

No new runtime dependencies. Uses existing VS Code Extension API:
- `window.showErrorMessage()`
- `window.showWarningMessage()`
- `window.showInformationMessage()`
- `window.createStatusBarItem()`
- `TreeDataProvider` interface
- Walkthroughs contribution

## Testing Strategy

| Component | Test Approach |
|-----------|---------------|
| Error types | Unit tests for message generation |
| ErrorNotificationService | Mock VS Code window API |
| StatusBarManager | Verify status item updates |
| WelcomeViewProvider | Verify tree items returned |

## Success Criteria

- [ ] All service errors show user-friendly notifications
- [ ] Status bar shows real-time connection status
- [ ] Welcome view appears on first activation
- [ ] Walkthrough can be completed end-to-end
- [ ] Common error scenarios have clear resolution paths
- [ ] "View Logs" action opens output channel with relevant context

---

*Generated by speckit*
