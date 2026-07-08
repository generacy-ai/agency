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

3. **Fused analysis + approval prompt** —

   *The findings summary is delivered AS PART OF the same response that invokes `AskUserQuestion` — presenting findings in a response that does not invoke `AskUserQuestion` is a protocol violation. Do not end a response between completing the analysis and invoking the prompt.*

   Branch internally on `--gate`. Both sub-branches converge on ONE shared `AskUserQuestion` invocation, in the same response as the summary prose produced by the sub-branch above.

   **Sub-branch A — `--gate implementation-review`:**

   - Invoke Claude Code's built-in `/code-review` slash command. This is the sole exception to the "no cross-slash-command invocation" rule; `/code-review` ships with Claude Code, so it is always present in any session where this plugin is installed.
   - Capture `/code-review`'s output verbatim as the review summary body.
   - **Classify each finding.** For each finding `/code-review` emits, judge whether it describes a correctness / security / data-integrity failure scenario (⇒ `Blocking? Yes`) or a style / simplification / nit (⇒ `Blocking? No`). `/code-review` does not carry a stable machine-readable blocking marker; this classification is Claude's judgment, and it MUST be surfaced per-finding at the `AskUserQuestion` gate in this same step so the operator can override.
   - **MUST NOT print raw JSON under any circumstance.** If `/code-review` returns JSON, parse it and render the required summary table (below) before printing anything else. Raw JSON output from this step is a defect: the operator must see the findings-summary table, never `{"findings": …}` prose.
   - **Render a findings-summary table** as prose in the response body, immediately after the captured `/code-review` output, with the shape:

     | # | File:line | Finding | Blocking? |
     |---|-----------|---------|-----------|
     | 1 | <path>:<line> | <one-line finding summary> | Yes | No |

     One row per finding; the `Blocking?` cell is `Yes` or `No` per the classification above. If `/code-review` emitted no findings, render `| (none) | | | |` on a single row.
   - **Append a `Suggested decision: <approve|request-changes|abort>` line** derived from the table's `Blocking?` column:
     - Any `Yes` in the column → `Suggested decision: request-changes`.
     - All `No` (findings present, none blocking) → `Suggested decision: approve`. Non-blocking findings will be surfaced in the approval-review body at step 4, NOT as inline threads.
     - No findings → `Suggested decision: approve`.

   **Sub-branch B — `--gate` ∈ { `spec-review`, `clarification-review`, `plan-review`, `tasks-review` }:**

   - Read the corresponding artifact from the epic's spec directory (resolved by the CLI, not by this playbook): `spec.md`, `clarifications.md`, `plan.md`, or `tasks.md`.
   - Produce a terse three-section summary as prose in the response body:
     - `## Blockers`
     - `## Open questions`
     - `## Suggested decision`

     Empty sections render as `- (none)`.
   - Append a single `Suggested decision: <approve|request-changes|abort>` line. Do NOT invoke any other slash command.

   **Convergence — same response as the summary prose above:**

   Invoke `AskUserQuestion` with one question and three options in this exact order:

   - `approve` — Advance the gate.
   - `request-changes` — Post an `event: COMMENT` PR review with per-finding inline comments (step 5). Do NOT advance.
   - `abort` — Stop without advancing and without posting any review.

   The `question` field carries either:
   - **Normal case**: the findings-summary table (implementation-review) or the three-section summary (artifact-review), reproduced from the prose immediately above so the operator can see the classifications and reasoning before deciding.
   - **Digest fallback**: when the summary payload exceeds `AskUserQuestion`'s size budget (model judgment — rough guide ~4 KB; a playbook executor cannot count bytes accurately, so the trigger is judgment, not a hard threshold), the `question` field carries a compact digest instead. The digest MUST include: the artifact/PR identifier, the blocking finding count, the non-blocking finding count, and a "see table above" pointer that references the always-present prose above. Format is illustrative — e.g., `Review of PR #<n>: N findings (B blocking, NB non-blocking) — see table above` is one valid rendering.

   The response that invokes `AskUserQuestion` MUST also contain the prose summary above — never one without the other, never in separate turns. This is the fusion rule from the head of this step, restated at the point of the tool call.

   **Edge cases:**

   - **Zero findings (implementation-review)**: render the `| (none) | | | |` row in the table with `Suggested decision: approve`, and STILL invoke `AskUserQuestion` with the empty-row table inside `question`. Zero findings does not auto-advance; the operator still approves the gate.
   - **`/code-review` hard error**: route to the **Error handling** block below with class `OTHER`. Do NOT invoke `AskUserQuestion`. Do NOT emit any of the Terminal Outcome Check markers (`Labels:` / `Feedback posted:` / `Aborted:`). A decision prompt with no analysis behind it would manufacture consent; error-handling exit is a legitimate non-zero terminal outcome, and the fusion rule does not apply when there is no analysis result.

