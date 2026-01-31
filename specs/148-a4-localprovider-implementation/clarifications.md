# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-31 18:37

### Q1: Delete Operation
**Context**: Acceptance criteria lists 'create, read, update' but not delete. This affects whether we need a deleteTicket method.
**Question**: Should LocalProvider support ticket deletion, or is the lack of delete operation intentional?
**Options**:
- A: No delete - tickets are permanent once created
- B: Add deleteTicket method to remove tickets

**Answer**: *Pending*

### Q2: ID Overflow
**Context**: The ID format LOCAL-XXX uses zero-padded 3 digits. When nextId exceeds 999, the format would change (LOCAL-1000 vs LOCAL-001).
**Question**: How should ticket IDs handle numbers beyond 999?
**Options**:
- A: Allow longer IDs naturally (LOCAL-1000, LOCAL-10000, etc.)
- B: Always pad to 3 digits minimum, extend as needed (LOCAL-001, LOCAL-1000)
- C: Cap at 999 tickets per store

**Answer**: *Pending*

### Q3: Optional Methods
**Context**: BacklogProvider has optional methods: setLabels, getLabels, searchTickets. The spec doesn't specify whether to implement these.
**Question**: Should LocalProvider implement the optional BacklogProvider methods?
**Options**:
- A: Only required methods (simpler, matches acceptance criteria)
- B: Add setLabels/getLabels (labels fully supported)
- C: All optional methods including searchTickets

**Answer**: *Pending*

