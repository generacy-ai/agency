# Implementation Plan: Extension Entry Point & Core Infrastructure

**Feature**: Extension Entry Point & Core Infrastructure
**Branch**: `092-tg-002-41-p`
**Status**: Complete

## Summary

This feature implements the foundational infrastructure for the Agency VS Code extension, including the extension entry point with activation/deactivation lifecycle, shared constants, and core utility modules (logger, disposable manager, debounce). This provides the scaffolding for all future extension features.

## Context

- **Parent Epic**: #38 (Agency VS Code Extension)
- **Task Group**: TG-002
- **Phase**: Phase 1 - Foundation & Extension Scaffold
- **Epic Child**: Yes (inherits spec from parent)

## Technical Architecture

### Technology Stack

- **Runtime**: VS Code Extension Host (Node.js-based)
- **Language**: TypeScript 5.x
- **Build**: turbo (monorepo build orchestration)
- **Test Framework**: Vitest
- **VS Code API**: ^1.85.0

### Project Structure

```
packages/agency-extension/
├── src/
│   ├── extension.ts              # Extension entry point (activate/deactivate)
│   ├── constants.ts              # Shared extension constants
│   └── utils/
│       ├── index.ts              # Utility exports
│       ├── logger.ts             # Singleton logger with output channel
│       ├── disposable.ts         # DisposableManager and helper functions
│       └── debounce.ts           # Debounce/throttle utilities
├── __tests__/
│   └── extension.test.ts         # Extension activation tests
└── package.json
```

## Implementation Approach

### 1. Extension Entry Point (`extension.ts`)

**Purpose**: Manage extension lifecycle and coordinate initialization of all services.

**Key Components**:
- `activate(context)`: Extension activation handler
  - Initialize output channel and logger
  - Create DisposableManager for resource cleanup
  - Initialize services (ConfigService, McpClientService, ModeService)
  - Register tree views (plugins, modes, welcome)
  - Register all commands (plugin, tool, mode, container stubs)
  - Initialize status bar manager
- `deactivate()`: Clean shutdown handler
  - Dispose all resources via DisposableManager
- `getExtensionState()`: Accessor for extension state (testability)

**State Management**:
- Module-level `extensionState` variable holds:
  - `context`: Extension context from VS Code
  - `disposables`: DisposableManager instance
  - `outputChannel`: Output channel for logging

**Error Handling**:
- All service initialization wrapped in try-catch
- Failures reported via ErrorNotificationService
- Failed initialization throws to prevent extension from appearing "working"

### 2. Constants Module (`constants.ts`)

**Purpose**: Centralize all extension identifiers, command names, and configuration keys.

**Exported Constants**:
- `EXTENSION_ID`: Extension marketplace identifier
- `EXTENSION_NAME`: Display name
- `VIEW_IDS`: View identifiers for tree views
- `COMMANDS`: Command identifiers (plugins, tools, modes, containers)
- `CONFIG_KEYS`: VS Code settings keys
- `CONFIG_DEFAULTS`: Default configuration values
- `OUTPUT_CHANNEL_NAME`: Logger output channel name
- `LOG_LEVELS`: Enum for log levels
- `CONTEXT_KEYS`: Context keys for conditional command enablement

**Design Rationale**:
- Single source of truth for identifiers prevents typos
- Type-safe via TypeScript const assertions
- Easy to discover available constants

### 3. Logger Utility (`utils/logger.ts`)

**Purpose**: Provide structured logging with scopes for all extension components.

**Key Features**:
- Singleton pattern (`Logger.getInstance()`)
- Initialize with VS Code output channel
- Scoped loggers via `createScopedLogger(scope)` for component-specific logging
- Log levels: DEBUG, INFO, WARN, ERROR
- Prefix format: `[YYYY-MM-DD HH:mm:ss] [SCOPE] [LEVEL] message`

**Usage Pattern**:
```typescript
const log = createScopedLogger('MyComponent');
log.info('Component initialized');
log.error('Something failed', error);
```

