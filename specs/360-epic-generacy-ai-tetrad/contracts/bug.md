# Contract: `/cockpit:bug`

**Feature**: `/cockpit:bug` confirm-gated wrapper over the bug-filing engine (A5.3)
**Branch**: `360-epic-generacy-ai-tetrad`
**Date**: 2026-06-29

This is the external contract of the slash command — the surface that calling developers and depending commands can rely on. It is binding on the implementation in `packages/claude-plugin-cockpit/commands/bug.md`.

---

## Invocation

```
/cockpit:bug <title-or-description>
```

### Arguments

| Arg | Type | Required | Default | Valid values |
|-----|------|----------|---------|--------------|
| `<title-or-description>` | string (whole trimmed `$ARGUMENTS`, multi-token allowed) | yes | — | opaque to this command; the entire trimmed string becomes the issue title (clarification Q1=A). The engine templates a minimal body — the slash command supplies nothing else. |

### Structural validation (slash-command side)

The slash command performs one structural check before invoking anything:

1. **Empty / whitespace-only `$ARGUMENTS`** → emit `Usage: /cockpit:bug <title-or-description>` and exit non-zero. No prompt, no engine call.
2. **Any non-empty trimmed string** → capture as `<title>`, proceed to the confirmation step. The title is passed byte-for-byte to the engine; no tokenization, no first-line/remainder split, no Markdown stripping, no case-folding.

There is no `--help` flag. Bare invocation produces the `Usage:` line.

There is no multi-arg structural rejection (`/cockpit:queue`'s "≥2 tokens" check). A bug title is freeform prose; multi-token is the common case.

---

## Confirmation gate

After structural validation, the command calls `AskUserQuestion` with exactly:

| Field | Value |
|-------|-------|
| `question` | Multi-line literal: line 1 = ``File this as a `process:speckit-bugfix` issue?`` , line 2 = blank, line 3 = `Title: <preview>` where `<preview>` is `<title>` truncated to 120 chars with `…` if truncation happened. |
| `header` | `File bug` |
| `multiSelect` | `false` |
| `options[0]` | `{ label: "Confirm", description: "File the bug and enter the process:speckit-bugfix loop" }` |
| `options[1]` | `{ label: "Cancel",  description: "Abort without filing" }` |

**Affirmative outcome**: the user selected the option labelled `Confirm`.

**Non-affirmative outcome**: any other return from `AskUserQuestion`, including:
- the user selected `Cancel`;
- the user provided custom text via the host's auto-added `Other` option;
- the prompt was aborted or returned no selection;
- the host primitive returned anything that is not the literal string `Confirm`.

On non-affirmative outcomes, the command emits `Cancelled: /cockpit:bug` and exits non-zero. The engine is **not** invoked.

The preview-truncation rule is a UI affordance for the prompt only; the engine receives the FULL untruncated title, not the preview.

---

## Behaviour — affirmative path

Reached only when `AskUserQuestion` returned the literal string `Confirm`.

1. **Pre-flight**: `command -v generacy >/dev/null 2>&1`. If non-zero, branch to the `MissingBinary` error path; do not invoke the engine.
2. **Engine invocation**: from the repository root, invoke the bug-filing engine (sibling cockpit A2.1 / A2.5; exact entry point is engine-owned) via the Bash tool, passing the full untrimmed-after-outer-trim `<title>` as the single positional argument. Capture stdout, stderr, and the exit code in separate variables. Pass no other flags.
3. **The engine** is responsible for:
   - Computing `sha256(<trimmed-title>)` and writing the hidden HTML marker `<!-- generacy-bug: <hash> -->` into the GitHub issue body.
   - Applying the literal label `process:speckit-bugfix` to the issue.
   - Templating a minimal body (the slash command supplies no body content).
   - Searching open issues labelled `process:speckit-bugfix` for an existing matching marker BEFORE creating a new issue; on a hit, reusing the existing issue and emitting an indication on stdout.
   - The slash command does NOT perform any of these tasks itself.
4. **Success** (exit code `0`): emit the single header line `**Filed:** <repo>#<number>`, then one blank line, then captured engine stdout inside a triple-backtick fenced code block. Render stdout verbatim.
5. **Failure** (exit code ≠ 0): classify per the error table below and emit the matching response.

---

## Output schema

### Success (engine exit 0 after `Confirm`)

````markdown
**Filed:** <repo>#<number>

```
<verbatim captured engine stdout>
```
````

- Header line is the literal string `**Filed:** <repo>#<number>`.
- `<repo>#<number>` is extracted from the engine's success payload (last stdout line OR a structured JSON field, depending on the engine's emission convention).
- Exactly one blank line separates the header from the fence.
- The engine's stdout is rendered verbatim — no reflow, reformat, re-align, re-decorate, or substitute.
- No additional summary, narration, or footer follows the fence.
- Exit code: `0`.
- Dedup hits (engine reused an existing issue) render under the SAME shape; the reuse indication is inside the fenced block. There is no separate "Reused:" header.

