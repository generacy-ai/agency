# Research: Fix `auto.md` request-changes postcondition Leg 1

Each section below records one decision, the alternatives that were considered, and the rationale for the chosen path. All five decisions correspond to the Batch-1 clarifications resolved 2026-07-16.

## R1 — Third file scoped: `request-changes-post.md`

**Problem**: The spec's Scope names two files (`packages/claude-plugin-cockpit/commands/auto.md` at line 305 and `specs/422-summary-auto-md-s/contracts/postcondition-check.md` § Leg 1). But `specs/422-summary-auto-md-s/contracts/request-changes-post.md` line 74 tells the executor to `extract .comments[].length (accepted-by-POST count)` from the POST response, and line 80 states Leg 1 as `response.comments.length == bundle.comments.length`. Both are the identical buggy rule at a different site. A literal implementer of `request-changes-post.md` re-introduces the exact defect this fix exists to eliminate.

**Alternatives**:

- **A. Add `request-changes-post.md` to Scope and edit it in the same PR.** **Chosen (Q1=A).** All three files' Leg-1 wording aligns to the corrected GET-based rule so the contract set is internally consistent and FR-002 ("the postcondition never reads a non-existent `response.comments` field") is actually enforceable across every reader.
- **B. Leave `request-changes-post.md` as-is** and treat `postcondition-check.md` as the sole authoritative Leg 1 source. Rejected: creates a documented conflict between two contract docs in the same directory that any future reader must reconcile. This is exactly the drift the pin test exists to catch.
- **C. Edit only the specific `.comments[].length` line** and leave surrounding prose in `request-changes-post.md` untouched. Rejected: line 80 (`response.comments.length == bundle.comments.length`) is the same buggy rule spelled out a second time in the same file — a targeted line edit would leave the defect on line 80 intact.

**Additional site found during plan drafting**: `packages/claude-plugin-cockpit/commands/review.md:123` encodes the identical `response.comments.length == bundle.comments.length` Leg-1 rule for the standalone `/cockpit:review --gate implementation-review` flow. It shares the same postcondition contract by reference. Recommend adding it to the edit set on the same rationale as Q1; see `plan.md` § Key Decisions "Note on `review.md`" for the escape hatch if the operator disagrees.

**Rationale**: FR-002 is a whole-contract invariant, not a per-file rule. If any documented site tells an executor to read `response.comments`, the defect is still latent for a future reader who consults that site first.

## R2 — Pagination on the new Leg 1 GET

**Problem**: FR-001's corrected rule filters `GET /repos/{o}/{r}/pulls/{n}/comments` by `pull_request_review_id == response.id`. The endpoint paginates (`per_page` default 30, max 100) and returns comments across **all** reviews on the PR. On a long-lived PR with prior review rounds, the review's own comments could span more than one page. Naïve first-page-only reading would false-negative on a legitimate multi-page result and trip the outer retry — re-POSTing the review and re-creating the very duplicate this fix eliminates.

**Alternatives**:

- **A. First page only, `per_page=100`.** Matches Leg 2's `first: 50` first-page pragma; simple; caps at 100 comments across the whole PR. Rejected: reintroduces the undercount-and-retry on long-lived / multi-round PRs, defeating the fix. Leg 2's first-page pragma is defensible because it counts *fresh unresolved threads by the acting bot* (a much narrower filter that rarely exceeds 50) — Leg 1's filter, keyed on a single review's `id`, is exact and needs completeness.
- **B. Paginate with `per_page=100` and early-exit once the filtered count reaches `bundle.comments.length`.** **Chosen (Q2=B).** Correct under all PR sizes. On a happy-path POST the filter matches every entry on page 1 and the loop exits after one round trip (no worse than option A). On a genuine POST-side drop the filtered count never reaches the expected value, so the loop naturally exhausts all pages before concluding an undercount — which is exactly the correct failure signal Leg 1 is meant to raise. Slightly more complex than A but the complexity is one `while` loop over `gh api --paginate` (or a manual `?page=N` loop with an exit condition).
- **C. Paginate fully with no early exit.** Fully general; wastes API budget on long-lived PRs where page 1 already sufficed. Rejected: B is strictly better — it collapses to C's semantics on the failure path (where completeness matters) and beats it on the happy path.

**Rationale**: Correctness first, cost second. The paginated GET adds at most one round trip on the happy path and bounds the failure path to the pages actually needed to prove the count. `gh api --paginate` handles page-cursor plumbing; the executor just accumulates the filter count and breaks when the threshold is met.

## R3 — Eventual-consistency handling on Leg 1

