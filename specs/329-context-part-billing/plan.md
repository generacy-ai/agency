# Implementation Plan: Context-Part Billing — Worker Cap Enforcement

**Feature**: Cap effective worker count at `min(configuredWorkers, tierLimit)` with tier delivery via relay handshake and live updates via `tier_update` push messages.
**Branch**: `329-context-part-billing`
**Status**: Complete

## Summary

The orchestrator currently reports `workers.count` from `cluster.yaml` as metadata to the cloud but does not enforce any subscription-based limits. This feature adds tier-aware worker capping so that the `WorkerDispatcher` limits concurrent dispatch slots to the lesser of the locally configured worker count and the subscription tier's `maxWorkers` value.

Tier limits are delivered in two ways:
1. **Handshake acknowledgment** — the cloud relay server includes tier limits in its response when a cluster connects.
2. **`tier_update` push message** — when a Stripe webhook fires and the subscription changes, the cloud broadcasts updated limits to all connected clusters for that org.

When a cluster connection is rejected because the org has hit its cluster limit, the relay server closes the WebSocket with code `4003` and a `cluster_rejected` reason payload. The orchestrator surfaces this as a clear error with upgrade guidance.

In offline/local-only mode (no relay configured), no tier enforcement applies — `configuredWorkers` is the only constraint.

## Technical Context

- **Language**: TypeScript (ESM)
- **Runtime**: Node.js 20+
- **Packages modified**:
  - `generacy/packages/cluster-relay` — message types, client handshake handling
  - `generacy/packages/orchestrator` — WorkerDispatcher, RelayBridge, server startup
  - `generacy-cloud/services/api` — relay server handshake response, tier_update broadcast, cluster_rejected close
- **Testing**: Vitest with mock WebSocket servers and mock queue adapters
- **Key dependencies**: `ws` (WebSocket), Firestore (subscription/tier data), Redis (org broadcast pub/sub)

## Project Structure

### Client-side (orchestrator + cluster-relay)

| File | Change |
|------|--------|
| `packages/cluster-relay/src/messages.ts` | Add `HandshakeAckMessage`, `TierUpdateMessage`, `TierLimits` type; extend `RelayMessage` union |
| `packages/cluster-relay/src/relay.ts` | Handle `handshake_ack` during authenticating state (extract tier limits); handle `tier_update` messages; handle close code `4003` without auto-reconnect |
| `packages/orchestrator/src/services/worker-dispatcher.ts` | Add `tierLimit` property, `setTierLimit(n)` method; change concurrency guard from hardcoded `1` to `this.effectiveMaxWorkers` |
| `packages/orchestrator/src/services/relay-bridge.ts` | Listen for `tier_update` messages, call `dispatcher.setTierLimit()`; listen for `handshake_ack`, extract initial tier limit; listen for close code `4003`, surface `cluster_rejected` error |
| `packages/orchestrator/src/server.ts` | Wire tier limit from relay handshake into WorkerDispatcher on startup; pass dispatcher reference to RelayBridge |
| `packages/orchestrator/src/types/relay.ts` | Add `TierLimits` interface, update `RelayMessage` union |

### Server-side (generacy-cloud)

| File | Change |
|------|--------|
| `services/api/src/services/relay/relay-server.ts` | In `handleHandshake()`, look up org subscription tier from Firestore, send `handshake_ack` with tier limits instead of bare `heartbeat`; enforce cluster limit — if exceeded, send `cluster_rejected` payload and close with code `4003` |
| `services/api/src/services/relay/relay-types.ts` | Add `HandshakeAckMessage`, `TierUpdateMessage`, `ClusterRejectedPayload` types |
| `services/api/src/services/relay/connection-manager.ts` | Add `getOrgConnectionCount(orgId)` method for cluster limit checks |
| `services/api/src/webhooks/stripe-webhooks.ts` | On subscription change, resolve new tier limits and publish `tier_update` to Redis `relay:org:{orgId}` channel |

### Tests

