# Research: Queue Priority for Resume/Retry vs New Workflows

## Technology Decisions

### Redis Sorted Set Score Semantics

Redis sorted sets (`ZADD`/`ZPOPMIN`) order by numeric score (ascending). Members with the same score are ordered **lexicographically by member string**, not by insertion order. This is why we use timestamp-based sub-priorities rather than flat integer tiers.

**Decision**: Use fractional scores (`0.{timestamp}`, `1.{timestamp}`) for resume/retry tiers. JavaScript `Number` (IEEE 754 double) has 53 bits of mantissa precision — sufficient to represent `{tier}.{millisecond_timestamp}` without loss for timestamps through 2255.

### Precision Verification

```
0.1711036800000  → stored as 0.1711036800000 (15 significant digits, within float64 precision)
1.1711036800000  → stored as 1.1711036800000
1711036800000    → stored as 1711036800000
```

Redis stores scores as IEEE 754 doubles, matching JavaScript's `Number` type. No precision issues.

### Score Construction

```typescript
function computePriorityScore(reason: QueueReason): number {
  const timestamp = Date.now();
  switch (reason) {
    case 'resume': return Number(`0.${timestamp}`);  // 0.1711036800000
    case 'retry':  return Number(`1.${timestamp}`);   // 1.1711036800000
    case 'new':    return timestamp;                   // 1711036800000
  }
}
```

Ordering: `0.{ts} < 1.{ts} < {ts}` always holds since any real `Date.now()` ≫ 2.

## Alternatives Considered

### A1: Flat integer tiers (0, 1, Date.now())
**Rejected**: Same-score items in Redis sorted sets order lexicographically by member key (UUID-based), not by insertion time. This would break FIFO within a tier.

### A2: Separate queues per priority tier
**Rejected**: Would require polling multiple queues and implementing cross-queue priority logic. The sorted set already provides this natively.

### A3: Derive priority from `command` field only
**Rejected**: Retries re-enqueue with the original command (`process`, `continue`, etc.), so we can't distinguish "first attempt of continue" from "retry of continue" using command alone. A dedicated `queueReason` field is needed.

### A4: Callers compute and pass priority scores directly
**Rejected**: Scatters priority logic across call sites. Centralizing in the adapter (keyed by `queueReason`) keeps the scheme in one place and makes it easy to change.

## Implementation Patterns

### Backwards Compatibility Pattern
The `queueReason` field is optional on `QueueItem`. Adapters check: if `queueReason` is present, compute priority from it; otherwise, use the `priority` field as-is. This allows zero-downtime deployment — items enqueued before the change continue to work.

### Test Pattern for Priority Ordering
Enqueue items with different reasons, then verify dequeue order matches expected priority:
```typescript
await adapter.enqueue({ ...item, queueReason: 'new' });
await adapter.enqueue({ ...item2, queueReason: 'retry' });
await adapter.enqueue({ ...item3, queueReason: 'resume' });
// Claim order should be: resume → retry → new
```

## Key References

- [Redis ZADD docs](https://redis.io/commands/zadd/) — score semantics, lexicographic tiebreaking
- [Redis ZPOPMIN docs](https://redis.io/commands/zpopmin/) — atomic dequeue of lowest-score member
- [IEEE 754 double precision](https://en.wikipedia.org/wiki/Double-precision_floating-point_format) — 53 bits mantissa = ~15 significant digits
