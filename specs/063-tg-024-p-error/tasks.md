# Tasks: [P] Error Handling & UX Polish

**Input**: Design documents from `/specs/063-tg-024-p-error/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup & Error Infrastructure

- [X] T001 Create error types and base classes in `src/errors/ErrorTypes.ts`
  - [X] Create abstract `AgencyError` base class with category, getUserMessage(), getAction()
  - [X] Create `ErrorCategory` enum (DOCKER, MCP, CONFIG, NETWORK, VALIDATION, PERMISSION, UNKNOWN)
  - [X] Create `ErrorAction` interface (label, command, args)
  - [X] Implement `DockerNotRunningError` with user message and action
  - [X] Implement `ContainerNotFoundError` with user message and action
  - [X] Implement `McpConnectionError` with user message and action
  - [X] Implement `ConfigValidationError` with user message and action
  - [X] Implement `PermissionDeniedError` with user message and action

- [X] T002 [P] Create error notification service in `src/errors/ErrorNotificationService.ts`
  - [X] Implement `showError(error: Error)` method
  - [X] Add error categorization logic (detect error type)
  - [X] Integrate with VS Code `window.showErrorMessage()` API
  - [X] Add logging to output channel for detailed errors
  - [X] Implement action button handling
  - [X] Add "View Logs" default action for all errors

- [X] T003 [P] Create error module index in `src/errors/index.ts`
  - [X] Export all error types
  - [X] Export ErrorNotificationService
  - [X] Export ErrorCategory enum
  - [X] Export ErrorAction interface

## Phase 2: Status Bar Implementation

- [X] T004 Create ConnectionStatus type in `src/types/status.ts`
  - [X] Define union type for connection states (connected, disconnected, connecting, error)
  - [X] Add metadata fields (connectedAt, reason, error, startedAt, occurredAt)
  - [X] Create StatusBarState interface (text, tooltip, icon, color, command)

- [X] T005 Implement StatusBarManager in `src/status/StatusBarManager.ts`
  - [X] Create singleton class with initialization method
  - [X] Create MCP status bar item (right-aligned, priority 100)
  - [X] Create Container status bar item (right-aligned, priority 99)
  - [X] Implement `updateMcpStatus(status: ConnectionStatus)` method
  - [X] Implement `updateContainerStatus(status: ConnectionStatus)` method
  - [X] Implement status-to-statusbar-state mapping functions
  - [X] Add click handlers for status items
  - [X] Add dispose method for cleanup

- [X] T006 [P] Create status module index in `src/status/index.ts`
  - [X] Export StatusBarManager
  - [X] Export ConnectionStatus type
  - [X] Export StatusBarState interface

## Phase 3: Welcome View Implementation

- [X] T007 Create WelcomeItem interface in `src/types/welcome.ts`
  - [X] Define WelcomeItem extending TreeItem
  - [X] Add id, label, description, command, iconPath properties
  - [X] Export WelcomeItem type

- [ ] T008 Implement WelcomeViewProvider in `src/welcome/WelcomeViewProvider.ts`
  - [ ] Create class implementing TreeDataProvider<WelcomeItem>
  - [ ] Implement getChildren() to return welcome items
  - [ ] Add welcome items: Create Configuration, Browse Plugins, Connect to Container, View Documentation, Watch Tutorial
  - [ ] Implement getTreeItem() method
  - [ ] Add visibility logic based on config existence
  - [ ] Integrate with VS Code global state for first-run detection

- [ ] T009 [P] Create welcome module index in `src/welcome/index.ts`
  - [ ] Export WelcomeViewProvider
  - [ ] Export registration function

## Phase 4: Integration with Extension

- [ ] T010 Update extension.ts to initialize error handling
  - [ ] Import ErrorNotificationService
  - [ ] Wrap service initializations in try-catch blocks
  - [ ] Replace generic error handling with ErrorNotificationService.showError()
  - [ ] Add error handling to extension activation
  - [ ] Add error handling to extension deactivation

- [ ] T011 [P] Update extension.ts to initialize StatusBarManager
  - [ ] Import StatusBarManager
  - [ ] Initialize StatusBarManager in activate()
  - [ ] Add to disposables for cleanup
  - [ ] Register status bar click commands

- [ ] T012 [P] Update extension.ts to register WelcomeViewProvider
  - [ ] Import WelcomeViewProvider
  - [ ] Register welcome tree view in activate()
  - [ ] Add view contribution to disposables
  - [ ] Check first-run state and show/hide welcome view

## Phase 5: Service Integration

- [ ] T013 Update ConfigService to use typed errors
  - [ ] Import AgencyError types
  - [ ] Replace generic Error throws with ConfigValidationError
  - [ ] Replace generic Error throws with PermissionDeniedError for file access
  - [ ] Update error handling in initialize(), loadConfig(), saveConfig()
  - [ ] Add try-catch with ErrorNotificationService in public methods

- [ ] T014 [P] Update McpClientService to use typed errors and status updates
  - [ ] Import McpConnectionError
  - [ ] Import StatusBarManager
  - [ ] Replace generic errors with McpConnectionError
  - [ ] Add status updates to connect() method (connecting → connected/error)
  - [ ] Add status updates to disconnect() method
  - [ ] Add error handling with ErrorNotificationService

- [ ] T015 [P] Update ContainerService to use typed errors and status updates
  - [ ] Import DockerNotRunningError, ContainerNotFoundError
  - [ ] Import StatusBarManager
  - [ ] Replace generic errors with typed errors
  - [ ] Add status updates to container lifecycle methods
  - [ ] Add error handling with ErrorNotificationService

## Phase 6: Package Manifest Updates

- [ ] T016 Update package.json with welcome view contribution
  - [ ] Add welcome view to contributes.views.agency array
  - [ ] Set view id: "agency.welcome"
  - [ ] Set view name: "Getting Started"
  - [ ] Set visibility condition based on config existence

- [ ] T017 [P] Update package.json with walkthrough contribution
  - [ ] Add contributes.walkthroughs array
  - [ ] Define walkthrough id: "agency.gettingStarted"
  - [ ] Define walkthrough title: "Get Started with Agency"
  - [ ] Add Step 1: Create configuration file
  - [ ] Add Step 2: Configure first plugin
  - [ ] Add Step 3: Connect to container
  - [ ] Add Step 4: Test a tool
  - [ ] Add Step 5: View activity feed
  - [ ] Set completion events for each step

- [ ] T018 [P] Add status bar commands to package.json
  - [ ] Register agency.showMcpStatus command
  - [ ] Register agency.connectMcp command
  - [ ] Register agency.showMcpError command
  - [ ] Register agency.showContainerStatus command
  - [ ] Register agency.initConfig command (for welcome view)

## Phase 7: Testing

- [ ] T019 Create error types tests in `src/__tests__/errors/ErrorTypes.test.ts`
  - [ ] Test AgencyError base class structure
  - [ ] Test each concrete error class (getUserMessage, getAction)
  - [ ] Test error categorization
  - [ ] Verify action button data structure

- [ ] T020 [P] Create ErrorNotificationService tests in `src/__tests__/errors/ErrorNotificationService.test.ts`
  - [ ] Mock VS Code window API
  - [ ] Test showError with each error type
  - [ ] Verify correct notification method called
  - [ ] Verify logging to output channel
  - [ ] Test action button handling

- [ ] T021 [P] Create StatusBarManager tests in `src/__tests__/status/StatusBarManager.test.ts`
  - [ ] Mock VS Code StatusBarItem API
  - [ ] Test updateMcpStatus for all states
  - [ ] Test updateContainerStatus for all states
  - [ ] Verify status item text, tooltip, icon updates
  - [ ] Test click command registration
  - [ ] Test dispose cleanup

- [ ] T022 [P] Create WelcomeViewProvider tests in `src/__tests__/welcome/WelcomeViewProvider.test.ts`
  - [ ] Test getChildren returns correct welcome items
  - [ ] Test getTreeItem returns proper TreeItem structure
  - [ ] Test visibility logic based on config state
  - [ ] Verify command associations for each item

## Phase 8: Manual Validation

- [ ] T023 [manual] Manual test: Docker error scenarios
  - [ ] Stop Docker and verify "Docker not running" error shows
  - [ ] Verify error message is user-friendly
  - [ ] Verify "View Documentation" action opens docs
  - [ ] Start Docker and verify error clears

- [ ] T024 [manual] Manual test: Status bar indicators
  - [ ] Verify MCP status shows in status bar
  - [ ] Verify Container status shows in status bar
  - [ ] Click MCP status item and verify action
  - [ ] Click Container status item and verify action
  - [ ] Verify status updates in real-time during connection

- [ ] T025 [manual] Manual test: Welcome view
  - [ ] Fresh install: verify welcome view appears
  - [ ] Click "Create Configuration" and verify action
  - [ ] Verify welcome view hides after config created
  - [ ] Verify all welcome items have correct commands

- [ ] T026 [manual] Manual test: Walkthrough
  - [ ] Open walkthrough from Command Palette
  - [ ] Complete Step 1 and verify checkmark
  - [ ] Complete all 5 steps end-to-end
  - [ ] Verify completion events trigger properly

## Dependencies & Execution Order

### Sequential Dependencies:
- **Phase 1 → Phase 2-3**: Error types and services must exist before status and welcome can use them
- **Phase 2-3 → Phase 4-5**: Status bar and welcome implementations must exist before extension integration
- **Phase 4-5 → Phase 6**: Extension integration complete before manifest updates
- **Phase 6 → Phase 7**: Manifest complete before testing
- **Phase 7 → Phase 8**: Automated tests complete before manual validation

### Parallel Opportunities:
- **Phase 1**: T002 and T003 can run in parallel with T001 (different files)
- **Phase 2**: T006 can run in parallel with T004-T005
- **Phase 3**: T009 can run in parallel with T007-T008
- **Phase 4**: T011 and T012 can run in parallel with T010 (different sections of same file)
- **Phase 5**: T014 and T015 can run in parallel with T013 (different service files)
- **Phase 6**: T017 and T018 can run in parallel with T016 (different sections of package.json)
- **Phase 7**: T020, T021, T022 can all run in parallel (different test files)
- **Phase 8**: T024, T025, T026 can run in parallel after T023 (different features)

### Parallel Batches Summary:
- Batch 1 (Phase 1): T002, T003 after T001
- Batch 2 (Phase 2): T006 with T005
- Batch 3 (Phase 3): T009 with T008
- Batch 4 (Phase 4): T011, T012 after T010
- Batch 5 (Phase 5): T014, T015 with T013
- Batch 6 (Phase 6): T017, T018 with T016
- Batch 7 (Phase 7): T020, T021, T022 after T019
- Batch 8 (Phase 8): T024, T025, T026 with T023

---

*Generated by speckit*
