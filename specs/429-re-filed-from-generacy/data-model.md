# Data Model: Fix `auto.md` request-changes postcondition Leg 1

This branch is a contract-doc fix; the shapes below extend (not replace) the entities already defined in `specs/422-summary-auto-md-s/data-model.md`. Only the entities that change or are new are shown.

## PostReviewResponse (documented; unchanged shape, corrected consumption)

The response body returned by `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`. Documented here because #422's contracts consumed a field that was never present.

```
PostReviewResponse {
  id: number                    // review ID; the join key for the corrected Leg 1
  submitted_at: string          // ISO-8601; freshness anchor for Leg 2's createdAt filter
  state: string                 // "COMMENTED" for event:COMMENT reviews
  body: string
  commit_id: string
  html_url: string
  node_id: string
  pull_request_url: string
  user: { login: string, ... }
  author_association: string
  _links: object
  // NOTE: NO `comments` field. Prior contract references to response.comments.length
  //       were reading `undefined` and are removed by this branch.
}
```

**Validation**: `id` is a positive integer; `submitted_at` parses as ISO-8601. Both are required to proceed to Leg 1.

**Invariant (contract-drift pin)**: no other document in this contract set may name `response.comments` — this is enforced by an assertion in `playbook-verification.test.ts`.

## ReviewComment (new — the Leg 1 read shape)

One entry per element of the paginated `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments` response. Only the fields Leg 1 reads:

```
ReviewComment {
  id: number                    // comment ID (not used by the filter, but useful in error logs)
  pull_request_review_id: number  // JOIN KEY — filter to comments where this equals response.id
  path: string
  line: number | null
  body: string
  user: { login: string, ... }
  created_at: string
}
```

**Filter rule**: `comment.pull_request_review_id == postResponse.id`.

**Note**: `pull_request_review_id` is `null` for standalone PR comments (created outside a review). The filter drops those naturally.

## Leg1Check (new — replaces the buggy `response.comments.length` rule)

The corrected Leg 1 procedure. This is the shape the four contract sites must all encode identically.

```
Leg1Check {
  expected: number                // == bundle.comments.length (the anchored count)
  reviewId: number                // == postResponse.id
  filteredCount: number           // count of ReviewComment where pull_request_review_id == reviewId
  attempts: 1..3                  // inline poll attempts consumed (see R3)
  outcome: "pass"                 // filteredCount == expected within the inline budget
         | "genuine-undercount"   // filteredCount < expected after pages exhausted AND poll exhausted
}
```

**Rule**: `outcome == "pass"` iff, on some inline-poll attempt, the paginated GET returns `filteredCount == expected`.

**Pagination**: `gh api --paginate /repos/{owner}/{repo}/pulls/{pull_number}/comments?per_page=100`, filter each page to `pull_request_review_id == postResponse.id`, accumulate the count, and **early-exit as soon as the accumulated count reaches `expected`**. If a page returns and the accumulated count is still below `expected`, continue to the next page. Only when the paginator returns no more pages AND the accumulated count is below `expected` is this attempt a failure.

**Inline poll**: three attempts with backoff `500 ms → 1 s → 2 s` between attempts (backoff *before* attempt 2 and *before* attempt 3; no backoff before attempt 1). Each attempt runs the full paginated GET-and-filter above.

**Outer retry interaction**: `outcome == "pass"` short-circuits the outer retry (Leg 2 still runs; both must pass for the combined verdict). `outcome == "genuine-undercount"` returns failure to the outer combined verdict, which THEN applies the existing "sleep 2000 ms → retry the POST once → re-present the gate if the second attempt also fails" flow.