**Problem**: The current outer retry-once-then-re-present flow (2 s backoff between attempts) was designed around Leg 2's GraphQL read-replica lag. The new Leg 1 GET is a REST endpoint against a different backing store and could exhibit its own eventual-consistency window: a fresh `POST /reviews` returns `.id` immediately, but the just-created comments may not yet appear in `GET /comments`. If Leg 1 fires a single GET with no inline patience and the comments haven't propagated yet, the outer retry fires, re-POSTs the review, and creates the exact duplicate this whole fix exists to prevent.

**Alternatives**:

- **A. Rely on the outer retry only** — one GET, one 2 s backoff, one re-POST. Rejected: the outer retry mechanic is a re-POST, so falling through to it on propagation lag re-creates the duplicate-review bug. The outer retry's semantic is "the POST didn't take, try again"; it is the wrong lever for "the POST took but the read hasn't caught up yet."
- **B. Inline poll — 3 attempts with 500 ms → 1 s → 2 s backoff before Leg 1 returns a failure verdict.** **Chosen (Q3=B).** Total inline budget ≈ 3.5 s of wall time — well within GitHub's typical REST read-replica window (single-digit seconds). Only a still-short filtered count after the poll exhausts constitutes a real failure. Leg 1's failure verdict then feeds the outer retry only on genuine POST-side drops, which is exactly where re-POSTing might legitimately help.
- **C. Distinguish "not-yet-visible" vs "genuinely-missing"** — Leg 1 returns two failure modes; only the "genuinely-missing" one triggers an outer re-POST retry, the "not-yet-visible" one re-runs the GET. Rejected: the distinguishing signal is elapsed time (has the propagation window plausibly closed yet?), which the inline poll already encodes. C's added state machine buys nothing over B and is harder to specify.

**Rationale**: Match the retry mechanic to the failure mode. Read-replica lag is a poll-until-visible problem; POST-side drops are a re-POST-with-verification problem. B keeps the two concerns cleanly separated with the minimum specification surface.

**Backoff schedule (500 ms → 1 s → 2 s)** — matches Leg 2's outer 2 s ceiling on the last attempt, so a well-behaved GitHub is always seen within one outer cycle; the increasing backoff absorbs a longer-than-typical propagation window without a hot-loop of GETs.

## R4 — `[bot]` normalization scope and case-sensitivity

**Problem**: FR-003 says to "strip a trailing `[bot]` suffix" on both sides of Leg 2's `author.login` comparison. Two open sub-questions: (1) apply the strip only to Leg 2, or as a general rule for **every** login comparison in the postcondition contract? (2) also compare case-insensitively (e.g., `Generacy-AI[bot]` vs `generacy-ai`)?

**Alternatives**:

- **A. Leg 2 only, case-sensitive strip.** Minimal edit matching FR-003's literal wording.
- **B. Leg 2 only, case-insensitive.** Adds case-fold at the same site.
- **C. Contract-wide, case-sensitive strip.**
- **D. Contract-wide, case-insensitive.** **Chosen (Q4=D).**

**Rationale**: The entire generacy-ai/generacy#961 class is *API-identity mismatch* — REST renders bot logins as `<name>[bot]`, GraphQL as `<name>`, and both are case-preserved but not case-guaranteed. Documenting one rule at the top of `postcondition-check.md` and applying it everywhere:
- costs nothing in doc weight;
- prevents a future leg or a future implementer that binds `<acting-bot-login>` to a REST-derived form from tripping the same class of bug;
- is exactly the shape defense-in-depth belongs in.

**Note on Leg 2's current correctness**: as `auto.md:330` binds `<acting-bot-login>` to GraphQL `viewer.login` and Leg 2 compares against GraphQL `reviewThreads…author.login`, both render `generacy-ai` today, so Q4=D is defense-in-depth rather than an active bug fix. The must-fix is still Leg 1.

**Rule shape (contract-wide preamble in `postcondition-check.md`)**:

> **Login normalization**: any comparison of two `login` values in this document normalizes both sides by (1) stripping a single trailing `[bot]` suffix if present, then (2) comparing the results case-insensitively. Example: `Generacy-AI[bot]` and `generacy-ai` compare equal.

Every subsequent leg's `author.login ==` phrasing points at this preamble by name rather than re-stating the rule.

## R5 — Regression test approach and location (FR-005 re-interpretation)

