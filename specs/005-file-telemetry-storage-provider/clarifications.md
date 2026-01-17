# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-17 23:24

### Q1: Error Handling
**Context**: File operations can fail due to disk space, permissions, or I/O errors. The behavior on write failure affects reliability guarantees.
**Question**: What should happen when a write fails (e.g., disk full, permission denied)?
**Options**:
- A: Silently drop the event and continue (telemetry is best-effort)
- B: Log a warning and continue (visibility without disruption)
- C: Throw an error that propagates to the caller (strict mode)

**Answer**: *Pending*

### Q2: Session ID Source
**Context**: In 'session' mode, files are named by session ID. The spec doesn't specify where this ID comes from.
**Question**: In session mode, where should the session ID come from?
**Options**:
- A: Generated UUID when provider initializes
- B: Passed via configuration
- C: Extracted from the first ToolCallEvent's session context

**Answer**: *Pending*

### Q3: Compression Trigger
**Context**: Config includes 'compress: boolean' for gzipping old files, but doesn't specify when compression occurs.
**Question**: When should file compression be triggered?
**Options**:
- A: During rotateOldLogs() call only (explicit)
- B: Automatically when a file exceeds maxAgeDays threshold
- C: On shutdown() to compress completed session/day files

**Answer**: *Pending*

### Q4: Concurrent Writes
**Context**: Multiple agent sessions might write to the same daily log file simultaneously.
**Question**: Should the file provider support concurrent writes from multiple processes?
**Options**:
- A: No - single-process only (simpler, use file locks if needed)
- B: Yes - use file locking for safe concurrent appends

**Answer**: *Pending*