**Failure interpretation** (replaces the old "POST-side rejection" prose, which was misdiagnosed because the check was reading `undefined`):
- `genuine-undercount` — the POST accepted with exit 0 and returned an `id`, but the count of comments visible under that `pull_request_review_id` never reached the anchored count within the inline-poll budget. Most likely a POST-side per-entry drop (a pre-validated anchor turned out to be *just outside* a hunk — the same off-by-one class the original prose named). Log the paths/lines that DID make it (from the filter's result set) and diff against the bundle to identify the dropped entry(-ies).

## LoginNormalization (new — contract-wide preamble in `postcondition-check.md`)

A single rule at the top of `postcondition-check.md`, referenced by every leg that compares logins.

```
LoginNormalization {
  step_1: "strip a single trailing '[bot]' suffix from both sides, if present"
  step_2: "compare case-insensitively"
}
```

**Application**: any expression of the form `<login-A> == <login-B>` in `postcondition-check.md` is understood to mean `normalize(A) == normalize(B)` under this rule. Individual legs do NOT re-state the rule; they reference the preamble by name.

**Coverage today**: exactly one comparison site — Leg 2's `comments.nodes[0].author.login == <acting-bot-login>`. Coverage tomorrow: any new leg that reads a `login` field is automatically covered.

**Examples**:
- `Generacy-AI[bot]` vs `generacy-ai` → equal (strip + fold both to `generacy-ai`)
- `generacy-ai` vs `generacy-ai` → equal
- `generacy-ai[bot]` vs `Generacy-AI` → equal
- `generacy-ai` vs `other-bot` → not equal

## PostcondCounts (updated — reuses #422's entity name; only Leg 1 semantics change)

The two-leg verdict shape, redefined so `acceptedByPost` is now derived from Leg1Check rather than the non-existent `response.comments`.

```
PostcondCounts {
  expectedAnchored: number                 // == bundle.comments.length
  acceptedByPost: number                   // == Leg1Check.filteredCount at outcome time
  freshUnresolvedThreads: number           // unchanged from #422 data-model
}
```

**Combined verdict**:

```
success  = (Leg1Check.outcome == "pass") AND (freshUnresolvedThreads >= expectedAnchored)
retry    = success == false AND attempt == 1        // outer attempt counter, not the Leg 1 poll
escalate = success == false AND attempt == 2        // re-present G.2
```

`success` requires *both* legs pass on the same outer attempt. The Leg 1 inline poll counts as one outer attempt regardless of how many polls it consumed.

## RetryLedgerEntry (unchanged shape; new failure-summary detail)

The `<mismatch-summary>` sub-token on the retry line now names the Leg 1 outcome explicitly:

```
`<issue-ref> · waiting-for:<gate> · review-post-retry · attempt=1 · reason=leg1-undercount:<a>/<n>[·leg2:<b>/<n>]`
```

Where `<a>` = Leg1Check.filteredCount at failure, `<n>` = expectedAnchored, `<b>` = freshUnresolvedThreads (omit the `·leg2:` tail if Leg 2 alone would have passed).

## Relationships

```
POST /reviews ──→ PostReviewResponse (id, submitted_at)
                       │
                       ├──→ Leg1Check
                       │      ├── pagination + filter over ReviewComment[] joined on pull_request_review_id
                       │      └── inline poll with 500ms → 1s → 2s backoff
                       │
                       └──→ Leg 2 (unchanged; GraphQL reviewThreads, filter uses LoginNormalization)
                              │
                              ▼
                       PostcondCounts ──→ combined verdict ──→ retry / escalate / success
```

## Non-changes (called out for reviewers)

- **Leg 2 shape** — the GraphQL query, `first: 50` bound, `isResolved`/`createdAt` filters, and `≥` semantics are unchanged. Only the `author.login ==` comparison gains the `LoginNormalization` reference (which is a no-op today because both sides are already GraphQL-derived `generacy-ai`).
- **POST body** — `event`, `body`, `comments[]` shape all unchanged. `request-changes-post.md` § POST body edits are only in §§ Execution (`Capture` list) and Postconditions (Leg 1 rule); the POST payload itself is not touched.
- **Outer retry-once-then-re-present flow** — timing (2 s backoff between outer attempts) and attempt bound (1 retry, then re-present G.2) unchanged. Only the *trigger* changes: Leg 1 now fires the outer retry only on `genuine-undercount`, not on `undefined.length`.
