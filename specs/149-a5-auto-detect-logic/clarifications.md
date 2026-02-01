# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-31 19:26

### Q1: File location discrepancy
**Context**: The spec says to create `src/providers/detect.ts`, but an implementation already exists at `packages/agency-plugin-spec-kit/src/utils/detect-ticket-ref.ts`. The existing implementation is already used by `GitHubProvider.parseRef()`.
**Question**: Should the existing implementation at `src/utils/detect-ticket-ref.ts` be moved to `src/providers/detect.ts` to match the spec, or should the spec be updated to reference the existing location?
**Options**:
- A: Move the existing file to `src/providers/detect.ts` as specified
- B: Update the spec to use the existing `src/utils/detect-ticket-ref.ts` location

**Answer**: *Pending*

### Q2: LOCAL pattern support
**Context**: The spec mentions supporting `LOCAL-001` format, but the current implementation doesn't include a local provider pattern. The local provider exists (`src/providers/local.ts`) but detection for its format isn't implemented.
**Question**: Should the `LOCAL-xxx` pattern be added to the detection logic to support the local provider shorthand format?
**Options**:
- A: Yes, add `LOCAL-xxx` pattern detection
- B: No, local tickets should only be referenced by full ID or other means

**Answer**: *Pending*

### Q3: Implementation completeness
**Context**: The existing `detectTicketRef` implementation appears to already fulfill most acceptance criteria. Tests exist and pass. The main gap is the LOCAL pattern mentioned above.
**Question**: Is this issue about enhancing the existing implementation (adding LOCAL pattern, etc.) or has it already been completed and just needs verification?
**Options**:
- A: Enhance existing implementation with missing features
- B: Verify existing implementation meets criteria, update spec if needed
- C: Complete rewrite to match spec exactly (move file location, etc.)

**Answer**: *Pending*

