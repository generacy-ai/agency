# Tasks: Core Telemetry Capture

**Input**: Design documents from `/specs/003-core-telemetry-capture/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Core Schema & Types

- [ ] T001 [US1] Create `packages/agency/src/telemetry/schemas.ts` with ToolCallEventV1 Zod schema using `.passthrough()` for forward compatibility
- [ ] T002 [P] [US1] Create `packages/agency/src/telemetry/types.ts` with TelemetryStorageProvider interface, TelemetryFilter, StatsFilter, and ToolStats types
- [ ] T003 [P] [US2] Create `packages/agency/src/telemetry/config.ts` with TelemetryConfigSchema and DEFAULT_TELEMETRY_CONFIG
- [ ] T004 Create `packages/agency/src/__tests__/telemetry/schemas.test.ts` with validation tests for ToolCallEventV1 schema

## Phase 2: Event Bus

- [ ] T005 [US1] Create `packages/agency/src/telemetry/bus.ts` with TelemetryBus class using Node.js EventEmitter
- [ ] T006 Implement fire-and-forget emit() method that catches and logs provider errors
- [ ] T007 Create `packages/agency/src/__tests__/telemetry/bus.test.ts` with event emission and error isolation tests

## Phase 3: Tool Call Interceptor

- [ ] T008 [US1] Create `packages/agency/src/telemetry/interceptor.ts` with wrapToolHandler() function
- [ ] T009 [US2] Implement privacy-aware data capture (conditional inputs/outputs based on config)
- [ ] T010 Add timing measurement using performance.now() and UUID generation with crypto.randomUUID()
- [ ] T011 Create `packages/agency/src/__tests__/telemetry/interceptor.test.ts` with success/error handling tests

## Phase 4: Memory Provider

- [ ] T012 [US1] Create `packages/agency/src/telemetry/providers/memory.ts` implementing TelemetryStorageProvider
- [ ] T013 Implement configurable maxEvents with FIFO eviction when limit reached
- [ ] T014 [P] Implement optional query() method for event filtering
- [ ] T015 [P] Implement getStats() method for basic statistics calculation
- [ ] T016 Create `packages/agency/src/__tests__/telemetry/memory-provider.test.ts` with storage and query tests

## Phase 5: Telemetry Manager

- [ ] T017 [US1] Create `packages/agency/src/telemetry/manager.ts` with TelemetryManager class
- [ ] T018 Implement registerProvider() and unregisterProvider() methods with lifecycle management
- [ ] T019 Implement wrapServer() method to instrument MCP servers with telemetry
- [ ] T020 Create `packages/agency/src/__tests__/telemetry/manager.test.ts` with integration tests

## Phase 6: Integration & Exports

- [ ] T021 Create `packages/agency/src/telemetry/index.ts` exporting all public types and classes
- [ ] T022 Create `packages/agency/src/telemetry/providers/index.ts` exporting MemoryStorageProvider
- [ ] T023 Update `packages/agency/src/index.ts` to export telemetry module

## Phase 7: Performance & Documentation

- [ ] T024 Create performance benchmark test verifying <5ms overhead requirement
- [ ] T025 Add JSDoc comments to all public APIs in telemetry module

## Dependencies & Execution Order

**Phase 1** (Schema & Types):
- T001 must complete first (schemas are foundation)
- T002, T003 can run in parallel after T001
- T004 can run after T001

**Phase 2** (Event Bus):
- T005 depends on T001, T002 (needs types)
- T006 is part of T005 implementation
- T007 depends on T005

**Phase 3** (Interceptor):
- T008 depends on T002 (needs config type), T005 (needs bus)
- T009, T010 are part of T008 implementation
- T011 depends on T008

**Phase 4** (Memory Provider):
- T012 depends on T001, T002 (needs event and provider types)
- T013 is part of T012 implementation
- T014, T015 can run in parallel after T012
- T016 depends on T012-T015

**Phase 5** (Manager):
- T017 depends on T005 (bus), T012 (provider)
- T018, T019 are part of T017 implementation
- T020 depends on T017

**Phase 6** (Exports):
- T021, T022, T023 depend on all previous phases
- T021, T022 can run in parallel
- T023 depends on T021

**Phase 7** (Performance & Docs):
- T024 depends on T017 (needs full system)
- T025 can run in parallel with T024

## Parallel Opportunities

The following tasks can be executed concurrently:
- T002, T003 (different files, no dependencies)
- T014, T015 (independent query methods)
- T021, T022 (different index files)
- T024, T025 (independent concerns)
