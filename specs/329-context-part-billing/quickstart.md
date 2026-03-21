# Quickstart: Context-Part Billing — Worker Cap Enforcement

## Overview

This feature enforces subscription-based worker limits in the orchestrator. The effective worker count is `min(configuredWorkers, tierLimit)`.

## How It Works

### With Relay Connected (production)

1. Orchestrator connects to cloud relay
2. Cloud sends `handshake_ack` with `tierLimits.maxWorkers`
3. WorkerDispatcher caps concurrent dispatch slots to `min(cluster.yaml workers.count, maxWorkers)`
4. If subscription changes, cloud pushes `tier_update` — dispatcher adjusts immediately
5. If org has too many clusters connected, new connection is rejected with close code `4003`

### Without Relay (local dev)

No enforcement. `workers.count` from `cluster.yaml` is the only constraint.

## Configuration

No new configuration needed. The feature reads:

- **`cluster.yaml`** → `workers.count` (existing — local resource cap)
- **Relay handshake** → `tierLimits.maxWorkers` (new — subscription cap)

## Verifying It Works

### Check effective worker count

Look for this log line on orchestrator startup (after relay connects):

```
[INFO] Tier limits received: maxWorkers=5, maxClusters=2, tier=pro
[INFO] Effective worker count: 3 (configured=3, tierLimit=5)
```

### Check tier update

Trigger a subscription change (upgrade/downgrade). Look for:

```
[INFO] Tier update received: maxWorkers=10, tier=enterprise
[INFO] Effective worker count updated: 3 → 3 (configured=3, tierLimit=10)
```

### Check cluster rejection

Connect more clusters than the tier allows. The rejected cluster logs:

```
[ERROR] Cluster connection rejected: cluster limit exceeded (2/2 for tier 'pro')
[ERROR] Upgrade your subscription to connect more clusters: https://app.generacy.ai/settings/billing
```

## Testing

```bash
# Run orchestrator unit tests
cd packages/orchestrator
pnpm test -- --run tests/unit/services/worker-dispatcher.test.ts

# Run cluster-relay tests
cd packages/cluster-relay
pnpm test -- --run tests/relay.test.ts
```

## Troubleshooting

### Workers seem limited even though I upgraded

The `tier_update` push is near-instant but requires the orchestrator to have an active relay connection. If the relay was disconnected during the upgrade, reconnection will re-fetch limits via the handshake.

### "Cluster connection rejected" but I haven't exceeded my limit

Check if stale connections exist. The relay server cleans up dead connections after 2 missed heartbeats (~60s). Wait and retry. If it persists, another cluster for the same org may be connected elsewhere.

### Local dev is limited to 1 worker

If you see tier enforcement in local-only mode, check that no relay config is active. Remove or comment out `relay.apiKey` in your environment to run without tier enforcement.
