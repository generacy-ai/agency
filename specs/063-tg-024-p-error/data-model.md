# Data Model: Error Handling & UX Polish

## Core Entities

### 1. AgencyError (Abstract Base)

Base class for all typed errors in the extension.

```typescript
abstract class AgencyError extends Error {
  /**
   * Error category for routing and handling
   */
  abstract readonly category: ErrorCategory;

  /**
   * Get user-friendly message (no technical details)
   */
  abstract getUserMessage(): string;

  /**
   * Get suggested action for user
   */
  abstract getAction(): ErrorAction | null;

  /**
   * Get detailed technical message for logging
   */
  getTechnicalMessage(): string {
    return this.message;
  }
}
```

### 2. ErrorCategory (Enum)

```typescript
enum ErrorCategory {
  DOCKER = 'docker',
  MCP = 'mcp',
  CONFIG = 'config',
  NETWORK = 'network',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  UNKNOWN = 'unknown',
}
```

### 3. ErrorAction

```typescript
interface ErrorAction {
  /**
   * Label for action button
   */
  label: string;

  /**
   * Command to execute
   */
  command: string;

  /**
   * Optional command arguments
   */
  args?: unknown[];
}
```

### 4. ConnectionStatus (Union Type)

```typescript
type ConnectionStatus =
  | { state: 'connected'; connectedAt: Date }
  | { state: 'disconnected'; reason?: string }
  | { state: 'connecting'; startedAt: Date }
  | { state: 'error'; error: Error; occurredAt: Date };
```

### 5. StatusBarState

```typescript
interface StatusBarState {
  /**
   * Display text (may include codicons)
   */
  text: string;

  /**
   * Hover tooltip
   */
  tooltip: string;

  /**
   * Codicon name (without $() wrapper)
   */
  icon: string;

  /**
   * Theme color key
   */
  color?: string;

  /**
   * Command to run on click
   */
  command?: string;
}
```

### 6. WelcomeItem

```typescript
interface WelcomeItem extends TreeItem {
  /**
   * Item identifier
   */
  readonly id: string;

  /**
   * Display label
   */
  readonly label: string;

  /**
   * Item description
   */
  readonly description?: string;

  /**
   * Command to execute on click
   */
  readonly command?: Command;

  /**
   * Icon (codicon or theme icon)
   */
  readonly iconPath?: string | ThemeIcon;

  /**
   * Collapsible state
   */
  readonly collapsibleState: TreeItemCollapsibleState;
}
```

### 7. WalkthroughStep

```typescript
interface WalkthroughStep {
  /**
   * Step identifier
   */
  id: string;

  /**
   * Step title
   */
  title: string;

  /**
   * Step description (markdown)
   */
  description: string;

  /**
   * Media content
   */
  media?: {
    image?: string;
    markdown?: string;
  };

  /**
   * Events that complete this step
   */
  completionEvents?: string[];

  /**
   * Action button
   */
  button?: {
    title: string;
    command: string;
  };
}
```

## Concrete Error Types

### DockerNotRunningError

```typescript
class DockerNotRunningError extends AgencyError {
  readonly category = ErrorCategory.DOCKER;

  getUserMessage(): string {
    return 'Docker is not running. Agency requires Docker to manage dev containers.';
  }

  getAction(): ErrorAction {
    return {
      label: 'View Documentation',
      command: 'agency.openDocs',
      args: ['docker-setup'],
    };
  }
}
```

### ContainerNotFoundError

```typescript
class ContainerNotFoundError extends AgencyError {
  readonly category = ErrorCategory.DOCKER;

  constructor(public readonly containerId?: string) {
    super(`Container not found${containerId ? `: ${containerId}` : ''}`);
  }

  getUserMessage(): string {
    return 'No dev container found. Create one to test MCP tools.';
  }

  getAction(): ErrorAction {
    return {
      label: 'Create Container',
      command: 'agency.createContainer',
    };
  }
}
```

### McpConnectionError

```typescript
class McpConnectionError extends AgencyError {
  readonly category = ErrorCategory.MCP;

  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
  }

  getUserMessage(): string {
    return 'Could not connect to MCP server in container.';
  }

  getAction(): ErrorAction {
    return {
      label: 'Check Container',
      command: 'agency.showContainerStatus',
    };
  }
}
```

### ConfigValidationError

```typescript
class ConfigValidationError extends AgencyError {
  readonly category = ErrorCategory.CONFIG;

  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(message);
  }

  getUserMessage(): string {
    return 'Configuration file has errors and could not be loaded.';
  }

  getAction(): ErrorAction {
    return {
      label: 'View Errors',
      command: 'agency.showConfigErrors',
      args: [this.validationErrors],
    };
  }
}
```

### PermissionDeniedError

```typescript
class PermissionDeniedError extends AgencyError {
  readonly category = ErrorCategory.PERMISSION;

  constructor(public readonly resource: string) {
    super(`Permission denied accessing ${resource}`);
  }

  getUserMessage(): string {
    return `Permission denied accessing ${this.resource}.`;
  }

  getAction(): ErrorAction {
    return {
      label: 'View Logs',
      command: 'agency.showLogs',
    };
  }
}
```

## Status Bar State Mapping

### MCP Connection Status → StatusBarState

```typescript
function getMcpStatusBarState(status: ConnectionStatus): StatusBarState {
  switch (status.state) {
    case 'connected':
      return {
        text: '$(plug) MCP',
        tooltip: 'Connected to MCP server',
        icon: 'plug',
        command: 'agency.showMcpStatus',
      };

    case 'disconnected':
      return {
        text: '$(debug-disconnect) MCP',
        tooltip: status.reason || 'Disconnected from MCP server',
        icon: 'debug-disconnect',
        color: 'disabledForeground',
        command: 'agency.connectMcp',
      };

    case 'connecting':
      return {
        text: '$(loading~spin) MCP',
        tooltip: 'Connecting to MCP server...',
        icon: 'loading',
        command: 'agency.showMcpStatus',
      };

    case 'error':
      return {
        text: '$(error) MCP',
        tooltip: `MCP connection error: ${status.error.message}`,
        icon: 'error',
        color: 'errorForeground',
        command: 'agency.showMcpError',
      };
  }
}
```

## Validation Rules

### Error Message Validation

All user-facing error messages must:
1. Be under 200 characters
2. Not contain technical jargon (stack traces, error codes)
3. Explain what went wrong (not just "Error")
4. Suggest a resolution path

### Action Button Validation

All error actions must:
1. Have a label under 30 characters
2. Reference a registered command
3. Be actionable (user can complete the action)

### Status Bar Text Validation

Status bar text must:
1. Include a codicon (for visual identification)
2. Be under 20 characters
3. Not contain dynamic data (timestamps, etc.)

## Relationships

```
AgencyError (1) --> (0..1) ErrorAction
ErrorCategory (1) --> (*) AgencyError
ConnectionStatus (1) --> (1) StatusBarState
WelcomeItem (*) --> (0..1) Command
WalkthroughStep (1) --> (0..1) Command
```

## State Transitions

### MCP Connection Status State Machine

```
[disconnected] --connect()--> [connecting] --success--> [connected]
                                    |
                                  fail
                                    |
                                    v
                                [error] --reset()--> [disconnected]

[connected] --disconnect()--> [disconnected]
```

### Welcome View Visibility

```
[first-run] --show()--> [visible] --dismiss()--> [hidden]
                            |
                       config-created
                            |
                            v
                        [hidden]
```

---

*Generated by speckit*
