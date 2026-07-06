# Contract: `/cockpit:status`

**File**: `packages/claude-plugin-cockpit/commands/status.md`
**Related FRs**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-008, FR-012.

## Inputs

- `$ARGUMENTS`: optional. When present, passed to the CLI byte-for-byte (no validation, no ref rewriting).

## Behavior

1. **Argument handling** — Trim outer whitespace on `$ARGUMENTS`.
   - Empty → print the literal `Usage: /cockpit:status <epic-ref>` line and exit success without invoking the CLI. **Do NOT walk any `.generacy/epics/` resolution chain** (that directory no longer exists and is dropped by this rewrite).
   - Non-empty → capture verbatim as `<args>` and pass through to step 3.
2. Pre-flight `command -v generacy`. On failure, use the shared error block's `MISSING_BINARY` class.
3. Run `generacy cockpit status <args>` via the Bash tool from the repository root. Capture stdout, stderr, exit code.
4. On exit 0: print header line `**Status:** <args>`, blank line, then stdout inside a triple-backtick fenced block. Render verbatim — no reflow, no reformat.
5. On non-zero exit: shared error block.

## Forbidden

- No `.generacy/epics/` filesystem walk.
- No `specs/**` reference (FR-002).
- No `--json` flag (consumes the CLI's default text output).
- No cross-slash-command invocation (FR-005).

## Success criteria

- `grep -F 'specs/' status.md` returns no matches (SC-002).
- `grep -F '.generacy/epics' status.md` returns no matches.
- Shared error block byte-identical to the other five commands (SC-005).
