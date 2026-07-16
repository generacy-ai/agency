# Clarifications: Fix auto.md request-changes postcondition Leg 1

**Feature**: `429-re-filed-from-generacy`
**Source Issue**: [generacy-ai/agency#429](https://github.com/generacy-ai/agency/issues/429)

---

## Batch 1 — 2026-07-16

### Q1: Scope — third file with same bug
**Context**: The spec's Scope lists only `packages/claude-plugin-cockpit/commands/auto.md` and `specs/422-summary-auto-md-s/contracts/postcondition-check.md`. But `specs/422-summary-auto-md-s/contracts/request-changes-post.md` also encodes the buggy rule — line 74 says to "extract … `.comments[].length` (accepted-by-POST count)" from the POST response, and line 80 states Leg 1 as `response.comments.length == bundle.comments.length`. A literal implementer of that contract will re-introduce the exact defect FR-001/FR-002 is supposed to fix.
**Question**: Should `contracts/request-changes-post.md` be edited in the same PR to remove the `response.comments[].length` capture and align its Postconditions § Leg 1 wording with the fixed rule?
**Options**:
- A: Yes — add it to Scope and edit alongside the other two files (recommended for FR-002 to be enforceable across the contract set).
- B: No — leave `request-changes-post.md` as-is and rely on `postcondition-check.md` as the sole authoritative Leg 1 source (accept the drift).
- C: Different scope — edit only the specific `.comments[].length` line, leave the rest of `request-changes-post.md` untouched.

**Answer**: A — Yes. Add specs/422-summary-auto-md-s/contracts/request-changes-post.md to Scope and fix it in the same PR. Its line 74 (the .comments[].length "accepted-by-POST count" capture) and line 80 (response.comments.length == bundle.comments.length) encode the identical buggy rule; leaving them means a literal implementer re-introduces the exact defect FR-001/FR-002 fix. Align all three files' Leg-1 wording to the corrected GET-based rule (GET /repos/{o}/{r}/pulls/{n}/comments filtered on pull_request_review_id == response.id) so the contract set is internally consistent and FR-002 is actually enforceable.

### Q2: Pagination on `GET /repos/{o}/{r}/pulls/{n}/comments`
**Context**: FR-001's new rule filters the GET response by `pull_request_review_id == response.id`. That endpoint paginates (30/page default, 100/page max) and returns comments across **all** reviews on the PR. On a long-lived PR with prior review rounds, the review's own comments could span more than one page. If Leg 1 only reads page 1, a legitimate POST could report a false undercount and trip the retry.
**Question**: How should the implementation handle pagination on `GET /pulls/{n}/comments` when computing the filtered count?
**Options**:
- A: Fetch one page with `per_page=100` and treat that as sufficient (matches Leg 2's `first: 50` first-page-only pragma; simple, but caps at 100 total comments across the whole PR).
- B: Paginate fully until the filtered count reaches `bundle.comments.length` (early-exit optimization; correct under all PR sizes; more complex).
- C: Paginate fully with no early exit (fully general; slowest on large PRs).

**Answer**: B — Paginate GET /repos/{o}/{r}/pulls/{n}/comments with per_page=100, filter to pull_request_review_id == response.id, and stop early once the filtered count reaches bundle.comments.length. Do not read only page 1 (option A caps at 100 comments across the whole PR and re-creates the undercount-and-retry on long-lived / multi-round PRs). On a genuine POST-side drop the filtered count never reaches the expected value, so the loop naturally exhausts all pages before concluding an undercount — which is exactly the correct failure signal Leg 1 is meant to raise.

### Q3: Eventual-consistency handling on the new GET check
**Context**: The current outer retry-once-then-re-present flow (2000 ms backoff between attempts) was designed around Leg 2's GraphQL read-replica lag. The new Leg 1 GET is a REST endpoint against a different backing store and could exhibit its own eventual-consistency window — a fresh POST returns `.id` immediately, but the comments may not yet appear in `GET /comments`. If Leg 1 has no inline patience, a valid POST could still false-negative → outer retry → duplicate POST (defeating the whole fix).
**Question**: Should Leg 1 include its own inline retry/backoff on the GET check, or should it rely solely on the existing outer retry-once-with-2s flow?
**Options**:
- A: Rely on the outer retry only — keep Leg 1 as a single GET and let the outer 2s+retry handle lag (simpler; matches current guardrail shape; but retry re-POSTs, causing the duplicate we're trying to prevent).
- B: Inline poll — Leg 1 polls GET up to N times with backoff (e.g., 3 attempts, 500 ms → 1 s → 2 s) before returning a failure verdict; the outer retry re-POSTs only if the inline poll also failed.
- C: Distinguish the failure modes — Leg 1 returns "not-yet-visible" vs. "genuinely missing"; only the latter triggers an outer re-POST retry, the former re-runs the GET.

**Answer**: B — Give Leg 1 its own inline poll on the GET (e.g. 3 attempts, 500ms -> 1s -> 2s backoff) before it returns a failure verdict, so REST read-replica lag on a just-created review cannot false-negative. Only a still-short filtered count after the inline poll is a real failure. This keeps the outer retry (which re-POSTs the review) from firing on mere propagation lag — that outer re-POST is precisely the duplicate-review this whole fix exists to eliminate. Option C's "not-yet-visible vs genuinely-missing" split collapses to the same elapsed-time signal the inline poll already encodes, so B is the simpler equivalent; A defeats the fix.

### Q4: `[bot]` normalization scope and case-sensitivity
**Context**: FR-003 says to "strip a trailing `[bot]` suffix" on both sides of the Leg 2 `author.login` comparison. Two open questions: (1) Should the normalization apply only to Leg 2, or be encoded as a general rule for **any** login comparison in the postcondition contract (defense-in-depth against future legs)? (2) Should the comparison also be case-insensitive (e.g., `Generacy-AI[bot]` vs. `generacy-ai`), or is the strict `[bot]`-suffix strip sufficient?
**Question**: What's the intended scope and semantics of the `[bot]` normalization?
**Options**:
- A: Leg 2 only + case-sensitive strip (minimal change — matches the FR-003 wording literally).
- B: Leg 2 only + case-insensitive comparison (adds case-fold to the same site).
- C: All login comparisons in `postcondition-check.md` + case-sensitive strip (encodes the normalization as a contract-wide rule).
- D: All login comparisons + case-insensitive (most defensive).

**Answer**: D — Define one login-normalization rule (strip a trailing [bot] suffix, then compare case-insensitively) and apply it to every login comparison in postcondition-check.md, not just Leg 2. It is a doc-level rule so the cost is trivial, and the entire #961 class is API-identity mismatch. Note for /plan: Leg 2 as currently written is already GraphQL-to-GraphQL (<acting-bot-login> is bound to GraphQL viewer.login and compared against GraphQL reviewThreads...author.login, both "generacy-ai"), so this normalization is defense-in-depth that keeps a future leg — or an implementation that binds <acting-bot-login> to a REST-derived generacy-ai[bot] login — from tripping.

### Q5: Regression test approach and location
**Context**: FR-005 requires a regression test that "asserts the postcondition passes for a synthetic known-good POST result" and "fails when the review did not land." The existing `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins the playbook by exact heading strings and contract rules — it is a static drift audit, not a behavior test. The regression test FR-005 describes needs to exercise the actual postcondition-check logic against synthetic GitHub REST responses.
**Question**: What implementation approach and location should the regression test take?
**Options**:
- A: HTTP-mocked unit test (nock / msw / undici mock) with fixture GitHub responses, in a **new** test file (e.g., `tests/postcondition-check.test.ts`). `playbook-verification.test.ts` stays as-is (static pin audit only).
- B: HTTP-mocked unit test **inside** `playbook-verification.test.ts` (one file covers both drift audit and behavior regression).
- C: Contract-parsing test — the test reads `postcondition-check.md`, extracts the rule, and asserts it against a fixture without mocking HTTP (leaner but tests the spec, not the implementation).
- D: Defer — the executor of the postcondition today is the LLM interpreting `auto.md` at runtime (no compiled TS implementation yet); the regression test is a fixture bundle in the spec dir, not a Vitest test.

**Answer**: C, with FR-005 re-interpreted — there is no compiled TS implementation of the postcondition to HTTP-mock; the executor is the cockpit:auto LLM interpreting auto.md at runtime, so options A/B test nothing real. Implement a contract/playbook pin test that (1) asserts the corrected Leg-1 rule text is present in postcondition-check.md (GET .../pulls/{n}/comments filtered on pull_request_review_id == response.id) and (2) asserts the buggy substring "response.comments.length" is absent from both postcondition-check.md and request-changes-post.md, so any drift back to the defect fails CI. Also re-pin the existing packages/claude-plugin-cockpit/tests/playbook-verification.test.ts assertions to the corrected wording rather than leaving stale pins (the "re-pin, don't weaken" rule). Ship the synthetic known-good / did-not-land fixture pair from option D in the spec dir as executable documentation of the intended behavior.
