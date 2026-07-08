# Contract: `commands/review.md` — required strings after rewrite

**Feature**: 382-found-during-cockpit-v1
**File under contract**: `packages/claude-plugin-cockpit/commands/review.md`
**Consumers**: The Claude Code harness (reads the file as a slash-command prompt at invocation time), the user (reads the printed output), and — indirectly — `PrFeedbackMonitorService` (observes the review threads this command posts).
**Purpose**: Capture, section by section, the exact strings the rewritten file MUST contain. This is the reference the quickstart, code review, and any future drift check hangs off.

Backticks in this document are Markdown code spans; every literal that must appear in `review.md` byte-for-byte is enclosed in a fenced code block. The prompt text uses ASCII quotes and a single em dash `—` where indicated; smart quotes / en dashes are drift.

## §1 Frontmatter

The file's YAML frontmatter must declare `--gate` with a description enumerating exactly the five accepted CLI review tokens:

```yaml
---
description: Review a speckit gate — artifact (spec-review/clarification-review/plan-review/tasks-review) or implementation-review PR diff — and advance on approval
arguments:
  - name: --gate
    description: "Gate name (one of: spec-review, clarification-review, plan-review, tasks-review, implementation-review). Everything else is rejected; for the `clarification` answering gate, use `/cockpit:clarify`."
    required: true
---
```

Verification:
- `grep -c "spec-review\|clarification-review\|plan-review\|tasks-review\|implementation-review" packages/claude-plugin-cockpit/commands/review.md` MUST report at least 5 (once per token in the frontmatter enumeration; more in the body).
- `grep -n "impl " packages/claude-plugin-cockpit/commands/review.md` MUST report 0 hits for the bare word `impl` used as a gate value. (The word "implementation" contains no `impl` at a word boundary since `impl` is followed by `e`, but a grep for the standalone token `impl` — with trailing whitespace — surfaces any stale shorthand.)

## §2 H1 body — the paragraph immediately under `# Review Command`

```markdown
Review the current epic's progress at one gate. For `--gate implementation-review`, invoke Claude Code's built-in `/code-review` (the single documented cross-slash-command exception). For every other accepted gate, read the corresponding artifact and produce a terse review summary. On approval, advance the gate by calling `generacy cockpit advance --gate <gate>` directly through the Bash tool. On `request-changes`, post a `event: COMMENT` PR review with one inline anchored comment per finding, which trips the existing `PrFeedbackMonitorService` handler.
```

## §3 Step 1 — Parse arguments (usage-line gate)

```markdown
1. **Parse arguments** — Require `--gate <name>` where `<name>` ∈ `{ spec-review, clarification-review, plan-review, tasks-review, implementation-review }`. If `--gate` is missing or the value is not in the set, print:

   ```
   Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>
   For `clarification`, use `/cockpit:clarify` — the answering gate is a different verb.
   ```

   Exit non-zero. Do not read files, do not call any CLI, do not call `gh api`.
```

Verification:
- `grep -c "Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 (this gate; possibly repeated in Examples).
- `grep -c "For \`clarification\`, use \`/cockpit:clarify\`" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1.

## §4 Step 2 — Pre-flight

Preserved from the current file, byte-for-byte:

```markdown
2. **Pre-flight** — `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` and stop.
```

## §5 Step 3 — `--gate implementation-review` branch (renamed from `--gate impl`); findings-summary table; Suggested-decision derivation

```markdown
3. **`--gate implementation-review` branch** — Only when `--gate implementation-review` is selected:
   - Invoke Claude Code's built-in `/code-review` slash command. This is the sole exception to the "no cross-slash-command invocation" rule; `/code-review` ships with Claude Code, so it is always present in any session where this plugin is installed.
   - Capture `/code-review`'s output verbatim as the review summary body.
   - **Classify each finding.** For each finding `/code-review` emits, judge whether it describes a correctness / security / data-integrity failure scenario (⇒ `Blocking? Yes`) or a style / simplification / nit (⇒ `Blocking? No`). `/code-review` does not carry a stable machine-readable blocking marker; this classification is Claude's judgment, and it MUST be surfaced per-finding at the `AskUserQuestion` gate in step 5 so the operator can override.
   - **Render a findings-summary table** immediately after the captured `/code-review` output:

     ```
     | # | File:line | Finding | Blocking? |
     |---|-----------|---------|-----------|
     | 1 | <path>:<line> | <one-line finding summary> | Yes | No |
     ...
     ```

     One row per finding; the `Blocking?` cell is `Yes` or `No` per the classification above. If `/code-review` emitted no findings, render `| (none) | | | |` on a single row.
   - **Append a `Suggested decision: <approve|request-changes|abort>` line** derived from the table's `Blocking?` column:
     - Any `Yes` in the column → `Suggested decision: request-changes`.
     - All `No` (findings present, none blocking) → `Suggested decision: approve`. Non-blocking findings will be surfaced in the approval-review body at step 6, NOT as inline threads.
     - No findings → `Suggested decision: approve`.
```

