# Quickstart: verify the fix

The change is contract-doc-only in four markdown files plus one test file. There's nothing to install or start. This quickstart shows how to verify the fix in a live request-changes flow and how to read the ledger to distinguish the corrected behavior from the pre-fix behavior.

## Prerequisites

- `gh` CLI authenticated (`gh auth status` shows a logged-in user).
- A PR you own the credential for (Generacy cluster's single-credential model requires PR author == acting bot for `event: COMMENT` reviews).
- The `cockpit_*` MCP tools available in the session (auto.md startup sweep checks this and fails loud if missing).
- `pnpm install && pnpm build` at repo root (only needed to run the new drift-pin test).

## Trigger the amended path

Either entry point lands on the same postcondition guardrail:

**Entry 1** — standalone review command:
```
/cockpit:review --gate implementation-review
```

**Entry 2** — auto loop on a PR that enters `waiting-for:implementation-review`:
```
/cockpit:auto owner/repo#123
```

On `request-changes`, the amended D.2 / step 5 guardrail runs: pre-validate anchors → POST → Leg 1 (paginated GET-and-filter with inline poll) → Leg 2 (unchanged) → success or bounded retry.

## What to watch on the PR

**Correct behavior** — one COMMENTED review posted, and:
- `GET /repos/{o}/{r}/pulls/{n}/comments?per_page=100` returns entries whose `pull_request_review_id` matches the just-created review's `id`, exactly one per anchored finding.
- `reviewThreads(first:50)` shows the same threads, `isResolved: false`, with the acting bot as author.
- **No duplicate review** appears. The pre-fix defect always produced two identical reviews (the outer retry re-POSTed after Leg 1's spurious failure).

**Quick GraphQL probe**:
```graphql
query { repository(owner:"o", name:"r") { pullRequest(number:123) {
  reviews(first:5) { nodes { id state body createdAt author { login } } }
  reviewThreads(first:30) { nodes { id isResolved path line comments(first:1){ nodes { author { login } createdAt } } } }
}}}
```

If `reviews.nodes[]` has one entry per verdict-and-attempt (not two per verdict-and-attempt), the fix is working.

**REST probe** to confirm the corrected Leg 1 path is what verified the POST:
```bash
gh api "/repos/o/r/pulls/123/comments?per_page=100" \
  --jq '[.[] | select(.pull_request_review_id == <REVIEW_ID>)] | length'
```
The count returned MUST equal `bundle.comments.length` (the anchored-finding count).

## What to watch in the session ledger

The run's `.generacy/cockpit/auto-runs/<slug>-<timestamp>.ledger` should show:

**Happy path** — two lines, no retry:
```
owner/repo#123 · waiting-for:implementation-review · review-analysis+request-changes · posted (3 inline, 0 in body)
owner/repo#123 · waiting-for:implementation-review · postcondition-passed · leg1=3/3 · leg2=3/3
```

**Read-replica lag absorbed by inline poll** — same two lines. The poll is invisible to the ledger (it does not emit per-attempt lines); the only signal is that the POST is not re-fired.

**Genuine POST-side undercount, outer retry recovers** — four lines:
```
owner/repo#123 · waiting-for:implementation-review · postcondition-failed · attempt=1 · leg1=2/3 · leg2=3/3
owner/repo#123 · waiting-for:implementation-review · review-post-retry · attempt=1 · reason=leg1-undercount:2/3
owner/repo#123 · waiting-for:implementation-review · review-analysis+request-changes · posted (3 inline, 0 in body)
owner/repo#123 · waiting-for:implementation-review · postcondition-passed · leg1=3/3 · leg2=3/3
```

**Outer retry did not help, gate re-fires** — five lines:
```
owner/repo#123 · waiting-for:implementation-review · postcondition-failed · attempt=1 · leg1=2/3 · leg2=3/3
owner/repo#123 · waiting-for:implementation-review · review-post-retry · attempt=1 · reason=leg1-undercount:2/3
owner/repo#123 · waiting-for:implementation-review · postcondition-failed · attempt=2 · leg1=2/3 · leg2=3/3 · re-present-gate
owner/repo#123 · waiting-for:implementation-review · review-analysis+<operator-verdict> · <outcome>
```

## Pre-fix vs post-fix signatures in the ledger

The pre-fix defect is unmistakable in the ledger. If you see any of these patterns after the fix ships, the fix is not on the executor's path:

| Signature | Interpretation |
|---|---|
| `postcondition-failed · attempt=1 · leg1=undefined/N` (or any `leg1=/N`) | Executor still reading `response.comments`. Pre-fix bug present. |
| `postcondition-failed · attempt=1 · leg1=0/N · leg2=N/N` after a POST that visibly succeeded (comments present on PR) | Same as above — Leg 1 read `undefined`, coerced to 0. |
| Two identical `review-analysis+request-changes · posted` lines seconds apart with no intervening operator gate | Pre-fix outer retry fired on the spurious Leg 1 failure and posted a duplicate. |

## Run the drift-pin test

```bash
pnpm --filter '@generacy/claude-plugin-cockpit' test playbook-verification
```

The new assertions from `research.md` § R5 should all pass:
- `postcondition-check.md` contains `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments` and `pull_request_review_id == response.id`.
- `postcondition-check.md` and `request-changes-post.md` do NOT contain `response.comments.length`.
- `postcondition-check.md` contains the `Login normalization` preamble heading.

If any assertion fails after a future edit, the correct response per `CLAUDE.md § Cockpit playbook pins` is to re-pin to the NEW contract, not to weaken the assertion.

## Common issues

**`leg1=<a>/<n>` with `a < n` on a PR that visibly has all `n` comments** — the executor's paginated GET is likely capping at `per_page=30` (the default) instead of the `per_page=100` the contract specifies. Verify the paginator call includes `?per_page=100` and uses `gh api --paginate` (or an equivalent manual loop). If pagination is correct, the actual undercount indicates a POST-side per-entry drop — inspect the filter result's paths/lines and diff against the bundle.

**Inline poll appears to be missing** — the poll is deliberately silent in the ledger (no per-attempt lines). Signal that the poll is working: on a PR with visible replication lag (uncommon; single-digit seconds at worst), the POST is NOT re-fired and the `postcondition-passed` line appears 1–3 s after the POST. If the POST IS re-fired on lag, the executor is skipping the inline poll — check the amended prose in `auto.md` D.2 § step 4 and `review.md` step 5 sub-step 4.

**Leg 2 filtered count is 0 despite a visibly successful POST** — this is the original `snappoll` failure shape and is a separate class of bug (accepted-but-invisible; see #422). This fix does not change Leg 2 semantics beyond adding the `LoginNormalization` reference. If Leg 2 filtered = 0 after this fix ships, file a separate issue.

**Login normalization not applied** — `Generacy-AI[bot]` vs `generacy-ai` in Leg 2 tripping the filter to 0 despite matching threads visible on the PR. Confirm the `Login normalization` preamble is present at the top of `postcondition-check.md` and that Leg 2's `author.login ==` phrasing points at it (or is understood to be governed by it). The rule is contract-wide; individual legs do not restate it.

## Executable-documentation fixtures

Two fixture files ship in this spec dir as reference material for the intended behavior:

- `fixtures/postcond-known-good.md` — synthetic POST response, paginated GET pages, and GraphQL response for a 3-comment POST that Leg 1 passes on the first attempt.
- `fixtures/postcond-did-not-land.md` — same shape, but the GET returns a filtered count of 2 for a 3-comment bundle; Leg 1's inline poll exhausts and returns `genuine-undercount`, then the outer retry re-POSTs.

These are not run by CI (per Q5=C, the drift pin is the automated bar); they document what the corrected contract asserts.
