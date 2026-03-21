# Data Model: Context-Part Billing — Worker Cap Enforcement

## Core Types

### TierLimits

Represents the subscription tier's resource constraints for a single cluster.

```typescript
interface TierLimits {
  /** Maximum concurrent dispatch slots (worker concurrency cap) */
  maxWorkers: number;
  /** Maximum clusters per org that can connect simultaneously */
  maxClusters: number;
  /** Subscription tier identifier (e.g., 'free', 'pro', 'enterprise') */
  tier: string;
}
```

**Validation rules**:
- `maxWorkers` ≥ 1 (at least one worker must be allowed)
- `maxClusters` ≥ 1 (at least one cluster must be allowed)
- `tier` is a non-empty string

### ClusterRejectedPayload

Sent when a cluster connection is rejected due to cluster limit.

```typescript
interface ClusterRejectedPayload {
  reason: 'cluster_limit_exceeded';
  /** How many clusters the org currently has connected */
  currentCount: number;
  /** Maximum clusters allowed for the org's tier */
  maxClusters: number;
  /** Subscription tier name */
  tier: string;
}
```

## Message Types

### HandshakeAckMessage

Server response to client handshake, replacing the bare `heartbeat`.

```typescript
interface HandshakeAckMessage {
  type: 'handshake_ack';
  tierLimits: TierLimits;
}
```

**Relationship**: Sent by cloud relay server → received by ClusterRelay client during `authenticating` state. Old clients that don't recognize `handshake_ack` still transition to `connected` (any valid message triggers transition).

### TierUpdateMessage

Pushed when subscription tier changes.

```typescript
interface TierUpdateMessage {
  type: 'tier_update';
  tierLimits: TierLimits;
  /** ISO 8601 timestamp of the change */
  timestamp: string;
}
```

**Relationship**: Originates from Stripe webhook → Firestore update → Redis pub/sub → relay server → WebSocket → cluster client.

## Extended Types

### WorkerDispatcher (modified)

```typescript
class WorkerDispatcher {
  // Existing
  private activeWorkers: Map<string, ActiveWorker>;

  // New
  private configuredWorkers: number;  // from cluster.yaml workers.count (or container default of 1)
  private tierLimit: number;          // from relay handshake, default Infinity

  get effectiveMaxWorkers(): number {
    return Math.min(this.configuredWorkers, this.tierLimit);
  }

  setTierLimit(limit: number): void;
  getEffectiveMaxWorkers(): number;
}
```

### ClusterRelay (modified events)

```typescript
// New events emitted by ClusterRelay
interface ClusterRelayEvents {
  // Existing
  'connected': () => void;
  'disconnected': () => void;
  'message': (msg: RelayMessage) => void;
  'error': (err: Error) => void;

  // New
  'tier_limits': (limits: TierLimits) => void;
  'cluster_rejected': (payload: ClusterRejectedPayload) => void;
}
```

### RelayMessage Union (extended)

```typescript
type RelayMessage =
  | ApiRequestMessage
  | ApiResponseMessage
  | EventMessage
  | ConversationMessage
  | HeartbeatMessage
  | HandshakeMessage
  | ErrorMessage
  // New
  | HandshakeAckMessage
  | TierUpdateMessage;
```

## Firestore Schema Extensions

### organizations/{orgId} (read path)

```
subscription: {
  tier: string           // 'free' | 'pro' | 'enterprise'
  limits: {
    maxWorkers: number   // per-cluster worker cap
    maxClusters: number  // max simultaneous cluster connections
  }
}
```

This data already exists or will be populated by the Stripe webhook handler (Phase 2 of the billing plan). The relay server reads it during handshake to populate `TierLimits`.

## Entity Relationships

```
Organization (Firestore)
  └── subscription.limits ──→ TierLimits
  └── projects[] ──→ Project
       └── cluster.connectionStatus ──→ 'online' | 'offline'

ClusterRelay (client)
  ──connects──→ RelayServer (cloud)
  ←──handshake_ack──── RelayServer (includes TierLimits)
  ←──tier_update────── RelayServer (on subscription change)
  ←──close(4003)────── RelayServer (cluster_rejected)

WorkerDispatcher
  ←──setTierLimit()──── RelayBridge (on handshake_ack or tier_update)
  uses effectiveMaxWorkers = min(configuredWorkers, tierLimit)
```

## WebSocket Close Codes

| Code | Meaning | Auto-reconnect? |
|------|---------|-----------------|
| 1000 | Normal close | No |
| 1006 | Abnormal (network) | Yes |
| 4001 | Replaced by new connection | Yes (existing behavior) |
| 4003 | Cluster rejected (limit exceeded) | **No** — surface error |
