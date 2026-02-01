# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-31 19:26

### Q1: Port Scope
**Context**: The reference implementation in claude-plugins has significantly more functionality than the interfaces specified in the issue (e.g., task groups parsing, issue link management, custom ID patterns). This affects implementation effort and feature parity.
**Question**: Should the port include all functionality from the reference implementation, or only the minimal interfaces defined in the issue's Functions to Implement section?
**Options**:
- A: Full port - include all functionality from reference (parseTaskGroups, detectTaskFormat, filterEligibleTasks, issue link updates, etc.)
- B: Minimal port - only the 4 functions specified: parseTasks, buildDependencyGraph, topologicalSort, validateDependencies

**Answer**: A - Full port with all functionality from reference implementation (parseTaskGroups, detectTaskFormat, filterEligibleTasks, issue link updates, etc.)

### Q2: Missing Type Definitions
**Context**: The spec references ParseError and ValidationResult types in return values but doesn't define their structure. These are needed for the parseTasks and validateDependencies functions.
**Question**: What structure should ParseError and ValidationResult have, or should we infer from the reference implementation?
**Options**:
- A: Infer from reference implementation's patterns (warnings array, error details with line numbers)
- B: Define minimal structures (just message string and optional line number)

**Answer**: A - Infer from reference implementation's patterns (warnings array, error details with line numbers)

### Q3: Type Location
**Context**: The reference imports types from a separate types/tasks.ts file. The issue shows types inline in task-parser.ts. This affects code organization and reusability for other tools.
**Question**: Should types be co-located in task-parser.ts or placed in a separate src/types/tasks.ts file?
**Options**:
- A: Separate file (src/types/tasks.ts) - matches reference, better for type sharing
- B: Co-located in task-parser.ts - simpler, self-contained module

**Answer**: A - Separate file (src/types/tasks.ts) for better type sharing

