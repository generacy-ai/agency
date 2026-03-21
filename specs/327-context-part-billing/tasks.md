# Tasks: Integrate Execution Lease Protocol into Orchestrator Dispatch

**Input**: Design documents from `/specs/327-context-part-billing/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/relay-lease-messages.ts
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which acceptance criterion this task supports

> **Note**: All code changes are in the `generacy` repo (`packages/orchestrator/`, `packages/cluster-relay/`), not this repo.

## Phase 1: Relay Message Types & Configuration

- [ ] T001 Add lease message type interfaces to `packages/cluster-relay/src/messages.ts` — add `LeaseRequestMessage`, `LeaseGrantedMessage`, `LeaseDeniedMessage`, `LeaseReleaseMessage`, `LeaseHeartbeatMessage`, `SlotAvailableMessage` interfaces and extend the `RelayMessage` union (per `contracts/relay-lease-messages.ts`)
- [ ] T002 [P] Re-export new lease message types from `packages/cluster-relay/src/index.ts`
- [ ] T003 [P] Add lease-specific relay types to `packages/orchestrator/src/types/relay.ts` — import and re-export `LeaseInfo`, `LeaseRequestResult`, `LeaseConfig` types (per `data-model.md`)
- [ ] T004 [P] Add lease config options to `packages/orchestrator/src/config/schema.ts` — add `leaseEnabled` (default: `false`), `leaseRequestTimeoutMs` (default: `30000`), `leaseHeartbeatIntervalMs` (default: `30000`) to `DispatchConfig`

## Phase 2: Core Implementation

- [ ] T005 Create `packages/orchestrator/src/services/lease-manager.ts` — implement `LeaseManager` class with:
  - `requestLease(queueItemId, jobId)` — sends `lease_request` via relay with `correlationId`, returns `Promise<LeaseRequestResult>`, rejects on 30s timeout
  - `releaseLease(leaseId)` — sends `lease_release` via relay, removes from active leases map
  - `startHeartbeat(leaseId)` — starts 30s interval sending `lease_heartbeat`, returns cleanup function
  - `handleResponse(message)` — resolves pending request promises on `lease_granted`/`lease_denied`
  - `handleHeartbeatFailure(leaseId)` — adds to `pausedLeases` set, triggers graceful pause callback
  - Active lease tracking via `Map<leaseId, LeaseInfo>` and pending requests via `Map<correlationId, {resolve, reject}>`
- [ ] T006 Extend `WorkerInfo` interface in `packages/orchestrator/src/services/worker-dispatcher.ts` — add optional `leaseId?: string` field
- [ ] T007 Modify `WorkerDispatcher.pollOnce()` in `packages/orchestrator/src/services/worker-dispatcher.ts`:
  - After `queue.claim()`, if `leaseEnabled`, call `leaseManager.requestLease()`
  - On `lease_granted`: store `leaseId` in `WorkerInfo`, call `leaseManager.startHeartbeat()`, proceed to dispatch
  - On `lease_denied` or timeout: call `queue.release()` to return item to queue, skip dispatch
  - If `leaseEnabled` is `false`: dispatch immediately (current behavior, backward compatible)
- [ ] T008 Modify workflow completion/failure/pause/cancel handlers in `WorkerDispatcher`:
  - On any terminal state, if worker has `leaseId`, call `leaseManager.releaseLease(leaseId)`
  - Stop the heartbeat via `leaseInfo.stopHeartbeat()`

## Phase 3: Relay Bridge Integration

- [ ] T009 Modify `RelayBridge` in `packages/orchestrator/src/services/relay-bridge.ts`:
  - Route incoming `lease_granted` and `lease_denied` messages to `LeaseManager.handleResponse()`
  - Forward outgoing `lease_request`, `lease_release`, `lease_heartbeat` messages through relay client
- [ ] T010 Add `slot_available` listener in `RelayBridge`:
  - On `slot_available` message, call `WorkerDispatcher` to attempt dispatch
  - Dispatch up to `availableSlots` items sequentially (one lease request at a time)
  - Check local queue for pending items before each attempt

## Phase 4: Tests

- [ ] T011 Create `packages/orchestrator/tests/unit/services/lease-manager.test.ts` — unit tests for `LeaseManager`:
  - `requestLease()` → `lease_granted` → returns granted result
  - `requestLease()` → `lease_denied` → returns denied result
  - `requestLease()` → timeout (30s) → returns timeout/denied result
  - `releaseLease()` → sends `lease_release` message, removes from active map
  - `startHeartbeat()` → sends periodic `lease_heartbeat` messages
  - `handleHeartbeatFailure()` → triggers pause callback, stops heartbeat
  - Multiple concurrent lease requests with different correlation IDs
- [ ] T012 [P] Extend `packages/orchestrator/tests/unit/services/worker-dispatcher.test.ts` — lease integration tests:
  - `pollOnce()` with `leaseEnabled=true`: claim → lease_granted → dispatch flow
  - `pollOnce()` with `leaseEnabled=true`: claim → lease_denied → item returned to queue
  - `pollOnce()` with `leaseEnabled=true`: claim → lease timeout → item returned to queue
  - Workflow complete → lease released
  - Workflow fail → lease released
  - Workflow pause → lease released
  - Workflow cancel → lease released
  - Heartbeat failure → graceful pause (current task finishes, no new dispatches)
  - `leaseEnabled=false` → dispatch without lease (backward compatibility)
  - `slot_available` → triggers dispatch attempt for queued items
  - `slot_available` with `availableSlots=3` → sequential dispatch of up to 3 items

## Dependencies & Execution Order

```
Phase 1: T001 ──┐
         T002 ──┤ (T002, T003, T004 parallel with each other, but T002 depends on T001)
         T003 ──┤
         T004 ──┘
              │
Phase 2: T005 ─── T006, T007, T008 (T007/T008 depend on T005 and T006)
              │
Phase 3: T009 ─── T010 (both depend on Phase 2)
              │
Phase 4: T011 ──┐ (parallel, both depend on Phase 2-3)
         T012 ──┘
```

- **T001** must complete before T002 (re-export depends on new types)
- **T003, T004** can run in parallel with T001/T002 (different packages)
- **T005** (LeaseManager) must complete before T007/T008 (dispatcher uses it)
- **T006** (WorkerInfo extension) can run in parallel with T005
- **T007, T008** depend on both T005 and T006
- **T009, T010** depend on T005 (routes messages to LeaseManager)
- **T011, T012** can run in parallel (different test files)
