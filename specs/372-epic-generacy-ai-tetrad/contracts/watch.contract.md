# Contract: `/cockpit:watch`

**File**: `packages/claude-plugin-cockpit/commands/watch.md`
**Line budget**: ~20 lines (SC-004); soft cap ~30.
**Related FRs**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-012.

## Inputs

- `$ARGUMENTS`: exactly one positional token — `<epic-ref>`, either bare (`351`) or fully-qualified (`generacy-ai/agency#351`). Passed to the CLI verbatim; no ref resolution in the playbook.

## Behavior

1. If `$ARGUMENTS` is empty (or whitespace-only), print:
   ```
   Usage: /cockpit:watch <epic-ref>
   ```
   Exit non-zero. Do NOT spawn the CLI.
2. Pre-flight `command -v generacy`. On failure, use the shared error block's `MISSING_BINARY` class.
3. Spawn `generacy cockpit watch <epic-ref>` via the Bash tool as a long-running command (stream stdout line-by-line).
4. For each transition line received on stdout, look up the suggested next `/cockpit:*` verb in the static mapping table (below) and print exactly one notification line in this shape:
   ```
   <transition line verbatim> · suggested: <verb-or-nothing>
   ```
   - If the transition matches the "error states" row, omit the ` · suggested: …` segment.
5. On watcher exit (process EXITED), surface one inline line:
   ```
   [cockpit:watch] watcher exited — re-run /cockpit:watch <epic-ref> to resume.
   ```
   Do NOT retry, do NOT reconnect.
6. Any non-zero CLI exit → shared error block.

## Static next-command mapping table (embedded in `watch.md`)

| Transition line contains… | Suggested next command |
|---|---|
| `waiting-for:clarification` | `/cockpit:clarify` |
| `waiting-for:<gate>-review` | `/cockpit:review --gate <gate>` |
| `completed:validate` or all green checks | `/cockpit:merge` |
| any `error` / `failed` state | (no suggestion) |

## Forbidden

- No autonomy-policy lookup (FR-007).
- No dedupe / baseline / `seen` set.
- No `PushNotification` (FR-007).
- No `specs/**` reference (FR-002).
- No cross-slash-command invocation (FR-005). The mapping table *names* other verbs as text — it does not invoke them.

## Success criteria

- `wc -l watch.md` ≤ ~20 (SC-004).
- `grep -F 'specs/' watch.md` returns no matches (SC-002).
- Shared error block byte-identical to the other five commands (SC-005).
