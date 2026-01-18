# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-18 04:02

### Q1: Conflict Resolution Behavior
**Context**: The acceptance criteria mentions 'Conflict detection with Humancy escalation' but doesn't specify what constitutes a conflict that should be escalated vs. handled automatically.
**Question**: What types of git conflicts should trigger Humancy escalation, and what should the plugin attempt to resolve automatically?
**Options**:
- A: Escalate all merge/rebase conflicts to human
- B: Escalate only semantic conflicts (same function edited); auto-resolve textual conflicts
- C: Never auto-resolve; always escalate any conflict
- D: Provide structured conflict info and let agent decide per-case

**Answer**: *Pending*

### Q2: Error Handling Strategy
**Context**: Git operations can fail for many reasons (auth, network, conflicts, detached HEAD, etc.). The terse output pattern is mentioned but not how errors map to it.
**Question**: Should git errors be wrapped in a standardized error taxonomy, or passed through as-is with exit codes?
**Options**:
- A: Standardized error types (AuthError, NetworkError, ConflictError, etc.)
- B: Pass through git's exit codes and stderr directly
- C: Hybrid: categorize common errors, pass through uncommon ones

**Answer**: *Pending*

### Q3: Force Push Safety
**Context**: Config shows 'allowForcePush: false' but doesn't specify behavior when force push is needed (e.g., after rebase).
**Question**: When force push is required but disabled, should the plugin fail silently, return a structured error, or escalate to human?
**Options**:
- A: Return error with instructions on how to enable
- B: Escalate to human via Humancy
- C: Block and explain why, suggest alternative workflow

**Answer**: *Pending*

### Q4: Working Directory Scope
**Context**: The spec doesn't clarify if tools operate on a fixed working directory or accept path parameters.
**Question**: Should git tools always operate on the current working directory, or accept an optional 'cwd' parameter for multi-repo scenarios?
**Options**:
- A: Always use process.cwd() - single repo assumed
- B: Accept optional 'cwd' parameter on all tools
- C: Use plugin-level config for working directory

**Answer**: *Pending*

### Q5: Authentication Method
**Context**: Push/pull operations require authentication. The spec doesn't address how credentials are provided or managed.
**Question**: How should the plugin handle git authentication for remote operations?
**Options**:
- A: Rely on system git credential helper (no plugin-level auth)
- B: Accept token/credentials in plugin config
- C: Support both: prefer config, fallback to system

**Answer**: *Pending*

