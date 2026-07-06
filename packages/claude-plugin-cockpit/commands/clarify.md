---
description: Draft grounded answers for an epic's open clarifications, approve per-question, post, and advance the gate
arguments:
  - name: issue
    description: "Issue reference (bare integer, #N, or owner/repo#N). Optional; falls back to the current branch."
    required: false
---

# Clarify Command

Drive the assist loop for open clarification questions on an epic child issue: fetch grounded context via `generacy cockpit context`, draft one answer per question, present them for per-question approval via `AskUserQuestion`, post the approved subset as a single marker-prefixed GitHub comment, then — when every question has an approved answer — advance the clarification gate via `generacy cockpit advance`.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Resolve target issue** — Trim `$ARGUMENTS`; strip a leading `#`. If it parses to a positive integer, use it. Otherwise fall back to `git branch --show-current` and take the leading `<digits>-` prefix. If neither yields an integer, print `no child issue resolvable; pass <issue>` and exit non-zero. Qualify with the current repo's `nameWithOwner` (via `gh repo view --json nameWithOwner -q .nameWithOwner`) so downstream `generacy` calls are unambiguous.

2. **Pre-flight** — `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` and stop.

3. **Fetch context** — Invoke `generacy cockpit context <issue-ref>` via the Bash tool. This is the renamed successor to `clarify-context`; the old verb no longer exists. Handle:
   - Exit `0` → parse stdout as the JSON payload (open-question list, spec/plan bodies, touched files).
   - CLI reports "no open clarifications" (gate refusal, empty question list) → print `no open clarification questions for <issue-ref>` and exit zero without posting or advancing.
   - Any other non-zero exit → apply the **Error handling** block below.

4. **Draft answers** — For each open question, produce one drafted answer grounded in the fetched context (question's own context → spec body → plan body → touched files). Cite the source (`spec.md § Section`, `plan.md § Section`, or `<path>:<line>`) in a `provenance` field shown to the developer but not posted. When no citation is available, produce the stub `_no draft — insufficient context_` and flag the entry as ungrounded. Do NOT silently skip. Drafts are ~4–8 sentences each.

5. **Per-question approval** — For every drafted question, invoke `AskUserQuestion` with three options: `Approve` (post the drafted body verbatim), `Edit` (developer supplies revised text and we re-prompt for approval on the edited text), `Skip` (drop this answer from the run). Show a running pre-confirm summary before Step 6 with the tally and the remaining-pending count.

6. **Post comment** — Assemble the comment body byte-exactly with:
   - Line 1: `<!-- generacy-cockpit:clarification-answers -->` (no leading/trailing whitespace).
   - Line 2: blank.
   - Subsequent lines: one `### Q<n>` block per approved (or edited) answer, in ascending question-number order, separated by a single blank line.

   Write to a tempfile at `/tmp/cockpit-clarify-answers-<issue>-<unix_ts>.md`, then post with:

   ```bash
   gh issue comment "$ISSUE" --body-file /tmp/cockpit-clarify-answers-${ISSUE}-${UNIX_TS}.md
   ```

   Use `--body-file` exclusively — never `-b "…"` or `--body "…"` (shell quoting risks stripping the marker). If every decision was `Skip` (or edit-then-skip), print `all answers were skipped; no comment posted` and exit zero without posting or advancing.

7. **Advance gate** — Only when every open question has an approved (or edited-then-approved) answer AND step 6 posted successfully, run `generacy cockpit advance --gate clarification <issue-ref>` via the Bash tool. On exit `0`, print `posted <k> answers; clarification gate advanced for <issue-ref>` and exit zero. On non-zero, apply the **Error handling** block below (the comment stays live on the issue — do not attempt retraction). If some questions were skipped, print a status summary listing the pending question numbers with their verdicts and exit zero without advancing.

8. On any non-zero CLI exit, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. Install it with npm install -g @generacy-ai/cli (or the prevailing install command) and retry.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Examples

`/cockpit:clarify 353` — resolves to `<owner>/<repo>#353`, fetches its open clarifications, drafts one answer each, prompts per-question, posts the approved subset, and advances the clarification gate if every question was approved.

`/cockpit:clarify` (run from a branch like `353-…`) — resolves the issue from the branch name and follows the same flow.
