# Research: Inline-thread request-changes contract

## R1 — Why the current contract "posts inline comments" but the run posted a body

**Observed on christrudelpw/snappoll PR #14** (2026-07-14):

- Review 1 22:07:46Z: `event: COMMENTED`, one body containing "3 blocking findings" as markdown, `reviewThreads(first:30)` empty.
- Review 2 22:49:54Z: same shape — one body, zero threads.
- Round-2 fix instructions (`git rm -r --cached node_modules .env`) never dispatched; operator ran them manually at 23:15:43.

**Root cause**: both `auto.md` (D.2/D.3) and `review.md` (step 5) name the goal ("per-finding inline comments") but neither specifies a **postcondition** the executor must satisfy. The executor was free to assemble a `gh api ... /reviews` POST with `body:` populated and `comments[]` empty, and GitHub happily accepted it as a COMMENTED review with no threads. `PrFeedbackMonitorService` reads `reviewThreads` — a body-only review is invisible to the monitor.

**Decision**: Add a **postcondition guardrail** whose success criterion is *the thing the consumer reads*, not the thing the writer intended. This matches the loop-trust-boundary principle already used in auto.md step 4a (batch is advisory, live-state is authoritative).

## R2 — Anchor validation against PR diff hunks

**Problem**: GitHub's PR inline review comments API rejects `comments[]` entries whose `path:line` is not inside the PR's diff hunks (a narrow multi-line span rule applies; single-line anchors — which SB.2 emits — either match or don't). If the analyzer's `line` is a context line near the change (a common precision issue), the whole POST 422s or the specific entry is rejected depending on the client library's atomicity.

**Alternatives considered**:

- **A. Pre-validate** every anchor by parsing `gh pr diff <ref>` for hunk ranges, and demote anchors that fall outside to the anchor-less section. **Chosen.**
- **B. Post first, catch 422**, drop the offending entry, re-POST. Rejected: burns a round trip on a known-rejectable payload; the POST's per-entry atomicity is documented but ambiguous under partial-comment 422s; and this pattern hides analyzer imprecision from operators looking at the ledger.
- **C. Fail the whole verdict** and re-prompt the analyzer. Rejected: turns routine precision drift (line ±3) into a hard failure loop; the analyzer already returned a valid finding, just at a nearby line.

**Rationale** (from Q1=A clarification): the executor already holds the diff in the review flow, so validation is free and deterministic; the failure mode of a stale/context-line anchor is exactly the shape the FR-004 body section is designed to catch.

**Implementation note**: `gh pr diff <owner>/<repo>#<n>` returns a unified diff. Hunk headers (`@@ -A,B +C,D @@`) define the ranges. An anchor `path:line` is inside a hunk iff there exists a hunk in `path` whose `+C..+C+D-1` range contains `line`. This is a ~30-line shell/awk snippet the parent loop can run inline; no library needed.

## R3 — Postcondition: POST response vs GraphQL query

**Problem**: FR-002 says verify by either the POST response or `reviewThreads`. They're different: POST response is atomic-with-the-write but proves nothing about visibility; `reviewThreads` is what the monitor reads but costs a round trip.

**Alternatives**:

- **A. POST response only** — cheapest but doesn't guard the exact failure mode this branch exists to prevent (accepted-but-invisible).
- **B. GraphQL only** — proves visibility but hides the failure surface if the POST silently under-counted.
- **C. Both** — POST-response count must equal anchored-finding count; then a follow-up `reviewThreads(first:N)` returns ≥ that many *new* (created ≥ the POST timestamp) unresolved threads. **Chosen (Q2=C).**

**Rationale**: The one extra API call is nothing against another silent feedback-loop disconnect. The two-leg check localizes the failure — a mismatch on leg 1 is a POST-side bug, a mismatch on leg 2 is a visibility/replication bug — and both legs are cheap.

**GraphQL query shape** (see `contracts/postcondition-check.md`):

```graphql
query($owner:String!, $repo:String!, $pr:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$pr) {
      reviewThreads(first:50) {
        nodes { id isResolved createdAt path line comments(first:1){ nodes { author { login } createdAt } } }
      }
    }
  }
}
```

Filter client-side to threads whose `createdAt >= <POST timestamp>` and whose author matches the acting bot — that gives the "new threads from this POST" count.

## R4 — Failure recovery: retry, ask, or abort?

**Alternatives**:

- **A. One bounded retry (2s backoff) → re-present verdict gate.** **Chosen (Q3=A).** Auto-heals transient 5xx (the common case; GitHub REST regularly emits 502/504); when the failure is real, the operator gets the verdict gate back with the failure context in the prompt.
- **B. Never retry — re-present gate immediately.** Rejected: makes every transient 5xx a human interrupt.
- **C. Hard abort → outer loop retries.** Rejected: throws away completed review analysis and the operator's verdict.

**Rationale**: Matches the bounded-fixer idiom already used in D.6 (one autonomous attempt, then escalation gate). The retry bound is the guardrail; the re-presented gate is the honest next step when the retry doesn't help.

**Re-presentation shape**: the verdict gate's presentation block gains a prepended failure notice — the POST/GraphQL error `code`/`message` verbatim, plus a "postcondition failed after retry" line. The operator can choose `approve` (advance despite the failure — rare, but the operator's call), `request-changes` (try again — the retry counter is per-attempt, so a re-selection is a fresh POST + fresh retry allowance), or `abort` (walk away).

