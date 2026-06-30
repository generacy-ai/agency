---
description: File a bug as a process:speckit-bugfix issue after explicit confirmation
---

# Bug Command

Confirm-gated wrapper over the bug-filing engine. Treats the entire trimmed `$ARGUMENTS` string as a freeform GitHub issue title, echoes a truncated preview in an `AskUserQuestion` prompt with `Confirm` / `Cancel` options, and — only when the user explicitly selects `Confirm` — invokes the engine from the repository root. The engine owns dedup-marker computation, label application (`process:speckit-bugfix`), and body templating; this verb's responsibility is the confirmation gate, the engine shell-out, and the terse output discipline shared with `/cockpit:status` and `/cockpit:queue`.

## Arguments

`/cockpit:bug <title-or-description>`

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `<title-or-description>` | string (whole trimmed `$ARGUMENTS`, multi-token allowed) | yes | Opaque to this command; the entire trimmed string becomes the issue title. The engine templates a minimal body — the slash command supplies nothing else. |

The argument is freeform prose, NOT a single token. Unlike `/cockpit:queue` there is no "≥2 tokens" rejection — bug titles are multi-token by design.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Argument handling** — Read `$ARGUMENTS`. Trim only outer whitespace.
   - If empty / whitespace-only → emit the literal line `Usage: /cockpit:bug <title-or-description>` and exit non-zero. Do NOT invoke `AskUserQuestion`. Do NOT invoke the engine.
   - Otherwise capture the trimmed string as `<title>` (multi-token allowed). Do NOT tokenize, do NOT validate, do NOT split on the first newline, do NOT strip Markdown, do NOT case-fold, do NOT otherwise transform it. The full untransformed string is what the engine receives.

2. **Confirmation gate** — Compute `<preview>` = `<title>` truncated to 120 chars with `…` appended if (and only if) truncation actually happened; otherwise `<preview>` is `<title>` itself. The preview is informational — the engine receives the full untruncated `<title>`, not the preview.

   Invoke `AskUserQuestion` with exactly one question:
   - `question`: the literal multi-line string — line 1 is ``File this as a `process:speckit-bugfix` issue?``, line 2 is blank, line 3 is `Title: <preview>` (with `<preview>` interpolated). The host primitive renders the multi-line `question` as-is.
   - `header`: `File bug`
   - `multiSelect`: `false`
   - `options`: exactly two, in this order:
     1. `{ label: "Confirm", description: "File the bug and enter the process:speckit-bugfix loop" }`
     2. `{ label: "Cancel",  description: "Abort without filing" }`

3. **Affirmative test** — Inspect the value returned by `AskUserQuestion`.
   - **Only** the literal string `Confirm` is affirmative and proceeds to step 4.
   - Any other return — `Cancel`, the platform's auto-added `Other` option (with or without custom text), an empty / aborted prompt, `null`, or anything else — is non-affirmative and routes directly to step 6 (Cancel rendering). **Do NOT invoke the engine.**

4. **CLI pre-flight + engine invocation** (reached only when step 3 returned `Confirm`) — Pre-flight `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, branch directly to step 7 with class `MissingBinary` (do NOT run the engine). Otherwise, from the repository root, invoke the bug-filing engine via the Bash tool, passing `<title>` byte-for-byte as the single positional argument. Capture stdout, stderr, and the exit code in separate variables. Pass no flags — in particular, no `--json`, no `--label-override`, no `--body`.

   The engine — not this slash command — owns marker computation (`sha256(<trimmed-title>)` → `<!-- generacy-bug: <hash> -->`), label application (literal `process:speckit-bugfix`), body templating, and dedup search across open `process:speckit-bugfix` issues. The slash command surfaces the engine's stdout/stderr/exit code verbatim and does none of these tasks itself.

5. **Success rendering** (engine exit code `0`) — Print the single header line `**Filed:** <repo>#<number>` (with `<repo>#<number>` extracted from the engine's success payload — by convention the last stdout line, e.g. `Filed: generacy-ai/agency#360`, OR a structured JSON field), then one blank line, then captured engine stdout inside a triple-backtick fenced code block. Render stdout verbatim: do NOT reflow, reformat, re-align, re-decorate, substitute symbols, or otherwise transform the engine's output. No additional summary, narration, or footer follows the fence. Exit zero.

   Dedup hits (engine reused an existing issue — e.g. stdout contains "matched existing marker; reusing #<n>") render under the SAME shape with the SAME header — there is no separate "Reused:" header. The reuse indication lives inside the fenced block.

6. **Cancel rendering** (non-affirmative outcome from step 3) — Print exactly one line: `Cancelled: /cockpit:bug` (no fenced block, no echo of the title — the prompt UI already showed it). Exit non-zero so scripted callers can distinguish from `Confirm` + success. The engine MUST NOT be invoked on this branch — no GitHub issue is created and no label is applied.

7. **Error rendering** — When the exit code is non-zero (or the pre-flight in step 4 failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
   - **MissingBinary** — pre-flight `command -v generacy` returned non-zero. Print: `The` ``generacy`` `CLI is required but is not on $PATH. Install it with` ``npm install -g @generacy-ai/cli`` `(or the prevailing install command) and retry.`
   - **AuthFailure** — engine exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The` ``generacy`` `CLI uses` ``gh`` `for GitHub access — run` ``gh auth login`` `and retry.`
   - **Other** — anything else (including engine-reported "rate limited", "repository not found", "label `process:speckit-bugfix` missing from repo and could not be auto-created", "unknown subcommand", etc.). Print `Engine failed with exit code <N>.` on one line, followed by captured engine stderr inside a triple-backtick fenced code block.

## Examples

`/cockpit:bug login button is broken on Safari` — freeform multi-token title. Prompts with ``File this as a `process:speckit-bugfix` issue?`` + `Title: login button is broken on Safari` and `Confirm` / `Cancel` options. On `Confirm`, invokes the bug-filing engine with the full title; on engine exit 0, renders `**Filed:** generacy-ai/agency#<n>` followed by the engine's stdout (which includes the new issue URL or "reused existing #<n>") in a fenced block. On `Cancel` (or any non-`Confirm` outcome), emits `Cancelled: /cockpit:bug` and exits non-zero without invoking the engine.

`/cockpit:bug` (no arguments) — emits `Usage: /cockpit:bug <title-or-description>` and exits non-zero. No prompt, no engine call.

`/cockpit:bug login button is broken on Safari` re-run after a previous filing — the engine's marker dedup short-circuits to the existing issue; the slash command emits the SAME `**Filed:** <repo>#<n>` shape with the original `<n>`. No second issue is created.
