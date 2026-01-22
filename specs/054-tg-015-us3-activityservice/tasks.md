# Tasks: ActivityService

**Input**: Design documents from `/specs/054-tg-015-us3-activityservice/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US3: Activity Monitoring)

---

## Phase 1: Service Foundation

- [x] T001 [US3] Create `ActivityService.ts` with singleton pattern and initialization
  - File: `packages/agency-extension/src/services/ActivityService.ts`
  - Implement singleton `getInstance()` and `reset()` methods
  - Implement `initialize(vscodeModule)` and `dispose()` lifecycle methods
  - Follow pattern from `McpClientService.ts`

- [x] T002 [US3] Implement ring buffer for event storage
  - File: `packages/agency-extension/src/services/ActivityService.ts`
  - Create internal `RingBuffer<ToolCallEvent>` class
  - Implement `push()` with FIFO eviction at capacity
  - Implement `toArray()` for retrieval in insertion order
  - Default max size: 1000 events

- [x] T003 [US3] Add event emitters for tool call events
  - File: `packages/agency-extension/src/services/ActivityService.ts`
  - Copy `EventEmitter<T>` pattern from `McpClientService.ts`
  - Implement `onToolCall` event (single event)
  - Implement `onBatch` event (batch updates)

---

## Phase 2: Core Functionality

- [x] T004 [US3] Implement `addEvent()` method
  - File: `packages/agency-extension/src/services/ActivityService.ts`
  - Validate incoming `ToolCallEvent`
  - Add to ring buffer
  - Fire `onToolCall` event
  - Support batch mode via `addEvents()` that fires `onBatch`

- [x] T005 [US3] Implement filter matching for `getEvents()`
  - File: `packages/agency-extension/src/services/ActivityService.ts`
  - Match `toolName` (partial, case-insensitive)
  - Match `namespace`, `pluginId`, `agentId`, `containerId` (exact)
  - Match `status` (single value or array)
  - Match `isError` (boolean)
  - Match `startTime`/`endTime` (range)
  - Apply `limit` and `offset` for pagination

- [x] T006 [US3] Implement `getEventById()` and `clearEvents()` methods
  - File: `packages/agency-extension/src/services/ActivityService.ts`
  - `getEventById(id)` - O(n) lookup by event ID
  - `clearEvents()` - Reset buffer and emit empty batch

- [x] T007 [US3] Implement buffer size configuration
  - File: `packages/agency-extension/src/services/ActivityService.ts`
  - `setBufferSize(maxEvents)` - Resize buffer (may evict events)
  - `getBufferSize()` - Return current max size
  - Minimum size: 100 events

---

## Phase 3: Statistics

- [x] T008 [US3] Implement `getStats()` for activity statistics
  - File: `packages/agency-extension/src/services/ActivityService.ts`
  - Calculate `totalCalls`, `successCount`, `errorCount`, `timeoutCount`, `pendingCount`
  - Calculate `averageDuration` from completed events
  - Calculate `medianDuration` (sort and find middle)
  - Calculate `callsPerMinute` based on time range
  - Generate `topTools` array with usage stats
  - Support optional `ActivityFilter` to scope statistics

---

## Phase 4: Integration & Export

- [x] T009 [US3] Export ActivityService from services index
  - File: `packages/agency-extension/src/services/index.ts`
  - Add `export { ActivityService } from './ActivityService';`

---

## Phase 5: Testing

- [x] T010 [P] [US3] Write unit tests for ring buffer
  - File: `packages/agency-extension/src/__tests__/services/ActivityService.test.ts`
  - Test insertion and retrieval order
  - Test eviction at capacity
  - Test resize behavior

- [x] T011 [P] [US3] Write unit tests for event filtering
  - File: `packages/agency-extension/src/__tests__/services/ActivityService.test.ts`
  - Test each filter field individually
  - Test filter combinations
  - Test pagination (limit/offset)
  - Test empty filter (return all)

- [x] T012 [P] [US3] Write unit tests for statistics calculation
  - File: `packages/agency-extension/src/__tests__/services/ActivityService.test.ts`
  - Test count aggregations
  - Test duration calculations (average, median)
  - Test calls per minute calculation
  - Test top tools ranking

- [x] T013 [P] [US3] Write unit tests for event emission
  - File: `packages/agency-extension/src/__tests__/services/ActivityService.test.ts`
  - Test `onToolCall` fires on `addEvent()`
  - Test `onBatch` fires on `addEvents()`
  - Test listener disposal

---

## Dependencies & Execution Order

**Phase dependencies** (sequential):
- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

**Task dependencies within phases**:
- T001 must complete before T002, T003
- T002 must complete before T004, T005, T006, T007
- T003 must complete before T004
- T004, T005, T006, T007 can run in any order after dependencies
- T008 depends on T005 (uses filter logic)
- T009 depends on T001-T008 (complete service)

**Parallel opportunities**:
- T010, T011, T012, T013 can all run in parallel (different test scopes)

**User story coverage**:
- All tasks belong to US3 (Activity Monitoring)

---

*Generated by speckit*
