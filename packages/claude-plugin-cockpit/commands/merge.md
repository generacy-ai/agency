---
description: Merge a PR via the cockpit CLI; spawn a fixer subagent on red checks and re-evaluate, up to a bounded number of attempts. Never merges on red. Green/approved PRs still merge with --no-fix.
arguments:
  - name: ref
    description: Issue or epic reference (resolved via the shared resolver to a single PR)
    required: true
  - name: --no-fix
    description: Stop on red instead of spawning the fixer (green PRs still merge)
    required: false
  - name: --max-fix-attempts
    description: Maximum fixer passes before stopping with the most recent red status (default 1)
    required: false
---

# Merge Command

Merge a PR via the `generacy cockpit merge` CLI. On red checks or merge conflicts, spawn a fixer subagent, then re-evaluate. Never merge on red.

## User Input

```text
$ARGUMENTS
```

## Instructions

### 1. Parse arguments

Parse `$ARGUMENTS` into:

- `ref` (positional, required) — the issue/epic reference to resolve.
- `--no-fix` (boolean flag, default `false`) — if set, stop on red without spawning the fixer.
- `--max-fix-attempts=N` (integer, default `1`) — cap on fixer passes. Must be `>= 1`.

**Validation:**

- If `ref` is missing, emit `Usage: /cockpit:merge <ref> [--no-fix] [--max-fix-attempts=N]` and exit non-zero.
- If `--max-fix-attempts` is `< 1` or not an integer, emit `Stopped: --max-fix-attempts must be a positive integer` and exit non-zero.
- Resolve `ref` via the shared issue/epic resolver (issue #788). If the resolver returns zero matches, emit `Stopped: no PR found for <ref>` and exit non-zero. If it returns multiple matches, emit `Stopped: <ref> resolved to multiple PRs: <list> — specify one` and exit non-zero.
- On successful resolution, emit one terse line: `Resolved <ref> → <repo>#<pr-number> (PR #<pr-number>)`.

### 2. Invoke CLI

Call the CLI via Bash:

```bash
generacy cockpit merge <resolved-pr-ref>
```

Parse stdout as JSON per the envelope in `specs/355-epic-generacy-ai-tetrad/data-model.md` E2 / `contracts/merge-cli.contract.md`:

```json
{
  "result": "merged" | "red" | "blocked",
  "reason": "checks-failing" | "merge-conflict" | "missing-label" | "missing-approval" | "draft" | "pending",
  "pr": { "number": ..., "repo": "...", "url": "..." },
  "checks": [ { "name": "...", "status": "...", "url": "...", "summary": "..." } ],
  "details": "..."
}
```

On JSON parse failure or non-zero CLI exit code before JSON is produced, emit a single terse line — `Stopped: CLI error — <stderr first line>` — and exit non-zero. Do not retry.

### 3. Decision tree

Route strictly on `result` + `reason`:

| `result` | `reason` | Action |
|----------|----------|--------|
| `"merged"` | — | Emit `Merged ✓ — <pr.url>` and exit 0. |
| `"red"` | `"checks-failing"` | Go to the **Fixer branch** (§4). |
| `"red"` | `"merge-conflict"` | Go to the **Fixer branch** (§4). |
| `"blocked"` | `"missing-label"` | Emit `Stopped: missing-label — add the epic-cockpit label to PR #<n>` and exit non-zero. |
| `"blocked"` | `"missing-approval"` | Emit `Stopped: missing-approval — PR #<n> not approved yet` and exit non-zero. |
| `"blocked"` | `"draft"` | Emit `Stopped: draft — mark PR #<n> ready for review first` and exit non-zero. |
| `"blocked"` | `"pending"` | Emit `Stopped: pending — defer to /cockpit:watch` and exit non-zero. **Do not poll.** |
| unknown `result` or unknown `reason` | — | Emit `Stopped: unknown CLI result — report to #355` and exit non-zero. |

**Invariant**: never spawn the fixer for any `blocked` reason. `pending` in particular is owned by `/cockpit:watch` (#787); polling here would duplicate it.

### 4. Fixer branch

Reached only when `result == "red"` and `reason ∈ { "checks-failing", "merge-conflict" }`.

1. **Short-circuit on `--no-fix`**: if set, emit `Stopped: red (--no-fix) — <reason> (<comma-joined check names, when known>)` and exit non-zero. **Do not spawn the fixer.**
2. **Initialize / increment the attempt counter** (1-indexed). On the first arrival, `attempt = 1`; on each re-entry from the re-evaluate loop (§6), increment.
3. **Cap check**: if `attempt > max-fix-attempts`, emit `Stopped: red after <max-fix-attempts> fix attempt(s) — <reason> (<check names>)` and exit non-zero. **Do not spawn the fixer.**
4. **Spawn the fixer subagent** via the Task tool with the E3 payload:

   ```json
   {
     "pr": { "number": ..., "repo": "...", "url": "...", "head_ref": "..." },
     "reason": "checks-failing" | "merge-conflict",
     "checks": [ ... ],
     "attempt": <n>,
     "max_attempts": <max-fix-attempts>
   }
   ```

   Emit `Spawning fixer (attempt <n>/<max-fix-attempts>)` immediately before the Task call.

### 5. Fixer-subagent selection

Per research D5:

- **Preferred**: invoke the named `cockpit-fixer` subagent if it is registered in this Claude Code environment (`subagent_type: "cockpit-fixer"`).
- **Fallback (current mode)**: at the time this file ships, no `cockpit-fixer` subagent is registered. Use `subagent_type: "general-purpose"` with an embedded fixer prompt that:
  - Consumes the E3 payload above.
  - Checks out `pr.head_ref` in the repo.
  - For `reason: "checks-failing"`: reads the failing-check summaries, fixes the underlying code, runs the relevant local checks, and pushes.
  - For `reason: "merge-conflict"`: resolves conflicts against the PR's base branch, preserving the PR's intent, and pushes.
  - Treats `attempt == max_attempts` as its final chance and prioritizes the highest-confidence fixes.
  - MUST NOT call `generacy cockpit merge` itself — this command owns the loop.

Once a named `cockpit-fixer` subagent lands, swap the `subagent_type` value in §5 above; no other change to this file is required.

### 6. Re-evaluate loop

When the fixer Task returns:

1. Emit `Fixer returned; re-evaluating…`.
2. Loop back to §2 (`Invoke CLI`). State is observed fresh on every call — never cache the previous CLI result.

The loop terminates at one of:

- `result: "merged"` → success (§3).
- A `blocked` reason → terse stop (§3).
- Fixer cap reached (§4 step 3) → terse stop.

The cap is enforced solely by the attempt counter in §4; there is no separate iteration guard.

### 7. Output discipline

Per research D6 and data-model.md E4:

- One terse status line per phase transition. No multi-line narration.
- Exit code `0` only on `result: "merged"`. Every stop state (blocked, cap, --no-fix, unknown, usage error, CLI error) exits non-zero so scripting is trivial.
- Canonical examples (from data-model.md E4):
  - `Resolved 355 → generacy-ai/agency#789 (PR #789)`
  - `CLI: red (checks-failing)` *(optional debug line; omit if it adds noise)*
  - `Spawning fixer (attempt 1/1)`
  - `Fixer returned; re-evaluating…`
  - `Merged ✓ — https://github.com/generacy-ai/agency/pull/789`
  - `Stopped: missing-approval — PR #789 not approved yet`
  - `Stopped: red after 1 fix attempt — checks-failing (lint, typecheck)`
  - `Stopped: red (--no-fix) — checks-failing (lint, typecheck)`

## Invariants

Per `specs/355-epic-generacy-ai-tetrad/contracts/slash-command.contract.md` §Behavioral contract. Future edits to this file MUST NOT violate any of these:

### MUST

1. **Never merge on red** — issue a merge only when the CLI returns `result: "merged"`.
2. **Idempotent re-evaluation** — re-invoke the CLI between fixer passes; never cache previous state.
3. **Bounded loop** — at most `--max-fix-attempts` fixer passes per invocation.
4. **Reason-based routing** — only `reason ∈ { "checks-failing", "merge-conflict" }` may spawn the fixer.
5. **Closed enum handling** — unknown `result` or `reason` is a hard error; report to #355.
6. **No current-branch fallback** — always operate on the resolved PR; do not infer a target from the current branch.

### MUST NOT

1. MUST NOT call `gh pr merge` (or any direct merge primitive) — only the CLI verb merges.
2. MUST NOT poll/wait on `pending` checks — defer to `/cockpit:watch` (#787).
3. MUST NOT spawn the fixer when `--no-fix` is set.
4. MUST NOT spawn more than `--max-fix-attempts` fixer subagents in a single invocation.
