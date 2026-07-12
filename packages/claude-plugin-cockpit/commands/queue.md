---
description: Confirm-gated wrapper over the `cockpit_queue` MCP tool — assigns the phase's issues to the cluster account and applies the `process:speckit-feature` label.
arguments:
  - name: epic-ref
    description: "Epic reference. Opaque to this command; accepts a bare number, `owner/repo#N`, or a full URL — resolution is the tool's job (see generacy#822)."
    required: true
  - name: phase
    description: "Phase identifier to queue. Opaque to this command; consult the `cockpit_queue` tool schema for the authoritative phase enum."
    required: true
---

# Queue Command

Confirm-gated wrapper over the `cockpit_queue` MCP tool. Validates exactly two positional tokens, prompts via `AskUserQuestion` with `Confirm` / `Cancel` options describing the action (assign the phase's issues to the cluster account, apply the `process:speckit-feature` label), and — only when the user explicitly selects `Confirm` — invokes the tool and renders its return under a single `**Queued:** <phase> (<epic-ref>)` header line followed by a summary block.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Argument handling** — Read `$ARGUMENTS`. Trim only outer whitespace. Tokenize on whitespace.
   - If not exactly two tokens (zero, one, or three-plus) → emit the literal line `Usage: /cockpit:queue <epic-ref> <phase>` and exit non-zero. Do NOT invoke `AskUserQuestion`. Do NOT invoke the tool.
   - If exactly two tokens → capture the first as `<epic-ref>` byte-for-byte and the second as `<phase>` byte-for-byte. Do NOT validate, parse, normalize, lowercase, expand, or strip inner punctuation on either token.
2. **Confirmation gate** — Invoke `AskUserQuestion` with exactly one question:
   - `question`: the literal string ``Assign phase `<phase>`'s issues of `<epic-ref>` to the cluster account and add label `process:speckit-feature`?`` with `<epic-ref>` and `<phase>` interpolated from step 1.
   - `header`: `Queue phase`
   - `multiSelect`: `false`
   - `options`: exactly two, in this order:
     1. `{ label: "Confirm", description: "Call the cockpit_queue MCP tool" }`
     2. `{ label: "Cancel",  description: "Abort without queueing" }`
3. **Affirmative test** — Only the literal string `Confirm` is affirmative and proceeds to step 4. Any other return — `Cancel`, the platform's auto-added `Other` option (with or without custom text), an empty / aborted prompt, `null`, or anything else — is non-affirmative. Emit exactly one line: `Cancelled: /cockpit:queue <epic-ref> <phase>` (no fenced block). Exit non-zero. Do NOT invoke the tool.
4. **Tool invocation** (reached only when step 3 returned `Confirm`) — Call `cockpit_queue(epic=<epic-ref>, phase=<phase>)` via the MCP tool binding. Consume the typed return. <!-- No `--yes` flag — the tool has no interactive confirm; the `AskUserQuestion` in step 2 is the sole gate. -->
5. **Success rendering** (tool return success) — Print the single header line `**Queued:** <phase> (<epic-ref>)`, then one blank line, then render the tool's return payload as an equivalent summary block (fenced code block or the tool's dashboard shape — the tool's return is structured, so the renderer converts to the same display shape the CLI's stdout used). No additional summary, narration, or footer follows the fence. Exit zero.
6. On any Bash CLI failure (defensively retained for future non-cockpit CLI invocations) or unhandled MCP tool typed error, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When a Bash CLI exit code is non-zero, a pre-flight fails, or an MCP tool returns an unhandled typed error, classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class. This block is retained defensively — post-#406 no Bash CLI is invoked from this playbook, but a future non-cockpit CLI invocation (e.g., `gh`) would reuse this block without change.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — a pre-flight for a required Bash CLI returned non-zero. Print: `A required CLI is required but is not on $PATH. In a Generacy cluster session common CLIs are already installed — add them to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install the specific CLI via your platform's package manager.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The required CLI needs GitHub access — run gh auth login and retry.`
- **OTHER** — anything else, including unhandled MCP tool typed errors. Print `CLI failed with exit code <N>.` (or, for typed errors, `Tool returned typed error <code>.`) on one line, followed by captured stderr / the typed error's `code`/`message`/`details` inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Examples

`/cockpit:queue 1 P1` — two positionals: an epic ref (bare number `1`) and a phase (`P1`). Prompts with ``Assign phase `P1`'s issues of `1` to the cluster account and add label `process:speckit-feature`?``. On `Confirm`, calls `cockpit_queue(epic="1", phase="P1")` via the MCP tool and renders the tool's return payload under `**Queued:** P1 (1)`. On `Cancel` (or any non-`Confirm` outcome), emits `Cancelled: /cockpit:queue 1 P1` and exits non-zero without invoking the tool.

`/cockpit:queue` (no arguments) — emits `Usage: /cockpit:queue <epic-ref> <phase>` and exits non-zero. No prompt, no tool call. The same usage line is emitted for one-token calls (e.g. `/cockpit:queue P1`) and for three-plus-token calls (e.g. `/cockpit:queue 1 P1 extra`).
