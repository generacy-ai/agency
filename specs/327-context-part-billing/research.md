# Research: Integrate Execution Lease Protocol into Orchestrator Dispatch

## Technology Decisions

### 1. Relay WebSocket Protocol (over REST)

**Decision**: Use existing WebSocket relay for all lease communication.

**Rationale**: The relay already handles bidirectional request/response patterns (`api_request`/`api_response` via `RequestRouter`). Adding REST endpoints would bypass the relay's purpose (avoiding direct HTTP from orchestrator to cloud) and introduce a second communication path to maintain. The `slot_available` push notification requires a persistent connection anyway.

**Pattern**: Request/response correlation via `correlationId` field — same pattern as existing `ApiRequestMessage`/`ApiResponseMessage`.

### 2. Separate LeaseManager Service (over inline in WorkerDispatcher)

**Decision**: Create a dedicated `LeaseManager` class rather than adding lease logic directly to `WorkerDispatcher`.

**Rationale**: The dispatcher's `pollOnce()` method is already complex with queue claiming, heartbeat management, handler invocation, and cleanup. Adding request/response correlation, timeout management, heartbeat loops, and graceful pause semantics inline would make it unwieldy. A separate manager also simplifies unit testing — lease flows can be tested independently of queue mechanics.

**Alternatives Considered**:
- **Inline in WorkerDispatcher**: Simpler initial implementation but creates a 500+ line class with mixed responsibilities
- **Middleware/interceptor pattern**: Over-engineered for a single integration point

### 3. Fail-Closed Timeout (over Fail-Open)

**Decision**: Treat lease request timeout as `lease_denied`.

**Rationale**: Fail-open defeats the purpose of concurrency enforcement — a network partition would allow unlimited dispatches. The 30s timeout is generous for normal relay latency. Items stay queued and retry on the next poll cycle or `slot_available` notification. Per clarification Q3.

### 4. Feature Flag for Rollout

**Decision**: Add `leaseEnabled: boolean` config option (default `false`).

**Rationale**: Existing clusters operate without cloud-side lease enforcement. The feature flag allows:
- Gradual rollout without coordinated deploys
- Fallback if cloud lease service has issues
- Local development without cloud connectivity

When disabled, `WorkerDispatcher` dispatches immediately after `queue.claim()` (current behavior).

### 5. Sequential Multi-Slot Dispatch (over Parallel)

**Decision**: When `slot_available` arrives with `availableSlots > 1`, attempt lease requests one at a time.

**Rationale**: Each granted lease decrements the cloud's available count. Parallel requests could all read the same count and over-commit, leading to lease grants that exceed the tier limit. Sequential ensures each request sees the updated state. Per clarification Q5.

## Implementation Patterns

### Correlation-Based Request/Response over WebSocket

```typescript
// Pattern: send request with correlationId, resolve promise when matching response arrives
const correlationId = randomUUID();
const promise = new Promise((resolve, reject) => {
  this.pendingRequests.set(correlationId, { resolve, reject });
  setTimeout(() => {
    this.pendingRequests.delete(correlationId);
    reject(new Error('Lease request timeout'));
  }, this.config.leaseRequestTimeoutMs);
});
this.relay.send({ type: 'lease_request', correlationId, payload });
return promise;
```

### Heartbeat Loop with Failure Detection

```typescript
// Pattern: interval-based heartbeat with error-triggered pause
startHeartbeat(leaseId: string): () => void {
  const interval = setInterval(async () => {
    try {
      await this.sendHeartbeat(leaseId);
    } catch {
      this.onHeartbeatFailure(leaseId);
      clearInterval(interval);
    }
  }, this.config.leaseHeartbeatIntervalMs);
  return () => clearInterval(interval);
}
```

### Graceful Pause on Heartbeat Failure

```typescript
// Pattern: set flag to prevent new dispatches, let in-flight complete
onHeartbeatFailure(leaseId: string): void {
  this.pausedLeases.add(leaseId);
  // WorkerDispatcher checks pausedLeases before dispatching
  // In-flight handler promise continues to completion
  // On completion, lease is released and removed
}
```

## Key Sources

- Billing & Concurrent Workflow Enforcement plan: `tetrad-development/docs/billing-concurrent-workflow-enforcement.md`
- Cloud ExecutionLeaseService: `generacy-cloud/services/api/src/services/execution-lease.ts`
- Orchestrator WorkerDispatcher: `generacy/packages/orchestrator/src/services/worker-dispatcher.ts`
- Relay message protocol: `generacy/packages/cluster-relay/src/messages.ts`
- Clarifications Q1–Q5: `specs/327-context-part-billing/clarifications.md`
