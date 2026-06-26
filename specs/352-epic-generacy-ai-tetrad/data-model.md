# Data Model: /cockpit:status command

**Feature**: 352-epic-generacy-ai-tetrad
**Date**: 2026-06-26

This feature ships no code, no database, and no runtime entities. The "data model" is the shape of one committed markdown file and the input/output values that flow through its execution at runtime.

## Entities

### E1: Slash-command file (`packages/claude-plugin-cockpit/commands/status.md`)

A Claude Code slash-command definition consisting of YAML frontmatter and a markdown instruction body.

| Field | Type | Required | Value for this issue |
|-------|------|----------|----------------------|
| `description` (frontmatter) | string | yes | `"Report the current status of an epic and its children"` (or the prevailing convention in sibling `commands/*.md`) |
| `arguments` (frontmatter) | array | no | Single optional entry: `{ name: "epic", description: "Epic reference (owner/repo#N, #N, or URL). Omit to resolve from the current branch.", required: false }` |
| Instruction body | markdown | yes | Sections in order: Argument handling → No-arg epic resolution → CLI invocation → Output rendering → Error handling → Examples |

**Validation rules**:
- Must be valid UTF-8 markdown ending with a trailing newline.
- Frontmatter (YAML between the leading and second `---`) must parse cleanly.
- `description` MUST be present and non-empty (FR-007).
- `arguments`, when present, MUST conform to the shape used by `packages/claude-plugin-agency-spec-kit/commands/specify.md` (single object per entry; keys `name`, `description`, `required`).
- The body MUST instruct the model to invoke `generacy cockpit status` via Bash (FR-002) — not via any other mechanism.
- The body MUST instruct the model to wrap CLI stdout in a fenced code block (FR-003 / Q1).
- The body MUST NOT instruct the model to pass `--json` (FR-008 / Q2).
- The body MUST NOT instruct the model to reinterpret a bare `#N` reference (FR-004 / Q4).

### E2: Epic reference (the `$ARGUMENTS` value)

The single string the user supplies after `/cockpit:status` (or the empty string if none).

| Shape | Example | Handling |
|-------|---------|----------|
| `owner/repo#N` | `generacy-ai/tetrad-development#85` | Pass through to CLI verbatim |
| `#N` | `#85` | Pass through to CLI verbatim — the engine resolver owns repo defaulting (Q4) |
| URL | `https://github.com/generacy-ai/tetrad-development/issues/85` | Pass through to CLI verbatim |
| empty | (user typed `/cockpit:status` with no argument) | Trigger no-arg resolution (E3 → E4) |

**Validation rules**:
- The slash command MUST NOT validate, parse, or transform a non-empty argument before passing it to the CLI (FR-004).
- The CLI's own resolver is the source of truth for whether a given reference is well-formed.

### E3: Branch-derived epic reference (no-arg resolution, step 1)

When `$ARGUMENTS` is empty, the model reads the current branch's `spec.md` (path discovered via the branch name → `specs/<branch>/spec.md`).

| Source | Pattern | Resolution |
|--------|---------|------------|
| `specs/<current-branch>/spec.md` | A line matching `^\*\*Epic\*\*:\s*<owner>/<repo>#<N>` | Extracted ref is the resolved epic |

**Validation rules**:
- If `specs/<current-branch>/spec.md` does not exist, fall through to E4.
- If the file exists but contains no `**Epic**:` line (or the line does not match the pattern), fall through to E4.
- The extracted ref MUST be passed to the CLI verbatim — no further transformation.

### E4: `.generacy/epics/` fallback (no-arg resolution, step 2)

When E3 fails, the model lists `.generacy/epics/` (at repository root).

| Condition | Resolution |
|-----------|------------|
| Directory contains exactly one entry | Resolve to that entry's epic ref (engine determines how to map directory name → ref) |
| Directory does not exist, is empty, or contains more than one entry | Fall through to E5 |

**Validation rules**:
- When the directory contains multiple epics, the slash command MUST NOT pick arbitrarily — it must surface E5 instead so the user disambiguates (FR-005 / Q3).

### E5: Usage hint (no-arg resolution, terminal fallback)

When E3 and E4 both fail to produce a ref, the command prints a fixed usage message.

| Field | Value |
|-------|-------|
| Output | A short, plain-text usage hint that lists the three accepted argument shapes (`owner/repo#N`, `#N`, URL) and points at the no-arg resolution chain (so a user on the wrong branch knows why nothing was auto-resolved). |

**Validation rules**:
- MUST be emitted (not silently no-op) when both E3 and E4 fail (FR-006).
- MUST exit success — this is a "did you mean…?" UX, not an error condition.

### E6: CLI invocation result

The outcome of running `generacy cockpit status <epic-ref>` via Bash.

| Field | Type | Source |
|-------|------|--------|
| `exit_code` | integer | Subprocess exit code |
| `stdout` | string | CLI's default text output |
| `stderr` | string | CLI's error stream |

**Validation rules**:
- `stdout` MUST be rendered inside a triple-backtick fenced code block when `exit_code == 0` (FR-003 / Q1).
- An optional one-line header (`**Status:** <epic-ref>`) MAY be printed before the fenced block (FR-003 / Q1).
- The body MUST NOT post-process `stdout` — column alignment, ASCII tree characters, and any per-child decoration emitted by the CLI are preserved as-is.

### E7: Error classification (when E6.exit_code != 0)

| Class | Detection rule | Response |
|-------|---------------|----------|
| `MISSING_BINARY` | `command -v generacy` returns non-zero (checked before invocation) | Print tailored install hint with the recommended install command |
| `AUTH_FAILURE` | `stderr` matches `/auth\|unauthorized\|401\|gh auth/i` | Print tailored hint pointing at `gh auth login` |
| `UNKNOWN_EPIC` | `stderr` matches `/not found\|unknown epic\|no such/i` | Print tailored hint naming the failed ref and suggesting `owner/repo#N` |
| `OTHER` | Anything else | Print `stderr` inside a fenced code block, prefixed with a "CLI failed with exit code N" line |

**Validation rules**:
- Detection patterns are case-insensitive (FR-006 / Q5).
- The four classes are mutually exclusive — `MISSING_BINARY` is checked first (pre-invocation); the next match wins thereafter; `OTHER` is the catch-all.
- All four arms MUST produce some output — none may silently no-op (FR-006).
- Tailored-message arms MUST include the failed `<epic-ref>` (where applicable) and a one-line actionable next step.

## Relationships

```
User input ─────► E2 (epic ref or empty)
                  │
                  ├── non-empty ─► pass to CLI ─► E6 ─► E7 (classify) ─► render
                  │
                  └── empty ────► E3 (parse spec.md)
                                     │
                                     ├── ok ────► pass to CLI ─► E6 ─► E7 ─► render
                                     │
                                     └── fail ─► E4 (.generacy/epics/)
                                                    │
                                                    ├── ok ──► pass to CLI ─► E6 ─► E7 ─► render
                                                    │
                                                    └── fail ─► E5 (usage hint)

E1 (status.md) ──── owns ────► all of the above behavior (it is the single
                               instruction file the loader registers)
```

## Cross-document invariants

- `E1` is the ONLY file added or modified by this issue (epic-isolation invariant from spec).
- `E6.stdout` rendering MUST NOT alter the CLI's structure (no per-child reformatting, no row reordering, no symbol substitution).
- `E2` flowing into the CLI MUST be byte-identical to what the user typed (modulo argument-parsing whitespace) — confirmed by D5 / Q4.
- `E7` MUST be exhaustive: for every possible `(exit_code, stderr)` pair, exactly one class is selected and exactly one response is printed.
