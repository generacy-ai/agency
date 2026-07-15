# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-15 17:18

### Q1: Anchor outside diff hunk
**Context**: GitHub's inline-review-comments API rejects `comments[]` entries whose `path:line` is not within the PR's diff hunks (with narrow multi-line exceptions). If the analyzer emits a finding at `file:line` for a line the PR didn't touch, POST will 422 on that entry. FR-004 covers the case where anchor is missing (null), but not where the anchor is provided-but-invalid — and the whole POST could fail atomically depending on how it's constructed.
**Question**: How should the executor handle a finding whose `file:line` is populated but not inside a PR diff hunk (GitHub will reject inline anchoring)?
**Options**:
- A: Treat it as anchor-less (fall through to FR-004 body section); count it as un-anchorable in the FR-002 postcondition.
- B: Fail the whole verdict post as an analyzer bug — surface an error and re-prompt the analyzer to re-anchor to a diff line.
- C: Attempt the POST first; if GitHub returns a 422 on that specific comment, drop that entry to the body section and re-POST once.

**Answer**: A — Pre-validate every anchor against the PR diff before posting; a populated `file:line` outside the diff hunks is treated as anchor-less (falls to the FR-004 body section) and counts as un-anchorable in the FR-002 postcondition.
**Rationale:** The executor already holds the diff in the review flow, so validation is free and deterministic; posting first and dropping 422s burns an API round-trip on a known-rejectable payload with atomicity ambiguity, and failing the whole post turns a routine analyzer imprecision (citing a context line near the change) into a hard failure loop.

### Q2: Postcondition source of truth
**Context**: FR-002 says verify by querying `reviewThreads` OR by reading the POST response's `comments` count. These are subtly different: the POST response returns immediately with the comments it accepted; `reviewThreads` is a fresh GraphQL query that reflects what the monitor will actually see. The choice affects both correctness and latency of the guardrail.
**Question**: Which source should FR-002's postcondition check use to count inline threads?
**Options**:
- A: The POST response's `comments[]` length — cheapest, atomic with the write, but doesn't prove the threads are visible to a subsequent GraphQL reader.
- B: A fresh `reviewThreads(first:N)` GraphQL query after the POST — most faithful to what `PrFeedbackMonitorService` sees, at the cost of one extra API call.
- C: Both: assert POST-response count matches anchored-finding count AND the subsequent GraphQL query returns ≥ that many new unresolved threads.

**Answer**: C — Both: assert the POST response accepted the anchored-finding count AND a follow-up `reviewThreads` GraphQL query returns at least that many new unresolved threads.
**Rationale:** The bug this guards against shipped precisely because nothing checked what the consumer sees — `PrFeedbackMonitorService` reads GraphQL threads, so that leg is non-negotiable — while the POST-response leg is free and localizes the failure (accepted-but-invisible vs rejected-at-write) when the two disagree. One extra API call is nothing against another silent feedback-loop disconnect.

### Q3: Guardrail failure recovery
**Context**: FR-003 says on postcondition failure the playbook must not emit `Feedback posted:` and instead emits `Error handling` and 're-presents the verdict gate.' That leaves the actual recovery behavior undefined — does it silently retry, ask the operator, abort the turn, or something else? This determines whether a transient GitHub 5xx auto-heals or requires a human.
**Question**: When the FR-002 postcondition fails, what should the executor do next?
**Options**:
- A: Retry the POST once inline (bounded, e.g. one retry with 2s backoff); if still failing, ask operator via AskUserQuestion.
- B: Do not retry — immediately re-present the verdict gate to the operator (approve/request-changes/abort) with the failure context in the prompt.
- C: Abort the turn with a hard error; leave the PR untouched and let the outer /cockpit:auto loop retry the whole verdict.

**Answer**: A — Retry the POST once inline (bounded, ~2 s backoff); if the postcondition still fails, re-present the verdict gate to the operator with the failure context.
**Rationale:** A single bounded retry auto-heals the common transient 5xx without waking a human, and keeps the gate re-presentation as the honest next step when the failure is real; a hard abort throws away a completed review analysis the operator already invested a verdict in. Matches the bounded-fixer idiom the merge flow already uses.

### Q4: Fix-loop thread resolution
**Context**: FR-005 says the re-review step must check `reviewThread.isResolved` per finding and skip re-verification of resolved threads. But nothing in the spec says who resolves them. If the fix-loop agent doesn't explicitly resolve, threads stay open and re-review re-verifies every finding, defeating FR-005's purpose. If it always resolves after a diff attempt, resolution stops meaning 'genuinely fixed.'
**Question**: Who should mark a review thread `resolved` after the fix-loop addresses a finding?
**Options**:
- A: The fix-loop agent calls `resolveReviewThread` for each finding it believes it fixed, in the same turn as the fix commit; re-review verifies and reopens threads it disagrees with.
- B: Only the re-review step resolves threads it verifies as fixed; the fix-loop never resolves — threads track re-review's own conclusions.
- C: The operator resolves threads manually; agents only read `isResolved` and never write it.

**Answer**: B — Only the re-review step resolves threads it has verified as fixed; the fix-loop agent replies in-thread but never resolves.
**Rationale:** If the fixer resolves its own threads, "resolved" means "the fixer believes it's fixed," and FR-005's skip rule would then skip unverified claims — which is letter-for-letter the snappoll failure (the agent believed `.gitignore` alone resolved findings 1–2, and it didn't). Resolution as re-review's verified verdict makes the skip optimization sound; never let the fixer self-certify.

### Q5: Anchor-less findings marker
**Context**: FR-004 says un-anchored findings render 'under a clearly labeled General findings (no file anchor) section' in the review body. For the re-review step and any tooling that parses the body, the exact section header string must be stable and machine-recognizable — otherwise parsing drifts.
**Question**: What should the exact section header string be for anchor-less findings in the review body?
**Options**:
- A: Literal H2 `## General findings (no file anchor)` — matches the phrasing already in FR-004, easy to grep.
- B: A machine-parseable HTML comment marker like `<!-- speckit:unanchored-findings -->` followed by an H3, so display prose can change without breaking parsers.
- C: Both — the HTML comment marker for tooling and a human-readable H2 immediately after, so either parsing approach works.

**Answer**: C — Both: a machine marker `<!-- generacy-cockpit:unanchored-findings -->` immediately followed by the human-readable H2 `## General findings (no file anchor)`.
**Rationale:** Every stable machine surface in this system is already an HTML comment marker (`generacy-cockpit:review-comment`, `generacy-clarifications:*`, `manual-advance`) — parsers key on the marker while the visible heading stays free to be reworded. One extra line buys both audiences.

