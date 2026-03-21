# Clarifications: Queue Priority for Resume/Retry vs New Workflows

## Batch 1 — 2026-03-21

### Q1: Implementation Target Repository
**Context**: No Redis queue or orchestrator code exists in the `agency` repository. The spec references an orchestrator that appears to live in `tetrad-development`.
**Question**: Which repository contains the orchestrator queue implementation where these changes should be made? If it's in `tetrad-development`, should this issue be moved or should changes span both repos?
**Options**:
- A: Changes go in `tetrad-development` only (move or cross-reference this issue)
- B: Changes go in `agency` (queue code will be added/ported here)
- C: Changes span both repositories

**Answer**: *Pending*

### Q2: Same-Score Ordering Assumption
**Context**: The spec assumes "multiple resumes or retries at the same priority score will be dequeued in insertion order." However, Redis sorted sets order same-score members **lexicographically by member key**, not by insertion order. If member keys are UUIDs or non-chronological IDs, the dequeue order among same-priority items would not be FIFO.
**Question**: Should sub-priorities be used to ensure FIFO within a priority tier (e.g., resume scores as `0.{timestamp}` like `0.1711036800000`), or is lexicographic ordering among same-priority items acceptable?
**Options**:
- A: Use timestamp-based sub-priorities (e.g., `0.{timestamp}`) to guarantee FIFO within tier
- B: Lexicographic ordering among same-priority items is acceptable
- C: Another approach (please specify)

**Answer**: *Pending*

### Q3: Queue Item Data Model
**Context**: The spec requires adding a `queueReason` field to queue items, but the current data model of queue members in the Redis sorted set is not specified. Redis sorted sets store only a member string and a score — additional fields need a storage strategy.
**Question**: What is the current format of queue members in the Redis sorted set? Is the member a plain string ID (with details in a separate hash), a serialized JSON object, or something else?

**Answer**: *Pending*

### Q4: Identifying Enqueue Call Sites
**Context**: The spec assumes "the enqueue call sites for resume, retry, and new workflows are identifiable and separable." Understanding the current code structure is needed before implementation can begin.
**Question**: Are resume, retry, and new workflows currently enqueued through separate code paths (different functions or endpoints), or through a single shared enqueue function with a type/reason parameter?
**Options**:
- A: Separate code paths for each type
- B: Single shared enqueue function
- C: Mixed — some are separate, some shared

**Answer**: *Pending*