### Cancelled (non-affirmative `AskUserQuestion` outcome)

```text
Cancelled: /cockpit:bug
```

- One line, no fenced block.
- No echo of the title (the prompt UI already showed it).
- The engine was not invoked. No GitHub issue was created. No label was applied.
- Exit code: non-zero.

### Usage error (empty / whitespace-only `$ARGUMENTS`)

```text
Usage: /cockpit:bug <title-or-description>
```

- One line, no fenced block.
- The confirmation prompt was not shown; the engine was not invoked.
- Exit code: non-zero.

### Error — `MissingBinary`

Triggered when pre-flight `command -v generacy >/dev/null 2>&1` returned non-zero (before any engine invocation).

```text
The `generacy` CLI is required but is not on $PATH. Install it with `npm install -g @generacy-ai/cli` (or the prevailing install command) and retry.
```

- One line, no fenced block. (Byte-identical to the `/cockpit:status` and `/cockpit:queue` `MISSING_BINARY` line.)
- Exit code: non-zero.

### Error — `AuthFailure`

Triggered when engine exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i` (case-insensitive).

```text
Authentication failed. The `generacy` CLI uses `gh` for GitHub access — run `gh auth login` and retry.
```

- One line, no fenced block. (Byte-identical to the `/cockpit:status` and `/cockpit:queue` `AUTH_FAILURE` line.)
- Exit code: non-zero.

### Error — `Other`

Triggered when engine exit ≠ 0 and no earlier class matched. Includes engine errors such as "label `process:speckit-bugfix` could not be created", "repository not found", "rate limited", etc.

````markdown
Engine failed with exit code <N>.

```
<verbatim captured engine stderr>
```
````

- One line followed by a fenced block.
- Exit code: non-zero.

---

## Marker and label contract (engine-owned; informational)

The slash command does NOT write any of the following — they are listed here as the binding contract on the engine the slash command shells out to (sibling cockpit issues A2.1 / A2.5).

| Artifact | Format / value |
|----------|----------------|
| Label | Literal string `process:speckit-bugfix` applied to the issue. (Q2=C) |
| Hidden HTML marker | Single-line HTML comment in the issue body, format `<!-- generacy-bug: <sha256-of-trimmed-arguments> -->` where `<sha256-...>` is lowercase hex, 64 chars. (Q5=B) |
| Dedup scope | Open issues labelled `process:speckit-bugfix` in the target repo. Closed issues are NOT searched — re-filing a closed bug produces a new issue. |
| Body templating | Engine supplies a minimal body template. The slash command provides no body content. (Q1=A) |

---

## Side-effect contract

| Side effect | When |
|-------------|------|
| Invokes `AskUserQuestion` | Always, after structural validation passes — once per run |
| Invokes the bug-filing engine via Bash | Only after `AskUserQuestion` returned the literal string `Confirm` AND the pre-flight passed |
| Pre-flight `command -v generacy` | Always, after `Confirm`, before the engine call |
| Mutates any GitHub label | **Never directly.** The engine applies `process:speckit-bugfix`. |
| Mutates any GitHub issue body | **Never directly.** The engine writes the body and the hidden marker. |
| Posts any PR comment | Never |
| Reads or writes any file on disk | Never (the command does not access `specs/`, `.generacy/`, or any other repository file beyond what the Bash subprocess does on its own) |
| Runs any CLI other than the bug-filing engine | Never (the pre-flight `command -v generacy` does not invoke `generacy`) |

---

## Exit codes

| Outcome | Exit code |
|---------|-----------|
| Success — issue created (engine exit 0 after `Confirm`) | `0` |
| Success — existing issue reused via marker dedup (engine exit 0 after `Confirm`) | `0` |
| Usage error (empty `$ARGUMENTS`) | non-zero |
| Cancelled (non-affirmative `AskUserQuestion` outcome) | non-zero |
| `MissingBinary` | non-zero |
| `AuthFailure` | non-zero |
| `Other` (engine non-zero exit, anything else) | non-zero |

Exit code `0` indicates "the engine ran to completion with exit 0 after the user confirmed" — covers both the create-new and reuse-existing success paths. Any other state — including a user-initiated cancel — exits non-zero so scripted callers can distinguish success from any other terminal state with a single `$?` check.

---

## Compatibility & versioning

- The command's name (`cockpit:bug`), single freeform argument (`<title-or-description>`), confirmation primitive (`AskUserQuestion` with `Confirm` / `Cancel` options), confirmation-prompt copy (``File this as a `process:speckit-bugfix` issue?`` + title preview), and success header (`**Filed:** <repo>#<number>`) are stable v1 surface.
- The label string `process:speckit-bugfix` and the marker prefix `generacy-bug:` are stable v1 surface — changing either is a backward-incompatible change to the watch-stream classifier and the engine-side dedup. (Q2=C / Q5=B locked them.)
- Adding `--yes` / `-y` to bypass the confirmation is a backward-compatible change but explicitly **not** part of v1.
- The engine's stdout / stderr / exit-code semantics and the exact engine entry-point (sub-verb name vs MCP tool name) are owned by sibling cockpit issues A2.1 / A2.5, not by this command. Callers MUST NOT depend on the engine's stdout shape beyond "it is text suitable for rendering in a fenced code block, and `<repo>#<number>` is extractable for the success header."

