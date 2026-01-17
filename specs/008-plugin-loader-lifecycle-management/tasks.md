# Tasks: Plugin Loader and Lifecycle Management

**Input**: Design documents from `/specs/008-plugin-loader-lifecycle-management/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Phase 1: Core Type Definitions

- [ ] T001 [US1] Extend `plugins/types.ts` with enhanced AgencyPlugin interface and full PluginManifest type
- [ ] T002 [P] Create `core-api/types.ts` with AgencyCoreAPI interface definition
- [ ] T003 [P] Create `channels/types.ts` with ChannelDefinition, MessageEnvelope, and related types
- [ ] T004 [P] Create `core-api/index.ts` barrel export
- [ ] T005 [P] Create `channels/index.ts` barrel export

## Phase 2: Manifest Validation

- [ ] T010 [US1] Create `plugins/manifest.ts` with Zod PluginManifestSchema and validateManifest()
- [ ] T011 Write `plugins/manifest.test.ts` covering valid/invalid manifests and edge cases

## Phase 3: Plugin Discovery

- [ ] T020 [US1] Create `plugins/discovery.ts` with PluginDiscovery class (node_modules scanning, config paths)
- [ ] T021 Write `plugins/discovery.test.ts` with mock filesystem tests
- [ ] T022 [P] Extend `config/schema.ts` to add pluginPaths and plugins config options

## Phase 4: Dependency Resolution

- [ ] T030 [US1] Create `plugins/dependency-resolver.ts` implementing Kahn's algorithm for topological sort
- [ ] T031 Write `plugins/dependency-resolver.test.ts` covering cycles, missing deps, version conflicts

## Phase 5: Channel Communication

- [ ] T040 [US3] Create `channels/manager.ts` with ChannelManager class (register, send, subscribe)
- [ ] T041 Write `channels/manager.test.ts` covering pub/sub patterns and message routing

## Phase 6: Mode System Enhancement

- [ ] T050 [US2] Extend `modes/manager.ts` with registerMode(), mode change callbacks, and plugin mode support
- [ ] T051 Extend `modes/manager.test.ts` with tests for dynamic mode registration and callbacks

## Phase 7: CoreAPI Implementation

- [ ] T060 [US1] [US2] [US3] Create `core-api/core-api.ts` implementing AgencyCoreAPI (wires tools, modes, channels, config, telemetry)
- [ ] T061 Write `core-api/core-api.test.ts` covering all API methods and plugin isolation

## Phase 8: Loader Enhancement

- [ ] T070 [US1] Extend `plugins/loader.ts` with discovery integration, manifest validation, dependency resolution
- [ ] T071 [US1] Add failure isolation logic to loader (try-catch wrappers, critical plugin propagation)
- [ ] T072 [US1] Add clean shutdown in reverse dependency order to loader
- [ ] T073 Extend `plugins/loader.test.ts` with integration tests for full plugin lifecycle

## Phase 9: Server Integration

- [ ] T080 Extend `server/agency-server.ts` to integrate CoreAPI, ChannelManager, and enhanced PluginLoader
- [ ] T081 Write or extend `server/agency-server.test.ts` with integration tests for plugin system

## Phase 10: Export Updates

- [ ] T090 [P] Update `plugins/index.ts` barrel export with new modules (discovery, manifest, dependency-resolver)
- [ ] T091 [P] Update main package index to export new public APIs

## Dependencies & Execution Order

**Phase boundaries (sequential)**:
- Phase 1 → Phase 2 → Phase 3 → Phase 4 (types before validation before discovery before resolution)
- Phase 5 and Phase 6 can run after Phase 1 completes (parallel with Phase 2-4)
- Phase 7 requires Phase 1, 5, 6 to complete (CoreAPI depends on types, channels, modes)
- Phase 8 requires Phase 2, 3, 4, 7 to complete (loader uses all components)
- Phase 9 requires Phase 8 to complete (server integrates loader)
- Phase 10 can run after Phase 8 completes

**Parallel opportunities**:
- T002, T003, T004, T005 can run in parallel (independent type files)
- T022 can run in parallel with T020, T021 (config schema vs discovery impl)
- T040-T041 and T050-T051 can run in parallel (channels vs modes)
- T090, T091 can run in parallel (independent export updates)

**Critical path**:
T001 → T010 → T020 → T030 → T060 → T070 → T080
