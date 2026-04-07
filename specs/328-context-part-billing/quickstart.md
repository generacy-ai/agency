# Quickstart: Queue Priority for Resume/Retry vs New Workflows

## Overview

This feature modifies the orchestrator's dispatch queue so that resumed workflows (priority `0.{ts}`) dequeue before retries (`1.{ts}`), which dequeue before new work (`Date.now()`).

## Prerequisites

- Access to the `generacy` repository
- Node.js, pnpm, Redis (or use in-memory adapter for local dev)

## Where to Make Changes

All changes are in:
```
/workspaces/generacy/packages/orchestrator/
```

## Key Files

| File | Role |
|------|------|
| `src/types/monitor.ts` | `QueueItem` interface, `QueueReason` type |
| `src/services/queue-priority.ts` | `computePriorityScore()` helper (new) |
| `src/services/redis-queue-adapter.ts` | Redis queue — enqueue/release |
| `src/services/in-memory-queue-adapter.ts` | In-memory queue — enqueue/release |
| `src/services/label-monitor-service.ts` | Sets `queueReason` on process/continue |
| `src/services/pr-feedback-monitor-service.ts` | Sets `queueReason` on PR feedback |

## Running Tests

```bash
cd /workspaces/generacy/packages/orchestrator
pnpm test                          # all tests
pnpm test -- queue-priority        # priority helper tests
pnpm test -- redis-queue-adapter   # Redis adapter tests
pnpm test -- in-memory-queue       # In-memory adapter tests
```

## Verifying Priority Ordering

After implementation, verify with this mental model:

```
Enqueue order:  new → retry → resume
Dequeue order:  resume → retry → new   (lowest score first)
```

Score examples for items enqueued at timestamp `1711036800000`:
```
resume: 0.1711036800000   ← dequeued first
retry:  1.1711036800000   ← dequeued second
new:    1711036800000     ← dequeued last
```

## Backwards Compatibility

- Items already in the queue (without `queueReason`) continue to work
- The `priority` field is used as fallback when `queueReason` is absent
- No migration needed — old items drain naturally

## Troubleshooting

**Q: Retry items not getting higher priority?**
Check that `release()` sets `queueReason: 'retry'` before re-enqueueing.

**Q: Resume and new items have same priority?**
Verify `LabelMonitorService` sets `queueReason: 'resume'` for `continue` commands, not `'new'`.

**Q: Precision issues with fractional scores?**
JavaScript `Number` and Redis both use IEEE 754 doubles — 15 significant digits. Timestamps are 13 digits, so `0.{13-digit-ts}` = 14 significant digits. No precision loss.
