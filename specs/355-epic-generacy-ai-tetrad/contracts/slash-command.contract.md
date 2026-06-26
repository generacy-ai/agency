# Contract: `/cockpit:merge` slash-command interface

**Feature**: 355-epic-generacy-ai-tetrad

This codifies the external contract of `packages/claude-plugin-cockpit/commands/merge.md` — what users invoke and what they observe.

## Invocation

```
/cockpit:merge <ref> [--no-fix] [--max-fix-attempts=N]
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `<ref>` | yes | — | Issue or epic reference; resolved via the shared resolver (#788) to a single PR. |
| `--no-fix` | no | `false` | If present, stop on red without spawning the fixer. Green/approved PRs still merge. |
| `--max-fix-attempts=N` | no | `1` | Positive integer cap on fixer passes. Default honors FR-007's one-shot reading. |

## Frontmatter shape

```yaml
---
description: Merge a PR via the cockpit CLI; spawn a fixer subagent on red checks and re-evaluate, up to a bounded number of attempts. Never merges on red.
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
```

## Behavioral contract

### Invariants (MUST)

1. **Never merge on red**: the command MUST NOT issue a merge under any condition other than the CLI returning `result: "merged"`.
2. **Idempotent re-evaluation**: between fixer passes, the command re-invokes the CLI to observe live state.
3. **Bounded loop**: the command attempts at most `--max-fix-attempts` fixer passes before stopping.
4. **Reason-based routing**: only `reason ∈ { "checks-failing", "merge-conflict" }` may spawn the fixer. All other `blocked` reasons stop with an actionable report.
5. **Closed enum handling**: an unknown CLI `result` or `reason` is a hard error — the command stops and asks the user to report it.
6. **No current-branch fallback**: the command always operates on the resolved PR; it does not infer a target from the current branch.

### Forbidden behaviors (MUST NOT)

- MUST NOT call `gh pr merge` (or any direct merge primitive) — only the CLI verb merges.
- MUST NOT poll/wait on `pending` checks — defer to `cockpit:watch` (#787).
- MUST NOT spawn the fixer when `--no-fix` is set.
- MUST NOT spawn more than `--max-fix-attempts` fixer subagents in a single invocation.

### Outputs

Terse status lines per phase transition. See `data-model.md` E4 for the canonical examples. No multi-line summaries. Exit code is `0` on `merged`; non-zero on any stop-state to make scripting trivial.

## State diagram

```
                ┌────────────────────────────────────┐
                │ Resolve <ref> → PR via #788        │
                └───────────────┬────────────────────┘
                                ▼
                ┌────────────────────────────────────┐
                │ generacy cockpit merge <pr>        │
                └───────────────┬────────────────────┘
                                ▼
                       parse JSON result
                                │
        ┌───────────────────────┼─────────────────────────────────┐
        │                       │                                 │
        ▼                       ▼                                 ▼
   result=merged       result=red                          result=blocked
        │                       │                                 │
        │            ┌──────────┴──────────┐                      │
        │            │                     │                      │
        │            ▼                     ▼                      ▼
        │       --no-fix?              normal              stop + report
        │            │                     │              (reason-specific
        │            ▼                     ▼               actionable msg)
        │       stop + report     attempts++; if at cap →
        │                         stop + report
        │                                  │
        │                                  ▼
        │                         Spawn fixer (Task)
        │                                  │
        │                                  ▼
        │                         on return, loop ──┐
        │                                           │
        ▼                                           │
   "Merged ✓"  ◄───────────────────────────────────┘  (back to CLI call)
```

## Test scenarios (manual)

| Scenario | Expected outcome |
|----------|------------------|
| Green + approved PR | `Merged ✓` |
| Red (checks-failing), default attempts | One fixer pass; if green after, `Merged ✓`; else `Stopped: red after 1 fix attempt` |
| Red (checks-failing), `--max-fix-attempts=3` | Up to 3 fixer passes; merges or stops with attempt count |
| Red (checks-failing), `--no-fix` | `Stopped: red (--no-fix) — checks-failing (<names>)`, no fixer spawned |
| Merge conflict | Same routing as `checks-failing` |
| Pending checks | `Stopped: pending — defer to /cockpit:watch` (no fixer, no poll) |
| Missing approval | `Stopped: missing-approval — PR not approved yet` |
| Draft | `Stopped: draft — mark ready for review first` |
| Missing label | `Stopped: missing-label — add the epic-cockpit label` |
| Unknown reason | `Stopped: unknown CLI result — report to #355`, non-zero exit |
| Resolver finds no PR | Usage-style error before any CLI call |
| Resolver finds multiple PRs | Usage-style error with the matches listed |
