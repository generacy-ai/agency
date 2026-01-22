# Quickstart: Extension Entry Point & Core Infrastructure

## Overview

This feature provides the foundation for the Agency VS Code extension. After implementation, the extension will activate properly with logging, resource management, and core utilities ready for use by other features.

## Installation (Development)

### Prerequisites

- Node.js 20+
- pnpm 8+
- VS Code 1.85+

### Setup

```bash
# Clone repository
git clone https://github.com/generacy-ai/agency.git
cd agency

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Open extension workspace
code packages/agency-extension
```

### Running in VS Code

1. Open `packages/agency-extension` in VS Code
2. Press `F5` to launch Extension Development Host
3. Extension will activate automatically
4. View logs: `View > Output > Agency`

## Usage

### Extension Activation

The extension activates automatically when VS Code starts (configured via `package.json` activationEvents).

**Activation Events**:
- `onStartupFinished`: Load when VS Code finishes startup
- View-specific events trigger on-demand loading

**What Happens During Activation**:
1. Output channel "Agency" created
2. Logger initialized
3. Services initialized (ConfigService, McpClientService, ModeService)
4. Tree views registered (plugins, modes, welcome)
5. Commands registered (plugin, tool, mode commands)
6. Status bar items created

### Viewing Logs

Open the output panel and select "Agency" channel:
- `View > Output` (or `Cmd+Shift+U` on Mac, `Ctrl+Shift+U` on Windows)
- Select "Agency" from dropdown

**Log Format**:
```
[2026-01-22 10:30:15] [Extension] [INFO] Agency extension is activating...
[2026-01-22 10:30:15] [ConfigService] [DEBUG] Loading config from .agency/agency.config.json
[2026-01-22 10:30:16] [Extension] [INFO] Agency extension activated successfully
```

### Using the Utilities (For Developers)

#### Logger

```typescript
import { createScopedLogger } from './utils';

const log = createScopedLogger('MyComponent');

log.debug('Detailed debug information');
log.info('General information');
log.warn('Warning message');
log.error('Error occurred', new Error('Details'));
```

#### DisposableManager

```typescript
import { DisposableManager } from './utils';

const disposables = new DisposableManager();

// Add disposables
disposables.add(vscode.window.onDidChangeActiveTextEditor(handler));
disposables.add(fileWatcher);
disposables.add(() => { /* custom cleanup */ });

// Later: clean up all at once
disposables.dispose();
```

#### Debounce

```typescript
import { debounce, throttle } from './utils';

// Debounce: wait for silence
const debouncedSave = debounce(saveConfig, 500);

// Throttle: max once per interval
const throttledUpdate = throttle(updateUI, 1000);

// With cleanup
const { debouncedFn, disposable } = createDebouncedDisposable(handler, 300);
// Later: disposable.dispose() to cancel pending calls
```

## Testing

### Run Tests

```bash
# From repository root
pnpm test

# From extension package
cd packages/agency-extension
pnpm test
```

### Test Coverage

```bash
pnpm test:coverage
```

### Manual Testing Checklist

1. **Activation**:
   - [ ] Extension activates without errors
   - [ ] "Agency" output channel appears
   - [ ] Activation logs visible

2. **Logging**:
   - [ ] Debug logs formatted correctly
   - [ ] Error logs include stack traces
   - [ ] Scoped loggers show component name

3. **Resource Cleanup**:
   - [ ] Reload window: no errors in developer console
   - [ ] Disable extension: deactivate() called successfully
   - [ ] No memory leaks after multiple activations

4. **Constants**:
   - [ ] Command IDs match package.json
   - [ ] View IDs match package.json
   - [ ] TypeScript autocomplete works for constants

## Troubleshooting

### Extension Fails to Activate

**Symptom**: Error notification on VS Code startup

**Possible Causes**:
1. Service initialization failure
2. Missing dependencies
3. Configuration file parse error

**Solution**:
1. Check "Agency" output channel for error details
2. Verify `.agency/agency.config.json` is valid JSON (if exists)
3. Run `pnpm build` to rebuild extension
4. Check VS Code Developer Console: `Help > Toggle Developer Tools`

### No Logs Visible

**Symptom**: Output channel exists but no logs appear

**Possible Causes**:
1. Logger not initialized
2. Output channel not selected

**Solution**:
1. Verify "Agency" channel is selected in Output panel dropdown
2. Check extension activation succeeded (no errors)
3. Reload VS Code window: `Developer: Reload Window`

### Memory Leaks

**Symptom**: Extension host uses increasing memory over time

**Possible Causes**:
1. Disposables not registered with DisposableManager
2. Event listeners not cleaned up

**Solution**:
1. Verify all services, commands, tree views added to DisposableManager
2. Use `toDisposable()` for manual cleanup functions
3. Check deactivate() is called when extension reloads

### TypeScript Errors

**Symptom**: Type errors when using constants

**Possible Causes**:
1. Missing `as const` assertion
2. Incorrect import path

**Solution**:
1. Import constants from `./constants` (not re-exported via index)
2. Verify TypeScript version matches project requirement (5.x)
3. Run `pnpm typecheck` to verify no type errors

## Common Commands

```bash
# Build extension
pnpm build

# Watch mode (rebuild on changes)
pnpm watch

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Package extension (creates .vsix)
pnpm package
```

## Next Steps

After this feature is complete:
1. Implement plugin configuration UI (tree view + webview)
2. Add MCP client connection logic
3. Implement tool browser for in-situ testing
4. Add activity feed for monitoring
5. Implement container management

## Resources

- **VS Code Extension API**: https://code.visualstudio.com/api
- **Extension Samples**: https://github.com/microsoft/vscode-extension-samples
- **Agency Repository**: https://github.com/generacy-ai/agency
- **Issue Tracker**: https://github.com/generacy-ai/agency/issues

---

*Generated by speckit*