| File | Scope |
|------|-------|
| `packages/orchestrator/tests/unit/services/worker-dispatcher.test.ts` | Tier limit enforcement, `setTierLimit()`, effective worker count = `min(configured, tier)` |
| `packages/cluster-relay/tests/relay.test.ts` | `handshake_ack` handling, `tier_update` event, close code `4003` no-reconnect |
| `packages/orchestrator/tests/unit/services/relay-bridge.test.ts` | Tier update → dispatcher wiring, cluster_rejected error surfacing |

## Implementation Phases

### Phase 1: Types & Message Protocol
1. Define `TierLimits` interface in cluster-relay `messages.ts`
2. Add `handshake_ack` message type with tier limits payload
3. Add `tier_update` message type
4. Mirror types in orchestrator `types/relay.ts`

### Phase 2: WorkerDispatcher Tier Enforcement
5. Add `tierLimit` property (default: `Infinity` — no limit when relay absent)
6. Add `setTierLimit(limit: number)` method that updates effective max workers
7. Add `get effectiveMaxWorkers()`: `Math.min(this.configuredWorkers, this.tierLimit)`
8. Update `pollOnce()` concurrency guard: `this.activeWorkers.size >= this.effectiveMaxWorkers`
9. Unit tests for auto-scale-down logic

### Phase 3: Relay Client Handshake Enhancement
10. Update `ClusterRelay` to recognize `handshake_ack` during authenticating state
11. Emit `tier_limits` event with parsed `TierLimits` on handshake ack
12. Handle `tier_update` messages — emit `tier_limits` event
13. Handle close code `4003` — emit `cluster_rejected` event, skip auto-reconnect
14. Client-side tests with mock WebSocket server

### Phase 4: Cloud Relay Server Changes
15. In `handleHandshake()`, look up org tier from Firestore `organizations/{orgId}`
16. Send `handshake_ack` message (instead of bare `heartbeat`) with tier limits
17. Before accepting connection, check cluster count via `ConnectionManager.getOrgConnectionCount()`
18. If cluster limit exceeded, send `cluster_rejected` payload + close with code `4003`
19. Add `getOrgConnectionCount()` to ConnectionManager

### Phase 5: Tier Update Broadcast
20. In Stripe webhook handler, after updating subscription in Firestore, resolve new tier limits
21. Publish `tier_update` message to Redis `relay:org:{orgId}` channel
22. RelayServer receives broadcast and forwards to all connected clusters for org

### Phase 6: Orchestrator Wiring
23. In `RelayBridge`, listen for `tier_limits` event from relay client → call `dispatcher.setTierLimit()`
24. In `RelayBridge`, listen for `cluster_rejected` event → log clear error with limit info and upgrade suggestion
25. In `server.ts`, pass dispatcher reference to RelayBridge constructor
26. On startup without relay: skip tier enforcement (default `Infinity`)

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Internal concurrency limit, not container stop/start | Avoids Docker API complexity; dispatch slot limiting is instant and reversible |
| Tier in handshake ack, not separate query | Orchestrator needs limit before dispatching; handshake is the natural delivery point |
| Push via relay for tier changes | Tier changes are infrequent but should take effect quickly; polling wastes resources |
| Close code `4003` for cluster rejection | Standard WebSocket close mechanism; distinguishes from auth errors (`4001`) and normal disconnects |
| No enforcement in offline mode | Local-only dev mode has no billing; `configuredWorkers` is the only constraint |
| `effectiveMaxWorkers = min(configured, tier)` | Local config reflects resource constraints/developer preference; tier reflects billing cap — respect both |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Race between tier_update and in-flight dispatches | `setTierLimit()` only affects future polls; already-dispatched work completes normally |
| Firestore read latency in handshake path | Tier data is a single field read on an already-loaded org document — negligible overhead |
| Client not handling handshake_ack (old client versions) | Old clients treat any message during `authenticating` as ack — `handshake_ack` still transitions to `connected`. Tier limits silently ignored (safe — no enforcement) |

## Constitution Check

No `.specify/memory/constitution.md` found — no governance constraints to verify.