4. **Advance on approval** — Only when the user selects `approve`:
   - If the gate is `implementation-review` AND non-blocking findings were present in step 3's table, POST an `event: COMMENT` PR review via `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` with a `body` that lists the non-blocking findings as human-readable text (one paragraph per finding: `- <file>:<line> — <finding text>`). Do NOT include `comments[]`. <!-- Rationale: event: APPROVE is forbidden by GitHub on one's own PR (422 "Can not approve your own pull request") and is semantically empty on a self-PR anyway — approval on your own PR does not count toward branch-protection thresholds. event: COMMENT is permitted on one's own PR and, with no comments[], produces zero review threads, so PrFeedbackMonitorService stays quiet: the #382 semantic contract "inline threads = actionable feedback; body text = information" is preserved verbatim. self-APPROVE is forbidden by GitHub and semantically empty; revisit if multi-credential reviewer identities ever ship. -->
   - If the gate is `implementation-review` AND no findings were present, no PR review is posted (the CLI advance below is the only side effect).
   - For non-`implementation-review` gates, no PR review is posted (there is no PR at these gates).
   - Run `generacy cockpit advance --gate <name>` via the Bash tool. On exit `0`, print one line `Labels: waiting-for:<name> → completed:<name>`. On non-zero CLI exit, apply the **Error handling** block below.

5. **Post feedback on `request-changes`** — Only when the user selects `request-changes` AND the gate is `implementation-review`:
   - Construct a `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` POST body:
     - `event`: `COMMENT` (NOT `REQUEST_CHANGES` — GitHub blocks `REQUEST_CHANGES` on one's own PR; the Generacy cluster's single-credential model requires `COMMENT` here).
     - `body`: the literal string `N finding(s) requiring changes; see inline comments.` with `N` interpolated to the total finding count (both `Blocking? Yes` and `Blocking? No` count — the operator chose to request changes on the whole set).
     - `comments[]`: one entry per finding, each with `path` (the file), `line` (the line number from `/code-review`'s anchor), and `body` (the finding text). Side defaults to `RIGHT` (the head SHA's version); do not set `side` or `start_line` unless `/code-review` emits multi-line anchors.
   - Run the POST via the Bash tool. On exit `0`, print one line `Feedback posted: N inline comment(s) on PR #<pull_number>`. On non-zero exit, apply the **Error handling** block below.
   - Do NOT run `generacy cockpit advance`. Do NOT emit a `Labels:` line. <!-- The unresolved review threads posted by this step trip PrFeedbackMonitorService, which applies waiting-for:address-pr-feedback and enqueues fix work. That handler owns the label transition; this command must not race it. -->

   For gates other than `implementation-review`, `request-changes` is a no-op post-review-body: emit one line `Changes requested at <gate>; artifact reviewer will address feedback and re-request review.` and exit zero (no CLI, no `gh api`).