## R5 — Who resolves review threads

**Problem**: FR-005 says the re-review step should skip threads marked `isResolved`. But *who* resolves them? Three options:

- **A. Fix-loop agent** self-resolves after committing a fix. Rejected — this is the exact snappoll failure: the agent believed `.gitignore` fixed findings 1–2 (it didn't), and if it had self-resolved the threads, the re-review would have skipped them and shipped broken.
- **B. Only the re-review step** resolves, after verifying the fix. **Chosen (Q4=B).** Resolution then means "re-review's verdict," which is what FR-005's skip-optimization needs.
- **C. Operator resolves manually.** Rejected: shifts a routine agent-mechanical action onto a human for no benefit.

**Rationale**: Resolution must be *the verifier's* verdict, not the fixer's belief. The fixer replies in-thread (existing PR-comment mechanic, already used by `PrFeedbackMonitorService` for fix acknowledgements) but never calls `resolveReviewThread`.

## R6 — Anchor-less findings section marker

**Problem**: The re-review step and any tooling that parses the review body need a stable, machine-recognizable header for the anchor-less section. FR-004 phrasing alone ("under a clearly labeled General findings (no file anchor) section") is prose — grep-fragile.

**Alternatives**:

- **A. H2 only** — `## General findings (no file anchor)`. Grep works today but breaks if wording ever softens.
- **B. HTML comment only** — parseable but the visible section still needs a header, and readers see two headers.
- **C. Both** — HTML comment marker for tooling, H2 immediately after for humans. **Chosen (Q5=C).** Matches every other stable marker in this system (`generacy-cockpit:review-comment`, `generacy-clarifications:*`, `manual-advance`).

**Exact marker**: `<!-- generacy-cockpit:unanchored-findings -->` on its own line, followed by `## General findings (no file anchor)` on the next line. Findings render as `### Finding <n>` blocks under the H2, each with `**Finding:**`, `**Failure scenario:**`, and a `_reason: no diff-hunk anchor_` line so operators reading the review can distinguish "analyzer didn't supply a line" from "analyzer supplied a line outside the diff."

## Key sources

- GitHub REST — [Create a review for a pull request](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request) (`event`, `body`, `comments[]` shape).
- GitHub GraphQL — [`PullRequest.reviewThreads`](https://docs.github.com/en/graphql/reference/objects#pullrequestreviewthread) (thread `isResolved`, per-node `path`/`line`).
- `packages/claude-plugin-cockpit/commands/auto.md` D.2 / D.3 / G.2 (current contract text — this branch amends).
- `packages/claude-plugin-cockpit/commands/review.md` step 5 (current contract text — this branch amends).
- generacy#861 / #869 / #878 / #883 (`PrFeedbackMonitorService` lineage — the consumer this postcondition protects).
- Snappoll PR #14 (evidence: two body-only request-changes reviews, empty `reviewThreads`).
