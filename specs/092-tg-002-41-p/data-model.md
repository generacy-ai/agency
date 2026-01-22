# Data Model: Extension Entry Point & Core Infrastructure

## Core Entities

### ExtensionState

**Purpose**: Container for extension-wide state and resources.

**Definition**:
```typescript
interface ExtensionState {
  context: vscode.ExtensionContext;
  disposables: DisposableManager;
  outputChannel: vscode.OutputChannel;
}
```

**Fields**:
- `context`: VS Code extension context (provided by VS Code)
  - Contains: `subscriptions`, `extensionUri`, `globalState`, `workspaceState`
- `disposables`: DisposableManager instance for resource cleanup
- `outputChannel`: Output channel for logging ("Agency" channel)

**Lifecycle**:
- Created: During `activate()`
- Stored: Module-level variable `extensionState`
- Destroyed: During `deactivate()`

**Relationships**:
- Owned by extension module
- Accessed via `getExtensionState()` for testing

### Logger

**Purpose**: Centralized logging with output channel integration.

**Type**: Singleton class

**Methods**:
```typescript
class Logger {
  static getInstance(): Logger
  initialize(outputChannel: vscode.OutputChannel): void
  debug(scope: string, message: string, ...args: any[]): void
  info(scope: string, message: string, ...args: any[]): void
  warn(scope: string, message: string, ...args: any[]): void
  error(scope: string, message: string, error?: Error): void
}
```

**Scoped Logger Interface**:
```typescript
interface ScopedLogger {
  debug(message: string, ...args: any[]): void
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, error?: Error): void
}
```

**Factory**:
```typescript
function createScopedLogger(scope: string): ScopedLogger
```

**State**:
- `outputChannel`: VS Code output channel (set via `initialize()`)
- `scope`: String identifier for component logging

### DisposableManager

**Purpose**: Collect and dispose multiple disposables.

**Definition**:
```typescript
class DisposableManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  add(disposable: vscode.Disposable | (() => void)): void
  dispose(): void
}
```

**Methods**:
- `add(disposable)`: Add a disposable to the collection
  - Accepts `Disposable` objects or cleanup functions
  - Cleanup functions converted via `toDisposable(fn)`
- `dispose()`: Dispose all collected disposables in reverse order

**Implements**: `vscode.Disposable` interface

**Usage Pattern**:
```typescript
const disposables = new DisposableManager();
disposables.add(service1);
disposables.add(treeView);
disposables.add(() => { /* cleanup */ });
// Later: disposables.dispose()
```

### Disposable Helper Functions

**toDisposable**:
```typescript
function toDisposable(fn: () => void): vscode.Disposable
```
Converts a cleanup function to a Disposable object.

**combineDisposables**:
```typescript
function combineDisposables(...disposables: vscode.Disposable[]): vscode.Disposable
```
Combines multiple disposables into a single disposable.

**emptyDisposable**:
```typescript
const emptyDisposable: vscode.Disposable
```
No-op disposable for default values.

### Debounce Functions

**debounce**:
```typescript
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void
```
Trailing-edge debounce (waits for silence before calling).

**debounceLeading**:
```typescript
function debounceLeading<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void
```
Leading-edge debounce (immediate first call, then blocks).

**throttle**:
```typescript
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void
```
Throttle (max once per interval).

**createDebouncedDisposable**:
```typescript
function createDebouncedDisposable<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): {
  debouncedFn: (...args: Parameters<T>) => void;
  disposable: vscode.Disposable;
}
```
Returns debounced function and disposable for cleanup.

**delay/cancellableDelay**:
```typescript
function delay(ms: number): Promise<void>
function cancellableDelay(ms: number): { promise: Promise<void>; cancel: () => void }
```
Promise-based delays with optional cancellation.

## Constants

### EXTENSION_ID
**Type**: `string`
**Value**: `"generacy-ai.agency-extension"`
**Usage**: Extension marketplace identifier

### EXTENSION_NAME
**Type**: `string`
**Value**: `"Agency"`
**Usage**: Display name in UI

### VIEW_IDS
**Type**: `Record<string, string>` (with const assertion)
**Values**:
- `PLUGINS`: `"agency.plugins"`
- `TOOLS`: `"agency.tools"`
- `ACTIVITY`: `"agency.activity"`
- `CONTAINERS`: `"agency.containers"`
- `MODES`: `"agency.modes"`

### COMMANDS
**Type**: `Record<string, string>` (with const assertion)
**Categories**:
- Plugin commands: `CONFIGURE_PLUGIN`, `ENABLE_PLUGIN`, etc.
- Tool commands: `TEST_TOOL`, `CONNECT_MCP`, etc.
- Mode commands: `SWITCH_MODE`, `VIEW_MODE_TOOLS`
- Container commands: `START_CONTAINER`, `STOP_CONTAINER`, etc.

### CONFIG_KEYS
**Type**: `Record<string, string>` (with const assertion)
**Values**:
- `CONFIG_PATH`: `"agency.configPath"`
- `AUTO_CONNECT`: `"agency.autoConnect"`

### CONFIG_DEFAULTS
**Type**: `Record<string, any>` (with const assertion)
**Values**:
- `CONFIG_PATH`: `".agency/agency.config.json"`
- `AUTO_CONNECT`: `true`

### LOG_LEVELS
**Type**: `Record<string, string>` (with const assertion)
**Values**:
- `DEBUG`: `"DEBUG"`
- `INFO`: `"INFO"`
- `WARN`: `"WARN"`
- `ERROR`: `"ERROR"`

**Derived Type**:
```typescript
type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];
```

### CONTEXT_KEYS
**Type**: `Record<string, string>` (with const assertion)
**Values**:
- `MCP_CONNECTED`: `"agency.mcpConnected"`
- `HAS_CONTAINERS`: `"agency.hasContainers"`
- `HAS_PLUGINS`: `"agency.hasPlugins"`

**Usage**: VS Code context keys for conditional command enablement

## Type Relationships

```
ExtensionState
  ├── context: vscode.ExtensionContext (external)
  ├── disposables: DisposableManager
  └── outputChannel: vscode.OutputChannel (external)

DisposableManager implements vscode.Disposable
  └── disposables: vscode.Disposable[]

Logger (singleton)
  ├── outputChannel: vscode.OutputChannel
  └── createScopedLogger() → ScopedLogger

Constants (module-level exports)
  ├── EXTENSION_ID: string
  ├── VIEW_IDS: const object
  ├── COMMANDS: const object
  ├── CONFIG_KEYS: const object
  └── LOG_LEVELS: const object → LogLevel type
```

## Validation Rules

### Logger
- Must be initialized with output channel before use
- Scope strings should be PascalCase component names
- Error logging optionally accepts Error object for stack traces

### DisposableManager
- Disposables disposed in reverse order of addition
- Safe to call `dispose()` multiple times (no-op after first)
- Null/undefined disposables are filtered out

### Constants
- All const objects use `as const` assertion for type safety
- Command identifiers must match package.json contributions
- View IDs must match package.json view contributions

---

*Generated by speckit*
