# Feature Specification: Integrate Execution Lease Protocol into Orchestrator Dispatch

**Branch**: `327-context-part-billing` | **Date**: 2026-03-21 | **Status**: Draft

## Summary

Integrate an execution lease protocol into the orchestrator's dispatch pipeline so that workflow execution is gated by cloud-side billing and concurrency enforcement. Before dispatching work to a worker, the orchestrator must acquire a lease from the cloud via the relay. This ensures organizations cannot exceed their paid concurrency limits.

## Context

Part of the [Billing & Concurrent Workflow Enforcement](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/billing-concurrent-workflow-enforcement.md) plan — **Phase 3: Orchestrator Integration**.

The cloud already exposes lease management endpoints. This feature wires the orchestrator (cluster-side) into that protocol so that every dispatched workflow consumes a lease slot and releases it when done.

## User Stories

### US1: Billing-Enforced Dispatch

**As a** platform operator,
**I want** the orchestrator to request a lease before dispatching work,
**So that** organizations cannot run more concurrent workflows than their billing plan allows.

**Acceptance Criteria**:
- [ ] Orchestrator sends `lease_request` before dispatching any job to a worker
- [ ] On `lease_granted`, the job is dispatched and the `leaseId` is stored with the active job
- [ ] On `lease_denied`, the queue item remains queued and is not dispatched

### US2: Lease Lifecycle Management

**As a** platform operator,
**I want** leases to be released when workflows end (pause/complete/fail/cancel),
**So that** freed slots are immediately available for other workflows.

**Acceptance Criteria**:
- [ ] `lease_release` is sent on workflow pause, complete, fail, or cancel
- [ ] The stored lease association is cleared after release

### US3: Lease Heartbeat & Expiry

**As a** platform operator,
**I want** active leases to be heartbeated periodically,
**So that** the cloud can reclaim slots from crashed or unresponsive orchestrators.

**Acceptance Criteria**:
- [ ] Heartbeat sent every 30 seconds for each active lease
- [ ] If heartbeat fails (lease expired/not found), execution is paused gracefully

### US4: Reactive Slot Availability

**As a** platform operator,
**I want** the orchestrator to react to `slot_available` push messages,
**So that** queued work is dispatched as soon as capacity opens up, without polling.

**Acceptance Criteria**:
- [ ] `slot_available` listener checks local queue for pending items
- [ ] Highest-priority pending item triggers a `lease_request`

## Relay Message Types

| Message | Direction | Payload |
|---------|-----------|---------|
| `lease_request` | Cluster → Cloud | `{ queueItemId, jobId }` |
| `lease_granted` | Cloud → Cluster | `{ leaseId, ttlSeconds }` |
| `lease_denied` | Cloud → Cluster | `{ reason: 'at_capacity' }` |
| `lease_release` | Cluster → Cloud | `{ leaseId }` |
| `lease_heartbeat` | Cluster → Cloud | `{ leaseId }` |
| `slot_available` | Cloud → Cluster | `{ orgId, availableSlots: number }` |

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Send `lease_request` to cloud via relay before dispatching to a worker | P0 | Blocking — no dispatch without lease |
| FR-002 | Handle `lease_granted` by dispatching job and storing `leaseId` | P0 | |
| FR-003 | Handle `lease_denied` by leaving item in queue (no dispatch) | P0 | |
| FR-004 | Send `lease_release` on workflow pause/complete/fail/cancel | P0 | |
| FR-005 | Clear stored lease association after release | P0 | |
| FR-006 | Run heartbeat loop (30s interval) for all active leases | P0 | |
| FR-007 | On heartbeat failure, pause execution gracefully | P0 | Treat as lease revoked |
| FR-008 | Listen for `slot_available` push and attempt dispatch of highest-priority queued item | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | No workflow dispatched without a lease | 100% | Integration test: dispatch blocked when lease denied |
| SC-002 | Lease released on all terminal states | 100% | Unit tests cover pause/complete/fail/cancel paths |
| SC-003 | Heartbeat interval | 30s ± 5s | Observe heartbeat timing in test |
| SC-004 | Heartbeat failure triggers graceful pause | 100% | Unit test: expired lease → execution paused |
| SC-005 | `slot_available` triggers re-dispatch | Works | Integration test: push event → lease request for queued item |

## Assumptions

- The relay transport layer is already operational and can route messages between cluster and cloud
- The cloud-side lease management (granting, denying, expiring) is implemented (Phase 1 & 2 of the billing plan)
- The orchestrator already has a dispatch pipeline with a queue that this feature hooks into
- `leaseId` is a unique string provided by the cloud in `lease_granted` responses
- `ttlSeconds` in `lease_granted` defines how long the lease is valid without a heartbeat renewal

## Out of Scope

- Cloud-side lease management logic (already handled in Phase 1 & 2)
- Billing plan CRUD or pricing tier configuration
- UI changes for displaying lease/slot status to end users
- Retry logic for transient relay transport failures (separate concern)
- Multi-region lease coordination

---

*Generated by speckit*
