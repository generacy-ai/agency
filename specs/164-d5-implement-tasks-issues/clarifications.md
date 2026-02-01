# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-31 19:26

### Q1: BacklogProvider Abstraction
**Context**: The spec mentions using BacklogProvider to create tickets, but the reference implementation uses GitHub directly via gh CLI. This affects code architecture and future extensibility.
**Question**: Should the implementation use a BacklogProvider abstraction (for multiple backlog systems) or directly integrate with GitHub via gh CLI?
**Options**:
- A: Use BacklogProvider abstraction - allows future support for Jira, Linear, etc.
- B: Use direct GitHub integration - simpler, matches reference implementation

**Answer**: B - Use direct GitHub integration via gh CLI. This is simpler and matches the reference implementation.

### Q2: Task Parser Dependency
**Context**: The spec lists B5 (task-parser) as a dependency, but there's no parseTasksFile utility in the agency package yet. Implementation could embed parsing logic or wait for B5.
**Question**: Should task parsing be embedded in this tool, or should it wait for the task-parser module (B5) to be implemented separately?
**Options**:
- A: Embed parsing logic - self-contained, can be refactored later
- B: Wait for B5 - cleaner separation of concerns but creates dependency

**Answer**: A - Embed parsing logic directly in this tool. It will be self-contained and can be refactored later if B5 becomes available.

### Q3: Task Format Support
**Context**: The reference implementation supports two task formats: individual tasks (T### pattern) and task groups (TG-XXX pattern used by epics). Supporting both increases complexity.
**Question**: Which task formats should be supported in the initial implementation?
**Options**:
- A: Both formats (T### and TG-XXX) - full feature parity with reference
- B: Individual tasks (T###) only - simpler initial implementation

**Answer**: A - Support both formats (T### and TG-XXX) for full feature parity with the reference implementation.

