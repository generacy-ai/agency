---
description: Review a speckit gate — artifact (spec-review/clarification-review/plan-review/tasks-review) or implementation-review PR diff — and advance on approval
arguments:
  - name: --gate
    description: "Gate name (one of: spec-review, clarification-review, plan-review, tasks-review, implementation-review). Everything else is rejected; for the `clarification` answering gate, use `/cockpit:clarify`."
    required: true
---

# Review Command

Review the current epic's progress at one gate. For `--gate implementation-review`, invoke Claude Code's built-in `/code-review` (the single documented cross-slash-command exception). For every other accepted gate, read the corresponding artifact and produce a terse review summary. On approval, advance the gate by calling `generacy cockpit advance --gate <gate>` directly through the Bash tool. On `request-changes`, post a `event: COMMENT` PR review with one inline anchored comment per finding, which trips the existing `PrFeedbackMonitorService` handler.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Parse arguments** — Require `--gate <name>` where `<name>` ∈ `{ spec-review, clarification-review, plan-review, tasks-review, implementation-review }`. If `--gate` is missing or the value is not in the set, print:

   ```
   Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>
   For `clarification`, use `/cockpit:clarify` — the answering gate is a different verb.
   ```

   Exit non-zero. Do not read files, do not call any CLI, do not call `gh api`.

2. **Pre-flight** — `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` and stop.

3. **`--gate implementation-review` branch** — Only when `--gate implementation-review` is selected:
   - Invoke Claude Code's built-in `/code-review` slash command. This is the sole exception to the "no cross-slash-command invocation" rule; `/code-review` ships with Claude Code, so it is always present in any session where this plugin is installed.
   - Capture `/code-review`'s output verbatim as the review summary body.
   - **Classify each finding.** For each finding `/code-review` emits, judge whether it describes a correctness / security / data-integrity failure scenario (⇒ `Blocking? Yes`) or a style / simplification / nit (⇒ `Blocking? No`). `/code-review` does not carry a stable machine-readable blocking marker; this classification is Claude's judgment, and it MUST be surfaced per-finding at the `AskUserQuestion` gate in step 5 so the operator can override.
   - **Render a findings-summary table** immediately after the captured `/code-review` output, with the shape:

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| 1 | <path>:<line> | <one-line finding summary> | Yes | No |

     One row per finding; the `Blocking?` cell is `Yes` or `No` per the classification above. If `/code-review` emitted no findings, render `| (none) | | | |` on a single row.
   - **Append a `Suggested decision: <approve|request-changes|abort>` line** derived from the table's `Blocking?` column:
     - Any `Yes` in the column → `Suggested decision: request-changes`.
     - All `No` (findings present, none blocking) → `Suggested decision: approve`. Non-blocking findings will be surfaced in the approval-review body at step 6, NOT as inline threads.
     - No findings → `Suggested decision: approve`.

4. **Non-`implementation-review` gate branch** — Only when `--gate` is one of `spec-review`, `clarification-review`, `plan-review`, `tasks-review`:
   - Read the corresponding artifact from the epic's spec directory (resolved by the CLI, not by this playbook): `spec.md`, `clarifications.md`, `plan.md`, or `tasks.md`.
   - Produce a terse three-section summary (`## Blockers`, `## Open questions`, `## Suggested decision`). Empty sections render as `- (none)`. End with a single `Suggested decision: <approve|request-changes|abort>` line. Do NOT invoke any other slash command.

5. **Approval prompt** — Invoke `AskUserQuestion` with one question and three options in this order:
   - `approve` — Advance the gate.
   - `request-changes` — Post a `event: COMMENT` PR review with per-finding inline comments (step 7). Do NOT advance.
   - `abort` — Stop without advancing and without posting any review.

   The prompt MUST display the findings-summary table from step 3 (`--gate implementation-review`) or the three-section summary from step 4 (other gates) so the operator can see the classifications and reasoning before deciding.

