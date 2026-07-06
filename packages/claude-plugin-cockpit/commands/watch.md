---
description: Watch an epic and stream one line per state transition
---

# Watch Command

Run `generacy cockpit watch <epic-ref>` and, for each transition line, print one notification suggesting the next `/cockpit:*` verb via the mapping below. On watcher exit, report and stop.

## Instructions

1. If `$ARGUMENTS` is empty, print `Usage: /cockpit:watch <epic-ref>` and exit non-zero. Pre-flight `command -v generacy`; on failure, apply **Error handling** → `MISSING_BINARY`.
2. Spawn `generacy cockpit watch $ARGUMENTS` via the Bash tool (long-running). For each stdout line, look up the next verb in the mapping table and print `<line> · suggested: <verb>`; for error-state rows, omit the ` · suggested: …` segment.
3. On watcher exit, print `[cockpit:watch] watcher exited — re-run /cockpit:watch <epic-ref> to resume.` and stop. Do NOT retry, do NOT reconnect.
4. On any non-zero CLI exit, apply **Error handling** below.

| Transition line contains… | Suggested next command |
|---|---|
| `waiting-for:clarification` | `/cockpit:clarify` |
| `waiting-for:<gate>-review` | `/cockpit:review --gate <gate>` |
| `completed:validate` or all green checks | `/cockpit:merge` |
| any `error` / `failed` state | (no suggestion) |

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. Install it with npm install -g @generacy-ai/cli (or the prevailing install command) and retry.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->