Verification:
- `grep -c "Blocking?" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 (once in the table header, at least once in the derivation rules narrative).
- `grep -c "All \`No\` (findings present, none blocking) → \`Suggested decision: approve\`" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 — the corrected middle-rule (the bug this fix resolves).
- `grep -n "non-blocking findings only → \`request-changes\`" packages/claude-plugin-cockpit/commands/review.md` MUST report 0 — the pre-fix contradictory rule must be gone.

## §6 Step 4 — Non-`impl` gate branch (renamed to non-implementation-review)

```markdown
4. **Non-`implementation-review` gate branch** — Only when `--gate` is one of `spec-review`, `clarification-review`, `plan-review`, `tasks-review`:
   - Read the corresponding artifact from the epic's spec directory (resolved by the CLI, not by this playbook): `spec.md`, `clarifications.md`, `plan.md`, or `tasks.md`.
   - Produce a terse three-section summary (`## Blockers`, `## Open questions`, `## Suggested decision`). Empty sections render as `- (none)`. End with a single `Suggested decision: <approve|request-changes|abort>` line. Do NOT invoke any other slash command.
```

## §7 Step 5 — Approval prompt

```markdown
5. **Approval prompt** — Invoke `AskUserQuestion` with one question and three options in this order:
   - `approve` — Advance the gate.
   - `request-changes` — Post a `event: COMMENT` PR review with per-finding inline comments (step 7). Do NOT advance.
   - `abort` — Stop without advancing and without posting any review.

   The prompt MUST display the findings-summary table from step 3 (`--gate implementation-review`) or the three-section summary from step 4 (other gates) so the operator can see the classifications and reasoning before deciding.
```

## §8 Step 6 — Advance on `approve`; non-blocking findings surfaced in the APPROVE-event review body only

```markdown
6. **Advance on approval** — Only when the user selects `approve`:
   - If the gate is `implementation-review` AND non-blocking findings were present in step 3's table, POST an `event: APPROVE` PR review via `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` with a `body` that lists the non-blocking findings as human-readable text (one paragraph per finding: `- <file>:<line> — <finding text>`). Do NOT include `comments[]`. Do NOT post an accompanying `event: COMMENT` review. <!-- Rationale: PrFeedbackMonitorService triggers on unresolved review THREADS. Posting inline threads on approve would apply waiting-for:address-pr-feedback and enqueue fix work on the PR we are approving. Body-only preserves the semantic "inline threads = actionable feedback; body text = information." -->
   - If the gate is `implementation-review` AND no findings were present, no PR review is posted (the CLI advance below is the only side effect).
   - For non-`implementation-review` gates, no PR review is posted (there is no PR at these gates).
   - Run `generacy cockpit advance --gate <name>` via the Bash tool. On exit `0`, print one line `Labels: waiting-for:<name> → completed:<name>`. On non-zero CLI exit, apply the **Error handling** block below.
```

Verification:
- `grep -c "event: APPROVE" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1.
- `grep -c "PrFeedbackMonitorService triggers on unresolved review THREADS" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 (the inline `<!-- ... -->` rationale note).
- `grep -c "Do NOT include \`comments\[\]\`" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1.

## §9 Step 7 — `request-changes` posts a `event: COMMENT` PR review with inline anchored comments

```markdown
7. **Post feedback on `request-changes`** — Only when the user selects `request-changes` AND the gate is `implementation-review`:
   - Construct a `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` POST body:
     - `event`: `COMMENT` (NOT `REQUEST_CHANGES` — GitHub blocks `REQUEST_CHANGES` on one's own PR; the Generacy cluster's single-credential model requires `COMMENT` here).
     - `body`: the literal string `N finding(s) requiring changes; see inline comments.` with `N` interpolated to the total finding count (both `Blocking? Yes` and `Blocking? No` count — the operator chose to request changes on the whole set).
     - `comments[]`: one entry per finding, each with `path` (the file), `line` (the line number from `/code-review`'s anchor), and `body` (the finding text). Side defaults to `RIGHT` (the head SHA's version); do not set `side` or `start_line` unless `/code-review` emits multi-line anchors.
   - Run the POST via the Bash tool. On exit `0`, print one line `Feedback posted: N inline comment(s) on PR #<pull_number>`. On non-zero exit, apply the **Error handling** block below.
   - Do NOT run `generacy cockpit advance`. Do NOT emit a `Labels:` line. <!-- The unresolved review threads posted by this step trip PrFeedbackMonitorService, which applies waiting-for:address-pr-feedback and enqueues fix work. That handler owns the label transition; this command must not race it. -->

   For gates other than `implementation-review`, `request-changes` is a no-op post-review-body: emit one line `Changes requested at <gate>; artifact reviewer will address feedback and re-request review.` and exit zero (no CLI, no `gh api`).
```

Verification:
- `grep -c "event: COMMENT" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1.
- `grep -c "gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1.
- `grep -c "N finding(s) requiring changes; see inline comments." packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1.
- `grep -c "waiting-for:address-pr-feedback" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 (inside the inline `<!-- ... -->` rationale note).
- `grep -c "PrFeedbackMonitorService" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 (once in step 6's approve-body rationale, once in step 7's request-changes rationale).

