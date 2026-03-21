# Tasks: Queue Priority for Resume/Retry vs New Workflows

**Input**: Design documents from `/specs/328-context-part-billing/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, clarifications.md
**Status**: Complete

**Target Repository**: `/workspaces/generacy/packages/orchestrator/`
> All code changes are in the `generacy` repo. This spec lives in `agency` for tracking.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story/acceptance criterion this task addresses

## Phase 1: Types & Priority Helper

- [X] T001 [AC1-3] Add `QueueReason` type and `queueReason` field to `QueueItem` in `src/types/monitor.ts`
  - Define `type QueueReason = 'new' | 'resume' | 'retry'`
  - Add optional `queueReason?: QueueReason` to `QueueItem` interface
  - `SerializedQueueItem` inherits it automatically

- [X] T002 [AC1-3] Create `src/services/queue-priority.ts` with `computePriorityScore(reason: QueueReason): number`
  - Resume → `Number(\`0.${Date.now()}\`)` (score ~0.17...)
  - Retry → `Number(\`1.${Date.now()}\`)` (score ~1.17...)
  - New → `Date.now()` (score ~1711...)

- [X] T003 [P] [AC5] Create `tests/unit/services/queue-priority.test.ts`
  - Test each reason returns correct score tier
  - Test ordering: `resume < retry < new` always holds
  - Test FIFO within tier (two sequential calls produce increasing scores)
  - Test precision: score round-trips through JSON without loss

## Phase 2: Adapter Updates

- [X] T004 [AC1-3,6] Update `src/services/redis-queue-adapter.ts`
  - In `enqueue()`: if `item.queueReason` is present, override score with `computePriorityScore(item.queueReason)`; otherwise fall back to `item.priority`
  - In `release()`: set `queueReason: 'retry'` and recompute priority before re-enqueue

- [X] T005 [P] [AC1-3,6] Update `src/services/in-memory-queue-adapter.ts`
  - Same logic as T004: priority override in `enqueue()`, retry reason in `release()`

- [X] T006 [AC4-5] Add priority ordering tests to `tests/unit/services/redis-queue-adapter.test.ts`
  - Enqueue items with all three reasons, verify dequeue order: resume → retry → new
  - Test `release()` re-enqueues with retry priority
  - Test backwards compat: item without `queueReason` uses `priority` field as-is

- [X] T007 [P] [AC4-5] Add priority ordering tests to `tests/unit/services/in-memory-queue-adapter.test.ts`
  - Same test cases as T006 for the in-memory adapter

## Phase 3: Enqueue Call Sites

- [X] T008 [AC1-3] Update `src/services/label-monitor-service.ts` enqueue calls
  - `command: 'process'` → add `queueReason: 'new'`
  - `command: 'continue'` → add `queueReason: 'resume'`

- [X] T009 [P] [AC1-3] Update `src/services/pr-feedback-monitor-service.ts` enqueue call
  - `command: 'address-pr-feedback'` → add `queueReason: 'new'`

- [X] T010 [AC5] Update `tests/unit/services/label-monitor-service.test.ts`
  - Verify enqueue calls include correct `queueReason` for each command type

## Phase 4: Integration Verification

- [X] T011 [AC4-5] End-to-end priority ordering integration test
  - Enqueue resume, retry, and new items in mixed order
  - Verify claim order matches: resume → retry → new
  - Verify FIFO within each tier
  - Can be added to existing adapter test files or a new integration test file

## Dependencies & Execution Order

```
T001 ──▶ T002 ──▶ T003 (can run in parallel with T004/T005 once T002 is done)
              ├──▶ T004 ──▶ T006
              └──▶ T005 ──▶ T007  (T005 parallel with T004)
T004 + T005 ──▶ T008 ──▶ T010
                 T009      (T009 parallel with T008)
T006 + T007 + T010 ──▶ T011
```

**Phase boundaries** (sequential):
- Phase 1 → Phase 2 → Phase 3 → Phase 4

**Parallel opportunities within phases**:
- Phase 1: T003 can start once T002 is done (parallel with Phase 2 prep)
- Phase 2: T004 and T005 are independent (parallel); T006 and T007 are independent (parallel)
- Phase 3: T008 and T009 are independent (parallel)