6. **No-op on `abort`** — On `abort`, emit no `Labels:` line, mutate no state, post no PR review, print a literal single line `Aborted: no changes to gate <gate>; no PR review posted.` (with `<gate>` interpolated to the argument's value), and exit zero. <!-- The `Aborted:` line is the Terminal Outcome Check's marker for the abort branch (FR-005); it is emitted only on this code path, so its presence transitively verifies the abort outcome without any state probe. -->

7. On any non-zero CLI exit, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install it with \`npm install -g @generacy-ai/generacy\`.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Examples

`/cockpit:review --gate implementation-review` — in a single response, invokes `/code-review` on the current epic's open PR, captures its output, classifies each finding as blocking / non-blocking, renders the findings-summary table as prose, appends the `Suggested decision:` line, AND invokes `AskUserQuestion` with the three options — all in the SAME turn (never split across turns; analysis and prompt arrive together). On `approve` with no findings, runs `generacy cockpit advance --gate implementation-review` via Bash. On `approve` with only non-blocking findings, POSTs an `event: COMMENT` PR review whose body lists those findings (no inline threads, so `PrFeedbackMonitorService` stays quiet) AND runs the CLI advance.

On the `request-changes` decision from that same invocation, POSTs an `event: COMMENT` PR review with `N finding(s) requiring changes; see inline comments.` and one inline anchored comment per finding, then STOPS without advancing (the resulting unresolved threads trip `PrFeedbackMonitorService`).

`/cockpit:review --gate plan-review` — in a single response, reads `plan.md`, produces the Blockers / Open questions / Suggested decision three-section summary as prose, appends the `Suggested decision:` line, AND invokes `AskUserQuestion` with the three options in the SAME response (never in a follow-up turn). On `approve` runs `generacy cockpit advance --gate plan-review` via Bash.

`/cockpit:review --gate impl` (or any value outside the accepted set) — emits `Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>` followed by `For \`clarification\`, use \`/cockpit:clarify\` — the answering gate is a different verb.`, and exits non-zero. No file read, no CLI call, no `gh api` call.

## Terminal Outcome Check

<!-- BEGIN terminal-check -->
**Terminal Outcome Check** — Before this command ends, exactly one of the following three markers MUST have been emitted in this session's output. Detection is text-emission-only: no `gh api` calls, no `generacy cockpit status` calls, no `gh pr view` calls, no state probes of any kind. Each marker is emitted by its own step only after that step's real side effect succeeds (or, in the abort case, only when the abort branch is taken), so verifying the emission verifies the outcome transitively.

- **approve** — Step 4 executed and printed a line matching `Labels: waiting-for:<gate> → completed:<gate>`.
- **request-changes** — Step 5 executed and printed a line matching `Feedback posted: N inline comment(s) on PR #<pull_number>`.
- **abort** — Step 6 executed and printed a line matching `Aborted: no changes to gate <gate>; no PR review posted.`.

If none of the three markers has been emitted, the command MUST NOT exit. Instead, re-invoke the fused step 3's `AskUserQuestion` invocation only (with the same three options), reusing the summary already present in the prior turn's response context — do NOT re-invoke `/code-review`, do NOT restart from the fused step 3's analysis, do NOT restart from step 1. The findings-summary table from the fused step 3 (or its three-section summary variant for artifact gates) is re-shown from session context; the sub-invocation is not repeated. The loop is unbounded: each iteration blocks on a human answer, so there is no runaway risk, and a retry cap would convert operator hesitation into a silent non-outcome — exactly this bug's failure mode.
<!-- Rationale: the primary gate-adherence guarantee — that the analysis and the `AskUserQuestion` prompt land in the SAME response — now lives structurally at the head of the fused step 3. The decay window between analysis and prompt is closed by construction rather than by this distant end-of-file reminder. This block covers a different decay window: between the operator's answer and the side-effect execution that emits the terminal marker across post-renumber steps 4–6 (advance / feedback-post / abort). Text-emission markers keyed to each terminal step's own side-effect-coupled emission provide a network-free fail-closed backstop for that downstream window. -->
<!-- END terminal-check -->
