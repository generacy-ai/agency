# Implementation Plan: Queue Priority for Resume/Retry vs New Workflows

**Feature**: Set queue priority scores so resumes and retries dispatch before new work
**Branch**: `328-context-part-billing`
**Status**: Complete

## Summary

Modify the orchestrator's dispatch queue to assign priority scores based on queue reason (resume, retry, or new), ensuring in-progress and failed work is dispatched before fresh triggers. Uses timestamp-based sub-priorities (`0.{ts}`, `1.{ts}`, `Date.now()`) to preserve FIFO within each tier while maintaining backwards compatibility.

## Technical Context

- **Language**: TypeScript
- **Runtime**: Node.js
- **Repository**: `generacy` (not `agency` — see clarification Q1)
- **Package**: `packages/orchestrator`
- **Queue backend**: Redis sorted sets (`ZADD`/`ZPOPMIN`), with in-memory adapter for local dev
- **Framework**: Express routes, service layer pattern
- **Testing**: Vitest (unit + integration)

## Target Repository Note

All code changes are in `/workspaces/generacy/packages/orchestrator/`. This spec lives in the `agency` repo for tracking purposes, but the implementation belongs in `generacy`.

## Architecture Overview

```
Enqueue Sources                  Queue Adapters              Consumer
─────────────────               ─────────────────           ──────────
LabelMonitorService ──┐         RedisQueueAdapter           WorkerDispatcher
  (process/continue)  ├──▶ enqueue(item) ──▶ ZADD ──┐       ├── claim() ──▶ ZPOPMIN
PrFeedbackMonitor  ───┘         InMemoryQueueAdapter        ├── complete()
                                                     │       └── release() ──▶ re-enqueue
                                                     └──▶ sorted set (score = priority)
```

## Priority Scheme

| Score Pattern | Queue Reason | Command(s) | Rationale |
|--------------|-------------|------------|-----------|
| `0.{timestamp}` | **resume** | `continue` | Finish in-progress work first |
| `1.{timestamp}` | **retry** | (re-enqueue from release) | Re-attempt failed work before new |
| `Date.now()` | **new** | `process`, `address-pr-feedback` | Fresh triggers, FIFO |

Since `0.xxx < 1.xxx < 1711036800000` (any real timestamp), tier ordering is guaranteed. Timestamp suffix guarantees FIFO within each tier.

## Project Structure — Files to Modify

### Types
| File | Change |
|------|--------|
| `src/types/monitor.ts` | Add `queueReason` to `QueueItem` interface; add `QueueReason` type |

### Adapters
| File | Change |
|------|--------|
| `src/services/redis-queue-adapter.ts` | Use `queueReason` to compute priority score in `enqueue()`; set retry reason/priority in `release()` |
| `src/services/in-memory-queue-adapter.ts` | Same changes as Redis adapter |

### Enqueue Call Sites
| File | Change |
|------|--------|
| `src/services/label-monitor-service.ts` | Set `queueReason: 'new'` for process, `queueReason: 'resume'` for continue |
| `src/services/pr-feedback-monitor-service.ts` | Set `queueReason: 'new'` for PR feedback |

### Priority Helper (new file)
| File | Change |
|------|--------|
| `src/services/queue-priority.ts` | Pure function: `computePriorityScore(reason: QueueReason): number` |

### Tests
| File | Change |
|------|--------|
| `tests/unit/services/redis-queue-adapter.test.ts` | Test priority score assignment for each reason |
| `tests/unit/services/in-memory-queue-adapter.test.ts` | Test priority ordering across reasons |
| `tests/unit/services/queue-priority.test.ts` | Unit test the priority computation function |
| `tests/unit/services/label-monitor-service.test.ts` | Verify queueReason set correctly |

## Design Decisions

### D1: Priority score computation as pure function
Extract `computePriorityScore(reason)` into its own module so both adapters share the same logic and it's trivially testable.

### D2: `queueReason` on QueueItem, not just computed from `command`
While `command: 'continue'` implies resume, retries re-use the original command. A dedicated `queueReason` field is explicit and avoids coupling priority to command semantics.

### D3: Adapters apply priority, not callers
Callers set `queueReason` but continue passing `priority: Date.now()` as a default. Adapters override with `computePriorityScore()` when `queueReason` is present. This keeps call sites minimal and centralizes priority logic.

### D4: `release()` sets retry reason
When `release()` re-enqueues a failed item, it sets `queueReason: 'retry'` and recomputes priority. This replaces the current behavior of preserving the original priority.

### D5: Backwards compatibility
Items without `queueReason` (in-flight during deployment) continue working — adapters fall back to the existing `priority` field when `queueReason` is absent.

## Implementation Order

1. Add `QueueReason` type and `queueReason` field to `QueueItem` (types)
2. Create `computePriorityScore()` helper + tests
3. Update `RedisQueueAdapter.enqueue()` and `release()` + tests
4. Update `InMemoryQueueAdapter.enqueue()` and `release()` + tests
5. Update `LabelMonitorService` enqueue calls + tests
6. Update `PrFeedbackMonitorService` enqueue call + tests
7. End-to-end priority ordering test
