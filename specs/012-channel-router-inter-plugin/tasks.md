# Tasks: Channel Router for Inter-Plugin Communication

**Input**: Design documents from `/specs/012-channel-router-inter-plugin/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story/acceptance criterion this task addresses

## Phase 1: Type System Updates

- [X] T001 Add new error codes (`CHANNEL_VERSION_MISMATCH`, `CHANNEL_TIMEOUT`, `CHANNEL_DELIVERY_FAILED`) to `packages/agency/src/errors/agency-error.ts`
- [X] T002 [P] Update `ChannelDefinition` interface in `packages/agency/src/plugins/types.ts` - add `version`, `messageTypes`, `pairedWith` fields with optional defaults
- [X] T003 [P] Add `PendingResponse` interface to `packages/agency/src/channels/types.ts`
- [X] T004 Update `ChannelState` interface in `packages/agency/src/channels/types.ts` to include `pendingResponses: Map<string, PendingResponse>`

## Phase 2: Version Compatibility

- [X] T005 [AC6] Create `packages/agency/src/channels/version.ts` with `isVersionCompatible(available, required)` function using semver
- [X] T006 [P] [AC6] Add unit tests for version compatibility in `packages/agency/src/channels/version.test.ts` - test same major/different minor, major mismatch, invalid versions
- [X] T007 Add `semver` as a dependency in `packages/agency/package.json`

## Phase 3: Router Core Enhancement

- [X] T008 [AC4] Add `getChannels(): ChannelDefinition[]` method to `ChannelManager` in `packages/agency/src/channels/manager.ts`
- [X] T009 [AC4] [AC6] Add `findChannel(id: string, minVersion?: string): ChannelDefinition | undefined` method with version filtering
- [X] T010 Add `findPair(channel: ChannelDefinition): ChannelDefinition[]` method for cross-component channel discovery
- [X] T011 [AC2] Update `send()` method to use async/parallel delivery with `Promise.allSettled` and error aggregation
- [X] T012 [P] Add tests for `getChannels`, `findChannel`, and `findPair` methods in `packages/agency/src/channels/manager.test.ts`
- [X] T013 [P] Add tests for error aggregation in send() in `packages/agency/src/channels/manager.test.ts`

## Phase 4: Request/Response Pattern

- [X] T014 [AC3] Implement response interception in `send()` - check for `correlationId` and resolve pending promises
- [X] T015 [AC3] Implement `sendAndWait(channelId: string, message: MessageEnvelope, timeout?: number): Promise<MessageEnvelope>` method with 30-second default timeout
- [X] T016 Implement timeout cleanup for pending responses - clear from map and reject promise
- [X] T017 [AC3] Add tests for request/response pattern in `packages/agency/src/channels/manager.test.ts` - success, timeout, cleanup

## Phase 5: Integration & Built-in Channels

- [X] T018 Define built-in channel definitions (`agency.lifecycle`, `agency.mode`, `agency.telemetry`, `agency.humancy`) as constants
- [X] T019 Add `registerBuiltInChannels()` method to `ChannelManager`
- [X] T020 [P] Update `CoreAPIDependencies.channelManager` interface in `packages/agency/src/core-api/types.ts` to include new methods
- [X] T021 [P] Update `packages/agency/src/channels/index.ts` exports to include new types and functions
- [X] T022 [AC5] Add tests for `unsubscribe` cleanup behavior verification in `packages/agency/src/channels/manager.test.ts`

## Phase 6: Final Validation

- [X] T023 Run full test suite: `pnpm test --filter=@generacy-ai/agency`
- [X] T024 Run type check: `pnpm typecheck`
- [X] T025 Verify all acceptance criteria are covered by tests

## Dependencies & Execution Order

**Sequential Dependencies**:
- T001 must complete before T011, T015 (error codes needed)
- T002-T004 must complete before T005-T021 (types needed)
- T005-T007 must complete before T009 (version utils needed for findChannel)
- T014 must complete before T015 (response interception needed for sendAndWait)
- T023-T025 must run after all implementation tasks

**Parallel Opportunities**:
- Phase 1: T002 and T003 can run in parallel (different files)
- Phase 2: T006 can run in parallel with T005 (test file vs implementation)
- Phase 3: T012 and T013 can run in parallel (independent test files)
- Phase 5: T020 and T021 can run in parallel (different modules)

## Acceptance Criteria Mapping

| AC | Tasks | Description |
|----|-------|-------------|
| AC1 | T002, T008 | Plugins can register channels |
| AC2 | T011, T013 | Messages route to correct subscribers |
| AC3 | T014-T017 | Request/response pattern works with correlation |
| AC4 | T008, T009, T012 | Channel discovery returns available channels |
| AC5 | T022 | Unsubscribe cleans up handlers |
| AC6 | T005-T007, T009 | Version compatibility checked on send |
