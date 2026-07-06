# Contract: `/cockpit:queue`

**File**: `packages/claude-plugin-cockpit/commands/queue.md`
**Related FRs**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-009, FR-012.

## Inputs

- `$ARGUMENTS`: exactly one positional token — `<phase>`. Passed to the CLI byte-for-byte.

## Behavior

1. **Argument handling** — Tokenize `$ARGUMENTS` on whitespace.
   - 0 tokens or ≥ 2 tokens → print `Usage: /cockpit:queue <phase>` and exit non-zero. Do NOT prompt, do NOT invoke the CLI.
   - Exactly 1 → capture as `<phase>` verbatim.
2. **Confirmation gate** — Invoke `AskUserQuestion` with:
   - `question`: ``Run `generacy cockpit queue <phase>`?``
   - `header`: `Queue phase`
   - `multiSelect`: `false`
   - `options`: `[{label: "Confirm", description: "Run the CLI"}, {label: "Cancel", description: "Abort without queueing"}]`
3. **Affirmative test** — Only the literal string `Confirm` is affirmative. Any other value (`Cancel`, `Other`, empty, aborted) → print `Cancelled: /cockpit:queue <phase>` and exit non-zero. Do NOT invoke the CLI.
4. Pre-flight `command -v generacy`. On failure, use the shared error block's `MISSING_BINARY` class.
5. Run `generacy cockpit queue <phase>` via the Bash tool. Capture stdout, stderr, exit code.
6. On exit 0: print header `**Queued:** <phase>`, blank line, then stdout inside a triple-backtick fenced block.
7. On non-zero exit: shared error block.

## Forbidden

- No `specs/**` reference (FR-002).
- No cross-slash-command invocation (FR-005).

## Success criteria

- `grep -F 'specs/' queue.md` returns no matches (SC-002).
- Shared error block byte-identical to the other five commands (SC-005).
- The `AskUserQuestion` Confirm/Cancel gate is present (clarifications Q1, FR-009).
