# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-17 23:23

### Q1: Subscription Pattern
**Context**: The spec includes a subscribe() method for real-time updates, but the implementation details are unclear. This affects memory management and API design.
**Question**: For the subscribe(callback) method, should it support multiple concurrent subscribers? If so, how should errors in one subscriber callback affect others?
**Options**:
- A: Single subscriber only - calling subscribe() again replaces previous subscription
- B: Multiple subscribers with independent error isolation (one failing doesn't affect others)
- C: Multiple subscribers but propagate errors (fail-fast if any callback throws)

**Answer**: *Pending*

### Q2: Session Isolation
**Context**: The spec mentions 'per-session isolation option' but doesn't clarify if this means separate storage or filtered views.
**Question**: What does 'per-session isolation option' mean for the memory provider?
**Options**:
- A: Separate in-memory storage per session (each session has its own ring buffer)
- B: Single shared storage with session-based filtering at query time (already implemented)
- C: Configurable option to enable either behavior

**Answer**: *Pending*

### Q3: Default Buffer Size
**Context**: The spec says 'default: 1000 events' but the current implementation uses 10000. This affects memory usage.
**Question**: What should the default max buffer size be?
**Options**:
- A: 1000 events (as per spec)
- B: 10000 events (as per current implementation)
- C: Different value (please specify)

**Answer**: *Pending*

### Q4: Duration Filter
**Context**: The spec mentions filtering by 'duration threshold' but this isn't in the TelemetryFilter interface or implementation.
**Question**: Should the duration threshold filter be added to TelemetryFilter? If so, how should it work?
**Options**:
- A: Add minDurationMs and maxDurationMs fields to filter by duration range
- B: Add single durationThresholdMs field to filter events slower than threshold
- C: Skip duration filtering - the current filters are sufficient

**Answer**: *Pending*

### Q5: Auto-Registration
**Context**: Acceptance criteria includes 'Registered by default when telemetry enabled' but doesn't specify the mechanism.
**Question**: How should the memory provider be 'registered by default'? Where should this registration happen?
**Options**:
- A: TelemetryManager constructor automatically creates and registers MemoryStorageProvider
- B: Separate factory function or configuration option that includes memory provider
- C: Application code must explicitly register - 'default' means it's the recommended/documented provider

**Answer**: *Pending*

