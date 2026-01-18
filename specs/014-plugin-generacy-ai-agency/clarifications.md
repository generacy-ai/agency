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

**Answer**: **D** - Provide structured conflict info and let agent decide per-case. Aligns with "agents are primary workers" principle. The plugin should provide rich, structured conflict information (file, conflict type, conflicting content) and let the agent decide whether to resolve autonomously or escalate. This respects agent autonomy rather than hard-coding heuristics.

### Q2: Error Handling Strategy
**Context**: Git operations can fail for many reasons (auth, network, conflicts, detached HEAD, etc.). The terse output pattern is mentioned but not how errors map to it.
**Question**: Should git errors be wrapped in a standardized error taxonomy, or passed through as-is with exit codes?
**Options**:
- A: Standardized error types (AuthError, NetworkError, ConflictError, etc.)
- B: Pass through git's exit codes and stderr directly
- C: Hybrid: categorize common errors, pass through uncommon ones

**Answer**: **C** - Hybrid: categorize common errors, pass through uncommon ones. Supports the terse output pattern. Common errors (AuthError, NetworkError, ConflictError, DetachedHeadError) enable programmatic agent responses. Uncommon errors pass through so nothing is lost.

### Q3: Force Push Safety
**Context**: Config shows 'allowForcePush: false' but doesn't specify behavior when force push is needed (e.g., after rebase).
**Question**: When force push is required but disabled, should the plugin fail silently, return a structured error, or escalate to human?
**Options**:
- A: Return error with instructions on how to enable
- B: Escalate to human via Humancy
- C: Block and explain why, suggest alternative workflow

**Answer**: **B** - Escalate to human via Humancy. Force push is destructive and can lose team history - exactly the kind of decision requiring human judgment. Agent should be blocked with blocking_now urgency escalation. Prevents accidents while respecting "humans as specialist consultants" model.

### Q4: Working Directory Scope
**Context**: The spec doesn't clarify if tools operate on a fixed working directory or accept path parameters.
**Question**: Should git tools always operate on the current working directory, or accept an optional 'cwd' parameter for multi-repo scenarios?
**Options**:
- A: Always use process.cwd() - single repo assumed
- B: Accept optional 'cwd' parameter on all tools
- C: Use plugin-level config for working directory

**Answer**: **B** - Accept optional 'cwd' parameter on all tools. Provides flexibility for multi-repo scenarios (monorepos, submodules) without complicating single-repo usage. Omit param = use process.cwd().

### Q5: Authentication Method
**Context**: Push/pull operations require authentication. The spec doesn't address how credentials are provided or managed.
**Question**: How should the plugin handle git authentication for remote operations?
**Options**:
- A: Rely on system git credential helper (no plugin-level auth)
- B: Accept token/credentials in plugin config
- C: Support both: prefer config, fallback to system

**Answer**: **A** - Rely on system git credential helper. In container environments (expected deployment), credentials are configured via git credential helpers, SSH keys, or environment variables. Plugin-level credential handling adds security surface and duplicates existing infrastructure. Let the container/environment own authentication.

