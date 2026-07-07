---
description: Review a speckit gate — artifact (specify/clarify/plan/tasks) or impl PR diff — and advance on approval
arguments:
  - name: --gate
    description: "Gate name: specify, clarify, plan, tasks, or impl"
    required: true
---

# Review Command

Review the current epic's progress at one gate. For `--gate impl`, invoke Claude Code's built-in `/code-review` (the single documented cross-slash-command exception). For every other gate, read the corresponding artifact and produce a terse review summary. On approval, advance the gate by calling `generacy cockpit advance --gate <gate>` directly through the Bash tool.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Parse arguments** — Require `--gate <name>` where `<name>` ∈ `{ specify, clarify, plan, tasks, impl }`. If `--gate` is missing or the value is not in the set, print:

   ```
   Usage: /cockpit:review --gate <specify|clarify|plan|tasks|impl>
   ```

   Exit non-zero. Do not read files, do not call any CLI.

2. **Pre-flight** — `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` and stop.

3. **`--gate impl` branch** — Only when `--gate impl` is selected:
   - Invoke Claude Code's built-in `/code-review` slash command. This is the sole exception to the "no cross-slash-command invocation" rule; `/code-review` ships with Claude Code, so it is always present in any session where this plugin is installed.
   - Capture `/code-review`'s output verbatim as the review summary body.
   - Append (if not already present) a final line matching `Suggested decision: <approve|request-changes|abort>`. Derive: any blockers → `request-changes`; non-blocking findings only → `request-changes`; no findings → `approve`.

4. **Non-`impl` gate branch** — Only when `--gate` is one of `specify`, `clarify`, `plan`, `tasks`:
   - Read the corresponding artifact from the epic's spec directory (resolved by the CLI, not by this playbook): `spec.md`, `clarifications.md`, `plan.md`, or `tasks.md`.
   - Produce a terse three-section summary (`## Blockers`, `## Open questions`, `## Suggested decision`). Empty sections render as `- (none)`. End with a single `Suggested decision: <approve|request-changes|abort>` line. Do NOT invoke any other slash command.

5. **Approval prompt** — Invoke `AskUserQuestion` with one question and three options in this order:
   - `approve` — Advance the gate.
   - `request-changes` — Stop without advancing.
   - `abort` — Stop without advancing.

6. **Advance on approval** — Only when the user selects `approve`, run `generacy cockpit advance --gate <name>` via the Bash tool. On exit `0`, print one line `Labels: waiting-for:<name> → completed:<name>`. On non-zero CLI exit, apply the **Error handling** block below.

7. **No-op on non-approval** — On `request-changes` or `abort`, emit no `Labels:` line, mutate no state, and exit zero.

8. On any non-zero CLI exit, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install it with \`npm install -g @generacy-ai/generacy\`.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Examples

`/cockpit:review --gate impl` — invokes `/code-review` on the current epic's open PR, appends the `Suggested decision:` line, prompts for approval, and on `approve` runs `generacy cockpit advance --gate impl` via Bash.

`/cockpit:review --gate plan` — reads `plan.md`, produces a Blockers / Open questions / Suggested decision summary, prompts for approval, and on `approve` runs `generacy cockpit advance --gate plan` via Bash.
