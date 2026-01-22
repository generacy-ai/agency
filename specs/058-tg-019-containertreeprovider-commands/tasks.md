# Tasks: ContainerTreeProvider & Commands

**Input**: Design documents from `/specs/058-tg-019-containertreeprovider-commands/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup & Structure

- [X] T001 Create directory structure for providers and commands tests
  - Create `packages/agency-extension/src/providers/__tests__/` directory
  - Create `packages/agency-extension/src/commands/__tests__/` directory
  - Ensure directories exist for integration

---

## Phase 2: Core Implementation

### ContainerTreeProvider Implementation

- [X] T002 Implement `ContainerTreeItem` class in `packages/agency-extension/src/providers/ContainerTreeProvider.ts`
  - Extend `vscode.TreeItem`
  - Add `container: ContainerInfo` property
  - Implement constructor accepting `ContainerInfo` and collapsible state
  - Set `label` from container name
  - Set `description` from container image
  - Implement `getContextValue()` based on container status
  - Implement `getIconPath()` returning ThemeIcon based on status
  - Build tooltip with container details (Markdown string)

- [X] T003 Implement `ContainerTreeProvider` class in `packages/agency-extension/src/providers/ContainerTreeProvider.ts`
  - Implement `vscode.TreeDataProvider<ContainerTreeItem>` interface
  - Add private `_onDidChangeTreeData` EventEmitter
  - Expose public `onDidChangeTreeData` event
  - Add constructor accepting `ContainerService` dependency
  - Implement `refresh()` method to fire tree data change event
  - Implement `getTreeItem(element)` returning element as-is
  - Implement `getChildren(element?)` to fetch containers from service and map to tree items
  - Handle errors gracefully (empty array on error, log error)

- [X] T004 Export `ContainerTreeProvider` from `packages/agency-extension/src/providers/index.ts`
  - Add export statement for ContainerTreeProvider

### Container Commands Implementation

- [X] T005 Implement `startContainer` command in `packages/agency-extension/src/commands/container-commands.ts`
  - Accept `ContainerTreeItem` parameter
  - Extract container ID from tree item
  - Show progress notification "Starting container..."
  - Call `containerService.startContainer(id)`
  - Handle success: show info notification, refresh tree
  - Handle errors: show error notification with details

- [X] T006 Implement `stopContainer` command in `packages/agency-extension/src/commands/container-commands.ts`
  - Accept `ContainerTreeItem` parameter
  - Extract container ID from tree item
  - Show progress notification "Stopping container..."
  - Call `containerService.stopContainer(id)`
  - Handle success: show info notification, refresh tree
  - Handle errors: show error notification with details

- [X] T007 Implement `rebuildContainer` command in `packages/agency-extension/src/commands/container-commands.ts`
  - Accept `ContainerTreeItem` parameter
  - Extract container ID and name from tree item
  - Show confirmation dialog (destructive operation)
  - If confirmed: show progress notification with cancellation token
  - Call `containerService.rebuildContainer(id)`
  - Handle success: show success notification, refresh tree
  - Handle errors: show error notification with details
  - Handle cancellation

- [X] T008 Implement `viewContainerLogs` command in `packages/agency-extension/src/commands/container-commands.ts`
  - Accept `ContainerTreeItem` parameter
  - Extract container ID from tree item
  - Check if `ContainerDetailPanel` exists (TG-020)
  - If available: open panel with logs view
  - If not available (fallback): create output channel and stream logs
  - Handle errors: show error notification

- [X] T009 Export container command functions from `packages/agency-extension/src/commands/index.ts`
  - Export `startContainer`, `stopContainer`, `rebuildContainer`, `viewContainerLogs`

---

## Phase 3: Extension Integration

- [X] T010 Register ContainerTreeProvider in `packages/agency-extension/src/extension.ts`
  - Import `ContainerTreeProvider` and `ContainerService`
  - Instantiate `ContainerService`
  - Instantiate `ContainerTreeProvider` with service dependency
  - Call `vscode.window.registerTreeDataProvider('agency.containers', provider)`
  - Add to context subscriptions

- [X] T011 Register container commands in `packages/agency-extension/src/extension.ts`
  - Import container command functions
  - Register `agency.startContainer` command
  - Register `agency.stopContainer` command
  - Register `agency.rebuildContainer` command
  - Register `agency.viewContainerLogs` command
  - Add all command registrations to context subscriptions

- [X] T012 Add container commands to VS Code command palette in `packages/agency-extension/package.json`
  - Add command contributions for `agency.startContainer`
  - Add command contributions for `agency.stopContainer`
  - Add command contributions for `agency.rebuildContainer`
  - Add command contributions for `agency.viewContainerLogs`
  - Set `when` clauses for command enablement based on context values
  - Add command titles and categories

---

## Phase 4: Testing

- [ ] T013 [P] [manual] Write unit tests for `ContainerTreeItem` in `packages/agency-extension/src/providers/__tests__/ContainerTreeProvider.test.ts`
  - Test constructor sets properties correctly
  - Test `getContextValue()` returns correct value for each status
  - Test `getIconPath()` returns correct ThemeIcon for each status
  - Test tooltip formatting with container details

- [ ] T014 [P] [manual] Write unit tests for `ContainerTreeProvider` in `packages/agency-extension/src/providers/__tests__/ContainerTreeProvider.test.ts`
  - Mock `ContainerService`
  - Test `getChildren()` fetches containers and maps to tree items
  - Test `getChildren()` returns empty array on service error
  - Test `refresh()` fires `onDidChangeTreeData` event
  - Test tree item creation from container info

- [ ] T015 [P] [manual] Write unit tests for container commands in `packages/agency-extension/src/commands/__tests__/container-commands.test.ts`
  - Mock `ContainerService` and `ContainerTreeProvider`
  - Test `startContainer` calls service and shows notifications
  - Test `stopContainer` calls service and shows notifications
  - Test `rebuildContainer` shows confirmation and calls service
  - Test `rebuildContainer` cancellation handling
  - Test `viewContainerLogs` fallback to output channel
  - Test error handling for all commands

---

## Phase 5: Polish

- [X] T016 Add JSDoc comments to public methods in `ContainerTreeProvider.ts`
  - Document class purpose and usage
  - Document constructor parameters
  - Document public methods (refresh, getTreeItem, getChildren)

- [X] T017 Add JSDoc comments to command functions in `container-commands.ts`
  - Document each command's purpose
  - Document parameters
  - Document behavior and side effects

---

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 (Setup) → Phase 2 (Core) → Phase 3 (Integration) → Phase 4 (Testing) → Phase 5 (Polish)

**Parallel opportunities**:
- Phase 4: T013, T014, T015 can run in parallel (independent test files)

**Prerequisites**:
- T002 must complete before T003 (ContainerTreeItem used by ContainerTreeProvider)
- T003 must complete before T004 (export requires implementation)
- T005-T008 must complete before T009 (export requires implementations)
- T003, T009 must complete before T010, T011 (registration requires implementations)
- T010, T011 must complete before T012 (package.json contributions reference registered commands)
- T002-T009 must complete before T013-T015 (tests require implementations)

**Cross-task dependencies**:
- Requires TG-018 (ContainerService) from parent epic to be complete
- T008 (viewContainerLogs) has optional dependency on TG-020 (ContainerDetailPanel) - uses fallback if not available

---

*Generated by speckit*
