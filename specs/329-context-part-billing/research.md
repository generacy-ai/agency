# Research: Context-Part Billing — Worker Cap Enforcement

## Technology Decisions

### 1. Concurrency Limiting Strategy: Dispatch Slot Cap (not container lifecycle)

**Decision**: Limit how many concurrent dispatch slots the `WorkerDispatcher` uses, rather than stopping/starting Docker containers.

**Rationale**:
- The WorkerDispatcher already has a concurrency guard (`this.activeWorkers.size >= 1`). Generalizing this to a configurable limit is minimal code change.
- Container lifecycle management (Docker API calls, health checks, startup/shutdown) is complex and slow.
- Slot-based limiting is instant: takes effect on the next poll cycle (~5s).
- Idle containers consume minimal resources — they're just waiting for dispatch.

**Alternatives considered**:
- **Container scaling**: Stop excess containers when tier < configured. Rejected — adds Docker orchestration complexity, slow to recover on tier upgrade, risk of data loss if container is mid-operation.
- **Kubernetes HPA integration**: Scale replicas via k8s. Rejected — not all deployments use k8s, and the orchestrator shouldn't assume infrastructure.

### 2. Tier Delivery: Handshake Acknowledgment

**Decision**: Extend the relay handshake response from a bare `{ type: 'heartbeat' }` to a `{ type: 'handshake_ack', tierLimits: {...} }`.

**Rationale**:
- The orchestrator needs tier limits before starting dispatch — the handshake is the earliest delivery point.
- The handshake already requires a server response (client waits in `authenticating` state). Adding data to this response is zero additional round trips.
- Backward compatible: old clients in `authenticating` state transition to `connected` on any valid message — `handshake_ack` qualifies.

**Alternatives considered**:
- **Separate `get_tier` request/response**: Would add latency and a new message type pair. The handshake already blocks startup, so piggybacking is free.
- **Include in metadata response**: Metadata is client→server only; would require protocol reversal.

### 3. Live Updates: Push via `tier_update` Relay Message

**Decision**: When a Stripe webhook fires and updates the subscription, broadcast a `tier_update` message to all connected clusters for the org via Redis pub/sub → WebSocket.

**Rationale**:
- Tier changes are infrequent (upgrade/downgrade events) but should take effect quickly.
- The Redis `relay:org:{orgId}` pub/sub channel already exists for org-wide broadcasts (`slot_available` uses it).
- Push eliminates polling overhead and reduces latency from minutes to seconds.

**Alternatives considered**:
- **Polling**: Orchestrator queries cloud every N minutes. Rejected — wasteful for infrequent events, adds N-minute delay.
- **Firestore listener**: Use Firestore real-time updates. Rejected — orchestrator doesn't have direct Firestore access; relay is the bridge.

### 4. Cluster Rejection: WebSocket Close Code 4003

**Decision**: When the cluster limit is exceeded, the server sends a `cluster_rejected` message payload and closes with code `4003`.

**Rationale**:
- WebSocket close codes 4000-4999 are reserved for application use (RFC 6455).
- Code `4001` is already used for "replaced by new connection". `4003` is unused and semantically distinct.
- Close reason includes structured data (limit, count, tier) for the client to display.
- Client can handle this close code specifically: log error and NOT auto-reconnect (unlike transient disconnects).

**Alternatives considered**:
- **Error message type + keep connection open**: Would leave a zombie connection consuming resources.
- **HTTP 429 before WebSocket upgrade**: WebSocket upgrade happens before relay-level auth; cluster limit check requires org resolution which happens after.

### 5. Offline Mode: No Enforcement

**Decision**: When no relay is configured, `tierLimit` defaults to `Infinity` — only `configuredWorkers` applies.

**Rationale**:
- Local-only mode is for development — no billing, no cloud connection.
- Artificially limiting local dev would frustrate developers with no benefit.
- Consistent with other dev tools that run without restrictions offline.

## Implementation Patterns

### Effective Worker Count Pattern

```typescript
get effectiveMaxWorkers(): number {
  return Math.min(this.configuredWorkers, this.tierLimit);
}
```

This pattern ensures:
- Local config (`configuredWorkers`) is always respected — it reflects machine resources or developer preference.
- Tier limit is always respected — it reflects billing constraints.
- The stricter of the two wins.

### Event-Driven Tier Propagation

```
Stripe webhook → Firestore update → Redis pub/sub → RelayServer → WebSocket → ClusterRelay → RelayBridge → WorkerDispatcher
```

Each hop is asynchronous and non-blocking. The WorkerDispatcher's `setTierLimit()` method updates state atomically; the next `pollOnce()` cycle picks up the new limit.

### Graceful Degradation on Tier Downgrade

When `tierLimit` decreases:
- Already-dispatched jobs continue to completion (no interruption).
- New dispatches are blocked until `activeWorkers.size < effectiveMaxWorkers`.
- No container stopping, no job cancellation.

## Key Sources

- WebSocket close codes: [RFC 6455 §7.4](https://tools.ietf.org/html/rfc6455#section-7.4)
- Existing relay protocol: `/workspaces/generacy/packages/cluster-relay/src/messages.ts`
- WorkerDispatcher concurrency: `/workspaces/generacy/packages/orchestrator/src/services/worker-dispatcher.ts` (line 165-167)
- Cloud relay server: `/workspaces/generacy-cloud/services/api/src/services/relay/relay-server.ts`
- Org broadcast infrastructure: Redis `relay:org:{orgId}` channel in relay-server.ts
