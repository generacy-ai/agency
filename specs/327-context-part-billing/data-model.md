# Data Model: Integrate Execution Lease Protocol into Orchestrator Dispatch

## Core Entities

### LeaseInfo

Tracks an active lease held by the orchestrator. Stored in-memory in `LeaseManager`.

```typescript
export interface LeaseInfo {
  leaseId: string;           // UUID from cloud (format: {clusterId}_{queueItemId})
  queueItemId: string;       // Reference to the queue item this lease covers
  jobId: string;             // Reference to the dispatched job
  ttlSeconds: number;        // Lease TTL from cloud (default: 90s)
  grantedAt: number;         // Timestamp when lease was granted (Date.now())
  stopHeartbeat: () => void; // Cleanup function to stop heartbeat interval
}
```

### LeaseRequestResult

Response from a lease request attempt.

```typescript
export type LeaseRequestResult =
  | { granted: true; leaseId: string; ttlSeconds: number }
  | { granted: false; reason: 'at_capacity' }
  | { granted: false; reason: 'timeout' };
```

### LeaseConfig

Configuration for lease behavior, added to existing `DispatchConfig`.

```typescript
export interface LeaseConfig {
  leaseEnabled: boolean;            // Default: false — feature flag
  leaseRequestTimeoutMs: number;    // Default: 30000 (30s)
  leaseHeartbeatIntervalMs: number; // Default: 30000 (30s)
}
```

## Relay Message Types

### Outbound (Cluster → Cloud)

```typescript
export interface LeaseRequestMessage {
  type: 'lease_request';
  correlationId: string;     // UUID for matching response
  payload: {
    queueItemId: string;
    jobId: string;
  };
}

export interface LeaseReleaseMessage {
  type: 'lease_release';
  payload: {
    leaseId: string;
  };
}

export interface LeaseHeartbeatMessage {
  type: 'lease_heartbeat';
  payload: {
    leaseId: string;
  };
}
```

### Inbound (Cloud → Cluster)

```typescript
export interface LeaseGrantedMessage {
  type: 'lease_granted';
  correlationId: string;     // Matches the original request
  payload: {
    leaseId: string;
    ttlSeconds: number;
  };
}

export interface LeaseDeniedMessage {
  type: 'lease_denied';
  correlationId: string;     // Matches the original request
  payload: {
    reason: 'at_capacity';
    currentCount?: number;
    limit?: number;
  };
}

export interface SlotAvailableMessage {
  type: 'slot_available';
  payload: {
    orgId: string;
    availableSlots: number;
  };
}
```

## Extended Existing Types

### WorkerInfo (extended)

The existing `WorkerInfo` interface gains a `leaseId` field:

```typescript
export interface WorkerInfo {
  workerId: string;
  item: QueueItem;
  startedAt: number;
  heartbeatInterval: NodeJS.Timeout;
  promise: Promise<void>;
  leaseId?: string;          // NEW: associated execution lease
}
```

### RelayMessage (extended union)

The existing `RelayMessage` union in `cluster-relay/src/messages.ts` gains six new members:

```typescript
export type RelayMessage =
  | ApiRequestMessage
  | ApiResponseMessage
  | EventMessage
  | ConversationMessage
  | HeartbeatMessage
  | HandshakeMessage
  | ErrorMessage
  // NEW lease messages:
  | LeaseRequestMessage
  | LeaseGrantedMessage
  | LeaseDeniedMessage
  | LeaseReleaseMessage
  | LeaseHeartbeatMessage
  | SlotAvailableMessage;
```

## Relationships

```
QueueItem (Redis)
  └── claimed by WorkerDispatcher
       └── LeaseInfo (in-memory, LeaseManager)
            ├── leaseId ← from cloud LeaseGrantedMessage
            ├── heartbeat loop → sends LeaseHeartbeatMessage every 30s
            └── released on complete/fail/pause/cancel → LeaseReleaseMessage

SlotAvailableMessage (from cloud)
  └── triggers WorkerDispatcher to attempt dispatch
       └── up to availableSlots items, sequentially
```

## Validation Rules

- `correlationId` must be a valid UUID v4
- `leaseId` format: `{clusterId}_{queueItemId}` (validated by cloud, opaque to orchestrator)
- `ttlSeconds` must be positive (cloud default: 90)
- `availableSlots` must be >= 1
- `reason` in `LeaseDeniedMessage` must be `'at_capacity'`
