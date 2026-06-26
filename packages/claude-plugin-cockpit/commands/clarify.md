---
description: Drive clarification flow against an epic's open questions
---

# Cockpit Clarify

Draft answers to an epic child issue's open clarification questions, present them for developer approval, post the approved subset back to the issue as a single marker-prefixed comment, and — only when every open question has an approved answer — advance the `clarification` gate via `generacy cockpit advance`. The verb is read-mostly until Step 5: it shells out to `generacy cockpit clarify-context` for source-of-truth context, never reads or writes `clarifications.md`, and posts at most one comment per run.

## Arguments

- `$ARGUMENTS`: optional issue number for the target child issue. Accepts a bare integer (`353`) or a `#`-prefixed form (`#353`); the leading `#` is stripped. When omitted, the verb falls back to extracting the issue number from the current branch name (pattern `###-*`). If neither resolves a target issue, the verb exits non-zero with the literal message `no child issue resolvable; pass --issue <n>`.

## Instructions

### Step 1: Resolve target issue

Resolve `<issue>` (a positive integer) using this precedence:

1. **`$ARGUMENTS`** — if non-empty, trim whitespace, strip any leading `#`, and parse as a positive integer. If parsing fails, exit 1 with `invalid issue argument: <raw value>`.
2. **Branch name fallback** — run `git branch --show-current` and apply the regex `^(\d+)-` to the result. If it matches, the captured group is `<issue>`.
3. **Hard error** — if neither source yields an integer, exit 1 with the literal message `no child issue resolvable; pass --issue <n>` (this exact string is documented in `specs/353-epic-generacy-ai-tetrad/quickstart.md` so it stays greppable in support threads).

Then qualify `<issue>` with the current repo's `nameWithOwner` so downstream `generacy` calls work regardless of how many repos are in cockpit config:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
ISSUE_REF="${REPO}#${ISSUE}"
```

If `gh repo view` fails (no git remote, not a GitHub repo), surface the error verbatim and exit 1.

### Step 2: Fetch open questions

Invoke `generacy cockpit clarify-context` against the qualified issue ref and parse the JSON payload:

```bash
generacy cockpit clarify-context "$ISSUE_REF"
```

Handle exit codes:

- **Exit 0** — stdout is a single JSON object matching `ClarifyContextOutput` (see `specs/353-epic-generacy-ai-tetrad/contracts/cockpit-clarify-context.md`). Parse and continue.
- **Exit 3** (`gate refusal: … is not in waiting-for:clarification`) — the issue has no pending clarifications. Exit 0 with `no open clarification questions for issue <ISSUE_REF>`. Do NOT post or advance.
- **Any other non-zero exit** — surface stderr verbatim and exit non-zero.

From the parsed JSON, retain:

- `clarificationComment.body` — the markdown source of the open questions (may be null).
- `spec.body` — contents of `specs/<branch>/spec.md` (may be null).
- `plan.body` — contents of `specs/<branch>/plan.md` (may be null).
- `codeReferences.touchedFiles` — repo files touched on the current branch (may be null).

If `clarificationComment` is `null`, exit 0 with `no clarification comment found for issue <ISSUE_REF>`. Do NOT post or advance.

Parse `clarificationComment.body` into an ordered list of `OpenQuestion` records (see `specs/353-epic-generacy-ai-tetrad/data-model.md` § OpenQuestion). The body is the markdown produced by `formatClarificationComment` in `packages/agency-plugin-spec-kit/src/utils/issue-comment.ts`; each question is a block of the form:

```markdown
### Q<n>: <topic>

**Context**: <free text, may span multiple lines>

**Question**: <literal question, may span multiple lines>

**Options**:
- A: <description>
- B: <description>
```

For each block, populate `{ number, topic, context, question, options }`. The leading `<!-- generacy-clarification:batch-N -->` marker, the `## 🔍 Clarification Questions` heading, and the trailing `---` / "How to answer" footer are ignored.

If no `### Q<n>:` blocks parse out, exit 0 with `no open clarification questions for issue <ISSUE_REF>`.

### Step 3: Draft answers

For each `OpenQuestion`, produce a `DraftedAnswer` (see data-model § DraftedAnswer):

1. **Ground the answer** by searching, in order: the question's own `context`, the `spec.body` from Step 2, the `plan.body` from Step 2, then any file listed in `codeReferences.touchedFiles` (read with the Read tool only when the prior sources do not suffice). Do NOT post-process external URLs.
2. **Cite the source** as `provenance` — either a `spec.md` / `plan.md` section heading (e.g., `plan.md § Technical Context`) or a `<path>:<line>` repo reference. The provenance string is shown to the developer but is not posted in the comment body.
3. **Set `grounded`** to `true` and `body` to the drafted answer text when a citation is available.
4. **Fall back to the stub** when no citation is available: set `grounded: false`, `body` to the literal string `_no draft — insufficient context_`, and omit `provenance`. Do NOT silently skip the question — the developer must still see it in Step 4.

