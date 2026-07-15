# Contract: postcondition check (`reviewThreads` + POST response)

The guardrail's success criterion is that *what `PrFeedbackMonitorService` reads* matches *what the executor thinks it posted*. Two legs:

## Leg 1 — POST response count

**Input**: the POST response JSON captured in `request-changes-post.md`.

**Rule**: `response.comments.length == bundle.comments.length` (the anchored-finding count).

**Failure interpretation**: POST-side rejection. GitHub silently dropped one or more `comments[]` entries — almost always because a pre-validated anchor turned out to be *just outside* a hunk (an off-by-one in the pre-validator's hunk-range logic, e.g. the hunk-end-inclusive edge). Log the specific paths that made it into the response and diff against the bundle to identify which entry(-ies) were dropped.

## Leg 2 — GraphQL fresh unresolved threads

**Query**:

```graphql
query PostcondCheck($owner:String!, $repo:String!, $pr:Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 1) {
            nodes {
              author { login }
              createdAt
            }
          }
        }
      }
    }
  }
}
```

**Execution**:

```bash
gh api graphql \
  -f query='<query>' \
  -F owner="${OWNER}" -F repo="${REPO}" -F pr:="${PR}"
```

**Filter (client-side)** — collect nodes matching ALL of:
- `isResolved == false`
- `comments.nodes[0].author.login == <acting-bot-login>` (the login the POST was made under)
- `comments.nodes[0].createdAt >= <POST timestamp from response.submitted_at>`

**Rule**: filtered count ≥ `bundle.comments.length` (the anchored-finding count from the POST bundle).

**Failure interpretation**:
- Filtered count `== 0`: total feedback-loop disconnect — this is the snappoll shape. The POST accepted, but the threads never materialized where `PrFeedbackMonitorService` reads them. Most likely cause: `event: COMMENT` was posted with `body` populated but `comments[]` empty or malformed.
- `0 < filtered < expected`: partial visibility (unusual; suggests replication lag or a per-entry drop that Leg 1 already flagged). Retry once with 2s backoff (the backoff is enough for eventual consistency on GitHub's read replicas).

**Why `first: 50`**: PR reviews with more than ~50 findings on one round are unusual, and the failure mode this guards against (empty threads) is detected in the first page. If a run legitimately produces >50 findings, follow-up pages exist but are not read — the postcondition still passes on the first 50, and any missing count in Leg 1 catches the drop.

## Combined verdict

```
success  = (leg1 == expected) AND (leg2_filtered >= expected)
retry    = success == false AND attempt == 1
escalate = success == false AND attempt == 2  (re-present G.2)
```

Between attempt 1 and attempt 2, sleep 2000ms (deterministic — no exponential; the retry is a single shot, not a loop).

## Ledger emission

**On success (first attempt)** — one line:
```
<issue-ref> · waiting-for:<gate> · postcondition-passed · leg1=<n>/<n> · leg2=<m>/<n>
```
Where `<n>` = expected (anchored) count, `<m>` = leg2 filtered count (may exceed `<n>` if a prior round left unresolved threads; only the `≥` bound is required).

**On retry** — two lines:
```
<issue-ref> · waiting-for:<gate> · postcondition-failed · attempt=1 · leg1=<a>/<n> · leg2=<b>/<n>
<issue-ref> · waiting-for:<gate> · review-post-retry · attempt=1 · backoff=2s
```

**On escalation** — one additional line after the retry attempt:
```
<issue-ref> · waiting-for:<gate> · postcondition-failed · attempt=2 · leg1=<a>/<n> · leg2=<b>/<n> · re-present-gate
```

## Non-goals of this postcondition

- **Thread resolution state** — checked by the *re-review* step on subsequent entry, not by this postcondition. First-post threads are always unresolved by definition; a resolved thread at freshness time would indicate a race the postcondition can't sensibly handle.
- **Reply comments** — the fix-loop agent's in-thread replies are not counted here. This postcondition runs once per POST, at post time.
- **Cross-review deduplication** — if the operator selects `request-changes` twice on the same PR (a legitimate re-review scenario), each POST is independently postcondition-checked against its own bundle. Threads from a prior round are already unresolved and would inflate leg 2's count — the `≥` bound accommodates this.
