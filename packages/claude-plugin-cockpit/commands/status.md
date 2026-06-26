---
description: Report the current status of an epic and its children
arguments:
  - name: epic
    description: "Epic reference (owner/repo#N, #N, or URL). Omit to resolve from the current branch."
    required: false
---

# Status Command

Print a readable dashboard for a speckit epic — child issues grouped by phase, each child's current speckit phase/gate and state (open/in-progress/blocked/done), and any items requiring human attention. This command is a thin wrapper around the `generacy cockpit status` CLI; phase grouping, decoration, and per-child layout are produced by the CLI and rendered verbatim here.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Argument handling** — Treat `$ARGUMENTS` as opaque. If non-empty, capture it as `<epic-ref>` and pass it through to the CLI in step 3 byte-for-byte. Do NOT validate, parse, normalize, expand, or reinterpret the argument — in particular, do NOT rewrite a bare `#N` into `owner/repo#N`; repo defaulting is the engine resolver's responsibility. If `$ARGUMENTS` is empty (or whitespace-only), proceed to step 2 instead.

2. **No-arg epic resolution** — Only when `$ARGUMENTS` is empty, resolve the epic via this chain, stopping at the first success:
   1. Determine the current branch (`git rev-parse --abbrev-ref HEAD`). Read `specs/<current-branch>/spec.md`. Extract the first line matching `^\*\*Epic\*\*:\s*([^\s|]+)` and take capture group 1 as `<epic-ref>` (the literal grammar is `**Epic**: <owner>/<repo>#<N>`; ignore any trailing ` | <phase>` continuation on the same line). If the file is missing, has no matching line, or the captured ref is empty, fall through.
   2. List `.generacy/epics/` (at repository root). If the directory exists AND contains exactly one entry, resolve `<epic-ref>` from that single entry. If the directory is missing, empty, or contains more than one entry, fall through.
   3. Print a one-paragraph usage hint listing the three accepted argument shapes — `owner/repo#N`, `#N`, URL — and noting that no-arg invocation resolves the epic from the current branch's `spec.md` `**Epic**:` line (and otherwise from a single `.generacy/epics/` entry). Exit success without invoking the CLI. Do NOT silently no-op.

3. **CLI invocation** — Pre-flight `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, branch directly to step 5 with class `MISSING_BINARY` (do NOT run the CLI). Otherwise, from the repository root, run `generacy cockpit status <epic-ref>` via the Bash tool, capturing stdout, stderr, and the exit code in separate variables. Pass no flags — in particular, do NOT pass `--json`; this command consumes the CLI's default text output.

4. **Output rendering** — When the exit code is `0`, print a single header line `**Status:** <epic-ref>` followed by a blank line and then captured stdout inside a triple-backtick fenced code block. Render stdout verbatim: do NOT reflow, reformat, re-align columns, re-order rows, re-decorate per-child state, substitute symbols, or otherwise transform the CLI's output. Phase grouping and visual decoration are the CLI's responsibility.

5. **Error handling** — When the exit code is non-zero (or the pre-flight in step 3 failed), classify the failure into exactly one of four classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op.
   - **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The` ``generacy`` `CLI is required but is not on $PATH. Install it with` ``npm install -g @generacy-ai/cli`` `(or the prevailing install command) and retry.`
   - **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The` ``generacy`` `CLI uses` ``gh`` `for GitHub access — run` ``gh auth login`` `and retry.`
   - **UNKNOWN_EPIC** — exit ≠ 0 AND captured stderr matches `/not found|unknown epic|no such/i`. Print: `Could not resolve epic` `<epic-ref>` `. Try the explicit` `owner/repo#N` `form (e.g.,` `generacy-ai/tetrad-development#85` `) — bare` `#N` `requires the engine resolver to know your default repo.`
   - **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.

## Examples

`/cockpit:status generacy-ai/tetrad-development#85` — explicit reference. Invokes `generacy cockpit status generacy-ai/tetrad-development#85`, prints `**Status:** generacy-ai/tetrad-development#85`, then the CLI's dashboard inside a fenced code block (child issues grouped by phase, per-child state, blocked items decorated).

`/cockpit:status` (run from this branch, `352-epic-generacy-ai-tetrad`) — no argument. Resolves the epic from `specs/352-epic-generacy-ai-tetrad/spec.md`'s `**Epic**:` line (yielding `generacy-ai/tetrad-development#85`), then invokes the CLI and renders the same dashboard.
