---
description: Queue a phase for the current epic after explicit confirmation
arguments:
  - name: phase
    description: "Phase identifier to queue. Opaque to this command; run `generacy cockpit queue --help` for the authoritative phase enum."
    required: true
---

# Queue Command

Confirm-gated wrapper over `generacy cockpit queue <phase>`. Validates exactly one positional token, prompts via `AskUserQuestion` with `Confirm` / `Cancel` options, and — only when the user explicitly selects `Confirm` — invokes the CLI from the repository root and renders its output under a single `**Queued:** <phase>` header line followed by a fenced code block.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Argument handling** — Read `$ARGUMENTS`. Trim only outer whitespace. Tokenize on whitespace.
   - If zero tokens (empty or whitespace-only) → emit the literal line `Usage: /cockpit:queue <phase>` and exit non-zero. Do NOT invoke `AskUserQuestion`. Do NOT invoke the CLI.
   - If two or more tokens → emit the same literal line `Usage: /cockpit:queue <phase>` and exit non-zero. Do NOT invoke `AskUserQuestion`. Do NOT invoke the CLI.
   - If exactly one token → capture it as `<phase>` byte-for-byte. Do NOT validate, parse, normalize, lowercase, expand, or strip inner punctuation.
2. **Confirmation gate** — Invoke `AskUserQuestion` with exactly one question:
   - `question`: the literal string ``Run `generacy cockpit queue <phase>`?`` with `<phase>` interpolated from step 1.
   - `header`: `Queue phase`
   - `multiSelect`: `false`
   - `options`: exactly two, in this order:
     1. `{ label: "Confirm", description: "Run the CLI" }`
     2. `{ label: "Cancel",  description: "Abort without queueing" }`
3. **Affirmative test** — Only the literal string `Confirm` is affirmative and proceeds to step 4. Any other return — `Cancel`, the platform's auto-added `Other` option (with or without custom text), an empty / aborted prompt, `null`, or anything else — is non-affirmative. Emit exactly one line: `Cancelled: /cockpit:queue <phase>` (no fenced block). Exit non-zero. Do NOT invoke the CLI.
4. **CLI pre-flight + invocation** (reached only when step 3 returned `Confirm`) — Pre-flight `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` (do NOT run the CLI). Otherwise, from the repository root, run `generacy cockpit queue <phase>` via the Bash tool, capturing stdout, stderr, and the exit code in separate variables. Pass no flags.
5. **Success rendering** (CLI exit code `0`) — Print the single header line `**Queued:** <phase>`, then one blank line, then captured stdout inside a triple-backtick fenced code block. Render stdout verbatim. No additional summary, narration, or footer follows the fence. Exit zero.
6. On any non-zero CLI exit, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. Install it with npm install -g @generacy-ai/cli (or the prevailing install command) and retry.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Examples

`/cockpit:queue plan` — single positional. Prompts with ``Run `generacy cockpit queue plan`?``. On `Confirm`, invokes `generacy cockpit queue plan` and renders the CLI's stdout under `**Queued:** plan`. On `Cancel` (or any non-`Confirm` outcome), emits `Cancelled: /cockpit:queue plan` and exits non-zero without invoking the CLI.

`/cockpit:queue` (no arguments) — emits `Usage: /cockpit:queue <phase>` and exits non-zero. No prompt, no CLI call.
