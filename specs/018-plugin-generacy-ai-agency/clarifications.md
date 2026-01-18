# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-18 04:02

### Q1: Queue Persistence Mechanism
**Context**: The spec requires 'Queue persists if Humancy disconnected' but doesn't specify where or how the queue should be stored. This affects architecture decisions for the plugin.
**Question**: How should the request queue be persisted when Humancy is disconnected?
**Options**:
- A: In-memory only (lost on agent restart)
- B: File-based persistence (survives agent restart)
- C: Delegate to channel router's persistence layer
- D: Use agency core's telemetry storage provider

**Answer**: *Pending*

### Q2: Request Review Tool Behavior
**Context**: The `humancy.request_review` tool is listed but no example implementation or parameter schema is provided. Understanding its behavior is needed for implementation.
**Question**: What should `humancy.request_review` accept as input and return?
**Options**:
- A: Accept artifact path/content, return approval status (approved/rejected)
- B: Accept artifact + checklist, return item-by-item feedback
- C: Accept artifact, return freeform review comments
- D: Accept work summary, return continuation decision

**Answer**: *Pending*

### Q3: Connection Mode Detection
**Context**: The spec lists three connection modes (Direct, Via Generacy, Offline) but doesn't explain how the plugin determines which mode to use.
**Question**: How should the plugin detect and switch between connection modes?
**Options**:
- A: Configuration-based (user specifies mode in plugin config)
- B: Auto-detect with fallback chain (Direct → Generacy → Offline)
- C: Environment-based (detect from runtime environment)
- D: Hybrid (config preference with automatic fallback)

**Answer**: *Pending*

### Q4: Timeout Behavior
**Context**: The spec mentions timeout handling but doesn't specify what should happen when a request times out, especially for blocking requests.
**Question**: What should happen when a human decision request times out?
**Options**:
- A: Return error result, let agent decide how to proceed
- B: Return a default 'no decision' response with timeout flag
- C: Automatically escalate urgency and retry
- D: Queue for later and return 'pending' status

**Answer**: *Pending*

### Q5: Notify Tool Semantics
**Context**: The `humancy.notify` tool is described as 'non-blocking' but it's unclear if delivery confirmation is expected or if it's fire-and-forget.
**Question**: Should `humancy.notify` provide delivery confirmation or be fire-and-forget?
**Options**:
- A: Fire-and-forget (return immediately, no confirmation)
- B: Wait for delivery acknowledgment (human received)
- C: Configurable per-call (optional wait parameter)
- D: Best-effort with async callback/event on failure

**Answer**: *Pending*

