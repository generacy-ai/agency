# Data Model: claude-plugin-cockpit six-command rewrite

**Feature**: 372-epic-generacy-ai-tetrad
**Phase**: 1 (design)
**Date**: 2026-07-06

This feature ships no runtime code, no database schema, no serialized wire format, and no persisted state. The "data model" is the shape of the Markdown assets themselves: six slash-command files and one README, all under `packages/claude-plugin-cockpit/`. This document specifies their required shapes so the tasks phase can enforce them mechanically.

The only in-memory value the rewrite retains is `watch`'s per-invocation transition-notification cursor (implicit — Claude Code processes each `Bash` stdout line as it arrives; no dedupe, no baseline, no `seen` set).

---

## Entity 1: Command file (Markdown playbook)

**Path pattern**: `packages/claude-plugin-cockpit/commands/<verb>.md` where `<verb>` ∈ { `watch`, `status`, `queue`, `clarify`, `review`, `merge` }.

**Cardinality**: Exactly six files (SC-001). No other `.md` files in `commands/`. No subdirectories.

**Structure**:

```markdown
---
description: <one-line command description shown in Claude Code UI>
arguments:                             # optional; present only when the verb takes args
  - name: <arg-name>
    description: <one-line arg description>
    required: <true|false>
---

# <Verb> Command                        # H1 — title-case verb name + " Command"

<one-paragraph summary of what the command does — matches the ---description above>

## User Input                           # optional; present when the command reads $ARGUMENTS

```text
$ARGUMENTS
```

## Instructions                         # required — numbered playbook steps

1. **<step name>** — <step body>
2. **<step name>** — <step body>
   …
N. **Error handling** — <inlined three-class block; see Entity 3>

## Examples                             # optional but strongly recommended

`<verb example 1>` — <what it does>
`<verb example 2>` — <what it does>
```

**Validation rules**:

| Rule | Where enforced | Notes |
|------|----------------|-------|
| YAML frontmatter present with a `description` field. | Static check (`head -1 == "---"` and frontmatter parses). | Required for Claude Code UI listing. |
| First H1 matches `# <TitleCase(verb)> Command`. | Static check. | Verb-name consistency. |
| No occurrence of the substring `specs/` anywhere in the file. | `grep -F 'specs/' commands/*.md` (SC-002). | Enforces "no `specs/**` references." |
| No occurrence of `/cockpit:advance`, `autonomy-policy`, `transition.schema`, `PolicyEntry`, `PushNotification`. | `grep -Fw` (SC-002). | Enforces "no policy/schema/unshipped-verb refs." |
| No occurrence of another `/cockpit:*` slash command being invoked (as opposed to being *suggested* to the user, which `watch` and `queue` do). | Careful grep on lines that look like Bash-tool invocations of the verb, not lines that print it as text. | FR-005. The `/code-review` reference is allowed only in `review.md`. |
| Shared error convention block present verbatim (byte-identical across all six files). | `diff <(sed -n '/BEGIN error-conv/,/END error-conv/p' file1) <(same for file2)` for each pair (SC-005). | See Entity 3. |
| `watch.md` line count ≤ ~20 (target ≈ 20; hard cap ~30 to give slack for the mapping table). | `wc -l watch.md` (SC-004). | Only file with a strict budget. |

**Per-verb specifics**:

- **`watch.md`** — takes one positional `<epic-ref>`; runs `generacy cockpit watch <epic-ref>` via the Bash tool as a long-running command; for each stdout line prints one notification using the static mapping table (Entity 2). On watcher exit, reports and stops. No policy lookup, no dedupe, no baseline, no `PushNotification`.
- **`status.md`** — takes optional `<epic-ref>`; runs `generacy cockpit status <args>` and renders stdout. With no arg, prints the usage line and exits. No `.generacy/epics/` resolution chain.
- **`queue.md`** — takes one positional `<phase>`; runs `AskUserQuestion` with Confirm/Cancel options; only on `Confirm` invokes `generacy cockpit queue <phase>` and renders stdout.
- **`clarify.md`** — takes optional `<epic-ref>`; runs the assist loop: `generacy cockpit context` → draft answers → per-question approval (`AskUserQuestion`) → post marked comment → `generacy cockpit advance`.
- **`review.md`** — takes `--gate <gate-name>`; for `impl`, invokes `/code-review` (single documented exception); for other gates, summarizes the review artifact; on approval calls `generacy cockpit advance --gate <g>` via the Bash tool.
- **`merge.md`** — takes optional `--max-fix-attempts <N>` (default 1); polls CI; never merges on red; on red-with-attempts-remaining spawns a bounded fixer subagent for tests/lint/typecheck/build failures; infrastructure failures abort without burning an attempt.

