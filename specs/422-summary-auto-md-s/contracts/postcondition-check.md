# Contract: postcondition check (`reviewThreads` + POST response)

The guardrail's success criterion is that *what `PrFeedbackMonitorService` reads* matches *what the executor thinks it posted*. Two legs.

## Login normalization

A single normalization rule for every `login` comparison in this document. Referenced by name (not restated) at each comparison site.

### Rule

Given two GitHub login strings `A` and `B`, define `normalize(x)` as:

1. If `x` ends with the literal suffix `[bot]`, strip that suffix (once).
2. Lowercase the result.

Two logins compare equal iff `normalize(A) == normalize(B)`. Every expression of the form `<login-A> == <login-B>` in this document is understood to mean `normalize(A) == normalize(B)` under this rule; individual legs do NOT re-state the rule, they reference this preamble by name.

### Examples

| A | B | normalize(A) | normalize(B) | Equal? |
|---|---|---|---|---|
| `generacy-ai` | `generacy-ai` | `generacy-ai` | `generacy-ai` | ✓ |
| `generacy-ai[bot]` | `generacy-ai` | `generacy-ai` | `generacy-ai` | ✓ |
| `Generacy-AI[bot]` | `generacy-ai` | `generacy-ai` | `generacy-ai` | ✓ |
| `generacy-ai[bot]` | `Generacy-AI` | `generacy-ai` | `generacy-ai` | ✓ |
| `generacy-ai` | `other-bot` | `generacy-ai` | `other-bot` | ✗ |
| `foo[bot]bar` | `foo[bot]bar` | `foo[bot]bar` | `foo[bot]bar` | ✓ (no trailing `[bot]` — no strip) |

## Leg 1 — inline-comment count via a separate REST endpoint

**Input**: the POST response JSON captured in `request-changes-post.md` (only `response.id` and `response.submitted_at` — the POST response body does NOT carry a `comments` field; see `specs/429-re-filed-from-generacy/data-model.md § PostReviewResponse`).

### Rule

Leg 1 counts the inline comments actually created by the just-posted review, using the **separate REST endpoint** `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments` — never the POST response body — and compares that count to `bundle.comments.length` (the anchored-finding count).

### Procedure

1. Capture from the POST response:
   - `response.id` — the review ID.
   - `response.submitted_at` — kept for Leg 2's freshness filter.
   - **Do NOT read a `comments` field on the POST response body. It does not exist on this endpoint** (see `specs/429-re-filed-from-generacy/data-model.md § PostReviewResponse` for the full set of keys the endpoint returns).

2. Fetch inline comments and filter:

   ```bash
   gh api --paginate "/repos/${OWNER}/${REPO}/pulls/${PR}/comments?per_page=100"
   ```

   Client-side filter: keep entries where `comment.pull_request_review_id == response.id`. Accumulate the filtered count.

3. Early exit: as soon as the running filtered count reaches `bundle.comments.length`, stop paginating. Leg 1 passes.

4. If the paginator exhausts pages and the filtered count is still `< bundle.comments.length`, continue to step 5 (inline poll). Otherwise Leg 1 passes.

5. Inline poll to absorb REST read-replica lag:
   - After attempt 1's page exhaustion, sleep **500 ms**, then re-run steps 2–4 (attempt 2).
   - If attempt 2 also exhausts without reaching the count, sleep **1 s**, then re-run steps 2–4 (attempt 3).
   - If attempt 3 also exhausts without reaching the count, sleep **2 s**, then re-run steps 2–4 (attempt 4 — the final attempt of the inline poll).

   Total inline budget: 3 sleep intervals (500 ms + 1 s + 2 s = 3.5 s) plus 4 paginated GET cycles.

6. If all four attempts exhaust and the count is still short → **Leg 1 outcome = `genuine-undercount`** → return failure to the outer combined verdict. The outer retry (§ Combined verdict below) then applies its own 2 s backoff and re-POSTs the review once. Do NOT re-POST inline — the poll is READ-side only.

### Pass criterion

`filteredCount == bundle.comments.length` at any point in the inline-poll budget.

### Failure interpretation

`Leg1Check.outcome == "genuine-undercount"` — the POST accepted with exit 0 and returned an `id`, but the count of inline comments visible under that `pull_request_review_id` never reached the anchored count within the inline-poll budget. Most likely a POST-side per-entry drop: a pre-validated anchor turned out to be *just outside* a hunk (an off-by-one in the pre-validator's hunk-range logic, e.g. the hunk-end-inclusive edge). Log the paths/lines that DID make it (from the filter's result set) and diff against the bundle to identify which entry(-ies) were dropped.

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