Drafts are limited to ~4–8 sentences each; defer long-form rationale to the spec/plan rather than the comment body.

### Step 4: Present drafts for approval

Present every drafted question to the developer in ascending `question_number` order. For each one, surface:

- The question header (`### Q<n>: <topic>`) and the literal question.
- The drafted `body`. When `grounded` is `false`, prefix the entry with a `⚠ ungrounded` flag so the developer notices the stub.
- The `provenance` citation (when present).

Collect one `ApprovalDecision` per question with verdict ∈ `approved`, `edited`, `rejected`, `skipped`:

- **`approved`**: `final_body` = drafted `body` (verbatim).
- **`edited`**: `final_body` = developer's revised text (MUST differ from the draft).
- **`rejected`**: no `final_body`; the answer is dropped from this run's comment.
- **`skipped`**: no `final_body`; the answer is dropped from this run's comment.

Before confirming, show a pre-confirm summary that lists, by question number, the running verdict tally and the remaining-pending count (questions with verdict ∈ `rejected`, `skipped`). The developer must confirm before Step 5 runs.

### Step 5: Post comment

Assemble the comment body in a tempfile at `/tmp/cockpit-clarify-answers-<issue>-<unix_ts>.md`, byte-exactly per `specs/353-epic-generacy-ai-tetrad/contracts/github-comment.md`:

- **Line 1**: `<!-- generacy-cockpit:clarification-answers -->` (no leading or trailing whitespace).
- **Line 2**: blank.
- **Subsequent lines**: one `### Q<n>` block per `ApprovalDecision` with verdict ∈ `approved`, `edited`, in ascending `question_number` order. Each block is `### Q<n>` (heading) + newline + `<final_body>`. Blocks are separated by a single blank line. The body ends with a single trailing `\n`.

If no Q-block would be emitted (every decision is `rejected` or `skipped`), exit 0 with `all answers were rejected or skipped; no comment posted` — do NOT post a marker-only comment, and do NOT advance.

Otherwise post the tempfile:

```bash
gh issue comment "$ISSUE" --body-file /tmp/cockpit-clarify-answers-${ISSUE}-${UNIX_TS}.md
```

Use `--body-file` exclusively. Do NOT use `-b "…"` or `--body "…"`: shell quoting risks rewrapping or stripping the canonical HTML marker.

If `gh issue comment` exits non-zero, surface stderr verbatim and exit non-zero. Do NOT proceed to Step 6.

### Step 6: Advance gate (conditional)

Compute the `GateAdvanceSignal` (see data-model § GateAdvanceSignal):

- `should_advance` is `true` if and only if every `OpenQuestion` in this run has an `ApprovalDecision` with verdict ∈ `approved`, `edited` AND Step 5's `gh issue comment` exited 0.
- Otherwise `should_advance` is `false`.

If `should_advance` is `true`:

```bash
generacy cockpit advance --gate clarification "$ISSUE_REF"
```

On exit 0, report `posted <k> answers; clarification gate advanced for issue <ISSUE_REF>` and exit 0. On non-zero, surface stderr verbatim and exit non-zero (the comment remains live on the issue — do not attempt retraction).

If `should_advance` is `false`, exit 0 with a status summary listing the pending question numbers and their verdicts, e.g.:

```
posted 3 answers; 2 questions still pending (Q2 rejected, Q4 skipped); gate not advanced.
Re-run /cockpit:clarify <ISSUE> after they are resolved.
```

## Constraints

- **Marker line is line 1** of the posted comment — exactly `<!-- generacy-cockpit:clarification-answers -->`, no leading/trailing whitespace. Resume tooling scans `gh issue view --comments | head -1` for this string.
- **One comment per run**, regardless of partial vs. full approval. Subsequent runs post new comments rather than editing prior ones (append-only audit trail).
- **No comment edits / no de-duplication.** The verb never calls `gh api … PATCH`, never touches prior cockpit comments, and never deletes the tempfile (OS handles `/tmp` cleanup; the file aids post-mortem debugging).
- **`gh` is a hard runtime dependency.** The verb does not fall back to `generacy` for posting and does not bundle a transport shim. If `gh` is missing or unauthenticated, the verb surfaces `gh`'s native error and exits non-zero.
- **`generacy cockpit` is a hard runtime dependency** for Steps 2 and 6. The verb does not parse `clarifications.md` directly; all open-question context flows through `clarify-context`.
- **Gate advance is gated on full approval in the current run** AND on a successful Step 5 post. Partial-approval runs post but never advance.

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/cockpit:watch`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
