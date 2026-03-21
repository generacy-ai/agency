# Clarifications: Auto-scale worker count down to tier limit

## Batch 1 — 2026-03-21

### Q1: Tier limit delivery mechanism
**Context**: The relay contract (`/workspaces/generacy/packages/orchestrator/src/types/relay.ts`) currently defines message types for API routing, SSE event forwarding, and metadata reporting, but has no message type for delivering tier limits from the cloud to the orchestrator. The spec says "fetch tier limit from cloud (via relay or cached subscription data)" but neither mechanism exists yet.
**Question**: How should the orchestrator receive the tier limit? Should it be (A) a new relay message type sent during the initial WebSocket handshake, (B) a new relay request/response pair the orchestrator queries on-demand, or (C) included in an existing response (e.g., relay connection acknowledgement)?

**Answer**: *Pending*

### Q2: Subscription change notification channel
**Context**: Stripe webhooks in generacy-cloud (`webhooks.ts`) update Firestore when subscriptions change, but there is no existing push mechanism from the cloud to the orchestrator. The relay bridge currently only pushes metadata *from* the orchestrator *to* the cloud, not the other direction for subscription data.
**Question**: When a subscription tier changes, how should the orchestrator be notified? Should the cloud push a new relay message type over the existing WebSocket connection, or should the orchestrator poll the cloud at intervals, or is there another mechanism planned?

**Answer**: *Pending*

### Q3: `cluster_rejected` contract definition
**Context**: The spec requires handling `cluster_rejected` when the cluster limit is reached, but this type does not exist anywhere in the relay types or codebase. The relay bridge currently handles `connected`, `disconnected`, `error`, and `message` events.
**Question**: What form does `cluster_rejected` take? Is it (A) a WebSocket close code/reason during connection, (B) a new relay message type received after connection, (C) an error payload in the existing relay error handler, or (D) something else? What fields does it include (e.g., current limit, current count)?

**Answer**: *Pending*

### Q4: Offline / no-relay fallback behavior
**Context**: The orchestrator supports running without relay (local-only mode, when no `relay.apiKey` is configured). In this mode, there's no cloud connection to fetch tier limits from. The spec doesn't address this scenario.
**Question**: When the orchestrator runs without a relay connection, what should the effective worker count be? Options: (A) unlimited — only `configuredWorkers` applies, (B) default to free tier limit (1 worker), (C) the orchestrator should refuse to start workers without a valid relay connection, or (D) use a last-known cached tier limit if available?

**Answer**: *Pending*

### Q5: Worker count scope — containers vs internal concurrency
**Context**: The `WorkerDispatcher` currently manages a dispatch loop where each container processes exactly one job at a time (per-container dispatch). The worker count in `cluster.yaml` (`workers.count: 3`) controls how many container replicas are created. The spec says "only `tierLimit` worker containers should be actively used."
**Question**: Does "effective worker count" mean the number of Docker container replicas the orchestrator manages (i.e., the orchestrator should stop/not-start excess containers), or is it an internal concurrency limit where excess containers remain running but idle (not dispatched work)?

**Answer**: *Pending*
