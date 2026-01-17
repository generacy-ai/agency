# Tasks: In-memory telemetry storage provider

**Input**: Design documents from `/specs/004-memory-telemetry-storage-provider/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Schema & Type Updates

- [ ] T001 [US1] Add `durationThresholdMs` field to `TelemetryFilterSchema` in `packages/agency/src/telemetry/schemas.ts`
- [ ] T002 [P] Add `SubscriberCallback` type to `packages/agency/src/telemetry/types.ts`

## Phase 2: Core Implementation

- [ ] T003 [US1] Implement `durationThresholdMs` filtering in `query()` method in `packages/agency/src/telemetry/providers/memory.ts`
- [ ] T004 [US2] Add subscriber Map and `subscribe()` method to `MemoryStorageProvider` in `packages/agency/src/telemetry/providers/memory.ts`
- [ ] T005 [US2] Update `record()` to notify subscribers with error isolation in `packages/agency/src/telemetry/providers/memory.ts`
- [ ] T006 Add `getBufferSize()` method (alias for `getEventCount()`) in `packages/agency/src/telemetry/providers/memory.ts`
- [ ] T007 Clear subscribers on `shutdown()` in `packages/agency/src/telemetry/providers/memory.ts`

## Phase 3: Factory Function

- [ ] T008 Create `packages/agency/src/telemetry/factory.ts` with `createTelemetryManager()` function
- [ ] T009 Export factory function from `packages/agency/src/telemetry/index.ts`

## Phase 4: Tests

- [ ] T010 [P] [US1] Add tests for `durationThresholdMs` filtering in `packages/agency/src/__tests__/telemetry/memory-provider.test.ts`
- [ ] T011 [P] [US2] Add subscription tests (subscribe, unsubscribe, multiple subscribers) in `packages/agency/src/__tests__/telemetry/memory-provider.test.ts`
- [ ] T012 [P] [US2] Add error isolation tests for subscribers in `packages/agency/src/__tests__/telemetry/memory-provider.test.ts`
- [ ] T013 [P] Add `getBufferSize()` test in `packages/agency/src/__tests__/telemetry/memory-provider.test.ts`
- [ ] T014 Create `packages/agency/src/__tests__/telemetry/factory.test.ts` with factory function tests

## Phase 5: Verification

- [ ] T015 Run `pnpm build` and verify no TypeScript errors
- [ ] T016 Run `pnpm test` and verify all tests pass
- [ ] T017 Run `pnpm lint` and fix any issues

## Dependencies & Execution Order

**Phase 1 → Phase 2**: Schema changes must complete before implementation uses them.

**Phase 2 internal dependencies**:
- T003 depends on T001 (`durationThresholdMs` in schema)
- T004 depends on T002 (`SubscriberCallback` type)
- T005 depends on T004 (subscriber Map must exist)
- T007 depends on T004 (subscribers must exist)
- T006 can run in parallel with T003-T005

**Phase 2 → Phase 3**: Core provider changes should complete before factory wraps them.

**Phase 3 → Phase 4**: Implementation should complete before writing tests (though TDD practitioners may reverse this).

**Phase 4 parallel opportunities**:
- T010, T011, T012, T013 can all run in parallel (different test blocks, same file)
- T014 can run in parallel with other tests (separate file)

**Phase 5**: All implementation and tests must complete before verification.
