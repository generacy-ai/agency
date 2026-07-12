---
description: Report the current status of an epic and its children
arguments:
  - name: epic
    description: "Epic reference (owner/repo#N, #N, or URL). Optional."
    required: false
---

# Status Command

Thin renderer over the `cockpit_status` MCP tool. Phase grouping, decoration, and per-child layout are the tool's responsibility; this verb renders the tool's return payload as the same dashboard layout the CLI used.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Argument handling** — Treat `$ARGUMENTS` as opaque. If non-empty, capture it as `<epic-ref>` and pass it to the tool in step 3 byte-for-byte. Do NOT validate, parse, normalize, expand, or reinterpret the argument — in particular, do NOT rewrite a bare `#N` into `owner/repo#N`; repo defaulting is the engine resolver's responsibility.
2. **No-arg case** — If `$ARGUMENTS` is empty (or whitespace-only), print the literal line `Usage: /cockpit:status <epic-ref>` and exit success without invoking the tool. Do NOT attempt to resolve the epic from the current branch, from `spec.md`, or from any other filesystem source.
3. **Tool invocation** — Call `cockpit_status(epic=<epic-ref>)` via the MCP tool binding. Consume the typed return.
4. **Output rendering** — On tool return success, print a single header line `**Status:** <epic-ref>` followed by a blank line and then render the tool's return payload as the same dashboard layout the CLI used. The tool's return is structured, so the renderer converts to the display shape: do NOT reflow, reformat, re-align columns, re-order rows, re-decorate per-child state, or substitute symbols beyond the CLI-shape rendering.
5. On any Bash CLI failure (defensively retained for future non-cockpit CLI invocations) or unhandled MCP tool typed error, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When a Bash CLI exit code is non-zero, a pre-flight fails, or an MCP tool returns an unhandled typed error, classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class. This block is retained defensively — post-#406 no Bash CLI is invoked from this playbook, but a future non-cockpit CLI invocation (e.g., `gh`) would reuse this block without change.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — a pre-flight for a required Bash CLI returned non-zero. Print: `A required CLI is required but is not on $PATH. In a Generacy cluster session common CLIs are already installed — add them to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install the specific CLI via your platform's package manager.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The required CLI needs GitHub access — run gh auth login and retry.`
- **OTHER** — anything else, including unhandled MCP tool typed errors. Print `CLI failed with exit code <N>.` (or, for typed errors, `Tool returned typed error <code>.`) on one line, followed by captured stderr / the typed error's `code`/`message`/`details` inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Examples

`/cockpit:status generacy-ai/tetrad-development#85` — explicit reference. Calls `cockpit_status(epic="generacy-ai/tetrad-development#85")` via the MCP tool and renders its dashboard payload inside the CLI-shaped display block.

`/cockpit:status` (no argument) — prints the usage line and exits without invoking the tool.
