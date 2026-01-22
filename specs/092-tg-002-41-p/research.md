# Research: Extension Entry Point & Core Infrastructure

## Technical Decisions

### 1. Extension State Management

**Decision**: Module-level state variable with interface

**Options Considered**:
- A. Global singleton class
- B. Module-level variable (CHOSEN)
- C. Context.globalState for persistence

**Rationale**:
- Module-level variable is simplest and sufficient for runtime state
- No need for persistence across VS Code sessions
- Easy to test by exporting `getExtensionState()` accessor
- Follows common VS Code extension patterns

**References**:
- VS Code Extension API documentation: https://code.visualstudio.com/api/references/vscode-api
- Extension samples: https://github.com/microsoft/vscode-extension-samples

### 2. Logger Design

**Decision**: Singleton pattern with scoped logger factory

**Options Considered**:
- A. Pass output channel to every module
- B. Singleton logger with scoped loggers (CHOSEN)
- C. Third-party logging library (winston, pino)

**Rationale**:
- Singleton ensures single output channel
- Scoped loggers provide context without boilerplate
- No external dependencies for simple logging needs
- VS Code output channel is sufficient for extension logging

**Implementation Pattern**:
```typescript
const log = createScopedLogger('ComponentName');
log.info('Message'); // [2026-01-22 10:30:15] [ComponentName] [INFO] Message
```

**References**:
- VS Code output channel API: https://code.visualstudio.com/api/references/vscode-api#OutputChannel

### 3. Disposable Management

**Decision**: DisposableManager class with fluent API

**Options Considered**:
- A. Manual tracking in array
- B. DisposableManager class (CHOSEN)
- C. VS Code's DisposableStore (not available in extension API)

**Rationale**:
- Centralized disposal prevents resource leaks
- Fluent API (`manager.add(disposable)`) is ergonomic
- Implements VS Code's Disposable interface
- Can be registered with `context.subscriptions` for automatic cleanup

**Design Pattern**:
```typescript
const disposables = new DisposableManager();
disposables.add(service1);
disposables.add(service2);
// Later: disposables.dispose() cleans up all
```

**References**:
- VS Code Disposable interface: https://code.visualstudio.com/api/references/vscode-api#Disposable

### 4. Constants Organization

**Decision**: Grouped constants with `as const` assertions

**Options Considered**:
- A. Individual exports
- B. Namespaced objects with `as const` (CHOSEN)
- C. Enum types

**Rationale**:
- `as const` provides type-level string literal types
- Grouped constants are easier to discover
- Avoids enum runtime overhead
- TypeScript infers exact types (e.g., `"agency.plugins"` not `string`)

**Pattern**:
```typescript
export const VIEW_IDS = {
  PLUGINS: 'agency.plugins',
  TOOLS: 'agency.tools',
} as const;
// VIEW_IDS.PLUGINS has type "agency.plugins"
```

**References**:
- TypeScript const assertions: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions

### 5. Debounce Implementation

**Decision**: Multiple utility functions for different patterns

**Options Considered**:
- A. Single debounce function with options object
- B. Multiple specialized functions (CHOSEN)
- C. lodash.debounce dependency

**Rationale**:
- Multiple functions make intent clear (`debounce` vs `throttle`)
- No external dependency
- TypeScript generics preserve function signatures
- Disposable variants integrate with cleanup pattern

**Functions Provided**:
- `debounce`: Trailing-edge (wait for silence)
- `debounceLeading`: Leading-edge (immediate first call)
- `throttle`: Max once per interval
- `createDebouncedDisposable`: Returns disposable for cleanup

**References**:
- Debouncing vs throttling: https://css-tricks.com/debouncing-throttling-explained-examples/

### 6. Dynamic vscode Import

**Decision**: Dynamic import of `vscode` module in activate()

**Options Considered**:
- A. Static `import * as vscode from 'vscode'`
- B. Dynamic `await import('vscode')` (CHOSEN)

**Rationale**:
- Supports unit testing without VS Code environment
- Can mock vscode module in tests
- VS Code extension host provides `vscode` module at runtime
- No runtime cost (module cached after first import)

**Pattern**:
```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const vscodeModule = await import('vscode');
  // Use vscodeModule.window, vscodeModule.commands, etc.
}
```

**References**:
- VS Code extension testing: https://code.visualstudio.com/api/working-with-extensions/testing-extension

### 7. Error Handling Strategy

**Decision**: Fail-fast with error notifications

**Options Considered**:
- A. Silent failures with logging
- B. Fail-fast with user notification (CHOSEN)
- C. Partial activation on errors

**Rationale**:
- Better UX to show error than appear "working" but broken
- User can take action (check logs, report issue)
- Prevents cascade failures from partially initialized state
- Each service wrapped individually to identify failure point

**Implementation**:
```typescript
try {
  await configService.initialize(vscodeModule);
} catch (error) {
  log.error('Failed to initialize ConfigService', error);
  await ErrorNotificationService.showError(error as Error);
  throw error; // Prevent activation
}
```

**References**:
- Error notification best practices: https://code.visualstudio.com/api/ux-guidelines/notifications

## Implementation Patterns

### Service Initialization Pattern

All services follow a consistent initialization pattern:
1. Get singleton instance
2. Call `initialize(vscode)` with VS Code module
3. Register disposable for cleanup
4. Catch and report errors

```typescript
const service = ServiceClass.getInstance();
await service.initialize(vscodeModule);
disposables.add({ dispose: () => ServiceClass.reset() });
```

### Command Registration Pattern

Commands registered in two ways:
1. Bulk registration via `registerXxxCommands(vscode)` functions
2. Individual registration for special cases

All commands added to DisposableManager for cleanup.

### Scoped Logging Pattern

Every module creates a scoped logger at top level:
```typescript
const log = createScopedLogger('ModuleName');
```

Provides consistent log output with clear component identification.

## Key Sources

1. **VS Code Extension API**: https://code.visualstudio.com/api
2. **Extension Guides**: https://code.visualstudio.com/api/extension-guides/overview
3. **Extension Samples**: https://github.com/microsoft/vscode-extension-samples
4. **TypeScript Handbook**: https://www.typescriptlang.org/docs/handbook/intro.html
5. **VS Code UX Guidelines**: https://code.visualstudio.com/api/ux-guidelines/overview

---

*Generated by speckit*
