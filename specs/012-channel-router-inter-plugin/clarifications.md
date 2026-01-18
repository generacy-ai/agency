# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-18 02:46

### Q1: Error Handling Behavior
**Context**: Implementation needs to know how to handle failure scenarios to ensure consistent behavior.
**Question**: When a subscriber handler throws an error, should the router (A) swallow errors and continue to other subscribers, (B) stop delivery and throw to the sender, or (C) collect all errors and report them after delivery completes?
**Options**:
- A: Swallow errors, continue delivery to other subscribers
- B: Stop delivery immediately, throw error to sender
- C: Complete delivery to all, then report collected errors

**Answer**: **C** - Complete delivery to all, then report collected errors. Aligns with the "graceful degradation" principle - one failing subscriber shouldn't break delivery to others. Sender still gets visibility into failures for debugging.

### Q2: Multiple Subscriber Delivery
**Context**: Channel pub/sub semantics affect how plugins coordinate.
**Question**: When a channel has multiple subscribers, should messages be delivered (A) to all subscribers concurrently, (B) to all subscribers sequentially in registration order, or (C) to the first subscriber only?
**Options**:
- A: Deliver to all concurrently (parallel dispatch)
- B: Deliver to all sequentially (ordered, one at a time)
- C: Deliver to first subscriber only (first-wins)

**Answer**: **A** - Deliver to all concurrently (parallel dispatch). Standard pub/sub pattern. Parallel execution is a core architectural value (parallel agents, maximizing throughput). Sequential delivery would create artificial bottlenecks.

### Q3: Version Compatibility Semantics
**Context**: The spec mentions version checking but doesn't define compatibility rules.
**Question**: What version compatibility scheme should be used for channel versioning? (A) Semver-compatible (^major.minor), (B) Exact match only, or (C) Allow any version >= minVersion?
**Options**:
- A: Semver-compatible (same major, >= minor.patch)
- B: Exact version match required
- C: Any version >= specified minVersion

**Answer**: **A** - Semver-compatible (same major, >= minor.patch). The compatibility docs explicitly state "additive-only changes" as a rule. This maps directly to semver: minor/patch versions are additive and compatible, major versions indicate breaking changes.

### Q4: Default sendAndWait Timeout
**Context**: The timeout parameter in sendAndWait is optional, so a sensible default is needed.
**Question**: What should be the default timeout for sendAndWait when no timeout is specified?
**Options**:
- A: 30 seconds (standard API timeout)
- B: 5 seconds (fast failure)
- C: No timeout (wait indefinitely)

**Answer**: **A** - 30 seconds. No timeout (C) risks indefinite hangs. 5 seconds (B) is too aggressive for I/O operations. 30 seconds is a sensible default; callers can specify shorter timeouts when needed.

### Q5: Channel ID Conflicts
**Context**: Multiple plugins might attempt to register channels with the same ID.
**Question**: When a plugin tries to register a channel with an ID that already exists, should the router (A) throw an error rejecting the registration, (B) allow duplicate registrations (all receive messages), or (C) replace the existing registration (last wins)?
**Options**:
- A: Throw error, reject duplicate registration
- B: Allow duplicates, both receive messages
- C: Replace existing, last registration wins

**Answer**: **A** - Throw error, reject duplicate registration. Channel definitions include an `owner` field, indicating ownership semantics. Silent replacement or duplication would create confusing bugs. Fail-fast makes conflicts explicit. Plugins needing to take over a channel should explicitly unregister first.

