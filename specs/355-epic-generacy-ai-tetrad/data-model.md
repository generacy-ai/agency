# Data Model: /cockpit:merge command

**Feature**: 355-epic-generacy-ai-tetrad
**Date**: 2026-06-26

This feature ships one markdown file. The "data model" is the shape of three things it reads/writes:
1. The slash-command argument model (what the user types).
2. The CLI's JSON output (what `generacy cockpit merge` returns).
3. The fixer subagent's input payload (what the Task call passes in).

## Entities

### E1: Command-argument model

The arguments accepted by `/cockpit:merge`.

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `ref` | string (positional) | yes | — | Issue or epic reference (e.g., `355`, `generacy-ai/agency#355`, an epic key). Resolved via the shared resolver from #788 to a concrete `{ repo, pr_number, head_ref }` triple. |
| `--no-fix` | boolean flag | no | `false` | If set, the command stops on red instead of spawning the fixer. Green/approved PRs still merge. |
| `--max-fix-attempts` | integer | no | `1` | Maximum fixer passes before stopping with the most recent red status. Must be `>= 1`. |

**Validation rules**:
- `ref` MUST resolve to exactly one PR via #788. If the resolver returns zero or multiple matches, terminate with an actionable error.
- `--max-fix-attempts` MUST be a positive integer; reject `0` or negative values with a usage error.
- `--no-fix` and `--max-fix-attempts` are independent: `--no-fix` short-circuits before the attempts counter is consulted.

### E2: CLI result envelope (`generacy cockpit merge <ref>` stdout)

This is the JSON contract `merge.md` consumes from #789. The full schema lives in `contracts/merge-cli.contract.md`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `result` | enum: `"merged"` \| `"red"` \| `"blocked"` | yes | Top-level outcome. |
| `reason` | enum (see below) | when `result != "merged"` | Typed reason for the non-merge outcome. |
| `checks` | array of objects | when `reason == "checks-failing"` | Failing-check payload passed to the fixer. |
| `pr` | object: `{ number, repo, url }` | yes | Identifies the PR the CLI observed. |
| `details` | string | no | Free-text human-readable summary; used verbatim in the terse report. |

**`reason` enum** (closed set):

| `reason` | `result` | Routes to | Fixable? |
|----------|----------|-----------|----------|
| `"checks-failing"` | `"red"` | Fixer subagent | yes |
| `"merge-conflict"` | `"red"` | Fixer subagent | yes |
| `"missing-label"` | `"blocked"` | Stop + report | no (workflow) |
| `"missing-approval"` | `"blocked"` | Stop + report | no (policy) |
| `"draft"` | `"blocked"` | Stop + report | no (policy) |
| `"pending"` | `"blocked"` | Stop + report (deferred to `cockpit:watch` #787) | no (timing) |

**Validation rules**:
- `merge.md` MUST treat any unknown `result` or `reason` as a hard error — stop with "report this to #355" rather than guess.
- `merge.md` MUST NOT merge when `result != "merged"` (invariant; spec acceptance criterion).
- `checks[]` items SHOULD include enough context (check name, status URL, last failing log excerpt) to be actionable by the fixer. The exact schema lives in `contracts/merge-cli.contract.md`.

### E3: Fixer subagent input payload

The structured input passed into the Task tool when spawning the fixer.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `pr` | object: `{ number, repo, url, head_ref }` | yes | From E2.pr + the resolved head ref. |
| `reason` | enum (subset of E2.reason) | yes | One of `checks-failing`, `merge-conflict`. |
| `checks` | array | when `reason == "checks-failing"` | Verbatim from E2.checks. |
| `attempt` | integer | yes | 1-indexed attempt counter (`1`, `2`, …). |
| `max_attempts` | integer | yes | Mirrors `--max-fix-attempts`. Lets the fixer know whether this is the last chance. |

**Validation rules**:
- The fixer MUST treat `attempt == max_attempts` as its final chance and prioritize the highest-confidence fixes.
- The fixer MUST NOT call `generacy cockpit merge` itself — the slash command owns the loop.

### E4: Slash-command status report (stdout to user)

The terse status lines emitted by `merge.md`.

| Phase | Output (example) |
|-------|------------------|
| Resolution | `Resolved 355 → generacy-ai/agency#789 (PR #789)` |
| CLI call | `CLI: red (checks-failing)` |
| Fixer spawn | `Spawning fixer (attempt 1/1)` |
| Fixer return | `Fixer returned; re-evaluating…` |
| Success | `Merged ✓ — generacy-ai/agency#789` |
| Stop (blocked) | `Stopped: missing-approval — PR #789 not approved yet` |
| Stop (cap) | `Stopped: red after 1 fix attempt — checks-failing (lint, typecheck)` |
| Stop (`--no-fix`) | `Stopped: red (--no-fix) — checks-failing (lint, typecheck)` |

**Validation rules**:
- No multi-line narrative summaries; one status line per phase transition.
- The "Stopped" lines MUST name the `reason` and SHOULD name the offending checks (when known).

## Relationships

```
User
 │ types /cockpit:merge <ref> [--no-fix] [--max-fix-attempts=N]
 ▼
Command-argument model (E1)
 │ ref → #788 resolver → { repo, pr_number, head_ref }
 ▼
Bash: generacy cockpit merge <resolved-ref>
 │ stdout
 ▼
CLI result envelope (E2)
 │ branches on result + reason
 ├─► result=merged          → E4: "Merged ✓", exit
 ├─► reason=checks-failing  → Task: spawn fixer with E3 payload
 │    │                       → on return, attempts++, re-call CLI
 │    │                       → at cap, E4: "Stopped: red after N", exit
 ├─► reason=merge-conflict  → same as checks-failing
 ├─► reason ∈ {missing-*, draft, pending} → E4: "Stopped: <reason>", exit
 └─► unknown                → E4: "Stopped: unknown CLI result — report this", exit
```

## Cross-document invariants

- The CLI-result `reason` enum (E2) and the routing table in `research.md` D3 MUST stay in sync. If #789 adds a new `reason`, `merge.md` MUST be updated to route it explicitly — unrouted reasons fall to the "unknown" error path.
- The `--max-fix-attempts` default (E1) MUST equal `1` to honor FR-007 + clarification Q5.
- The fixer payload (E3) MUST NOT include any field the fixer needs to spawn its own CLI calls — the slash command owns the loop (D2).
- `merge.md` MUST NOT issue a merge command on any `result` other than `"merged"` returned by the CLI itself; the slash command never merges directly (the CLI is the only entity that merges).
