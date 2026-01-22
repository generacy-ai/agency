# Tasks: ConfigService Implementation

**Input**: Design documents from `/specs/096-tg-006-45-us1/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Service Implementation

### Setup and Core Structure

- [x] T001 [US1] Create `packages/agency-extension/src/services/ConfigService.ts` with class skeleton
- [x] T002 [P] [US1] Implement singleton pattern with `getInstance()` and private constructor
- [x] T003 [P] [US1] Add internal state: `_config`, `_disposables`, `_vscode` properties
- [x] T004 [US1] Export ConfigService from `packages/agency-extension/src/services/index.ts`

### Initialization and Lifecycle

- [x] T005 [US1] Implement `initialize(vscode)` method with config loading
- [x] T006 [US1] Add version compatibility check in initialization
- [x] T007 [US1] Implement `dispose()` method with DisposableManager cleanup
- [x] T008 [P] [US1] Add `reset()` method for test cleanup

## Phase 2: Configuration Access Methods

### Getter Methods

- [x] T009 [US1] Implement `getConfig()` to return full AgencyConfig
- [x] T010 [P] [US1] Implement `getPlugins()` to return plugins array
- [x] T011 [P] [US1] Implement `getModes()` to return modes array
- [x] T012 [P] [US1] Implement `getContainers()` to return containers array
- [x] T013 [P] [US1] Implement `getPlugin(id)` for single plugin lookup
- [x] T014 [P] [US1] Implement `getMode(id)` for single mode lookup
- [x] T015 [P] [US1] Implement `getContainer(id)` for single container lookup

## Phase 3: Configuration Mutation Methods

### Save Methods

- [x] T016 [US1] Implement `savePluginConfig(plugin)` with add/update logic
- [x] T017 [P] [US1] Implement `saveModeConfig(mode)` with add/update logic
- [x] T018 [P] [US1] Implement `saveContainerConfig(container)` with add/update logic

### Remove Methods

- [x] T019 [US1] Implement `removePlugin(id)` with validation
- [x] T020 [P] [US1] Implement `removeMode(id)` with default mode protection
- [x] T021 [P] [US1] Implement `removeContainer(id)` with validation

## Phase 4: Event System

### Event Emitter

- [x] T022 [US1] Implement custom EventEmitter class for VS Code compatibility
- [x] T023 [US1] Add `onConfigChange` event property using EventEmitter
- [x] T024 [US1] Fire `onConfigChange` after initialization
- [x] T025 [US1] Fire `onConfigChange` after all save operations
- [x] T026 [US1] Fire `onConfigChange` after file watcher detects changes

### File Watching

- [x] T027 [US1] Setup file watcher using `watchConfig()` utility
- [x] T028 [US1] Handle external config changes with reload and migration
- [x] T029 [US1] Prevent write loops in file watcher

## Phase 5: Migration System

### Migration Infrastructure

- [x] T030 [US1] Define `ConfigMigration` interface
- [x] T031 [US1] Create `MIGRATIONS` registry array
- [x] T032 [US1] Implement `migrateConfig()` private method with sequential migration
- [x] T033 [US1] Add version validation logic
- [x] T034 [US1] Handle migration errors with fallback to minimal config

## Phase 6: Testing

### Unit Tests

- [x] T035 [US1] Create test file `packages/agency-extension/src/__tests__/services/ConfigService.test.ts`
- [x] T036 [US1] Setup vitest mocks for vscode, config utilities, logger
- [x] T037 [US1] Write singleton pattern tests (getInstance, multiple calls, reset)
- [x] T038 [US1] Write initialization tests (first init, re-initialization)
- [x] T039 [US1] Write migration tests (compatible version, incompatible version)
- [x] T040 [P] [US1] Write getter method tests (7 scenarios: getConfig, getPlugins, getModes, getContainers, getPlugin, getMode, getContainer)
- [x] T041 [P] [US1] Write save method tests (savePluginConfig add/update, saveModeConfig add/update, saveContainerConfig add/update)
- [x] T042 [P] [US1] Write remove method tests (removePlugin, removeMode with default protection, removeContainer)
- [x] T043 [US1] Write event emitter tests (single listener, multiple listeners, dispose)
- [x] T044 [US1] Write error handling tests (uninitialized service errors)
- [x] T045 [US1] Verify 100% code coverage

## Phase 7: Documentation and Integration

### Documentation

- [x] T046 [P] [US1] Add JSDoc comments to all public methods
- [x] T047 [P] [US1] Document singleton pattern usage in class header
- [x] T048 [P] [US1] Document event emitter usage and disposable pattern

### Integration

- [x] T049 [US1] Verify exports from `packages/agency-extension/src/services/index.ts`
- [x] T050 [US1] Ensure ConfigService integrates with existing config utilities

## Dependencies & Execution Order

**Sequential Dependencies**:
- Phase 1 (Setup) must complete before Phase 2 (Getters)
- Phase 2 (Getters) must complete before Phase 3 (Mutations)
- Phase 3 (Mutations) must complete before Phase 4 (Events)
- Phase 4 (Events) and Phase 5 (Migration) can be developed concurrently
- Phase 6 (Testing) can run in parallel with Phases 4-5 after Phase 3 completes
- Phase 7 (Documentation) can run in parallel with testing

**Parallel Opportunities**:
- Within Phase 1: T002, T003 can be done together
- Within Phase 2: All getter methods (T010-T015) are independent
- Within Phase 3: Save methods (T017-T018) and remove methods (T020-T021) are independent within their groups
- Within Phase 4: Event emitter and file watching can be developed in parallel after T022-T023
- Within Phase 6: Test suites (T040-T042) can be written in parallel after setup (T035-T037)
- Within Phase 7: All documentation tasks (T046-T048) are independent

**Critical Path**:
T001 → T005 → T009 → T016 → T022 → T030 → T035 → T046

**Estimated Completion**:
- Setup: 30 min (Phase 1)
- Access Methods: 45 min (Phase 2)
- Mutation Methods: 60 min (Phase 3)
- Event System: 45 min (Phase 4)
- Migration System: 45 min (Phase 5)
- Testing: 90 min (Phase 6)
- Documentation: 15 min (Phase 7)

**Total**: ~5.5 hours (includes comprehensive testing and documentation)

---

*Note: All tasks marked [x] as implementation is already complete per plan.md status*
