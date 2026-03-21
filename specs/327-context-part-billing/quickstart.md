# Quickstart: Execution Lease Protocol

## Prerequisites

- `generacy` repo checked out
- Cloud API running with `ExecutionLeaseService` (Phase 2)
- Redis running for queue backend
- WebSocket relay connection to cloud

## Configuration

Add lease settings to orchestrator config (e.g., `cluster.yaml` or environment):

```yaml
dispatch:
  leaseEnabled: true              # Enable lease enforcement
  leaseRequestTimeoutMs: 30000    # 30s timeout for lease responses
  leaseHeartbeatIntervalMs: 30000 # 30s heartbeat interval
```

Or via environment variables:

```bash
DISPATCH_LEASE_ENABLED=true
DISPATCH_LEASE_REQUEST_TIMEOUT_MS=30000
DISPATCH_LEASE_HEARTBEAT_INTERVAL_MS=30000
```

## Verification

### 1. Lease Request Flow

1. Enqueue a work item
2. Watch orchestrator logs for:
   ```
   [lease-manager] Requesting lease for queueItemId=<id> jobId=<id>
   [lease-manager] Lease granted: leaseId=<id> ttl=90s
   [worker-dispatcher] Dispatching item with lease <leaseId>
   ```
3. Confirm the item is dispatched to a worker

### 2. Lease Denial Flow

1. Fill all available slots (dispatch items up to tier limit)
2. Enqueue another item
3. Watch for:
   ```
   [lease-manager] Requesting lease for queueItemId=<id> jobId=<id>
   [lease-manager] Lease denied: at_capacity
   [worker-dispatcher] Lease denied, releasing item back to queue
   ```
4. Confirm the item stays in the queue

### 3. Lease Release Flow

1. Wait for a dispatched workflow to complete
2. Watch for:
   ```
   [lease-manager] Releasing lease: leaseId=<id>
   ```
3. Confirm the item is removed from active leases

### 4. Heartbeat Flow

1. While a workflow is running, watch for periodic heartbeats:
   ```
   [lease-manager] Heartbeat sent for leaseId=<id>
   ```
2. Confirm heartbeats occur every ~30 seconds

### 5. Slot Available Flow

1. With queued items waiting (lease denied), complete a running workflow
2. Cloud should push `slot_available`
3. Watch for:
   ```
   [relay-bridge] Received slot_available: availableSlots=1
   [worker-dispatcher] Attempting dispatch for available slot
   [lease-manager] Requesting lease for queueItemId=<id>
   ```

### 6. Feature Flag Off (Backward Compatibility)

1. Set `leaseEnabled: false`
2. Enqueue and confirm items dispatch immediately without lease requests
3. No lease-related log messages should appear

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Items stuck in queue | Lease always denied | Check tier limits in cloud, verify `activeExecutions` counter |
| No heartbeat logs | Heartbeat not started | Verify `leaseId` stored in `WorkerInfo` after grant |
| Lease timeout errors | Relay disconnected | Check WebSocket connection, verify `GENERACY_API_KEY` |
| Dispatch without lease | Feature flag off | Set `DISPATCH_LEASE_ENABLED=true` |

## Running Tests

```bash
cd packages/orchestrator
pnpm test -- --grep "lease"
```
