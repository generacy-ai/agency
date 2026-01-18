# Tasks: @generacy-ai/agency-plugin-firebase

**Input**: Design documents from `/specs/016-plugin-generacy-ai-agency/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/tools.json
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1=Emulators, US2=Deploy, US3=Status)

## Phase 1: Setup

- [ ] T001 Create package structure with `package.json`, `tsconfig.json`, `vitest.config.ts`
      `packages/agency-plugin-firebase/`
- [ ] T002 [P] Create config types in `src/config/types.ts`
      Define `FirebasePluginConfig`, `EmulatorType`, `DeployTarget`, `CleanupMode`
- [ ] T003 [P] Create config schema in `src/config/schema.ts`
      Zod schemas for config validation: `FirebasePluginConfigSchema`
- [ ] T004 [P] Create process types in `src/process/types.ts`
      Define `ProcessHandle`, `ProcessOptions`, `ProcessStatus`

## Phase 2: Core Infrastructure

- [ ] T010 Implement process manager in `src/process/manager.ts`
      Background process lifecycle: start, stop, status, cleanup
      Uses child_process.spawn with detached mode
      Tracks PIDs for cleanup, supports session/persist/explicit cleanup modes
- [ ] T011 Create Firebase CLI mock in `src/__tests__/mocks/firebase-cli.ts`
      Mock spawn responses for emulator start/stop, deploy, logs

## Phase 3: Tool Implementation

- [ ] T020 [US1] Implement `emulators-start` tool in `src/tools/emulators-start.ts`
      Start emulators with --only, --import, --export-on-exit flags
      Ready detection via "All emulators ready" pattern
      Returns terse output with emulator URLs
- [ ] T021 [P] [US1] Implement `emulators-stop` tool in `src/tools/emulators-stop.ts`
      Stop running emulators, optional force kill
      Clean process cleanup
- [ ] T022 [P] [US3] Implement `emulators-status` tool in `src/tools/emulators-status.ts`
      Return running state, ports, URLs for each emulator
      Query process manager for status
- [ ] T023 [P] [US2] Implement `deploy` tool in `src/tools/deploy.ts`
      Deploy to Firebase with configurable targets
      Support --only, --project, --message flags
- [ ] T024 [P] Implement `functions-log` tool in `src/tools/functions-log.ts`
      View function logs with --only and --lines flags
- [ ] T025 Create tool exports in `src/tools/index.ts`
      Export all 5 tools

## Phase 4: Plugin Integration

- [ ] T030 Implement plugin class in `src/plugin.ts`
      `FirebasePlugin` implementing `AgencyPlugin` interface
      Initialize registers tools, shutdown cleans up processes
      Mode affiliations: debug (all), coding (start/stop)
- [ ] T031 Create entry point in `src/index.ts`
      Export plugin manifest and default export

## Phase 5: Testing

- [ ] T040 [P] Write plugin lifecycle tests in `src/__tests__/plugin.test.ts`
      Test initialize, shutdown, config validation
- [ ] T041 [P] [US1] [US3] Write emulator tests in `src/__tests__/emulators.test.ts`
      Test start → status → stop lifecycle
      Test error scenarios (port conflicts, auth failures)
- [ ] T042 [P] [US2] Write deploy tests in `src/__tests__/deploy.test.ts`
      Test deploy with various targets
      Test error scenarios (project not found, auth failures)

## Dependencies & Execution Order

**Phase 1 (Setup)**: T001 first (creates package), then T002-T004 in parallel
**Phase 2 (Core)**: T010 depends on T004 (process types), T011 can run in parallel
**Phase 3 (Tools)**: T020 first (establishes patterns), then T021-T025 in parallel
**Phase 4 (Integration)**: T030 depends on all tools, T031 after T030
**Phase 5 (Testing)**: All tests can run in parallel after Phase 4 complete

**Parallel opportunities:**
- T002, T003, T004 (different config/types files)
- T021, T022, T023, T024 (independent tool implementations)
- T040, T041, T042 (independent test files)
