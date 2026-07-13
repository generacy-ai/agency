# Contract: `/cockpit:queue`

**Feature**: `/cockpit:queue` confirm-gated wrapper over `generacy cockpit queue <phase>` (A4.4)
**Branch**: `359-epic-generacy-ai-tetrad`
**Date**: 2026-06-29

This is the external contract of the slash command — the surface that calling developers and depending commands can rely on. It is binding on the implementation in `packages/claude-plugin-cockpit/commands/queue.md`.

---

## Invocation

```
/cockpit:queue <phase>
```

### Arguments

| Arg | Type | Required | Default | Valid values |
|-----|------|----------|---------|--------------|
| `<phase>` | string (single positional token) | yes | — | opaque to this command; validated by the CLI (`generacy cockpit queue`) |

### Structural validation (slash-command side)

The slash command tokenizes `$ARGUMENTS` on whitespace and performs two structural checks before invoking anything:

1. **Zero tokens** (empty / whitespace-only `$ARGUMENTS`) → emit `Usage: /cockpit:queue <phase>` and exit non-zero. No prompt, no CLI call.
2. **Two or more tokens** → emit the same `Usage: /cockpit:queue <phase>` and exit non-zero. No prompt, no CLI call.
3. **Exactly one token** → capture as `<phase>`, proceed to the confirmation step. The token is passed byte-for-byte to the CLI; no validation, parsing, normalization, or case-folding.

There is no `--help` flag. Bare invocation produces the `Usage:` line.

---

## Confirmation gate

After structural validation, the command calls `AskUserQuestion` with exactly:

| Field | Value |
|-------|-------|
| `question` | ``Run `generacy cockpit queue <phase>`?`` (literal; `<phase>` interpolated from the resolved token) |
| `header` | `Queue phase` |
| `multiSelect` | `false` |
| `options[0]` | `{ label: "Confirm", description: "Run the CLI" }` |
| `options[1]` | `{ label: "Cancel",  description: "Abort without queueing" }` |

**Affirmative outcome**: the user selected the option labelled `Confirm`.

**Non-affirmative outcome**: any other return from `AskUserQuestion`, including:
- the user selected `Cancel`;
- the user provided custom text via the host's auto-added "Other" option;
- the prompt was aborted or returned no selection;
- the host primitive returned anything that is not the literal string `Confirm`.

On non-affirmative outcomes, the command emits `Cancelled: /cockpit:queue <phase>` and exits non-zero. The CLI is **not** invoked.

---

## Behaviour — affirmative path

Reached only when `AskUserQuestion` returned the literal string `Confirm`.

1. **Pre-flight**: `command -v generacy >/dev/null 2>&1`. If non-zero, branch to the `MissingBinary` error path; do not invoke the CLI.
2. **CLI invocation**: from the repository root, run `generacy cockpit queue <phase>` via the Bash tool. Capture stdout, stderr, and the exit code in separate variables. Pass no flags.
3. **Success** (exit code `0`): emit the single header line `**Queued:** <phase>`, then one blank line, then captured stdout inside a triple-backtick fenced code block. Render stdout verbatim.
4. **Failure** (exit code ≠ 0): classify per the error table below and emit the matching response.

---

## Output schema

### Success (CLI exit 0 after `Confirm`)

````markdown
**Queued:** <phase>

```
<verbatim captured CLI stdout>
```
````

- Header line is the literal string `**Queued:** <phase>`.
- Exactly one blank line separates the header from the fence.
- The CLI's stdout is rendered verbatim — no reflow, reformat, re-align, re-decorate, or substitute.
- No additional summary, narration, or footer follows the fence.
- Exit code: `0`.

### Cancelled (non-affirmative `AskUserQuestion` outcome)

```text
Cancelled: /cockpit:queue <phase>
```

- One line, no fenced block.
- The CLI was not invoked.
- Exit code: non-zero.

### Usage error (zero tokens or two+ tokens in `$ARGUMENTS`)

```text
Usage: /cockpit:queue <phase>
```

- One line, no fenced block.
- The confirmation prompt was not shown; the CLI was not invoked.
- Exit code: non-zero.

