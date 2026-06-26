# Contract: `generacy cockpit merge` CLI JSON output

**Feature**: 355-epic-generacy-ai-tetrad
**Consumes**: Issue #789 (the CLI verb itself)

The `/cockpit:merge` slash command shells out to `generacy cockpit merge <ref>` and parses its stdout as JSON. This contract codifies the shape `merge.md` depends on. If #789 ships a different shape, `merge.md` must be updated to match — the contract is the agreement between issues.

## Invocation

```
generacy cockpit merge <ref>
```

- `<ref>`: a resolved PR reference, formatted as the resolver from #788 returns it (e.g., `generacy-ai/agency#789` or a numeric PR id within the active repo).
- The CLI is **idempotent** — calling it repeatedly observes live PR state and acts fresh each time. Per clarification Q2, the slash command re-invokes the CLI after each fixer pass.
- The CLI is **fail-fast on pending** — per #789 Q4, pending checks return `result: "blocked", reason: "pending"`; the CLI does not wait/poll.

## Output: required JSON shape on stdout

```json
{
  "result": "merged" | "red" | "blocked",
  "reason": "checks-failing" | "merge-conflict" | "missing-label" | "missing-approval" | "draft" | "pending",
  "pr": {
    "number": 789,
    "repo": "generacy-ai/agency",
    "url": "https://github.com/generacy-ai/agency/pull/789"
  },
  "checks": [
    {
      "name": "lint",
      "status": "failure",
      "url": "https://github.com/generacy-ai/agency/runs/...",
      "summary": "First failing line / short excerpt"
    }
  ],
  "details": "Free-text human-readable summary line"
}
```

### Field semantics

| Field | When present | Notes |
|-------|--------------|-------|
| `result` | always | Top-level outcome. `"merged"` = the CLI merged the PR. `"red"` = checks/conflicts blocking merge — fixable. `"blocked"` = workflow/policy/timing blocker — not fixable. |
| `reason` | when `result != "merged"` | Typed enum (closed set above). Unknown reasons must be treated as hard errors by the slash command. |
| `pr` | always | Identifies the PR observed. Used in status reports. |
| `checks` | when `reason == "checks-failing"` | List of failing checks. Passed verbatim to the fixer subagent. |
| `details` | optional | Free-text summary; used in the terse status report's "Stopped: …" line. |

### Closed-set invariants

- `result == "merged"` ⇔ the CLI performed a merge and no further action is required.
- `result == "red"` ⇒ `reason ∈ { "checks-failing", "merge-conflict" }`.
- `result == "blocked"` ⇒ `reason ∈ { "missing-label", "missing-approval", "draft", "pending" }`.
- The CLI MUST NOT return `result: "merged"` when checks are red. (Spec invariant: never merge on red.)

## Exit codes

- `0` — output is valid JSON; the slash command parses and routes on it.
- non-zero — the CLI failed before producing JSON (network error, auth failure, invalid `<ref>`). The slash command reports the stderr verbatim and exits.

## Compatibility

- Forward compatibility: new `reason` values are additive. The slash command treats unknown reasons as hard errors (rather than silently merging or routing to the fixer). This forces a deliberate update to `merge.md` whenever the CLI enum grows.
- Backward compatibility: this contract is the version `merge.md` was authored against. Breaking changes to `result` or `reason` MUST be coordinated with this command (#355).
