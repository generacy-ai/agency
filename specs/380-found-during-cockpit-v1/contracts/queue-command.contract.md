# Contract: `commands/queue.md` — required strings after rewrite

**Feature**: 380-found-during-cockpit-v1
**File under contract**: `packages/claude-plugin-cockpit/commands/queue.md`
**Consumers**: The Claude Code harness (reads the file as a slash-command prompt at invocation time) and the user (reads the printed output).
**Purpose**: Capture, section by section, the exact strings the rewritten file MUST contain. This is the reference the quickstart, code review, and any future drift check hangs off.

Backticks in this document are Markdown code spans; every literal that must appear in `queue.md` byte-for-byte is enclosed in a fenced code block. The prompt text uses ASCII quotes and a single em dash `—` where indicated; smart quotes / en dashes are drift.

## §1 Frontmatter

The file's YAML frontmatter must list two arguments in this order:

```yaml
---
description: Confirm-gated wrapper over `generacy cockpit queue <epic-ref> <phase>` — assigns the phase's issues to the cluster account and applies the `process:speckit-feature` label.
arguments:
  - name: epic-ref
    description: "Epic reference. Opaque to this command; accepts a bare number, `owner/repo#N`, or a full URL — resolution is the CLI's job (see generacy#822)."
    required: true
  - name: phase
    description: "Phase identifier to queue. Opaque to this command; run `generacy cockpit queue --help` for the authoritative phase enum."
    required: true
---
```

Verification: `grep -c "required: true" packages/claude-plugin-cockpit/commands/queue.md` MUST report `2`. The `name:` values must appear as `epic-ref` first and `phase` second, in that order (a `grep -n "^  - name:"` should show `epic-ref` on the earlier line).

## §2 Description sentence (H1 body)

The paragraph immediately under the `# Queue Command` heading must read:

```markdown
Confirm-gated wrapper over `generacy cockpit queue <epic-ref> <phase>`. Validates exactly two positional tokens, prompts via `AskUserQuestion` with `Confirm` / `Cancel` options describing the action (assign the phase's issues to the cluster account, apply the `process:speckit-feature` label), and — only when the user explicitly selects `Confirm` — invokes the CLI from the repository root with `--yes` and renders its output under a single `**Queued:** <phase> (<epic-ref>)` header line followed by a fenced code block.
```

## §3 Tokenization gate (Instructions §1)

```markdown
1. **Argument handling** — Read `$ARGUMENTS`. Trim only outer whitespace. Tokenize on whitespace.
   - If not exactly two tokens (zero, one, or three-plus) → emit the literal line `Usage: /cockpit:queue <epic-ref> <phase>` and exit non-zero. Do NOT invoke `AskUserQuestion`. Do NOT invoke the CLI.
   - If exactly two tokens → capture the first as `<epic-ref>` byte-for-byte and the second as `<phase>` byte-for-byte. Do NOT validate, parse, normalize, lowercase, expand, or strip inner punctuation on either token.
```

Verification: `grep -c "Usage: /cockpit:queue <epic-ref> <phase>" packages/claude-plugin-cockpit/commands/queue.md` MUST report at least `2` (one in this gate, one in the Examples §7 below).

## §4 Confirmation gate (Instructions §2)

```markdown
2. **Confirmation gate** — Invoke `AskUserQuestion` with exactly one question:
   - `question`: the literal string ``Assign phase `<phase>`'s issues of `<epic-ref>` to the cluster account and add label `process:speckit-feature`?`` with `<epic-ref>` and `<phase>` interpolated from step 1.
   - `header`: `Queue phase`
   - `multiSelect`: `false`
   - `options`: exactly two, in this order:
     1. `{ label: "Confirm", description: "Run the CLI with --yes" }`
     2. `{ label: "Cancel",  description: "Abort without queueing" }`
```

Note on wording: the question describes the *action* (assign + label) rather than echoing the argv, because step 4 passes `--yes` and the CLI's own resolved preview is suppressed (see [research.md](../research.md) Decision 2).

## §5 Affirmative test + Cancelled message (Instructions §3)

```markdown
3. **Affirmative test** — Only the literal string `Confirm` is affirmative and proceeds to step 4. Any other return — `Cancel`, the platform's auto-added `Other` option (with or without custom text), an empty / aborted prompt, `null`, or anything else — is non-affirmative. Emit exactly one line: `Cancelled: /cockpit:queue <epic-ref> <phase>` (no fenced block). Exit non-zero. Do NOT invoke the CLI.
```