---

## Reference: dependency contract (informational only)

### Bug-filing engine (A2.1 / A2.5)

- **Inputs**: one positional `<title>` argument (the full trimmed `$ARGUMENTS`). No flags consumed by this slash command.
- **Outputs**: text on stdout; text on stderr; integer exit code (0 = success; non-zero = failure). The success-path stdout MUST include `<repo>#<number>` in a form the host runtime can extract for the header — by convention, as the last stdout line (e.g. `Filed: generacy-ai/agency#360`) or as a structured JSON field.
- **Side effects**:
  - Creates a new GitHub issue (or reuses an existing one via marker dedup).
  - Applies the literal label `process:speckit-bugfix` to the issue.
  - Writes the hidden HTML marker `<!-- generacy-bug: <hash> -->` into the issue body.
  - Templates a minimal issue body around the marker.
  - Reads existing `process:speckit-bugfix` open issues for marker-based dedup.
- **Title validation**: the engine is the sole validator of title content. The slash command does not embed any title rules (length limits, character whitelists, banned strings).
- **Label management**: the engine creates the `process:speckit-bugfix` label in the target repo if it does not already exist. The slash command does not pre-flight the label.

This dependency is runtime-resolved. If the CLI binary is missing at call time, this command exits with `MissingBinary` and the engine is not invoked. If the binary is present but the bug-filing sub-verb / MCP tool is missing (e.g. installed `generacy` is too old), the engine's own "unknown subcommand" error is surfaced under `Other`.
