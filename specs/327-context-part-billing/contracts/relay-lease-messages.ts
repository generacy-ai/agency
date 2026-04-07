/**
 * Relay Lease Message Contracts
 *
 * Defines the message types for execution lease communication
 * between the orchestrator (cluster) and the cloud API via WebSocket relay.
 *
 * These types extend the existing RelayMessage union in
 * packages/cluster-relay/src/messages.ts
 */

// ─── Outbound: Cluster → Cloud ──────────────────────────────────────

/** Request an execution lease before dispatching work */
export interface LeaseRequestMessage {
  type: 'lease_request';
  correlationId: string;
  payload: {
    queueItemId: string;
    jobId: string;
  };
}

/** Release an execution lease (workflow complete/fail/pause/cancel) */
export interface LeaseReleaseMessage {
  type: 'lease_release';
  payload: {
    leaseId: string;
  };
}

/** Heartbeat to keep a lease alive (sent every 30s) */
export interface LeaseHeartbeatMessage {
  type: 'lease_heartbeat';
  payload: {
    leaseId: string;
  };
}

// ─── Inbound: Cloud → Cluster ───────────────────────────────────────

/** Lease was granted — proceed with dispatch */
export interface LeaseGrantedMessage {
  type: 'lease_granted';
  correlationId: string;
  payload: {
    leaseId: string;
    ttlSeconds: number;
  };
}

/** Lease was denied — do not dispatch, leave item queued */
export interface LeaseDeniedMessage {
  type: 'lease_denied';
  correlationId: string;
  payload: {
    reason: 'at_capacity';
    currentCount?: number;
    limit?: number;
  };
}

/** Cloud notifies that execution slots are available */
export interface SlotAvailableMessage {
  type: 'slot_available';
  payload: {
    orgId: string;
    availableSlots: number;
  };
}

// ─── Union ──────────────────────────────────────────────────────────

export type LeaseRelayMessage =
  | LeaseRequestMessage
  | LeaseGrantedMessage
  | LeaseDeniedMessage
  | LeaseReleaseMessage
  | LeaseHeartbeatMessage
  | SlotAvailableMessage;