## §6 CLI invocation (Instructions §4) and inline `--yes` note

```markdown
4. **CLI pre-flight + invocation** (reached only when step 3 returned `Confirm`) — Pre-flight `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` (do NOT run the CLI). Otherwise, from the repository root, run `generacy cockpit queue <epic-ref> <phase> --yes` via the Bash tool, capturing stdout, stderr, and the exit code in separate variables. <!-- `--yes` suppresses the CLI's own interactive confirm; the plugin's `AskUserQuestion` in step 2 is the sole gate. This is forced by Claude Code's Bash tool being non-interactive (no TTY). -->
```

Verification: `grep -c "generacy cockpit queue <epic-ref> <phase> --yes" packages/claude-plugin-cockpit/commands/queue.md` MUST report at least `1` (this invocation; possibly more if referenced elsewhere).

## §7 Success rendering (Instructions §5) and terminal step (Instructions §6)

```markdown
5. **Success rendering** (CLI exit code `0`) — Print the single header line `**Queued:** <phase> (<epic-ref>)`, then one blank line, then captured stdout inside a triple-backtick fenced code block. Render stdout verbatim. No additional summary, narration, or footer follows the fence. Exit zero.
6. On any non-zero CLI exit, apply the **Error handling** block below.
```

## §8 Error handling block (unchanged from current file)

The block from `<!-- BEGIN error-conv -->` through `<!-- END error-conv -->` is preserved byte-for-byte. The `Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling` marker line and the three list items (MISSING_BINARY / AUTH_FAILURE / OTHER) are NOT edited by this fix.

Verification: `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/queue.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/status.md)` MUST return empty output. (Any sibling of the six that #378 fixed can be used as the comparison anchor.)

## §9 Examples section

Rewrite the Examples section to two worked cases:

```markdown
## Examples

`/cockpit:queue 1 P1` — two positionals: an epic ref (bare number `1`) and a phase (`P1`). Prompts with ``Assign phase `P1`'s issues of `1` to the cluster account and add label `process:speckit-feature`?``. On `Confirm`, invokes `generacy cockpit queue 1 P1 --yes` from the repo root and renders the CLI's stdout under `**Queued:** P1 (1)`. On `Cancel` (or any non-`Confirm` outcome), emits `Cancelled: /cockpit:queue 1 P1` and exits non-zero without invoking the CLI.

`/cockpit:queue` (no arguments) — emits `Usage: /cockpit:queue <epic-ref> <phase>` and exits non-zero. No prompt, no CLI call. The same usage line is emitted for one-token calls (e.g. `/cockpit:queue P1`) and for three-plus-token calls (e.g. `/cockpit:queue 1 P1 extra`).
```

## Removed strings

The following strings from the current file MUST NOT appear in the rewritten file:

| Removed | Why |
|---|---|
| `` `generacy cockpit queue <phase>` `` (single-arg CLI form in the description) | Wrong CLI contract (spec §Summary). |
| `Usage: /cockpit:queue <phase>` | Wrong usage line (FR-002). |
| ``Run `generacy cockpit queue <phase>`?`` | Wrong argv echo, no `<epic-ref>`, no action description (FR-003). |
| `**Queued:** <phase>` (as a bare header without `(<epic-ref>)`) | Success header must include the epic ref (FR-006). |
| `Cancelled: /cockpit:queue <phase>` | Cancelled message must include both tokens (FR-004). |
| `/cockpit:queue plan` (single-arg worked example) | Wrong contract in Examples (FR-009). |

Verification: `grep -c "Usage: /cockpit:queue <phase>[^ ]" packages/claude-plugin-cockpit/commands/queue.md` MUST report `0` (the old one-token usage line must be gone; use a delimiter class to avoid matching the new two-arg line as a prefix).

## Byte-fidelity notes

- ASCII quotes throughout (`"..."`, `'...'`). No smart quotes.
- Em dash `—` (U+2014) is used in three places above (description sentence in §1 and §2; the inline note in §6). No en dash `–`.
- Inline code spans use single backticks; nested code inside `question:` uses two backticks (`` `` … `` ``) as shown in §4.
- Every literal `<epic-ref>` and `<phase>` in the *documentation of the command* (steps 1–6, examples) is a template placeholder for the user's token, not a literal to be typed. In the emitted `Usage:` and `Cancelled:` lines, `<epic-ref>` and `<phase>` are literal (they appear verbatim in the printed output as generic placeholders, exactly as the current file's `<phase>` does).
