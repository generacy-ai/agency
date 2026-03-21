# Data Model: Queue Priority for Resume/Retry vs New Workflows

## New Types

### QueueReason

```typescript
type QueueReason = 'new' | 'resume' | 'retry';
```

Discriminates why an item was enqueued, determining its priority tier.

| Value | Trigger | Priority Tier |
|-------|---------|--------------|
| `'new'` | Fresh issue trigger or PR feedback | `Date.now()` |
| `'resume'` | Workflow continuing after phase completion | `0.{timestamp}` |
| `'retry'` | Re-enqueue after worker failure | `1.{timestamp}` |

## Modified Types

### QueueItem (existing)

```typescript
interface QueueItem {
  owner: string;
  repo: string;
  issueNumber: number;
  workflowName: string;
  command: 'process' | 'continue' | 'address-pr-feedback';
  priority: number;
  enqueuedAt: string;
  metadata?: Record<string, unknown>;
  queueReason?: QueueReason;          // ← NEW (optional for backwards compat)
}
```

### SerializedQueueItem (existing, internal)

```typescript
interface SerializedQueueItem extends QueueItem {
  attemptCount: number;
  itemKey: string;
  // queueReason inherited from QueueItem
}
```

## Mapping: Command → Default QueueReason

| Command | Default QueueReason |
|---------|-------------------|
| `'process'` | `'new'` |
| `'continue'` | `'resume'` |
| `'address-pr-feedback'` | `'new'` |

Note: `release()` overrides `queueReason` to `'retry'` regardless of original command.

## Priority Score Computation

```typescript
function computePriorityScore(reason: QueueReason): number {
  const timestamp = Date.now();
  switch (reason) {
    case 'resume': return Number(`0.${timestamp}`);
    case 'retry':  return Number(`1.${timestamp}`);
    case 'new':    return timestamp;
  }
}
```

## Validation Rules

- `queueReason` must be one of `'new' | 'resume' | 'retry'` when present
- When `queueReason` is absent (legacy items), `priority` field is used as-is
- Priority scores must be non-negative numbers
- Timestamp sub-priorities use `Date.now()` at enqueue time (not original enqueuedAt)

## Redis Storage

No schema change to the Redis sorted set itself. The member remains a JSON-serialized `SerializedQueueItem` (now including `queueReason`). The score changes from always `Date.now()` to `computePriorityScore(queueReason)`.

```
Key:    orchestrator:queue:pending
Type:   Sorted Set
Member: JSON string of SerializedQueueItem
Score:  computePriorityScore(item.queueReason) or item.priority (legacy)
```
