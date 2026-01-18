# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-18 03:58

### Q1: Process Lifecycle
**Context**: The spec mentions 'background process handling' but doesn't clarify what happens to running emulators when the agent session ends.
**Question**: Should emulators persist after the agent session ends, or should they be automatically stopped?
**Options**:
- A: Persist - emulators keep running until explicitly stopped
- B: Auto-cleanup - emulators are stopped when agent session ends
- C: Configurable - let the user decide via plugin config

**Answer**: **C - Configurable**: Add a `cleanup` option with values like `"session"` | `"persist"` | `"explicit"`. Default to auto-cleanup (session) which is safer for ephemeral dev containers.

### Q2: Error Handling
**Context**: Firebase CLI operations can fail in various ways (auth errors, port conflicts, timeouts). The error handling strategy affects the terse output format.
**Question**: What error detail level should tool responses provide when Firebase CLI operations fail?
**Options**:
- A: Minimal - just the error type and exit code
- B: Standard - error type + Firebase error message
- C: Detailed - full stderr output for debugging

**Answer**: **B - Standard (error type + Firebase error message)**: Aligns with the Terse Output Pattern of "Minimal success, detailed failure." Option A is too minimal for agents to act on. Option C dumps full stderr which violates "agents can't glaze over irrelevant output."

### Q3: Authentication
**Context**: Firebase CLI requires authentication and project selection. This affects how the plugin initializes.
**Question**: Should the plugin verify Firebase CLI authentication on load, or defer to first use?
**Options**:
- A: Verify on load - fail fast if not authenticated
- B: Defer to use - check only when tools are called
- C: No check - let Firebase CLI handle auth errors naturally

**Answer**: **C - No check**: Lazy initialization is better for container startup - don't fail the entire plugin load because of auth. When a tool call fails due to auth, the Firebase CLI error message propagates naturally (per Q2). Clear feedback at point of failure.

### Q4: Deploy Scope
**Context**: Firebase supports deploying multiple resource types (functions, rules, hosting, etc.). The spec shows one 'deploy' tool but doesn't specify scope.
**Question**: What Firebase resources should the deploy tool support?
**Options**:
- A: Functions only - deploy Cloud Functions
- B: Configurable - let user specify which targets
- C: Full deploy - all Firebase resources at once

**Answer**: **B - Configurable**: Mirror the `emulators.only` pattern with a `targets` array. Default to `["functions"]` (most common), allow `["functions", "rules", "hosting"]` etc. Option A too limited, Option C potentially destructive.

### Q5: Status Output
**Context**: The 'emulators_status' tool needs a defined output format. This affects what information agents can act on.
**Question**: What information should emulators_status return?
**Options**:
- A: Simple - running/stopped boolean per emulator
- B: Standard - running status + port numbers + URLs
- C: Full - status, ports, URLs, process IDs, memory usage

**Answer**: **B - Standard (status + ports + URLs)**: Actionable for agents without noise. Running/stopped is essential for conditional logic, ports are needed to construct URLs, and URLs are needed for API calls. Option A too minimal (no ports). Option C adds process IDs/memory which are rarely actionable.

