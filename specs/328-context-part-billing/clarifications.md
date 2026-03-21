# Clarifications: Queue Priority for Resume/Retry vs New Workflows

## Batch 1 — 2026-03-21

### Q1: Implementation Target Repository
**Context**: No Redis queue or orchestrator code exists in the `agency` repository. The spec references an orchestrator that appears to live in `tetrad-development`.
**Question**: Which repository contains the orchestrator queue implementation where these changes should be made? If it's in `tetrad-development`, should this issue be moved or should changes span both repos?
**Options**:
- A: Changes go in `tetrad-development` only (move or cross-reference this issue)
- B: Changes go in `agency` (queue code will be added/ported here)
- C: Changes span both repositories

**Answer**: A — Changes go in the `generacy` repo only. The orchestrator and its Redis queue implementation live in `packages/orchestrator/` in the `generacy` repo, specifically `services/queue-service.ts`. The `agency` repo contains the MCP server and VS Code extension — it has no queue or dispatch code. This issue should either be moved to the `generacy` repo or cross-referenced with a new issue there.

### Q2: Same-Score Ordering Assumption
**Context**: The spec assumes "multiple resumes or retries at the same priority score will be dequeued in insertion order." However, Redis sorted sets order same-score members **lexicographically by member key**, not by insertion order. If member keys are UUIDs or non-chronological IDs, the dequeue order among same-priority items would not be FIFO.
**Question**: Should sub-priorities be used to ensure FIFO within a priority tier (e.g., resume scores as `0.{timestamp}` like `0.1711036800000`), or is lexicographic ordering among same-priority items acceptable?
**Options**:
- A: Use timestamp-based sub-priorities (e.g., `0.{timestamp}`) to guarantee FIFO within tier
- B: Lexicographic ordering among same-priority items is acceptable
- C: Another approach (please specify)

**Answer**: A — Use timestamp-based sub-priorities to guarantee FIFO within each tier. Redis sorted sets use lexicographic ordering for same-score members, which would order by member key string, not insertion time. Use scores like:
- Resume: `0.{timestamp}` (e.g., `0.1711036800000`)
- Retry: `1.{timestamp}` (e.g., `1.1711036800000`)
- New: `Date.now()` (e.g., `1711036800000`)

Since `0.xxx < 1.xxx < 1711036800000`, the priority tiers are preserved and FIFO is guaranteed within each tier. This is a clean approach that works with Redis sorted set semantics.

### Q3: Queue Item Data Model
**Context**: The spec requires adding a `queueReason` field to queue items, but the current data model of queue members in the Redis sorted set is not specified. Redis sorted sets store only a member string and a score — additional fields need a storage strategy.
**Question**: What is the current format of queue members in the Redis sorted set? Is the member a plain string ID (with details in a separate hash), a serialized JSON object, or something else?

**Answer**: The current queue uses a Redis sorted set where the member is a serialized JSON string containing the queue item data (`{ owner, repo, issueNumber, command, workflowName, ... }`), and the score is `Date.now()`. The `QueueService.enqueue()` method in `packages/orchestrator/src/services/queue-service.ts` does `ZADD` with the JSON string as the member and timestamp as the score. `ZPOPMIN` dequeues by lowest score. Adding `queueReason` is straightforward — just add the field to the JSON payload before serialization. It doesn't affect the sorted set mechanics since the score (not the member content) determines priority.

### Q4: Identifying Enqueue Call Sites
**Context**: The spec assumes "the enqueue call sites for resume, retry, and new workflows are identifiable and separable." Understanding the current code structure is needed before implementation can begin.
**Question**: Are resume, retry, and new workflows currently enqueued through separate code paths (different functions or endpoints), or through a single shared enqueue function with a type/reason parameter?
**Options**:
- A: Separate code paths for each type
- B: Single shared enqueue function
- C: Mixed — some are separate, some shared

**Answer**: C — Mixed. Looking at the orchestrator codebase:
- **New workflows**: Enqueued via webhook handlers and the `/dispatch/enqueue` API endpoint, which call `QueueService.enqueue()` with `command: 'process'`
- **Resume/continue**: Enqueued via the same `QueueService.enqueue()` but with `command: 'continue'`, triggered when clarification answers are posted or gates are resolved
- **Retry**: Currently uses the same enqueue path but may be triggered from the UI or API with a retry-specific endpoint

They all flow through `QueueService.enqueue()` but with different `command` values and trigger sources. The fix should add a `queueReason: 'new' | 'resume' | 'retry'` parameter to `enqueue()` and use it to determine the priority score.
