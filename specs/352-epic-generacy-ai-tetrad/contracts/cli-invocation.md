# Contract: `generacy cockpit status` CLI invocation

**Feature**: 352-epic-generacy-ai-tetrad

The `/cockpit:status` slash command is a wrapper around the `generacy cockpit status` CLI delivered by G1.1 / generacy-ai/generacy#787. This contract codifies the surface this slash command depends on; any change to that surface is a contract-level break and requires a coordinated revision of `status.md`.

## Invocation shape

```bash
# Pre-flight check (slash command MUST run this before invoking)
command -v generacy >/dev/null 2>&1

# Primary invocation
generacy cockpit status <epic-ref>
```

| Element | Value |
|---------|-------|
| Executable | `generacy` (expected on `$PATH` after global install) |
| Subcommand | `cockpit status` |
| Positional argument | `<epic-ref>` — opaque pass-through from `$ARGUMENTS` (FR-004 / clarification Q4) |
| Flags passed | none (default text output; FR-008 / clarification Q2) |
| Working directory | The repository root (so the CLI can locate `.generacy/epics/` etc.) |
| Environment | Inherits the slash-command process environment (no special vars set or unset by the slash command) |

## Output contract (what the slash command consumes)

| Channel | Expected shape | Slash-command handling |
|---------|---------------|------------------------|
| `stdout` (exit 0) | Human-readable text dashboard: epic identifier, child issues grouped by phase, per-child state (open/in-progress/blocked/done), blocked-item visual decoration | Wrap verbatim inside a triple-backtick fenced code block, optionally prefixed with `**Status:** <epic-ref>` (FR-003 / Q1) |
| `stdout` (exit ≠ 0) | May be empty or partial | Ignored on non-zero exit; error path uses `stderr` |
| `stderr` (any exit) | Human-readable error messages | Inspected on non-zero exit per the error-classification table below |
| `exit_code` | 0 on success; non-zero on failure | Drives the success-vs-error branch |

The slash command consumes the CLI's DEFAULT output. It MUST NOT pass `--json`, and it MUST NOT depend on any specific column ordering, indentation, or symbol vocabulary in `stdout` — those are the CLI's to evolve, and the slash command preserves them by not touching them.

## Error classification (referenced by `data-model.md` E7)

| Class | Detection rule (case-insensitive) | Required response |
|-------|----------------------------------|-------------------|
| `MISSING_BINARY` | Pre-flight `command -v generacy` returns non-zero | Tailored install hint naming `npm install -g @generacy-ai/cli` (or the prevailing install command) |
| `AUTH_FAILURE` | Exit ≠ 0 AND `stderr` matches `/auth\|unauthorized\|401\|gh auth/` | Tailored hint pointing at `gh auth login` |
| `UNKNOWN_EPIC` | Exit ≠ 0 AND `stderr` matches `/not found\|unknown epic\|no such/` | Tailored hint naming the failed `<epic-ref>` and suggesting `owner/repo#N` |
| `OTHER` | Anything else | Surface raw `stderr` inside a fenced code block, prefixed with one line: `CLI failed with exit code N` |

Detection is matched in the order listed; first match wins. `OTHER` is the unconditional catch-all so that the slash command can NEVER silently no-op (FR-006).

## Assumptions about G1.1 (generacy#787)

The slash command's contract with the CLI rests on the following observable behaviors that G1.1 commits to:

1. The CLI is installable globally as `generacy` (the exact install command is verified by G1.1's `--help` or docs at the time `status.md` lands).
2. The `cockpit status` subcommand exists and accepts a positional `<epic-ref>` argument in the three accepted shapes (`owner/repo#N`, `#N`, URL).
3. The default (no-flag) output is human-readable text — not JSON, not silence.
4. `--json` exists as an opt-in (#787 FR-013) but is NOT required by this slash command.
5. Non-zero exit codes accompany failures; messages are emitted on `stderr`.
6. The CLI's `#N` resolver is the same resolver targeted by generacy#788 — i.e., the slash command's pass-through of `#N` reaches the same defaulting logic that the terminal user would hit.

## Drift detection

If any of the following becomes true after G1.1 ships, this slash command is broken at the contract level and requires a revision:

- Default `stdout` becomes structured (JSON or similar) — this command would render JSON inside a code block, which is unusable as a dashboard.
- The CLI exits zero on failure — the error classification chain never fires; failures silently render an empty/partial dashboard.
- `cockpit status` requires a flag other than the positional `<epic-ref>` to function — pass-through breaks.
- The `MISSING_BINARY` / `AUTH_FAILURE` / `UNKNOWN_EPIC` stderr vocabularies change to terms outside the detection patterns above — tailored hints stop firing; users get raw stderr instead of actionable guidance.

Each of these would be raised as a follow-up issue against this slash command, NOT silently absorbed.

## Reference

- generacy-ai/generacy#787 — G1.1, the CLI this command wraps (`cockpit watch + status`).
- generacy-ai/generacy#788 — the engine resolver for `#N` shorthand (Q4 / D5).
- generacy-ai/tetrad-development#85 — the Epic Cockpit epic; the SC-002 smoke-test target.
- `specs/352-epic-generacy-ai-tetrad/spec.md` — FR-002, FR-003, FR-006, FR-008.
- `specs/352-epic-generacy-ai-tetrad/clarifications.md` — Q1, Q2, Q5.