### Error — `MissingBinary`

Triggered when pre-flight `command -v generacy >/dev/null 2>&1` returned non-zero (before any CLI invocation).

```text
The `generacy` CLI is required but is not on $PATH. Install it with `npm install -g @generacy-ai/cli` (or the prevailing install command) and retry.
```

- One line, no fenced block. (Byte-identical to the `/cockpit:status` `MISSING_BINARY` line.)
- Exit code: non-zero.

### Error — `AuthFailure`

Triggered when CLI exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i` (case-insensitive).

```text
Authentication failed. The `generacy` CLI uses `gh` for GitHub access — run `gh auth login` and retry.
```

- One line, no fenced block. (Byte-identical to the `/cockpit:status` `AUTH_FAILURE` line.)
- Exit code: non-zero.

### Error — `Other`

Triggered when CLI exit ≠ 0 and no earlier class matched. Includes unknown-phase rejections from the CLI.

````markdown
CLI failed with exit code <N>.

```
<verbatim captured CLI stderr>
```
````

- One line followed by a fenced block.
- Exit code: non-zero.

---

## Side-effect contract

| Side effect | When |
|-------------|------|
| Invokes `AskUserQuestion` | Always, after structural validation passes — once per run |
| Invokes `generacy cockpit queue <phase>` via Bash | Only after `AskUserQuestion` returned the literal string `Confirm` AND the pre-flight passed |
| Pre-flight `command -v generacy` | Always, after `Confirm`, before the CLI call |
| Mutates any GitHub label | **Never directly.** Any GitHub state change is performed by the CLI itself. |
| Posts any PR comment | Never |
| Reads or writes any file on disk | Never (the command does not access `specs/`, `.generacy/`, or any other repository file beyond what the Bash subprocess does on its own) |
| Runs any CLI other than `generacy cockpit queue <phase>` | Never (the pre-flight `command -v generacy` does not invoke `generacy`) |

---

## Exit codes

| Outcome | Exit code |
|---------|-----------|
| Success (CLI exited 0 after `Confirm`) | `0` |
| Usage error (zero / multi tokens) | non-zero |
| Cancelled (non-affirmative `AskUserQuestion` outcome) | non-zero |
| `MissingBinary` | non-zero |
| `AuthFailure` | non-zero |
| `Other` (CLI non-zero exit, anything else) | non-zero |

Exit code `0` indicates "the CLI ran to completion with exit 0 after the user confirmed." Any other state — including a user-initiated cancel — exits non-zero so scripted callers can distinguish success from any other terminal state with a single `$?` check.

---

## Compatibility & versioning

- The command's name (`cockpit:queue`), single positional argument (`<phase>`), confirmation primitive (`AskUserQuestion` with `Confirm` / `Cancel` options), confirmation-prompt copy (``Run `generacy cockpit queue <phase>`?``), and success header (`**Queued:** <phase>`) are stable v1 surface.
- Adding `--yes` / `-y` to bypass the confirmation is a backward-compatible change but explicitly **not** part of v1.
- The CLI's stdout / stderr / exit-code semantics are owned by `generacy cockpit queue` (sibling cockpit issue G3.2), not by this command. Callers MUST NOT depend on the CLI's stdout shape beyond "it is text suitable for rendering in a fenced code block."

---

## Reference: dependency contract (informational only)

### `generacy cockpit queue <phase>` (G3.2)

- **Inputs**: one positional `<phase>` argument; no flags consumed by this slash command.
- **Outputs**: text on stdout; text on stderr; integer exit code (0 = success; non-zero = failure).
- **Side effects**: owns the queue mutation. The slash command does not reimplement, retry, or compensate for any side effect.
- **Phase validation**: the CLI is the sole validator of `<phase>`. Unknown phases produce a non-zero exit and an actionable stderr message that the slash command surfaces under `Other`.

This dependency is runtime-resolved. If the CLI binary is missing at call time, this command exits with `MissingBinary` and the CLI is not invoked. If the CLI is present but the `cockpit queue` sub-verb is missing (e.g., installed `generacy` is too old), the CLI's own "unknown subcommand" error is surfaced under `Other`.
