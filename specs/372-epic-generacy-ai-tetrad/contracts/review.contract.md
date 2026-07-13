# Contract: `/cockpit:review`

**File**: `packages/claude-plugin-cockpit/commands/review.md`
**Related FRs**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-012.

## Inputs

- `$ARGUMENTS`: must include `--gate <gate-name>`. Optional additional args passed to the CLI.
- `<gate-name>` is opaque to this playbook; the set is owned by the CLI's `--help`. Special-case: the literal token `impl` triggers the code-review branch.

## Behavior

1. **Argument handling** — Parse `$ARGUMENTS` for `--gate <g>`. If missing, print `Usage: /cockpit:review --gate <gate>` and exit non-zero.
2. Pre-flight `command -v generacy`. On failure, use the shared error block's `MISSING_BINARY` class.
3. **Branch on `<g>`**:
   - **`impl`** — Invoke the Claude-Code-native `/code-review` slash command (the **single documented cross-slash-command exception**, permitted only here). This is not a `/cockpit:*` invocation, and it is not a marketplace plugin — `/code-review` ships with Claude Code itself and is always available.
   - **any other gate** — Summarize the review artifact for that gate. The artifact source is owned by `generacy cockpit`; run `generacy cockpit ...` to fetch it (exact verb per CLI `--help`) and produce a terse summary.
4. **Approval gate** — Invoke `AskUserQuestion` with Approve / Reject options. On `Approve` proceed to step 5. On any other outcome, print `Not advancing: gate <g>` and exit non-zero.
5. **Advance** — On approval, invoke the Bash tool to run `generacy cockpit advance --gate <g>` **directly**. Do NOT reference `/cockpit:advance` — that verb was never shipped and is explicitly removed by this rewrite.
6. On non-zero CLI exit at any step, invoke the shared error block.

## Forbidden

- No `specs/**` reference (FR-002).
- No reference to `/cockpit:advance` (FR-003, spec Out of Scope).
- No cross-slash-command invocation except `/code-review` in the `--gate impl` branch (FR-005, clarifications Q3).
- No invocation of `/security-review`, `/verify`, or any other non-cockpit slash command (clarifications Q3).

## Success criteria

- `grep -F '/cockpit:advance' review.md` returns no matches (SC-002).
- `grep -F 'specs/' review.md` returns no matches (SC-002).
- Shared error block byte-identical to the other five commands (SC-005).
- The `/code-review` invocation appears in `review.md` and nowhere else in the six-command set.
