# Contract: fail loud on cockpit MCP tools missing

**Feature**: #406
**Owning surface**: `commands/auto.md` § Instructions step 3 (top)
**Owned by**: This branch (`406-follow-up-generacy-ai`)
**Anchored FRs**: FR-006
**Anchored SCs**: SC-005 (startup path)

## Summary

At the top of the startup sweep, the session verifies the seven `cockpit_*` MCP tools are present in the runtime tool binding. On absence, the session writes a structured ledger entry, prints actionable guidance pointing at `cluster-base#75`, and exits non-zero. No `AskUserQuestion` prompt. No CLI fallback. No in-playbook branching.

This is the migration's "environment doesn't support the operation" response — the equivalent of the § Error handling class-`MISSING_BINARY` shape, extended into the ledger surface so the failure boundary accounts for itself in the audit trail.

## Check shape

**Position**: at the very top of `auto.md` § Instructions step 3 (startup sweep), before any other tool call.

**Tools verified** (seven, matching generacy#917's exported surface):

- `cockpit_status`
- `cockpit_context`
- `cockpit_queue`
- `cockpit_advance`
- `cockpit_resume`
- `cockpit_merge`
- `cockpit_await_events`

**Playbook prose** (verbatim in `auto.md`; the load-bearing anchor for VR-5 / 406-5):

```markdown
**Tool-presence check** (top of the startup sweep). Verify that the following seven MCP tools are present in the session's tool binding:

- `cockpit_status`
- `cockpit_context`
- `cockpit_queue`
- `cockpit_advance`
- `cockpit_resume`
- `cockpit_merge`
- `cockpit_await_events`

If any are absent, write the ledger line

```
startup · cockpit-mcp-tools-missing · abort · see cluster-base#75
```

to the run's `.ledger` file and to the transcript (prefixed with `[ledger] `), then print:

> cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75

Exit non-zero. Do NOT invoke `AskUserQuestion` — the operator cannot address missing registration in-session; a prompt whose every option means "abort" is not a decision.

Only after every listed tool is present does the sweep proceed to `cockpit_status(epic=<epic-ref>, json=true)` and the synthetic-event dispatch below.
```

## Ledger-line format

Format-sentence-compliant (see `auto.md` § Ledger):

```
<issue-ref> · <transition-class> · <action> · <outcome>
```

For the tool-presence failure:

```
startup · cockpit-mcp-tools-missing · abort · see cluster-base#75
```

- **`<issue-ref>`** = `startup` (the session hasn't picked an issue; the sweep itself is the dispatch unit).
- **`<transition-class>`** = `cockpit-mcp-tools-missing` (the machine-checkable outcome class).
- **`<action>`** = `abort` (matches the § Ledger action vocabulary for terminal outcomes).
- **`<outcome>`** = `see cluster-base#75` (the actionable pointer — a reviewer following the ledger line to the cluster-base issue can find the fix without further diagnosis).

Format compliance is asserted by the §L format-sentence rule (the audit doesn't need a special case).

## Guidance-print format

Single-line human-readable, printed to the transcript (not to the ledger — the guidance is operator-facing, the ledger line is audit-facing):

```
cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75
```

The guidance intentionally names the fix (upgrade the cluster / verify registration) so an operator new to this context can act without following the ledger line's issue-ref pointer alone.

## Non-invocation invariant

**No `AskUserQuestion`** on the fail path. Reasons:

1. **Operator cannot address the failure in-session.** MCP registration is baked into the cluster scaffold at creation time (cluster-base#75). Fixing it requires either rebuilding the cluster or manually patching the entrypoint script — neither of which happens inside the auto session's turn.
2. **Gate contract enumeration violation.** The § AskUserQuestion invocation contract (from #402) enumerates four gate kinds (clarification, verdict, phase-queue, escalation). A "should I abort or should I abort?" prompt would be a fifth without a matching gate contract entry.
3. **Every-option-abort violation.** The § Gate contract's exit-with-option-set property requires the option set to represent distinct outcomes. If every option leads to abort, the prompt is ceremonial.

## Non-fallback invariant

**No CLI fallback** on the fail path. Reasons (per Q1 clarification):

1. **Not enforceable via version pinning.** Plugin version and cluster-base version are uncoordinated artifacts; a plugin version bump can't ensure the underlying cluster has registration.
2. **Dual-path playbook is the drift factory.** The audit suite exists to prevent this; adding a fallback branch re-introduces it. Every branch that ships must be audited; a "temporary" branch that ships is a branch that ships.
3. **Failure is loud and actionable.** The ledger line names the fix; the operator can act on cluster-base#75 immediately.

## Interaction with the rest of the sweep

- The tool-presence check is the first tool interaction in step 3. Nothing precedes it.
- On success (all seven tools present), the sweep proceeds normally: `cockpit_status(epic, json=true)` → dispatch every issue in D.1–D.9 as a synthetic event → status-table summary → enter step 4's main loop.
- On failure, the sweep exits before any state read, so no synthetic events are dispatched and no status table is emitted (the § Ledger L.4 status-table policy's "startup-sweep summary" surface is conditional on successful entry).

## Interaction with the `Error handling` block

The § Error handling `MISSING_BINARY` / `AUTH_FAILURE` / `OTHER` classifier is retained in `auto.md` for the non-cockpit Bash CLI invocations that survive migration (`gh` for issue commenting; `git` for local operations). It does NOT overlap with this tool-presence check:

- The `MISSING_BINARY` class is triggered by `command -v <cli> >/dev/null 2>&1` failing at a pre-flight step. It applies to `gh` and `git` pre-flights.
- The tool-presence check applies to MCP tool bindings, checked via the harness's tool-list surface at session start.
- The two mechanisms have different failure surfaces (Bash CLI on PATH vs. MCP tool registered) and different fixes (install CLI vs. rebuild cluster). Their overlap is zero.

## Assertion index (VR-5 / 406-5)

The behavioral assertion in `tests/playbook-verification.test.ts` `describe("406 —", …)` block:

1. **Positive anchor**: `commands/auto.md` step 3 prose contains the sentence listing the seven `cockpit_*` tool names + the "verify … are present" phrasing.
2. **Positive anchor**: `commands/auto.md` step 3 prose contains the exact ledger-line string `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`.
3. **Positive anchor**: `commands/auto.md` step 3 prose contains the exact guidance string.
4. **Negative anchor**: `commands/auto.md` step 3 prose within the fail-loud paragraph does NOT contain `AskUserQuestion` (grep +/- 10 lines of the `cockpit-mcp-tools-missing` anchor).

## What's out of scope for this contract

- The runtime mechanism by which the session queries the tool binding (owned by the Claude Code SDK / harness).
- The tool server's registration path (owned by cluster-base#75).
- The exact wording of the operator's fix (cluster rebuild vs. entrypoint patch) — the guidance points at cluster-base#75, and cluster-base#75 owns the fix.
- The `Error handling` block's `MISSING_BINARY` clause wording for `gh` / `git` pre-flights.
