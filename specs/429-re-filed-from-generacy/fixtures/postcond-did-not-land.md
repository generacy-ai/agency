# Executable-documentation fixture: postcondition legitimately fails (Leg 1 outcome = `genuine-undercount`)

Companion to `postcond-known-good.md`. Same synthetic shape (3-comment bundle,
same executor, same PR) — but the POST silently drops one entry because a
pre-validated anchor turned out to be *just outside* a hunk (an off-by-one in
the pre-validator's hunk-range logic; the exact class the pre-fix contract's
"POST-side rejection" prose already named, only now the check actually detects
it instead of spuriously firing on `undefined.length`).

The inline poll exhausts across four attempts (500 ms → 1 s → 2 s backoff),
`Leg1Check.outcome` resolves to `genuine-undercount`, and the outer 2 s →
re-POST flow runs exactly once. This is the shape a literal executor must see
to distinguish "read-replica lag (poll it away)" from "POST-side drop (re-POST
after re-validating)".

Contract references: same as the companion fixture.

---

## Bundle sent by the executor

Identical to the known-good fixture — three anchored findings on the same PR
(`generacy-ai/agency#511`). `bundle.comments.length == 3`.

## Step 1 — POST and capture

`gh api -X POST /repos/generacy-ai/agency/pulls/511/reviews …` returns exit 0
with body:

```json
{
  "id": 2841955123,
  "node_id": "PRR_kwDOABC124",
  "user": { "login": "generacy-ai[bot]", "id": 8123456, "type": "Bot" },
  "body": "3 finding(s) requiring changes; see inline comments.",
  "state": "COMMENTED",
  "submitted_at": "2026-07-16T14:32:11Z",
  "commit_id": "9c8b7a6f5e4d3c2b1a09876543210fedcba98765",
  "_links": { "html": { "href": "..." }, "pull_request": { "href": "..." } }
}
```

Captured: `response.id = 2841955123`, `response.submitted_at = "2026-07-16T14:32:11Z"`.
No `response.comments` field to look at — as with the known-good fixture, that
is exactly the corrected rule's point.

## Step 2 — Paginated GET attempt 1 (no backoff)

```bash
gh api --paginate "/repos/generacy-ai/agency/pulls/511/comments?per_page=100"
```

Page 1 returns three entries in total for this review. Only **two** carry
`pull_request_review_id == 2841955123`; the third is a straggler from the same
prior round the known-good fixture also showed. GitHub silently dropped one of
our three anchored comments POST-side because its `line=88` on
`src/pipeline/loader.ts` had been pre-validated against a hunk that ended at
line 87 (the pre-validator treated the hunk range as end-exclusive; GitHub
treats it as end-inclusive — the exact off-by-one class the fix's
Failure-interpretation prose names).

```json
[
  {
    "id": 1900020001,
    "pull_request_review_id": 2841955123,
    "path": "src/pipeline/loader.ts",
    "line": 42,
    "body": "Off-by-one on the tail slice — losing the last record.",
    "user": { "login": "generacy-ai[bot]" },
    "created_at": "2026-07-16T14:32:11Z"
  },
  {
    "id": 1900020003,
    "pull_request_review_id": 2841955123,
    "path": "src/pipeline/writer.ts",
    "line": 17,
    "body": "Retry budget shadowed by an unrelated loop variable.",
    "user": { "login": "generacy-ai[bot]" },
    "created_at": "2026-07-16T14:32:11Z"
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

`Link: rel="next"` is absent → paginator has no more pages. Filter to
`pull_request_review_id == 2841955123` yields **`filteredCount = 2`**.
`2 < 3` (`expected`) → proceed to inline-poll attempt 2.

## Step 3 — Attempt 2 (500 ms backoff, then repeat)

Sleep 500 ms. Re-run the paginated GET. GitHub still returns the same 3
entries; the dropped entry never lands. `filteredCount = 2`. Proceed to
attempt 3.

## Step 4 — Attempt 3 (1 s backoff, then repeat)

Sleep 1 s. Re-run. `filteredCount = 2`. Proceed to attempt 4.

## Step 5 — Attempt 4 (2 s backoff, then repeat — final poll)

Sleep 2 s. Re-run. `filteredCount = 2`. Total inline budget consumed
(500 ms + 1 s + 2 s = 3.5 s across four paginated GET cycles). The undercount
is real — this is not read-replica lag.

`Leg1Check` resolves to:

```
Leg1Check = {
  expected: 3,
  reviewId: 2841955123,
  filteredCount: 2,
  attempts: 4,
  outcome: "genuine-undercount"
}
```

## Step 6 — Return failure to the outer combined verdict

Per `data-model.md § PostcondCounts § Combined verdict`:

```
success = (Leg1Check.outcome == "pass") AND (freshUnresolvedThreads >= expectedAnchored)
        = false                          AND (…)
        = false
