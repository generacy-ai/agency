# Tasks: Extension Entry Point & Core Infrastructure

**Input**: Design documents from `/specs/092-tg-002-41-p/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Core Utilities (Foundation)

- [x] T001 [P] [US1] Implement `constants.ts` with extension identifiers, command IDs, view IDs, config keys, and log levels
  - File: `packages/agency-extension/src/constants.ts`
  - Use `as const` assertions for type safety
  - Export: EXTENSION_ID, EXTENSION_NAME, VIEW_IDS, COMMANDS, CONFIG_KEYS, CONFIG_DEFAULTS, LOG_LEVELS, CONTEXT_KEYS

- [x] T002 [P] [US1] Implement `logger.ts` singleton with output channel integration
  - File: `packages/agency-extension/src/utils/logger.ts`
  - Create Logger singleton class with getInstance()
  - Implement initialize(outputChannel) method
  - Implement log methods: debug, info, warn, error
  - Create createScopedLogger(scope) factory function
  - Log format: [timestamp] [scope] [level] message

- [x] T003 [P] [US1] Implement `disposable.ts` with DisposableManager and helper functions
  - File: `packages/agency-extension/src/utils/disposable.ts`
  - Create DisposableManager class implementing vscode.Disposable
  - Implement add() method accepting Disposable or cleanup function
  - Implement dispose() method (dispose in reverse order)
  - Create helper functions: toDisposable, combineDisposables, emptyDisposable
  - Export DisposableStore as alternative pattern

- [x] T004 [P] [US1] Implement `debounce.ts` with debounce, throttle, and delay utilities
  - File: `packages/agency-extension/src/utils/debounce.ts`
  - Implement debounce(fn, delay) - trailing edge
  - Implement debounceLeading(fn, delay) - leading edge
  - Implement throttle(fn, delay) - max once per interval
  - Implement createDebouncedDisposable(fn, delay) - returns {debouncedFn, disposable}
  - Implement delay(ms) and cancellableDelay(ms) - promise-based delays

- [x] T005 [US1] Create `utils/index.ts` to export all utility functions
  - File: `packages/agency-extension/src/utils/index.ts`
  - Export logger utilities: Logger, createScopedLogger, getLogger
  - Export disposable utilities: DisposableManager, toDisposable, combineDisposables, etc.
  - Export debounce utilities: debounce, throttle, delay, etc.

## Phase 2: Extension Entry Point

- [x] T006 [US1] Implement `extension.ts` activate() function
  - File: `packages/agency-extension/src/extension.ts`
  - Create ExtensionState interface (context, disposables, outputChannel)
  - Implement activate(context) as async function
  - Dynamic import of vscode module for testability
  - Create output channel and initialize logger
  - Create DisposableManager and store in module-level extensionState
  - Initialize services with try-catch error handling:
    - ConfigService.getInstance().initialize(vscode)
    - McpClientService.getInstance().initialize(vscode)
    - ModeService.getInstance().initialize(vscode)
  - Initialize command modules: initializePluginCommands, initializeToolCommands, initializeModeCommands
  - Initialize StatusBarManager
  - Register tree views: registerPluginTreeView, registerModeTreeView, WelcomeViewProvider
  - Register commands: registerPluginCommands, registerToolCommands, mode commands, stub commands
  - Register all disposables with context.subscriptions
  - Log activation success

- [x] T007 [US1] Implement `extension.ts` deactivate() function
  - File: `packages/agency-extension/src/extension.ts`
  - Check if extensionState exists
  - Log deactivation start
  - Clear extensionState reference (cleanup handled by VS Code calling dispose on DisposableManager)
  - Log deactivation success
  - Catch and log any deactivation errors (don't throw)

- [x] T008 [US1] Implement `extension.ts` getExtensionState() accessor
  - File: `packages/agency-extension/src/extension.ts`
  - Export getExtensionState() function
  - Return extensionState (may be null if not activated)
  - Purpose: Allow tests to access extension state

- [x] T009 [US1] Implement initializeLogger() helper function
  - File: `packages/agency-extension/src/extension.ts`
  - Create initializeLogger(outputChannel) function
  - Get Logger singleton instance
  - Call logger.initialize(outputChannel)

- [x] T010 [US1] Implement registerCommands() helper function
  - File: `packages/agency-extension/src/extension.ts`
  - Register plugin commands via registerPluginCommands(vscode)
  - Register tool commands via registerToolCommands(vscode)
  - Register mode commands: agency.switchMode, agency.viewModeTools
  - Register stub commands: agency.startContainer, agency.stopContainer, agency.rebuildContainer, agency.viewContainerLogs
  - Register status bar commands: agency.showMcpStatus, agency.connectMcp, agency.showMcpError, agency.showContainerStatus
  - Register welcome view commands: agency.initConfig, agency.showPlugins, agency.openDocs
  - Add all command disposables to state.disposables
  - Log command registration counts

## Phase 3: Testing

- [x] T011 [US1] Write extension activation tests
  - File: `packages/agency-extension/src/__tests__/extension.test.ts`
  - Test: Extension activates successfully
    - Mock vscode module and dependencies
    - Call activate() with mock context
    - Verify logger initialized
    - Verify services initialized
    - Verify commands registered
    - Verify no errors thrown
  - Test: Extension handles service initialization failures
    - Mock service initialization to throw error
    - Verify ErrorNotificationService.showError called
    - Verify error propagated (activation fails)
  - Test: Extension deactivates successfully
    - Call activate() then deactivate()
    - Verify extensionState cleared
    - Verify no errors thrown
  - Test: getExtensionState() returns correct state
    - Verify returns null before activation
    - Verify returns ExtensionState after activation
    - Verify returns null after deactivation

## Dependencies & Execution Order

### Phase Dependencies (Sequential)
1. **Phase 1** (Core Utilities) must complete first - provides foundation for extension entry point
2. **Phase 2** (Extension Entry Point) depends on Phase 1 - uses logger, disposables, constants
3. **Phase 3** (Testing) depends on Phase 2 - tests the complete extension

### Parallel Opportunities Within Phases

**Phase 1 (All tasks can run in parallel)**:
- T001 (constants), T002 (logger), T003 (disposable), T004 (debounce) are independent
- T005 (utils/index.ts) should be done last to export from T002-T004

**Phase 2 (Sequential within phase)**:
- T006-T010 all modify extension.ts and must be done sequentially
- Alternatively, could be done as a single comprehensive task

**Phase 3 (Single task)**:
- T011 tests all of Phase 1 and Phase 2

### Task Completion Status

**All tasks completed**: ✅
- All source files exist and are implemented
- Extension activates successfully with full service initialization
- Tests are in place

---

*Generated by speckit*