## §10 Step 8 — No-op on `abort`

```markdown
8. **No-op on `abort`** — On `abort`, emit no `Labels:` line, mutate no state, post no PR review, and exit zero.
```

## §11 Step 9 — Error handling routing

Preserved from the current file, byte-for-byte:

```markdown
9. On any non-zero CLI exit, apply the **Error handling** block below.
```

## §12 Error handling block (unchanged from current file)

The block from `<!-- BEGIN error-conv -->` through `<!-- END error-conv -->` is preserved byte-for-byte. The `Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling` marker line and the three list items (MISSING_BINARY / AUTH_FAILURE / OTHER) are NOT edited by this fix.

Verification: `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md)` MUST return empty output.

## §13 Examples section

```markdown
## Examples

`/cockpit:review --gate implementation-review` — invokes `/code-review` on the current epic's open PR, classifies each finding as blocking / non-blocking, appends a `Suggested decision:` line, and prompts for approval with a findings-summary table visible. On `approve` with no findings, runs `generacy cockpit advance --gate implementation-review` via Bash. On `approve` with non-blocking findings only, POSTs an `event: APPROVE` PR review whose body lists the non-blocking findings (no inline threads) AND runs the CLI advance. On `request-changes`, POSTs an `event: COMMENT` PR review with `N finding(s) requiring changes; see inline comments.` and one inline anchored comment per finding, then STOPS without advancing (the resulting unresolved threads trip `PrFeedbackMonitorService`).

`/cockpit:review --gate plan-review` — reads `plan.md`, produces a Blockers / Open questions / Suggested decision summary, prompts for approval, and on `approve` runs `generacy cockpit advance --gate plan-review` via Bash.

`/cockpit:review --gate impl` (or any value outside the accepted set) — emits `Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>` followed by `For \`clarification\`, use \`/cockpit:clarify\` — the answering gate is a different verb.`, and exits non-zero. No file read, no CLI call, no `gh api` call.
```

Verification:
- `grep -c "/cockpit:review --gate implementation-review" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 (H1 body, plus the Examples section; possibly more).
- `grep -c "/cockpit:review --gate plan-review" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1.

## Removed strings

The following strings from the current file MUST NOT appear in the rewritten file:

| Removed | Why |
|---|---|
| `` `--gate impl` `` (as a documented accepted value in the frontmatter or body) | Wrong CLI vocabulary — five verbatim tokens replace it (spec Summary §1, FR-002). |
| `` `<name>` ∈ `{ specify, clarify, plan, tasks, impl }` `` | Wrong enumeration — five verbatim CLI tokens replace it (FR-002). |
| `Usage: /cockpit:review --gate <specify|clarify|plan|tasks|impl>` | Wrong usage line (FR-002). |
| `non-blocking findings only → \`request-changes\`` (as a rule in step 3) | The contradiction this fix resolves (spec Summary §3, FR-006). |
| `` on `request-changes`, "emit no `Labels:` line, mutate no state, exit zero" — a silent no-op `` (or any wording that describes step 7 as a no-op) | Wrong signaling — must post a `event: COMMENT` review to trigger `PrFeedbackMonitorService` (spec Summary §2, FR-004). |
| `waiting-for:<gate>-review` in body prose that implies substitution (e.g. header mapping `waiting-for:<gate>-review → /cockpit:review --gate <gate>`) | Wrong vocabulary — five explicit tokens replace substitution (FR-005 for watch.md; parallel spirit in review.md's body). |

Verification: `grep -nE "'--gate impl'|<specify\\|clarify\\|plan\\|tasks\\|impl>|non-blocking findings only → \`request-changes\`" packages/claude-plugin-cockpit/commands/review.md` MUST report 0 hits (all three stale strings gone).

## Byte-fidelity notes

- ASCII quotes throughout (`"..."`, `'...'`). No smart quotes.
- Em dash `—` (U+2014) is used in the H1 body sentence and in the two inline `<!-- ... -->` rationale notes. No en dash `–`.
- Inline code spans use single backticks; fenced code blocks use triple backticks.
- Every literal `<name>`, `<gate>`, `<pull_number>`, `{owner}`, `{repo}` in the *documentation of the command* is a template placeholder. In emitted output (`Usage:`, `Labels:`, `Feedback posted:`), placeholders are literal (they appear verbatim in the printed output, exactly as the current file's placeholders do — `<gate>` in `Labels: waiting-for:<gate> → completed:<gate>` was already a literal in the current file).
- The `AskUserQuestion` question text (step 5) is not fixed to a single canonical string in this contract — it varies by gate (implementation-review shows the findings table; other gates show the three-section summary) — but the visible ordering of options MUST be `approve`, `request-changes`, `abort` (FR-006, step 5 of §7 above).
- `event: COMMENT`, `event: APPROVE`, `event: REQUEST_CHANGES` are literals from GitHub's REST API. The plugin's markdown uses them in code spans exactly as written above; do not lowercase or reformat.