retry   = success == false AND attempt == 1
        = true (this is the outer first attempt)
```

## Step 7 — Ledger the retry line, then outer 2 s → re-POST

Per `postcondition-check.md § Ledger emission` (post-#429 shape from
`data-model.md § RetryLedgerEntry`):

```
generacy-ai/agency#511 · waiting-for:implementation-review · postcondition-failed · attempt=1 · leg1=2/3 · leg2=3/3
generacy-ai/agency#511 · waiting-for:implementation-review · review-post-retry · attempt=1 · reason=leg1-undercount:2/3
```

The `reason=leg1-undercount:2/3` sub-token is the load-bearing addition —
`<a> = filteredCount = 2`, `<n> = expectedAnchored = 3`. `·leg2:<b>/<n>` is
omitted because Leg 2 alone would have passed.

Executor logs the two paths that DID make it (`src/pipeline/loader.ts:42`,
`src/pipeline/writer.ts:17`) and diffs against the bundle to identify the
dropped entry (`src/pipeline/loader.ts:88`). This is the diagnostic the
Failure-interpretation prose calls for.

Then executor sleeps 2 s (the outer backoff, unchanged from #422) and re-POSTs
the same bundle. **Do NOT re-POST inline** — the inline poll is READ-side only;
re-POST lives in the outer attempt counter.

## Step 8 — Outer attempt 2 and its two branches

Two possible resolutions:

**(a) Attempt 2 succeeds** — GitHub accepts all three entries this time (a
transient POST-side glitch). Leg 1 attempt 1 of the new outer round returns
`filteredCount = 3` at page 1. Success ledger lines are the same as the
known-good fixture, prefixed by the retry line above.

**(b) Attempt 2 also fails** — the pre-validator bug is deterministic; the
same anchor gets dropped again. `Leg1Check.outcome = "genuine-undercount"`
returns from the new outer round too. Combined verdict is `success == false
AND attempt == 2` → **escalate** per `PostcondCounts § Combined verdict`.
Re-present G.2 with the failure notice prepended (see `auto.md § Gate contract
G.2 — re-presentation shape`). Do NOT emit the `Feedback posted:` line.

## Why the inline poll matters

Without the inline poll, every read-replica-lag case would fall through to the
outer re-POST — recreating the exact duplicate-review defect this whole branch
exists to eliminate. The four-attempt inline budget (3.5 s total) covers the
propagation window observed in GitHub's REST replicas for `POST /reviews` →
`GET /pulls/{n}/comments`. Only genuine POST-side drops reach the outer
re-POST path.

## What made this the failure path

1. The pre-validator's hunk-range logic was off-by-one (end-exclusive vs
   end-inclusive) — a real regression the pre-validator owns.
2. GitHub accepted the POST at the review level (returned an `id`,
   `submitted_at`, exit 0) but silently dropped one of the three inline
   comment entries — the exact "POST-side per-entry drop" class the corrected
   Failure-interpretation names.
3. The undercount reproduced across four paginated attempts spanning 3.5 s,
   so `Leg1Check.outcome == "genuine-undercount"` and not `pass`.
4. The outer retry re-POSTed once (either resolving in branch (a) or
   escalating to G.2 re-presentation in branch (b)).

The corrected rule's cost on this path: 4 paginated GET cycles + 3.5 s inline
wait + 2 s outer backoff + 1 re-POST. Compare against the pre-fix contract's
cost on the *same* input: `undefined.length` throws → outer retry re-POSTs →
`undefined.length` throws again → G.2 re-presented with two duplicate review
threads visible on the PR. The corrected rule costs more wall time but posts
the review exactly once.
