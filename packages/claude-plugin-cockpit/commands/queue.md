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

# Queue Command

Confirm-gated wrapper over `generacy cockpit queue <epic-ref> <phase>`. Validates exactly two positional tokens, prompts via `AskUserQuestion` with `Confirm` / `Cancel` options describing the action (assign the phase's issues to the cluster account, apply the `process:speckit-feature` label), and — only when the user explicitly selects `Confirm` — invokes the CLI from the repository root with `--yes` and renders its output under a single `**Queued:** <phase> (<epic-ref>)` header line followed by a fenced code block.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Argument handling** — Read `$ARGUMENTS`. Trim only outer whitespace. Tokenize on whitespace.
   - If not exactly two tokens (zero, one, or three-plus) → emit the literal line `Usage: /cockpit:queue <epic-ref> <phase>` and exit non-zero. Do NOT invoke `AskUserQuestion`. Do NOT invoke the CLI.
   - If exactly two tokens → capture the first as `<epic-ref>` byte-for-byte and the second as `<phase>` byte-for-byte. Do NOT validate, parse, normalize, lowercase, expand, or strip inner punctuation on either token.
2. **Confirmation gate** — Invoke `AskUserQuestion` with exactly one question:
   - `question`: the literal string ``Assign phase `<phase>`'s issues of `<epic-ref>` to the cluster account and add label `process:speckit-feature`?`` with `<epic-ref>` and `<phase>` interpolated from step 1.
   - `header`: `Queue phase`
   - `multiSelect`: `false`
   - `options`: exactly two, in this order:
     1. `{ label: "Confirm", description: "Run the CLI with --yes" }`
     2. `{ label: "Cancel",  description: "Abort without queueing" }`
3. **Affirmative test** — Only the literal string `Confirm` is affirmative and proceeds to step 4. Any other return — `Cancel`, the platform's auto-added `Other` option (with or without custom text), an empty / aborted prompt, `null`, or anything else — is non-affirmative. Emit exactly one line: `Cancelled: /cockpit:queue <epic-ref> <phase>` (no fenced block). Exit non-zero. Do NOT invoke the CLI.
4. **CLI pre-flight + invocation** (reached only when step 3 returned `Confirm`) — Pre-flight `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` (do NOT run the CLI). Otherwise, from the repository root, run `generacy cockpit queue <epic-ref> <phase> --yes` via the Bash tool, capturing stdout, stderr, and the exit code in separate variables. <!-- `--yes` suppresses the CLI's own interactive confirm; the plugin's `AskUserQuestion` in step 2 is the sole gate. This is forced by Claude Code's Bash tool being non-interactive (no TTY). -->
5. **Success rendering** (CLI exit code `0`) — Print the single header line `**Queued:** <phase> (<epic-ref>)`, then one blank line, then captured stdout inside a triple-backtick fenced code block. Render stdout verbatim. No additional summary, narration, or footer follows the fence. Exit zero.
6. On any non-zero CLI exit, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install it with \`npm install -g @generacy-ai/generacy\`.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Examples

`/cockpit:queue 1 P1` — two positionals: an epic ref (bare number `1`) and a phase (`P1`). Prompts with ``Assign phase `P1`'s issues of `1` to the cluster account and add label `process:speckit-feature`?``. On `Confirm`, invokes `generacy cockpit queue 1 P1 --yes` from the repo root and renders the CLI's stdout under `**Queued:** P1 (1)`. On `Cancel` (or any non-`Confirm` outcome), emits `Cancelled: /cockpit:queue 1 P1` and exits non-zero without invoking the CLI.

`/cockpit:queue` (no arguments) — emits `Usage: /cockpit:queue <epic-ref> <phase>` and exits non-zero. No prompt, no CLI call. The same usage line is emitted for one-token calls (e.g. `/cockpit:queue P1`) and for three-plus-token calls (e.g. `/cockpit:queue 1 P1 extra`).
