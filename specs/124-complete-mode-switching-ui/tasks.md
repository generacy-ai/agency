# Tasks: Complete Mode Switching UI

**Input**: Design documents from `/specs/124-complete-mode-switching-ui/`
**Prerequisites**: plan.md (required), spec.md (required), research.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which acceptance criterion this task addresses

## Phase 1: Setup & Exports

- [x] T001 [P] Add MODE_COMMANDS constants to `packages/agency-extension/src/constants.ts`
- [x] T002 [P] Export mode command registration from `packages/agency-extension/src/commands/index.ts`
- [x] T003 [P] Export registerModeTreeView from `packages/agency-extension/src/providers/index.ts`
- [x] T004 Add `agency.currentMode` configuration property to `packages/agency-extension/package.json`

## Phase 2: Core Implementation

- [x] T005 [AC1] Add `registerModeCommands()` function to `packages/agency-extension/src/commands/mode-commands.ts`
- [x] T006 [AC2] Add mode status bar item to `packages/agency-extension/src/status/StatusBarManager.ts`
- [x] T007 [AC5] Add workspace settings persistence to `packages/agency-extension/src/services/ModeService.ts`

## Phase 3: Extension Wiring

- [x] T008 [AC1,AC3] Wire mode commands and tree view registration in `packages/agency-extension/src/extension.ts`
- [x] T009 [AC4] Verify ModeTreeProvider updates tools list when mode changes (may need refresh call)

## Phase 4: Testing & Verification

- [x] T010 [P] Add unit tests for mode persistence in ModeService
- [x] T011 [P] Add unit tests for mode status bar item updates
- [ ] T012 [manual] Manual verification: Test all 5 acceptance criteria in VS Code

## Dependencies & Execution Order

**Phase 1 (Setup)**: T001, T002, T003 can run in parallel. T004 independent.

**Phase 2 (Core)**: Depends on Phase 1 exports. T005, T006, T007 can run in parallel as they modify different files.

**Phase 3 (Wiring)**: Depends on Phase 2. T008 requires T005 (commands) and T003 (tree view export). T009 depends on T008.

**Phase 4 (Testing)**: T010, T011 can run in parallel after Phase 2. T012 runs last after all implementation.

## Acceptance Criteria Mapping

| AC | Description | Tasks |
|----|-------------|-------|
| AC1 | Can switch modes via command palette | T005, T008 |
| AC2 | Status bar shows current mode | T006 |
| AC3 | Mode tree view displays correctly | T003, T008 |
| AC4 | Tools list updates when mode changes | T009 |
| AC5 | Mode persists across VS Code restarts | T004, T007 |
