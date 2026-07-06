# Contract: `/cockpit:merge`

**File**: `packages/claude-plugin-cockpit/commands/merge.md`
**Related FRs**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-011, FR-012.

## Inputs

- `$ARGUMENTS`: optional `<pr-ref>` and optional `--max-fix-attempts <N>` (default `1`).

## Behavior

1. **Argument handling** — Parse `$ARGUMENTS`. Extract `--max-fix-attempts <N>` (default `1`). Capture the remaining positional as `<pr-ref>` (may be empty; CLI resolves from current branch).
2. Pre-flight `command -v generacy`. On failure, use the shared error block's `MISSING_BINARY` class.
3. **CI status** — Run `generacy cockpit ...` (or `gh pr checks` — the exact verb is owned by the CLI's `--help`) to fetch the current PR CI status.
4. **Green path** — If all checks pass, run `generacy cockpit merge <pr-ref>` and render its output.
5. **Red path**:
   1. **Classify failures.** For each failing check, classify it into either:
      - **repo-owned** — tests, lint, typecheck, build.
      - **infrastructure** — runner errors, network flakes, missing secrets, anything not owned by this repo's CI configuration.
   2. **Infrastructure failure short-circuit.** If ANY failing check is infrastructure-classed, report all failures, print `Aborting merge: infrastructure failure — no fix attempt burned.`, and exit non-zero. Do NOT invoke the fixer. `--max-fix-attempts` counter is unchanged.
   3. **Repo-owned failure fixer loop.** If all failing checks are repo-owned AND `<max-fix-attempts>` > 0:
      1. Decrement the remaining-attempts counter (by 1 per invocation).
      2. Spawn a bounded fixer subagent with a task limited to "fix the following failing checks: <check list>". The subagent may edit code, commit, and push.
      3. Wait for the push to trigger a re-check.
      4. Loop back to step 3 (fetch CI status).
   4. **Attempts exhausted.** If `<max-fix-attempts>` = 0 and CI is still red, print `Aborting merge: red CI, no attempts remaining.` and exit non-zero.
6. **Invariant** — The command NEVER merges on red CI. There is no `--force`, no override, no bypass.

## Forbidden

- No `specs/**` reference (FR-002).
- No cross-slash-command invocation (FR-005).
- No merge on red CI under any argument combination (FR-011).
- Fixer subagent does NOT attempt infrastructure/runner failures (FR-011, clarifications Q4).

## Success criteria

- `grep -F 'specs/' merge.md` returns no matches (SC-002).
- Shared error block byte-identical to the other five commands (SC-005).
- `--max-fix-attempts` default 1 is documented in the file.
- The infrastructure short-circuit is present and covers the "no attempt burned" invariant.
