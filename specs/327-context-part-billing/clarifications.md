# Clarifications: Integrate Execution Lease Protocol into Orchestrator Dispatch

## Batch 1 — 2026-03-21

### Q1: Orchestrator Component Location
**Context**: The spec references an "orchestrator" with a "dispatch pipeline" that sends work to "workers," but the current codebase's dispatch architecture is the Agency MCP Server routing tool calls through plugins. Identifying the correct component to modify is prerequisite to all implementation work.
**Question**: Which component is the "orchestrator" that needs to be modified? Is this the Agency MCP Server (`agency-server.ts`), the humancy plugin's decision dispatch flow, or a separate orchestrator service in another repo (e.g., tetrad-development)?

**Answer**: *Pending*

### Q2: Relay Transport Mechanism
**Context**: The spec says lease messages should be sent "to cloud via relay." The existing relay infrastructure uses `HumancyHttpClient` (REST + SSE) for cloud communication and channels for inter-plugin messaging. The choice of transport affects message routing, error handling, and response patterns.
**Question**: Should lease messages (`lease_request`, `lease_release`, `lease_heartbeat`) go through the existing `HumancyHttpClient` REST transport (new API endpoints), through the channel-based relay (`sendMessage`/`onMessage`), or through a new dedicated transport?
**Options**:
- A: Extend `HumancyHttpClient` with new lease endpoints
- B: Use channel-based relay messaging
- C: New dedicated lease transport

**Answer**: *Pending*

### Q3: Lease Request Timeout Behavior
**Context**: The spec says retry logic for transient relay failures is out of scope, but doesn't specify what happens if the `lease_request` never receives a response (network partition, cloud service down). Without a timeout, the dispatch pipeline could hang indefinitely.
**Question**: What should the timeout be for waiting on a `lease_granted`/`lease_denied` response, and what should happen on timeout — should the item stay queued (treat as denied), or should dispatch proceed without a lease (fail-open)?
**Options**:
- A: Timeout after N seconds, treat as denied (fail-closed, item stays queued)
- B: Timeout after N seconds, dispatch anyway (fail-open)
- C: No timeout — block until response arrives

**Answer**: *Pending*

### Q4: Heartbeat Failure — Graceful Pause Semantics
**Context**: FR-007 says "on heartbeat failure, pause execution gracefully," but "gracefully" is ambiguous. The behavior of in-flight work on heartbeat failure has significant implications for data integrity and user experience.
**Question**: When a heartbeat fails (lease expired), should the orchestrator: (a) immediately stop dispatching new work but let the currently running task complete, then pause; or (b) actively interrupt/cancel the in-flight task and pause immediately?
**Options**:
- A: Stop dispatching new work, let current task finish, then pause
- B: Interrupt in-flight task immediately and pause
- C: Let current task finish, then re-queue remaining work and release

**Answer**: *Pending*

### Q5: slot_available — Multi-Slot Dispatch
**Context**: The `slot_available` message payload includes `availableSlots: number`, which could be greater than 1. The spec says to "attempt `lease_request` for the highest-priority item" (singular), but multiple slots could mean multiple items should be dispatched.
**Question**: When `slot_available` arrives with `availableSlots > 1`, should the orchestrator attempt lease requests for multiple queued items (up to `availableSlots`), or only attempt one at a time?
**Options**:
- A: Attempt up to `availableSlots` lease requests in parallel
- B: Attempt up to `availableSlots` lease requests sequentially
- C: Only attempt one lease request per `slot_available` message

**Answer**: *Pending*
