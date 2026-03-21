# Tasks: Context-Part Billing — Worker Cap Enforcement

**Input**: Design documents from `/specs/329-context-part-billing/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/relay-messages.json
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[AC#]**: Which acceptance criterion this task supports

## Phase 1: Types & Message Protocol

- [ ] T001 [P] [AC1] Add `TierLimits`, `HandshakeAckMessage`, `TierUpdateMessage` types and extend `RelayMessage` union in `packages/cluster-relay/src/messages.ts`
- [ ] T002 [P] [AC1] Add `TierLimits` interface, `ClusterRejectedPayload`, and update `RelayMessage` union in `packages/orchestrator/src/types/relay.ts`

## Phase 2: WorkerDispatcher Tier Enforcement (Tests First)

- [ ] T003 [AC5] Write unit tests for tier limit enforcement in `packages/orchestrator/tests/unit/services/worker-dispatcher.test.ts` — cover `setTierLimit()`, `effectiveMaxWorkers = min(configured, tier)`, default `Infinity` when no relay
- [ ] T004 [AC1] Add `tierLimit` property (default `Infinity`), `setTierLimit(limit)` method, and `get effectiveMaxWorkers()` getter to `packages/orchestrator/src/services/worker-dispatcher.ts`
- [ ] T005 [AC1] Update `pollOnce()` concurrency guard in `packages/orchestrator/src/services/worker-dispatcher.ts` from hardcoded `1` to `this.effectiveMaxWorkers`

## Phase 3: Relay Client Handshake Enhancement (Tests First)

- [ ] T006 [AC5] Write tests for `handshake_ack` handling, `tier_update` event, and close code `4003` no-reconnect in `packages/cluster-relay/tests/relay.test.ts`
- [ ] T007 [AC2] Update `ClusterRelay` in `packages/cluster-relay/src/relay.ts` to recognize `handshake_ack` during authenticating state and emit `tier_limits` event with parsed `TierLimits`
- [ ] T008 [AC3] Handle `tier_update` messages in `packages/cluster-relay/src/relay.ts` — emit `tier_limits` event on receipt
- [ ] T009 [AC4] Handle close code `4003` in `packages/cluster-relay/src/relay.ts` — emit `cluster_rejected` event, skip auto-reconnect

## Phase 4: Cloud Relay Server Changes

- [ ] T010 [AC2] In `handleHandshake()` in `generacy-cloud/services/api/src/services/relay/relay-server.ts`, look up org subscription tier from Firestore and send `handshake_ack` with tier limits instead of bare heartbeat
- [ ] T011 [P] [AC4] Add `getOrgConnectionCount(orgId)` method to `generacy-cloud/services/api/src/services/relay/connection-manager.ts`
- [ ] T012 [AC4] Before accepting connection in `handleHandshake()`, check cluster count via `getOrgConnectionCount()` — if exceeded, send `cluster_rejected` payload and close with code `4003`
- [ ] T013 [P] [AC1] Add `HandshakeAckMessage`, `TierUpdateMessage`, `ClusterRejectedPayload` types to `generacy-cloud/services/api/src/services/relay/relay-types.ts`

## Phase 5: Tier Update Broadcast

- [ ] T014 [AC3] In Stripe webhook handler (`generacy-cloud/services/api/src/webhooks/stripe-webhooks.ts`), on subscription change resolve new tier limits and publish `tier_update` to Redis `relay:org:{orgId}` channel
- [ ] T015 [AC3] In `RelayServer`, subscribe to Redis `relay:org:{orgId}` broadcasts and forward `tier_update` messages to all connected clusters for the org

## Phase 6: Orchestrator Wiring

- [ ] T016 [AC5] Write tests for relay bridge tier wiring and cluster_rejected error surfacing in `packages/orchestrator/tests/unit/services/relay-bridge.test.ts`
- [ ] T017 [P] [AC2] [AC3] In `RelayBridge` (`packages/orchestrator/src/services/relay-bridge.ts`), listen for `tier_limits` event from relay client and call `dispatcher.setTierLimit()`
- [ ] T018 [P] [AC4] In `RelayBridge`, listen for `cluster_rejected` event — log clear error with limit info and upgrade suggestion
- [ ] T019 [AC2] In `packages/orchestrator/src/server.ts`, pass dispatcher reference to RelayBridge constructor; on startup without relay, skip tier enforcement (default `Infinity`)

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

**Within-phase parallelism**:
- **Phase 1**: T001 and T002 are independent (different packages) — run in parallel
- **Phase 2**: T003 (tests) first, then T004 and T005 sequentially (T005 depends on T004)
- **Phase 3**: T006 (tests) first, then T007 → T008 → T009 (same file, sequential changes)
- **Phase 4**: T013 and T011 can run in parallel (different files); T010 depends on T013; T012 depends on T010 and T011
- **Phase 5**: T014 then T015 (T015 receives what T014 publishes)
- **Phase 6**: T016 (tests) first; then T017 and T018 in parallel (different event handlers); T019 last (wiring depends on T017)

**Cross-package dependency**: Phase 1 (message types) must complete before Phases 2–6 since all consumers depend on the shared type definitions.