---

## Entity 2: Static next-command mapping table (in `watch.md`)

A ~5-row table baked into the body of `watch.md`, used to derive the "suggested next `/cockpit:*` command" for each transition line emitted by `generacy cockpit watch`.

**Type**: Prose-embedded Markdown table.

**Shape**:

| Transition kind (substring match on the line) | Suggested next command |
|---|---|
| `waiting-for:clarification` | `/cockpit:clarify` |
| `waiting-for:<gate>-review` | `/cockpit:review --gate <gate>` |
| `completed:validate` or all green checks | `/cockpit:merge` |
| error states (any line matching `error` / `failed`) | (no suggestion) |

**Validation rules**:

| Rule | Notes |
|------|-------|
| Table lives in `watch.md`, not in an external file. | Fresh-session runnability (FR-004). |
| Match logic is a substring/regex check on the transition line, NOT a schema parse. | FR-007 forbids policy/schema lookup. |
| Unrecognized lines suggest nothing (silently pass through). | Explicit in the "error states" row. |

---

## Entity 3: Shared error convention block (inlined in all six commands)

The three-class failure taxonomy each command's `## Instructions` block appends as its terminal step. Byte-identical across all six commands (SC-005).

**Shape** (this is the reference form; tasks phase copies this verbatim into each command):

```markdown
N. **Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
   <!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
   - **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. Install it with npm install -g @generacy-ai/cli (or the prevailing install command) and retry.`
   - **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
   - **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
```

**Validation rules**:

| Rule | Where enforced |
|------|----------------|
| Block is byte-identical across `watch.md`, `status.md`, `queue.md`, `clarify.md`, `review.md`, `merge.md`. | `diff` (SC-005). |
| Block includes the canonical-source comment naming the plugin README section. | Grep for the comment string. |
| Three classes are exhaustive — no fourth class (no `UNKNOWN_EPIC` sub-class in this rewrite; that was `status.md`'s pre-rewrite extension and is dropped for parity). | Static check: block contains exactly three `**CLASS** —` bullets. |

**Note on `UNKNOWN_EPIC`**: the pre-rewrite `status.md` had a fourth `UNKNOWN_EPIC` class. It is dropped by the rewrite — the byte-identical constraint (SC-005) requires a single shared block, and `OTHER` covers unknown-epic failures acceptably (the CLI's stderr goes inside the fenced block, which contains the relevant "not found" message). This is a deliberate simplification, in the spirit of the S4 tier's v1-simplification goal.

---

## Entity 4: Plugin README

**Path**: `packages/claude-plugin-cockpit/README.md`

**Cardinality**: Exactly one.

**Required sections** (after the rewrite):

| Section | Purpose |
|---------|---------|
| `# cockpit` (H1) | Title. |
| Overview paragraph | One paragraph, no "coming in #351–#360" copy. Names the six commands. |
| `## Installation` | Marketplace install via `extraKnownMarketplaces` (JSON snippet retained). |
| `## Available Commands` | 6-row table: watch, status, queue, clarify, review, merge. |
| `## Error Handling` | Canonical copy of the three-class convention (the source Entity 3 cites). |
| `## Related` | Optional — sibling plugins. |
| `## License` | MIT. |

**Validation rules**:

| Rule | Where enforced |
|------|----------------|
| No occurrence of the substring `coming in #351` or `coming in #351–#360`. | `grep -F` (SC-006). |
| `## Available Commands` table has exactly 6 data rows (7 lines counting header + separator). | Static parse. |
| `## Error Handling` section exists and matches the inlined block in Entity 3 semantically (may be prose-expanded but the three class names and one-liners must be present). | Manual review + grep. |

---

## Entity 5: Deletions

Not a data entity per se, but a required output state:

| File to delete | Reason |
|---|---|
| `packages/claude-plugin-cockpit/commands/plan.md` | Out of the six-command set (FR-001). |
| `packages/claude-plugin-cockpit/commands/breakdown.md` | Out of the six-command set. |
| `packages/claude-plugin-cockpit/commands/file.md` | Out of the six-command set. |
| `packages/claude-plugin-cockpit/commands/bug.md` | Out of the six-command set. |

**Validation rule**: `ls packages/claude-plugin-cockpit/commands/ | wc -l` returns exactly 6 (SC-001).

---

## Relationships

```
README.md § Error Handling
    │ (canonical source-of-truth reference)
    ▼
Command file's Error handling step  ─────▶  (inlined verbatim, byte-identical across all 6)
    │
    │ (for watch.md only)
    ▼
Static next-command mapping table   ─────▶  Suggested /cockpit:* verb per transition line
```

No other cross-file relationships. Each command is self-contained at execution time (the whole point of the rewrite).
