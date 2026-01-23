# Tasks: Complete Container Operations UI

**Input**: Design documents from `/specs/125-complete-container-operations-ui/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundation

**Purpose**: Core utilities and event infrastructure needed by all user stories

- [x] T001 Create devcontainer detection utility in `packages/agency-extension/src/utils/devcontainerDetector.ts`
- [x] T002 Create McpConnectionManager service in `packages/agency-extension/src/services/McpConnectionManager.ts`
- [x] T003 Fix ContainerTreeProvider event subscription (change `onDidChangeState` to `onContainerStateChange`) in `packages/agency-extension/src/providers/ContainerTreeProvider.ts`

**Checkpoint**: Foundation ready - command implementations can begin

---

## Phase 2: User Story 1 - Start Container from Tree View (Priority: P1)

**Goal**: Enable developers to start dev containers from the tree view with progress feedback

**Independent Test**: Can start a container with devcontainer.json, see progress notification, tree view updates

### Implementation for User Story 1

- [x] T004 [US1] Implement `startContainer` command in `packages/agency-extension/src/commands/container-commands.ts`
- [x] T005 [US1] Add devcontainer.json validation before start in `packages/agency-extension/src/commands/container-commands.ts`
- [x] T006 [US1] Add progress notification for start operation in `packages/agency-extension/src/commands/container-commands.ts`
- [x] T007 [US1] Register startContainer command in `packages/agency-extension/src/extension.ts`

**Checkpoint**: Can start containers from tree view with validation and progress feedback

---

## Phase 3: User Story 2 - Stop Container with MCP Cleanup (Priority: P1)

**Goal**: Stop containers gracefully with automatic MCP disconnection via events

**Independent Test**: Can stop a running container, MCP auto-disconnects, tree view updates

### Implementation for User Story 2

- [x] T008 [US2] Implement `stopContainer` command in `packages/agency-extension/src/commands/container-commands.ts`
- [x] T009 [US2] Add MCP disconnect coordination via McpConnectionManager in `packages/agency-extension/src/services/McpConnectionManager.ts`
- [x] T010 [US2] Register stopContainer command in `packages/agency-extension/src/extension.ts`

**Checkpoint**: Can stop containers with automatic MCP cleanup

---

## Phase 4: User Story 3 - View and Filter Container Logs (Priority: P2)

**Goal**: View and filter container logs in real-time with text search and log level filtering

**Independent Test**: Logs stream in real-time, can filter by text and stdout/stderr

### Implementation for User Story 3

- [x] T011 [US3] Implement `viewContainerLogs` command in `packages/agency-extension/src/commands/container-commands.ts`
- [x] T012 [US3] Add log level filter UI (stdout/stderr dropdown) to webview in `packages/agency-extension/src/views/containers/ContainerDetailPanel.ts`
- [x] T013 [US3] Implement combined text + log level filtering logic in `packages/agency-extension/src/views/containers/ContainerDetailPanel.ts`
- [x] T014 [US3] Register viewContainerLogs command in `packages/agency-extension/src/extension.ts`

**Checkpoint**: Can view and filter logs by text and log level

---

## Phase 5: Rebuild Container (Priority: P1)

**Goal**: Rebuild container from devcontainer.json with progress and MCP reconnection

**Independent Test**: Rebuild works, progress shown, MCP reconnects after rebuild

### Implementation

- [x] T015 Implement `rebuildContainer` command in `packages/agency-extension/src/commands/container-commands.ts`
- [x] T016 Add rebuild progress notification with build output in `packages/agency-extension/src/commands/container-commands.ts`
- [x] T017 Add MCP reconnect coordination after rebuild via McpConnectionManager in `packages/agency-extension/src/services/McpConnectionManager.ts`
- [x] T018 Register rebuildContainer command in `packages/agency-extension/src/extension.ts`

**Checkpoint**: Can rebuild containers with progress and MCP auto-reconnect

---

## Phase 6: Integration & Polish

**Purpose**: Wire everything together and add finishing touches

- [x] T019 Create command exports in `packages/agency-extension/src/commands/index.ts`
- [x] T020 Add container picker for commands invoked without tree item context in `packages/agency-extension/src/commands/container-commands.ts`
- [x] T021 Add command availability based on container status (enablement) in `packages/agency-extension/package.json`
- [x] T022 Update context menu for container tree items in `packages/agency-extension/package.json`
- [x] T023 Initialize McpConnectionManager in extension activation in `packages/agency-extension/src/extension.ts`

**Checkpoint**: All commands wired up, context menus working, commands enabled/disabled appropriately

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundation)**: No dependencies - can start immediately
- **Phase 2 (US1 - Start)**: Depends on T001 (devcontainer detector), T003 (tree provider fix)
- **Phase 3 (US2 - Stop)**: Depends on T002 (McpConnectionManager)
- **Phase 4 (US3 - Logs)**: Depends on Phase 1 only (independent of other stories)
- **Phase 5 (Rebuild)**: Depends on T001, T002 (needs both devcontainer and MCP manager)
- **Phase 6 (Integration)**: Depends on all previous phases

### Task Dependencies

```
T001 (devcontainer) ─┬─> T004-T007 (US1: Start)
                     └─> T015-T018 (Rebuild)

T002 (McpConnectionManager) ─┬─> T008-T010 (US2: Stop)
                             └─> T015-T018 (Rebuild)

T003 (TreeProvider fix) ───> All phases (tree updates work correctly)

T011-T014 (US3: Logs) ───> Independent (can run parallel with US1, US2)
```

### Parallel Opportunities

- T001, T002, T003 can run in parallel (different files)
- US1, US2, US3 can run in parallel after their dependencies complete
- T011-T014 (logs) has minimal dependencies and can run early

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 (Foundation) - all 3 tasks
2. Complete Phase 2 (Start Container) - validates the whole pipeline works
3. Complete Phase 3 (Stop Container) - closes the lifecycle loop
4. Complete Phase 6 (Integration) - make it production-ready

### Incremental Delivery

- Each user story adds independent value
- Start → Stop → Logs → Rebuild is the natural learning curve for users
- Each phase can be tested independently before moving on

---

## Notes

- ContainerService is already fully implemented - use existing methods
- ContainerDetailPanel already has text filtering - extend with log level
- McpClientService has connect/disconnect - McpConnectionManager coordinates events
- All paths relative to `packages/agency-extension/`
