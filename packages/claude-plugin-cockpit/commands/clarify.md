---
description: Draft grounded answers for an epic's open clarifications, approve via a batched gate, post, and advance the gate
arguments:
  - name: issue
    description: "Issue reference (bare integer, #N, or owner/repo#N). Optional; falls back to the current branch."
    required: false
---

# Clarify Command

Drive the assist loop for open clarification questions on an epic child issue: fetch grounded context via the `cockpit_context` MCP tool, draft one answer per question, present them together for batched approval via a single `AskUserQuestion`, post the approved subset as one marker-prefixed GitHub comment, then — when every question has an approved answer — advance the clarification gate via the `cockpit_advance` MCP tool.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Resolve target issue** — Trim `$ARGUMENTS`; strip a leading `#`. If it parses to a positive integer, use it. Otherwise fall back to `git branch --show-current` and take the leading `<digits>-` prefix. If neither yields an integer, print `no child issue resolvable; pass <issue>` and exit non-zero. Qualify with the current repo's `nameWithOwner` (via `gh repo view --json nameWithOwner -q .nameWithOwner`) so downstream tool calls are unambiguous.

2. **Pre-flight** — `command -v gh >/dev/null 2>&1` (the sole remaining Bash CLI in this playbook, used at step 6 for comment posting). If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` and stop.

3. **Fetch context** — Call `cockpit_context(issue=<issue-ref>)` via the MCP tool binding. Handle:
   - Success → consume the tool's return payload (open-question list, spec/plan bodies, touched files, and the raw `clarificationComment.body` — the engine-authored batch template).
   - Typed error `code: "no-open-clarifications"` → print `no open clarification questions for <issue-ref>` and exit zero without posting or advancing.
   - Any other typed error → apply the **Error handling** block below with class `OTHER`, quoting the tool's `code`/`message`/`details` inside a triple-backtick fenced code block.

4. **Draft answers** — For each open question, produce one drafted answer grounded in the fetched context (question's own context → spec body → plan body → touched files). Return one entry per open question with the shape `{question_id, recommendation, justification, provenance}`:
   - `recommendation` — the chosen letter + its text (for lettered-option questions) OR the drafted free-form response (for free-form questions), ~1-3 sentences of prose.
   - `justification` — 1–3 sentences of the *why over alternatives*, not a restatement of `recommendation`. Rendered under `**Why:**` in the presentation and posted as `**Rationale:** <justification>` in the marker comment.
   - `provenance` — a citation (`spec.md § Section`, `plan.md § Section`, or `<path>:<line>`) shown to the operator but not posted. When no citation is available, produce the stub `_no draft — insufficient context_` for `recommendation`, an empty `justification`, and an empty `provenance`; flag the entry as ungrounded. Do NOT silently skip.

5. **Batched approval** — Parse the fetched `clarificationComment.body` into per-question `{title, context, question, options}` records per the shared batch-comment rule: each `### Q<n>: <title>` header opens a question block; within it, `**Context**:`, `**Question**:`, and `**Options**:` label the fields; option bullets match `/^\s*-?\s*([A-Z])[:)]\s+(.+)$/` (mildly tolerant of both `A:` and `A)` styles observed on live comments). Free-form questions (no `**Options**:` label) yield `options: null`. Then present a single batch-gate response containing both the presentation block and one `AskUserQuestion` call:

   **Presentation block** (in the same assistant response as the `AskUserQuestion` call):

   ```markdown
   Drafted answers for <issue-ref> (<N> open questions):

   ### Q<n> — <title from batch comment>
   **Context:** <framing from batch comment, verbatim/condensed>
   **Question:** <question verbatim>
   **Options:** <lettered options as posted (A — …, B — …); or "(free-form — no options posted)">
   **Recommendation:** <chosen letter + its text, or the drafted free-form response>
   **Why:** <1–3 sentences justifying the recommendation over the other options>
   _provenance: <citation>_

   (repeat per open question — one block per Q, separated by a blank line)
   ```

   **Free-form no-options placeholder**: when a question has `options: null`, the renderer MUST emit the literal string `**Options:** (free-form — no options posted)` — the five-element structure is a fixed shape; the placeholder makes the absence explicit rather than dropping the line.

   **Title fallback**: when the batch header lacks a title (`### Q<n>` instead of `### Q<n>: <title>`), substitute `q.question.split('\n')[0].slice(0, 80)` (no ellipsis). The canonical path uses the header title verbatim; the fallback is defense-in-depth against a future engine template that omits titles.

   **Gate invocation** (single `AskUserQuestion` call in the same response, never `ceil(N/4)` and never per-question):
   - **Question text**: `Post all <N> drafted answers to <issue-ref>?`
   - **Header**: `Clarify` (≤ 12 chars)
   - **multiSelect**: `false`
   - **Options** (exactly three, discrete, in this order):
     1. `Approve all & post (Recommended)` — post every drafted answer as-is.
     2. `Make changes` — enter the re-loop (see § Directive grammar): parse operator-typed directives from a follow-up prompt, apply them, re-present only the changed questions plus the same three-option batch gate, loop until Approve or Skip. Zero directives is a no-op re-present.
     3. `Skip this batch` — post nothing; do not advance; ledger line noting the skip.

   The built-in `"Other"` free-text channel is the **one-turn edit path**: directives typed there are parsed via the same rule (see § Directive grammar) and applied directly to the drafted answers (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip.

6. **Post comment** — Assemble the comment body byte-exactly with:
   - Line 1: `<!-- generacy-cockpit:clarification-answers -->` (no leading/trailing whitespace).
   - Line 2: blank.
   - Subsequent lines: one `### Q<n>` block per approved (or edited) answer, in ascending question-number order, separated by a single blank line. Each block emits `**Answer:** <recommendation>` on one line and, on the next line, `**Rationale:** <justification>`. Read the `recommendation` and `justification` fields from step 4's drafter return; the assembly step reads the same fields the presentation block renders, so display and posted content cannot drift. For bare-letter operator overrides (a directive whose `rationale` is `null` per § Directive grammar), emit NO `**Rationale:**` line at all — never retain the draft's justification under an operator-overridden answer, because it would argue for a different choice. Skipped questions do not appear in the comment.

   Write to a tempfile at `/tmp/cockpit-clarify-answers-<issue>-<unix_ts>.md`, then post with:

   ```bash
   gh issue comment "$ISSUE" --body-file /tmp/cockpit-clarify-answers-${ISSUE}-${UNIX_TS}.md
   ```

   Use `--body-file` exclusively — never `-b "…"` or `--body "…"` (shell quoting risks stripping the marker). If every decision was `Skip this batch` (or every question was skipped via directives), print `all answers were skipped; no comment posted` and exit zero without posting or advancing.

7. **Advance gate** — Only when every open question has an approved (or edited-then-approved) answer AND step 6 posted successfully, call `cockpit_advance(issue=<issue-ref>, gate="clarification")` via the MCP tool binding. On success, print `posted <k> answers; clarification gate advanced for <issue-ref>` and exit zero. On typed error, apply the **Error handling** block below with class `OTHER` (the comment stays live on the issue — do not attempt retraction). If some questions were skipped, print a status summary listing the pending question numbers with their verdicts and exit zero without advancing.

8. On any non-zero Bash CLI exit (from `gh` at step 6) or unhandled MCP tool typed error, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When a Bash CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v gh` returned non-zero (a required CLI — `gh` for issue comment posting — is not installed). Print: `A required CLI (\`gh\` for issue comment posting) is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install it via your platform's package manager (e.g., \`brew install gh\`).`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. \`gh\` requires GitHub access — run gh auth login and retry.`
- **OTHER** — anything else, including unhandled MCP tool typed errors. Print `CLI failed with exit code <N>.` (or, for typed errors, `Tool returned typed error <code>.`) on one line, followed by captured stderr / the typed error's `code`/`message`/`details` inside a triple-backtick fenced code block.
<!-- END error-conv -->

### Directive grammar

Both `Make changes` and the "Other" free-text path parse per-question directives identically, using a `Q<n>:` token-anchored rule.

**Rule**: A new directive begins at each `Q<n>:` token. Split the input at `Q<n>:` occurrences; each directive's payload runs from the token to the next token or end of input.

**Documented forms** (both parse identically under the rule):

- Newline-separated (canonical):
  ```
  Q2: B
  Q4: skip
  ```
- Single-line semicolon (a verbatim replacement's text may itself contain semicolons; the token rule doesn't mis-split it):
  ```
  Q2: B; Q4: skip
  ```

**Payload forms**:

- `Q<n>: <letter>` — bare letter (matching an option from the parsed batch comment) resolves to that option's text. The answer posts with **no rationale line** — never retain the draft's justification under an operator-overridden answer, because it would argue for a different choice.
- `Q<n>: <letter> — <reason>` — letter resolves to option text, and `<reason>` replaces the justification.
- `Q<n>: skip` — excludes that question from the posted batch and blocks advance.
- Anything else — treated as verbatim replacement text for the answer, posted as-is.

**Applied identically in two paths**:

- **`Make changes` re-loop** — the operator's turn collects directives typed in a follow-up prompt or in the initial `AskUserQuestion` "Other" field; the loop re-presents only changed questions plus the same batch gate; loops until Approve or Skip.
- **"Other" free-text on the batch gate** — the operator's replacement text is applied directly (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip.

Zero directives from a `Make changes` turn is a no-op: re-present the entire batch and fire the same gate again (never auto-approve or auto-skip on empty input).

## Examples

`/cockpit:clarify 353` — resolves to `<owner>/<repo>#353`, fetches its open clarifications, drafts one answer each, presents the batched five-element gate, posts the approved subset, and advances the clarification gate if every question was approved.

`/cockpit:clarify` (run from a branch like `353-…`) — resolves the issue from the branch name and follows the same flow.