6. **Advance on approval** — Only when the user selects `approve`:
   - If the gate is `implementation-review` AND non-blocking findings were present in step 3's table, POST an `event: APPROVE` PR review via `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` with a `body` that lists the non-blocking findings as human-readable text (one paragraph per finding: `- <file>:<line> — <finding text>`). Do NOT include `comments[]`. Do NOT post an accompanying `event: COMMENT` review. <!-- Rationale: PrFeedbackMonitorService triggers on unresolved review THREADS. Posting inline threads on approve would apply waiting-for:address-pr-feedback and enqueue fix work on the PR we are approving. Body-only preserves the semantic "inline threads = actionable feedback; body text = information." -->
   - If the gate is `implementation-review` AND no findings were present, no PR review is posted (the CLI advance below is the only side effect).
   - For non-`implementation-review` gates, no PR review is posted (there is no PR at these gates).
   - Run `generacy cockpit advance --gate <name>` via the Bash tool. On exit `0`, print one line `Labels: waiting-for:<name> → completed:<name>`. On non-zero CLI exit, apply the **Error handling** block below.

7. **Post feedback on `request-changes`** — Only when the user selects `request-changes` AND the gate is `implementation-review`:
   - Construct a `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` POST body:
     - `event`: `COMMENT` (NOT `REQUEST_CHANGES` — GitHub blocks `REQUEST_CHANGES` on one's own PR; the Generacy cluster's single-credential model requires `COMMENT` here).
     - `body`: the literal string `N finding(s) requiring changes; see inline comments.` with `N` interpolated to the total finding count (both `Blocking? Yes` and `Blocking? No` count — the operator chose to request changes on the whole set).
     - `comments[]`: one entry per finding, each with `path` (the file), `line` (the line number from `/code-review`'s anchor), and `body` (the finding text). Side defaults to `RIGHT` (the head SHA's version); do not set `side` or `start_line` unless `/code-review` emits multi-line anchors.
   - Run the POST via the Bash tool. On exit `0`, print one line `Feedback posted: N inline comment(s) on PR #<pull_number>`. On non-zero exit, apply the **Error handling** block below.
   - Do NOT run `generacy cockpit advance`. Do NOT emit a `Labels:` line. <!-- The unresolved review threads posted by this step trip PrFeedbackMonitorService, which applies waiting-for:address-pr-feedback and enqueues fix work. That handler owns the label transition; this command must not race it. -->

   For gates other than `implementation-review`, `request-changes` is a no-op post-review-body: emit one line `Changes requested at <gate>; artifact reviewer will address feedback and re-request review.` and exit zero (no CLI, no `gh api`).

8. **No-op on `abort`** — On `abort`, emit no `Labels:` line, mutate no state, post no PR review, and exit zero.

9. On any non-zero CLI exit, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install it with \`npm install -g @generacy-ai/generacy\`.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Examples

`/cockpit:review --gate implementation-review` — invokes `/code-review` on the current epic's open PR, classifies each finding as blocking / non-blocking, appends a `Suggested decision:` line, and prompts for approval with a findings-summary table visible. On `approve` with no findings, runs `generacy cockpit advance --gate implementation-review` via Bash. On `approve` with only non-blocking findings, POSTs an `event: APPROVE` PR review whose body lists those findings (no inline threads) AND runs the CLI advance.

On the `request-changes` decision from that same invocation, POSTs an `event: COMMENT` PR review with `N finding(s) requiring changes; see inline comments.` and one inline anchored comment per finding, then STOPS without advancing (the resulting unresolved threads trip `PrFeedbackMonitorService`).

`/cockpit:review --gate plan-review` — reads `plan.md`, produces a Blockers / Open questions / Suggested decision summary, prompts for approval, and on `approve` runs `generacy cockpit advance --gate plan-review` via Bash.

`/cockpit:review --gate impl` (or any value outside the accepted set) — emits `Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>` followed by `For \`clarification\`, use \`/cockpit:clarify\` — the answering gate is a different verb.`, and exits non-zero. No file read, no CLI call, no `gh api` call.