**Problem**: FR-005 as written asks for a regression test that "asserts the postcondition passes for a synthetic known-good POST result" and "fails when the review did not land." Taken literally this implies an HTTP-mocked unit test against a compiled TypeScript implementation of the postcondition. **There is no such implementation.** The postcondition's executor is the `/cockpit:auto` LLM interpreting `auto.md` at runtime — a mocked unit test would exercise a mock, not the actual guardrail.

The existing `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (2265 lines) pins the playbook by exact heading strings and contract rules — it is a static drift audit, not a behavior test. A `grep -n 'Leg\|leg\d\|comments\.length\|reviewThreads\|pull_request_review_id'` on that file returns zero matches, so today no pin exists for the buggy Leg 1 text.

**Alternatives**:

- **A. HTTP-mocked unit test (nock / msw / undici mock) in a new `tests/postcondition-check.test.ts` file.** Rejected: exercises a mocked pipeline that does not exist in the shipped runtime; a green test would prove nothing about `auto.md`.
- **B. Same HTTP-mocked test inside `playbook-verification.test.ts`.** Rejected for the same reason as A — the test targets a non-existent implementation regardless of file placement — with the added downside of mixing static-drift-audit and dynamic-behavior concerns in one file.
- **C. Contract-drift pin — the test reads `postcondition-check.md` and asserts (1) the corrected Leg 1 rule text is present and (2) the buggy substring `response.comments.length` is absent from both `postcondition-check.md` and `request-changes-post.md`.** **Chosen (Q5=C, re-interpreting FR-005).** Also re-pins the existing `playbook-verification.test.ts` assertions to the corrected wording where they read the edited playbooks. Ship a synthetic known-good / did-not-land **fixture pair** (from option D's shape) in this spec dir as executable documentation.
- **D. Defer — fixture bundle in the spec dir only, no automated test.** Partially adopted: the fixture pair from D is kept as documentation, but pairing it with C's drift pin gives CI a mechanical bar to catch a regression to the defect.

**Rationale**: FR-005's intent is "a green CI run implies the defect cannot silently return." That intent is satisfied by C: the substring `response.comments.length` is exactly the payload of the bug; a `toContain(...)` assertion inverted with `.not.` catches any drift back to the buggy phrasing regardless of implementation surface. The fixture pair is kept because it's the only place the intended runtime behavior is spelled out (the LLM reads spec dirs as context).

**Pin shape (new test block in `playbook-verification.test.ts`)**:

- Assertion 1: `postcondition-check.md` contains the exact string `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments` and the exact string `pull_request_review_id == response.id`.
- Assertion 2: `postcondition-check.md` does NOT contain the substring `response.comments.length`.
- Assertion 3: `request-changes-post.md` does NOT contain the substring `response.comments.length` and does NOT contain `.comments[].length` in the § Execution Capture list.
- Assertion 4: `postcondition-check.md` contains the exact heading string for the Login normalization preamble (asserting the new contract-wide rule is present and named).

The `readdirSync(COMMANDS_DIR)` sweep already in `playbook-verification.test.ts:515` continues to pin every playbook file by structure, so `auto.md` and `review.md` heading changes are caught by the existing invocation-vs-`--help` drift audit even without a new pin against their specific Leg 1 prose.

## Key sources

- GitHub REST — [Get a review for a pull request](https://docs.github.com/en/rest/pulls/reviews) response schema (confirms no `comments` field on the POST reply).
- GitHub REST — [List review comments on a pull request](https://docs.github.com/en/rest/pulls/comments#list-review-comments-on-a-pull-request) (`GET /repos/{o}/{r}/pulls/{n}/comments`; each comment carries `pull_request_review_id` per response schema).
- GitHub GraphQL — [`PullRequest.reviewThreads`](https://docs.github.com/en/graphql/reference/objects#pullrequestreviewthread) (Leg 2, unchanged).
- `packages/claude-plugin-cockpit/commands/auto.md` D.2 § step 4 (buggy Leg 1 text — this fix amends).
- `packages/claude-plugin-cockpit/commands/review.md` step 5 sub-step 4 (buggy Leg 1 text at a second site — this fix amends).
- `specs/422-summary-auto-md-s/contracts/postcondition-check.md` § Leg 1 (buggy Leg 1 text at a third site — this fix amends).
- `specs/422-summary-auto-md-s/contracts/request-changes-post.md` §§ Execution + Postconditions (buggy Leg 1 text at a fourth site — this fix amends).
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (existing 2265-line drift-audit test — this fix adds a new pin block).
- Snappoll dogfood evidence: christrudelpw/snappoll#2, #7, #8, #13 (2026-07-16) — operator worked around the defect by verifying against the correct fields by hand; confirms no double-posts occurred *because* the contract was not followed verbatim.