### 4. Disposable Manager (`utils/disposable.ts`)

**Purpose**: Simplify resource cleanup and prevent memory leaks.

**Key Components**:
- `DisposableManager`: Collects disposables and disposes all at once
- `DisposableStore`: Alternative disposable collection
- `toDisposable(fn)`: Convert cleanup function to Disposable
- `combineDisposables(...)`: Combine multiple disposables
- Helper functions for common patterns

**Integration**:
- Extension state holds single DisposableManager
- All services, commands, tree views registered with it
- Automatic cleanup on extension deactivation

### 5. Debounce Utility (`utils/debounce.ts`)

**Purpose**: Rate-limit event handlers to prevent performance issues.

**Key Functions**:
- `debounce(fn, delay)`: Standard trailing-edge debounce
- `debounceLeading(fn, delay)`: Leading-edge debounce
- `throttle(fn, delay)`: Throttle (max once per delay)
- `createDebouncedDisposable(fn, delay)`: Debounced function with cleanup
- `delay(ms)`: Promise-based delay
- `cancellableDelay(ms)`: Delay with abort signal

**Use Cases**:
- File system watcher events
- Configuration change handlers
- Search input handlers in webviews

## File Modifications

| File | Status | Description |
|------|--------|-------------|
| `packages/agency-extension/src/extension.ts` | ✅ Complete | Extension entry point with activate/deactivate |
| `packages/agency-extension/src/constants.ts` | ✅ Complete | Shared extension constants |
| `packages/agency-extension/src/utils/index.ts` | ✅ Complete | Utility module exports |
| `packages/agency-extension/src/utils/logger.ts` | ✅ Complete | Logger implementation |
| `packages/agency-extension/src/utils/disposable.ts` | ✅ Complete | Disposable management utilities |
| `packages/agency-extension/src/utils/debounce.ts` | ✅ Complete | Debounce/throttle utilities |
| `packages/agency-extension/src/__tests__/extension.test.ts` | ✅ Complete | Extension activation tests |

## Dependencies

### Runtime Dependencies
- `vscode`: VS Code extension API (provided by VS Code)
- Dynamic imports for `vscode` to support testing

### Internal Dependencies
- `./services`: ConfigService, McpClientService, ModeService (initialized during activate)
- `./providers`: Tree view providers (plugins, modes, welcome)
- `./commands`: Command registration functions
- `./errors`: ErrorNotificationService
- `./status`: StatusBarManager
- `./welcome`: WelcomeViewProvider

### Dev Dependencies
- `@types/vscode`: TypeScript definitions for VS Code API
- `vitest`: Test framework
- `typescript`: TypeScript compiler

## Testing Strategy

### Unit Tests
- Extension activation success path
- Extension activation with service initialization failures
- Extension deactivation and resource cleanup
- Logger initialization and scoped logger creation
- DisposableManager resource collection and disposal
- Debounce timing and cancellation

### Integration Tests
- Extension loads in VS Code test environment
- All services initialize successfully
- Tree views render correctly
- Commands are registered and callable

### Manual Testing
- Install extension in VS Code
- Verify output channel shows activation logs
- Check that tree views appear in activity bar
- Execute commands and verify behavior

## Success Criteria

- ✅ Extension activates without errors
- ✅ All services initialize successfully
- ✅ Logger outputs to "Agency" output channel
- ✅ DisposableManager properly cleans up resources on deactivation
- ✅ All constants are centralized and type-safe
- ✅ Unit tests pass with >80% coverage

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Service initialization failures | Wrap each service init in try-catch, show error notification |
| Memory leaks from disposables | Use DisposableManager pattern consistently |
| Logger not initialized before use | Initialize logger first in activate() |

## Follow-Up Work

After this feature is complete:
- Additional tree views (activity, containers, tools)
- MCP client connection logic
- Plugin configuration UI
- Tool testing webview
- Activity feed implementation

---

*Generated by speckit*
