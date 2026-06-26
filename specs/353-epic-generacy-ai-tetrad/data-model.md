# Data Model: /cockpit:clarify verb

**Feature**: `353-epic-generacy-ai-tetrad`
**Date**: 2026-06-26

The verb has no persisted state of its own; all data flows through transient in-memory structures during a single run. The entities below describe the *shape* of the data exchanged with `generacy cockpit clarify-context`, the developer, and `gh issue comment`. They are normative for the verb's parsing/rendering logic, not for any on-disk schema.

## Entities

### OpenQuestion

A single clarification question reported by `generacy cockpit clarify-context` as still needing an answer.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `number` | integer | yes | Sequential ID assigned by `clarifications.md` (matches `Q[N]` in the comment marker) |
| `topic` | string | yes | 2–5 word identifier from the question header |
| `context` | string | yes | Free-text explaining why the question matters |
| `question` | string | yes | The literal question |
| `options` | array of `{label: string, description: string}` | no | Present when the question is multiple-choice |

**Validation**:
- `number` must be > 0 and unique within the run.
- A question with `options` may still be answered with free text; the verb does not enforce option selection.

### DraftedAnswer

The verb's draft for a single `OpenQuestion`, produced in Step 3.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `question_number` | integer | yes | Matches `OpenQuestion.number` |
| `body` | string | yes | The drafted answer text. Set to the literal `_no draft — insufficient context_` when the agent cannot ground an answer (D4). |
| `provenance` | string | conditional | Required when `body` is a real draft. One of: a `spec.md` / `plan.md` section heading, or a `path:line` reference into the repo. Absent when `body` is the stub. |
| `grounded` | boolean | yes | `true` when `provenance` is present; `false` when the stub fallback was used. Drives the presentation step's UI cue (e.g., a `⚠ ungrounded` flag). |

**Validation**:
- If `grounded` is `true`, `provenance` MUST be non-empty.
- If `grounded` is `false`, `body` MUST equal the exact stub string `_no draft — insufficient context_`.

### ApprovalDecision

The developer's per-question verdict captured during Step 4.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `question_number` | integer | yes | Matches `DraftedAnswer.question_number` |
| `verdict` | enum | yes | One of `approved`, `edited`, `rejected`, `skipped` |
| `final_body` | string | conditional | Required when `verdict` is `approved` or `edited`. For `approved`, equals the draft `body`; for `edited`, equals the developer's revised text. |

**Validation**:
- `rejected` and `skipped` MUST NOT carry a `final_body`.
- `edited` MUST have `final_body` distinct from the original draft `body` (otherwise it's effectively `approved`).
- Exactly one decision per `OpenQuestion`. The developer cannot leave a question without a verdict; "no answer" is `skipped`, which is explicit.

### PostedComment

The single comment body assembled in Step 5 and sent to `gh issue comment`.

**Layout** (line-by-line, byte-exact):

```
<!-- generacy-cockpit:clarification-answers -->
                                                   ← blank line
### Q<n>
<final_body>
                                                   ← blank line
### Q<m>
<final_body>
                                                   ← (no trailing newline beyond a single \n)
```

| Element | Required | Notes |
|---------|----------|-------|
| Marker line | yes | MUST be line 1, exact string `<!-- generacy-cockpit:clarification-answers -->` (D2, clarification Q2) |
| Q-blocks | ≥1 | One per `ApprovalDecision` with `verdict` ∈ {`approved`, `edited`}; emitted in ascending `question_number` order |
| Trailing whitespace | no | The body ends with the last answer's content + a single `\n`; no extra blank lines |

**Validation**:
- The comment is posted only if at least one Q-block would be emitted. If every decision is `rejected`/`skipped`, the verb exits without posting (no empty marker-only comment).
- Posting transport is `gh issue comment <n> --body-file <tempfile>` (D2/D5). Never `-b "…"`.

### GateAdvanceSignal

The conditional invocation of `generacy cockpit advance` at the end of Step 6.

| Field | Type | Notes |
|-------|------|-------|
| `should_advance` | boolean | `true` iff every `OpenQuestion` from this run has an `ApprovalDecision` with verdict ∈ {`approved`, `edited`}. `skipped` and `rejected` block advancement. |
| `command` | string | When `should_advance` is `true`: `generacy cockpit advance --gate clarification --issue <n>` |

**Validation**:
- The advance command runs exactly once per verb invocation, only when `should_advance` is `true`.
- If `gh issue comment` failed (non-zero exit), `should_advance` is forced to `false` regardless of approval state — gate advance requires a successful post.

### IssueResolution

How the verb decides which issue to operate on (Step 1).

| Source | Precedence | Validation |
|--------|------------|------------|
| `$ARGUMENTS` (explicit `--issue <n>` or bare numeric) | 1 (highest) | Must parse as a positive integer; trims leading `#`. |
| Current branch name matching `/^(\d+)-/` | 2 | Captures the numeric prefix as the issue number. |
| — | — | If neither resolves, the verb exits 1 with the literal message `no child issue resolvable; pass --issue <n>`. |

**Validation**:
- Once resolved, the verb does NOT re-verify the issue exists upstream — `gh issue comment` will surface a clear error if the number is bogus. This keeps the resolution step network-free for the happy path.

## Relationships

```
OpenQuestion (1) ──drafts──▶ DraftedAnswer (1)
DraftedAnswer (1) ──prompts──▶ ApprovalDecision (1)
ApprovalDecision (approved|edited) ──contributes to──▶ PostedComment.Q-blocks (1)
{ApprovalDecision} ──aggregate──▶ GateAdvanceSignal.should_advance
IssueResolution.number ──parameterizes──▶ {clarify-context call, gh comment, advance call}
```

## Out-of-Scope

- `clarifications.md` shape — owned by `manage_clarifications` (sibling tooling); the verb never reads or writes it directly.
- Label management (`waiting-for:clarification`, `completed:clarification`) — managed by the orchestrator / `manage_clarification_labels`, not by this verb.
- Comment de-duplication / editing prior cockpit comments — append-only by design (D6).
