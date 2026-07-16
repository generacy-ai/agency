# Contract: Corrected postcondition Leg 1

This contract replaces the buggy Leg 1 rule (`response.comments.length == bundle.comments.length`) at every site in the #422 contract set. It is the canonical source; the four edit sites listed under **Application** below carry the identical rule.

## Rule

**Leg 1** counts the inline comments actually created by the just-posted review, using a **separate REST endpoint** — never the POST response body — and compares that count to `bundle.comments.length` (the anchored-finding count).

### Procedure

1. Capture from the POST response:
   - `response.id` — the review ID.
   - `response.submitted_at` — kept for Leg 2's freshness filter (unchanged from #422).
   - **Do NOT read `response.comments`. It does not exist on this endpoint.**

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

6. If all four attempts exhaust and the count is still short → **Leg 1 outcome = `genuine-undercount`** → return failure to the outer combined verdict. The outer retry (per `postcondition-check.md` § Combined verdict) then applies its own 2 s backoff and re-POSTs the review once. Do NOT re-POST inline — the poll is READ-side only.

### Pass criterion

`filteredCount == bundle.comments.length` at any point in the inline-poll budget.

### Failure criterion

Filtered count remains `< bundle.comments.length` after four paginated attempts spanning the 3.5 s inline budget. This is a real POST-side drop — most commonly a per-entry rejection where a pre-validated anchor was *just outside* a hunk (an off-by-one in the pre-validator's hunk-range logic). Log the filtered comments' paths/lines and diff against the bundle to identify which entry(-ies) were dropped.

## Why not `response.comments`

The response body of `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` has these keys and no others:

```
_links, author_association, body, commit_id, html_url, id, node_id,
pull_request_url, state, submitted_at, user
```

Reading `response.comments.length` evaluates as `undefined.length` — a runtime error under any faithful executor. The literal interpretation of the pre-fix contract fails on every successful POST, trips the outer retry, and posts a duplicate review.

## Why paginate

`GET /repos/{o}/{r}/pulls/{n}/comments` returns comments across ALL reviews on the PR — including prior rounds. On a long-lived PR with multiple review rounds, this review's own comments could legitimately span more than one page (default `per_page=30`, max `100`). Reading only page 1 with `per_page=100` caps Leg 1's visibility at 100 total comments across the whole PR — enough for typical PRs, but on any PR with historical review activity + a fresh multi-comment review the cap can produce a false undercount, tripping the outer retry and re-creating the duplicate-review bug.

Early exit keeps the happy-path cost at one round trip. Full pagination only occurs on the failure path where completeness matters.

## Why an inline poll (and not just the outer retry)

The outer retry mechanic is a **re-POST**. Falling through to it on read-replica lag re-creates the exact duplicate-review defect this contract exists to eliminate. The inline poll converts propagation lag into wall time, so only genuine POST-side drops reach the re-POST path.

## Application

The following four sites carry this rule verbatim (or reference it by heading). All are edited in the same PR:

1. `packages/claude-plugin-cockpit/commands/auto.md` — D.2 § step 4 "Leg 1" bullet (currently at line 305).
2. `packages/claude-plugin-cockpit/commands/review.md` — step 5 sub-step 4 "Leg 1" bullet (currently at line 123).
3. `specs/422-summary-auto-md-s/contracts/postcondition-check.md` — § Leg 1 rule + failure interpretation.
4. `specs/422-summary-auto-md-s/contracts/request-changes-post.md` — § Execution `Capture` list (drop `.comments[].length`) + § Postconditions Leg 1 wording.

## Drift pin

`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` gains assertions that (a) require the corrected wording to be present in `postcondition-check.md`, and (b) require the substring `response.comments.length` to be absent from both `postcondition-check.md` and `request-changes-post.md`. See `research.md` § R5 for the exact assertion list.
