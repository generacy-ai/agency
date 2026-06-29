---
description: Queue a phase for the current epic after explicit confirmation
arguments:
  - name: phase
    description: "Phase identifier to queue. Opaque to this command; run `generacy cockpit queue --help` for the authoritative phase enum."
    required: true
---

# Queue Command

Confirm-gated wrapper over `generacy cockpit queue <phase>`. Validates that exactly one positional token is present, echoes the resolved command in an `AskUserQuestion` prompt with `Confirm` / `Cancel` options, and — only when the user explicitly selects `Confirm` — invokes the CLI from the repository root and renders its output under a single `**Queued:** <phase>` header line followed by a fenced code block. Phase semantics, queue ordering, and idempotency are owned by the CLI; this verb's responsibility is the confirmation gate and the terse output discipline shared with `/cockpit:status`.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Argument handling** — Read `$ARGUMENTS`. Trim only outer whitespace. Tokenize on whitespace.
   - If zero tokens (empty or whitespace-only) → emit the literal line `Usage: /cockpit:queue <phase>` and exit non-zero. Do NOT invoke `AskUserQuestion`. Do NOT invoke the CLI.
   - If two or more tokens → emit the same literal line `Usage: /cockpit:queue <phase>` and exit non-zero. Do NOT invoke `AskUserQuestion`. Do NOT invoke the CLI.
   - If exactly one token → capture it as `<phase>` byte-for-byte. Do NOT validate, parse, normalize, lowercase, expand, strip inner punctuation, or otherwise transform it.

2. **Confirmation gate** — Invoke `AskUserQuestion` with exactly one question:
   - `question`: the literal string ``Run `generacy cockpit queue <phase>`?`` with `<phase>` interpolated from step 1. No surrounding whitespace, no trailing newline, no trailing period.
   - `header`: `Queue phase`
   - `multiSelect`: `false`
   - `options`: exactly two, in this order:
     1. `{ label: "Confirm", description: "Run the CLI" }`
     2. `{ label: "Cancel",  description: "Abort without queueing" }`

3. **Affirmative test** — Inspect the value returned by `AskUserQuestion`.
   - **Only** the literal string `Confirm` is affirmative and proceeds to step 4.
   - Any other return — `Cancel`, the platform's auto-added `Other` option (with or without custom text), an empty / aborted prompt, `null`, or anything else — is non-affirmative. Emit exactly one line: `Cancelled: /cockpit:queue <phase>` (no fenced block). Exit non-zero. **Do NOT invoke the CLI.**

4. **CLI pre-flight + invocation** (reached only when step 3 returned `Confirm`) — Pre-flight `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, branch directly to step 6 with class `MISSING_BINARY` (do NOT run the CLI). Otherwise, from the repository root, run `generacy cockpit queue <phase>` via the Bash tool, capturing stdout, stderr, and the exit code in separate variables. Pass no flags.

5. **Success rendering** (CLI exit code `0`) — Print the single header line `**Queued:** <phase>`, then one blank line, then captured stdout inside a triple-backtick fenced code block. Render stdout verbatim: do NOT reflow, reformat, re-align columns, re-order rows, re-decorate, substitute symbols, or otherwise transform the CLI's output. No additional summary, narration, or footer follows the fence. Exit zero.

6. **Error handling** — When the exit code is non-zero (or the pre-flight in step 4 failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
   - **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The` ``generacy`` `CLI is required but is not on $PATH. Install it with` ``npm install -g @generacy-ai/cli`` `(or the prevailing install command) and retry.`
   - **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The` ``generacy`` `CLI uses` ``gh`` `for GitHub access — run` ``gh auth login`` `and retry.`
   - **OTHER** — anything else (including unknown-phase rejections from the CLI). Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.

## Examples

`/cockpit:queue plan` — single positional. Prompts with ``Run `generacy cockpit queue plan`?`` and `Confirm` / `Cancel` options. On `Confirm`, invokes `generacy cockpit queue plan` and renders the CLI's stdout under `**Queued:** plan` in a fenced block. On `Cancel` (or any non-`Confirm` outcome), emits `Cancelled: /cockpit:queue plan` and exits non-zero without invoking the CLI.

`/cockpit:queue` (no arguments) — emits `Usage: /cockpit:queue <phase>` and exits non-zero. No prompt, no CLI call.

`/cockpit:queue plan tasks` (multiple tokens) — same `Usage:` line, same non-zero exit, no prompt, no CLI call.
