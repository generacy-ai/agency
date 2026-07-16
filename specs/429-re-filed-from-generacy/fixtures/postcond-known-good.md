# Executable-documentation fixture: postcondition passes (Leg 1 outcome = `pass`)

This is a *synthetic* trace of a successful `request-changes` postcondition on a
3-anchored-comment bundle. It is not consumed by CI — it is prose for a
literal-executor reading `auto.md` / `review.md` who wants to see the corrected
Leg 1 rule applied end-to-end (per `plan.md` § R5 and `quickstart.md`
§ "Executable-documentation fixtures"). Pair with `postcond-did-not-land.md`
(same shape, `outcome == "genuine-undercount"`).

Contract references:
- `specs/429-re-filed-from-generacy/data-model.md` § PostReviewResponse, § ReviewComment, § Leg1Check, § PostcondCounts.
- `specs/429-re-filed-from-generacy/contracts/leg1-corrected-rule.md`.
- `specs/422-summary-auto-md-s/contracts/postcondition-check.md` (post-#429 edit).

---

## Bundle sent by the executor

The G.2 verdict was `request-changes`. Three findings survived
`AnchorCheck.status == "anchored"`. The composed `ReviewPostBundle` is:

```json
{
  "event": "COMMENT",
  "body": "3 finding(s) requiring changes; see inline comments.",
  "comments": [
    { "path": "src/pipeline/loader.ts", "line": 42, "body": "Off-by-one on the tail slice — losing the last record." },
    { "path": "src/pipeline/loader.ts", "line": 88, "body": "Missing null-check on the batch cursor." },
    { "path": "src/pipeline/writer.ts", "line": 17, "body": "Retry budget shadowed by an unrelated loop variable." }
  ]
}
```

`bundle.comments.length == 3` — this is the anchored count Leg 1 must match.

## Step 1 — POST and capture

Executor runs:

```bash
gh api -X POST /repos/generacy-ai/agency/pulls/511/reviews --input <bundle.json>
```

The endpoint returns exit 0 and this JSON body (synthetic but shape-faithful to
`data-model.md § PostReviewResponse`; note there is **no `comments` field** —
that is the point of this whole branch):

```json
{
  "id": 2841903777,
  "node_id": "PRR_kwDOABC123",
  "user": { "login": "generacy-ai[bot]", "id": 8123456, "type": "Bot" },
  "body": "3 finding(s) requiring changes; see inline comments.",
  "state": "COMMENTED",
  "html_url": "https://github.com/generacy-ai/agency/pull/511#pullrequestreview-2841903777",
  "pull_request_url": "https://api.github.com/repos/generacy-ai/agency/pulls/511",
  "author_association": "MEMBER",
  "submitted_at": "2026-07-16T14:22:07Z",
  "commit_id": "9c8b7a6f5e4d3c2b1a09876543210fedcba98765",
  "_links": { "html": { "href": "..." }, "pull_request": { "href": "..." } }
}
```

Captured for Leg 1:
- `response.id = 2841903777` — the join key.
- `response.submitted_at = "2026-07-16T14:22:07Z"` — kept for Leg 2's freshness filter.
- **Not captured: `response.comments`** — the field does not exist. Any prior
  contract that tried to read `.comments[].length` here would have observed
  `undefined.length` and tripped the outer 2 s → re-POST loop, creating a
  duplicate review. This branch fixes that.

## Step 2 — Paginated GET (attempt 1, page 1, no backoff)

Executor runs:

```bash
gh api --paginate "/repos/generacy-ai/agency/pulls/511/comments?per_page=100"
```

`--paginate` walks `Link: rel="next"` pages transparently. Page 1 returns four
entries (there was one straggler inline comment from a prior review round on
this long-lived PR, unrelated to the current POST):

```json
[
  {
    "id": 1900010001,
    "pull_request_review_id": 2841903777,
    "path": "src/pipeline/loader.ts",
    "line": 42,
    "body": "Off-by-one on the tail slice — losing the last record.",
    "user": { "login": "generacy-ai[bot]" },
    "created_at": "2026-07-16T14:22:07Z"
  },
  {
    "id": 1900010002,
    "pull_request_review_id": 2841903777,
    "path": "src/pipeline/loader.ts",
    "line": 88,
    "body": "Missing null-check on the batch cursor.",
    "user": { "login": "generacy-ai[bot]" },
    "created_at": "2026-07-16T14:22:07Z"
  },
  {
    "id": 1900010003,
    "pull_request_review_id": 2841903777,
    "path": "src/pipeline/writer.ts",
    "line": 17,
    "body": "Retry budget shadowed by an unrelated loop variable.",
    "user": { "login": "generacy-ai[bot]" },
    "created_at": "2026-07-16T14:22:07Z"
  },
  {
    "id": 1899888812,
    "pull_request_review_id": 2830100000,
    "path": "src/pipeline/loader.ts",
    "line": 12,
    "body": "(from prior round — unresolved)",
    "user": { "login": "generacy-ai[bot]" },
    "created_at": "2026-07-14T09:11:44Z"
  }
]
```

## Step 3 — Client-side filter + early exit

Filter rule from `data-model.md § ReviewComment`:
`comment.pull_request_review_id == response.id`.

Applied:

| id | `pull_request_review_id` | matches `response.id (2841903777)`? |
|---|---|---|
| 1900010001 | 2841903777 | ✓ |
| 1900010002 | 2841903777 | ✓ |
| 1900010003 | 2841903777 | ✓ |
| 1899888812 | 2830100000 | ✗ (prior round; dropped) |

Running `filteredCount` after this page = **3**.

Compare against `bundle.comments.length` = 3. Reached. **Early exit** — do not
fetch subsequent pages. `Leg1Check.outcome = "pass"` (`attempts = 1`).

## Step 4 — Leg 2 (unchanged shape, applied for completeness)

Executor runs the `reviewThreads(first: 50)` GraphQL query from
`postcondition-check.md § Leg 2`. Client-side filter keeps nodes matching all
of:
- `isResolved == false`,
- `normalize(comments.nodes[0].author.login) == normalize(<acting-bot-login>)` per `postcondition-check.md § Login normalization` (both sides normalize to `generacy-ai`),
- `comments.nodes[0].createdAt >= "2026-07-16T14:22:07Z"`.

The three new threads (one per anchored comment) plus the one stale thread from
the prior round all match `login` and `isResolved`, but only the three fresh
ones pass the `createdAt` cut. `freshUnresolvedThreads = 3` ≥ `expectedAnchored`
= 3. **Leg 2 passes.**

## Step 5 — Combined verdict per `PostcondCounts`

```
PostcondCounts = {
  expectedAnchored: 3,
  acceptedByPost: 3,           // == Leg1Check.filteredCount at outcome time
  freshUnresolvedThreads: 3
}

success = (Leg1Check.outcome == "pass") AND (freshUnresolvedThreads >= expectedAnchored)
        = true                 AND (3 >= 3)
        = true
```

## Step 6 — Ledger

One success line (no retry, no re-POST):

```
generacy-ai/agency#511 · waiting-for:implementation-review · postcondition-passed · leg1=3/3 · leg2=3/3
```

Then the Terminal Outcome Check marker for the request-changes branch:

```
Feedback posted: 3 inline comment(s) on PR #511
```

No `cockpit_advance` call — `PrFeedbackMonitorService` owns the label
transition to `waiting-for:address-pr-feedback` once it sees the three new
unresolved threads.

## What made this the happy path

1. `response.id` was captured cleanly. No attempt to read `response.comments`.
2. The paginated GET's first page contained all three new inline comments.
3. Client-side filter dropped the stale prior-round entry, so
   `filteredCount == expected` after page 1 → early exit.
4. Zero inline-poll iterations consumed (attempt 1 sufficed) → zero backoff
   waited, zero re-POSTs.

The corrected rule adds **one** REST call to the happy path (the paginated GET
whose early exit stops at page 1). The prior contract's `response.comments.length`
read cost nothing on the wire, but tripped the outer retry on *every* successful
POST — so the prior contract was cheaper per happy-path GET but re-posted every
review it processed. The corrected rule is strictly cheaper end-to-end.
