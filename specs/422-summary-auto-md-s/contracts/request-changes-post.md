# Contract: request-changes POST body

## Endpoint

```
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

Invoked via `gh api` (never direct `curl`, never a language SDK).

## Preconditions

Before the POST:

1. **Verdict has been `request-changes`** on the G.2 gate for this PR.
2. **PR diff has been fetched**: `gh pr diff <owner>/<repo>#<pull_number>` succeeded; hunk headers parsed into `DiffHunk[]`.
3. **Every `Finding` has an `AnchorCheck` verdict** (`anchored` or `unanchored` with a reason).
4. **At least one finding exists** — a `request-changes` on zero findings is a contract violation (Error handling class `OTHER`, do NOT POST).

## POST body

```json
{
  "event": "COMMENT",
  "body": "<total> finding(s) requiring changes; see inline comments.\n\n<optional-unanchored-block>",
  "comments": [
    {
      "path": "<finding.file>",
      "line": <finding.line>,
      "body": "<finding.summary> — <finding.failure_scenario>"
    }
    // one entry per finding with AnchorCheck.status == "anchored"
  ]
}
```

**Field rules**:
- `event` is **always `COMMENT`** (never `REQUEST_CHANGES` — the Generacy cluster's single-credential model blocks REQUEST_CHANGES on one's own PR).
- `body`'s first line is the literal template `<total> finding(s) requiring changes; see inline comments.` with `<total>` = anchored + unanchored count.
- When any finding has `AnchorCheck.status == "unanchored"`, the `body` continues with a blank line, then the unanchored-block marker + header (see below), then one `### Finding <n>` block per unanchored finding.
- `comments[]` NEVER contains an entry for an unanchored finding — those live in `body`.
- Per-comment: `side` defaults to `RIGHT` (do not set); do NOT set `start_line` (single-line anchors only, per SB.2 schema).

## Unanchored-block shape (body suffix)

```markdown
<!-- generacy-cockpit:unanchored-findings -->
## General findings (no file anchor)

### Finding <n>
**Finding:** <finding.summary>
**Failure scenario:** <finding.failure_scenario>
_reason: <analyzer-supplied-null | outside-diff-hunks>_
```

**Rules**:
- The marker line `<!-- generacy-cockpit:unanchored-findings -->` is verbatim; no whitespace variation.
- The H2 `## General findings (no file anchor)` immediately follows on the next line.
- `<n>` is 1-based within the unanchored block (independent of the total finding numbering).
- The `_reason:_` italic line uses the human-readable form: `analyzer-supplied-null` → "analyzer supplied no line anchor"; `outside-diff-hunks` → "line not inside PR diff hunks".

## Execution

```bash
gh api -X POST "/repos/${OWNER}/${REPO}/pulls/${PR}/reviews" \
  --input <(cat <<'JSON'
<bundle JSON>
JSON
)
```

**Capture**:
- Exit code (0 required to proceed to postcondition).
- Response JSON — extract `.id` (review ID; the join key for Leg 1's paginated GET) and `.submitted_at` (POST timestamp for Leg 2's freshness filter). The POST response does NOT carry a `comments` field; see `specs/429-re-filed-from-generacy/data-model.md § PostReviewResponse`.

## Postconditions

Immediately after POST returns exit 0:

1. **Leg 1 — inline-comment count via a separate REST endpoint**: see `postcondition-check.md § Leg 1` for the paginated GET-and-filter procedure (single source of truth). Pass criterion: `filteredCount == bundle.comments.length` at some point in the inline-poll budget; failure outcome is `genuine-undercount`.
2. **Leg 2 — GraphQL freshness** (see `postcondition-check.md`): fresh unresolved threads count ≥ `bundle.comments.length`.

**On failure** of either leg: retry the POST once with a 2-second backoff. On second failure, re-present the G.2 verdict gate with the failure details prepended (Q3=A shape). Do NOT emit the `Feedback posted:` success line.

**On success**: emit the review.md step-5 success line `Feedback posted: N inline comment(s) on PR #<pull_number>` (with N = anchored count) and continue. Do NOT call `cockpit_advance` — the unresolved threads trip `PrFeedbackMonitorService`, which owns the label transition.

## Ledger

**Success (first attempt)**: `<issue-ref> · waiting-for:<gate> · review-analysis+request-changes · posted (<anchored> inline, <unanchored> in body)`

**Success (after retry)**: same, prefixed by a preceding line `<issue-ref> · waiting-for:<gate> · review-post-retry · attempt=1 · <mismatch-summary>`.

**Failure after retry**: `<issue-ref> · waiting-for:<gate> · review-analysis+request-changes · postcondition-failed → re-present-gate`.
