---
description: Report the current status of an epic and its children
arguments:
  - name: epic
    description: "Epic reference (owner/repo#N, #N, or URL). Optional."
    required: false
---

# Status Command

Thin renderer over `generacy cockpit status <epic-ref>`. Phase grouping, decoration, and per-child layout are the CLI's responsibility; this verb prints the CLI's stdout verbatim.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Argument handling** — Treat `$ARGUMENTS` as opaque. If non-empty, capture it as `<epic-ref>` and pass it to the CLI in step 3 byte-for-byte. Do NOT validate, parse, normalize, expand, or reinterpret the argument — in particular, do NOT rewrite a bare `#N` into `owner/repo#N`; repo defaulting is the engine resolver's responsibility.
2. **No-arg case** — If `$ARGUMENTS` is empty (or whitespace-only), print the literal line `Usage: /cockpit:status <epic-ref>` and exit success without invoking the CLI. Do NOT attempt to resolve the epic from the current branch, from `spec.md`, or from any other filesystem source.
3. **CLI invocation** — Pre-flight `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` (do NOT run the CLI). Otherwise, from the repository root, run `generacy cockpit status <epic-ref>` via the Bash tool, capturing stdout, stderr, and the exit code in separate variables. Pass no flags.
4. **Output rendering** — When the exit code is `0`, print a single header line `**Status:** <epic-ref>` followed by a blank line and then captured stdout inside a triple-backtick fenced code block. Render stdout verbatim: do NOT reflow, reformat, re-align columns, re-order rows, re-decorate per-child state, substitute symbols, or otherwise transform the CLI's output.
5. On any non-zero CLI exit, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. Install it with npm install -g @generacy-ai/cli (or the prevailing install command) and retry.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Examples

`/cockpit:status generacy-ai/tetrad-development#85` — explicit reference. Invokes `generacy cockpit status generacy-ai/tetrad-development#85` and prints its dashboard inside a fenced code block.

`/cockpit:status` (no argument) — prints the usage line and exits without invoking the CLI.
