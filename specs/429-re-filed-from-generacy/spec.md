# Feature Specification: Fix auto.md request-changes postcondition Leg 1

**Branch**: `429-re-filed-from-generacy` | **Date**: 2026-07-16 | **Status**: Draft
**Source**: [generacy-ai/agency#429](https://github.com/generacy-ai/agency/issues/429) (re-filed from generacy-ai/generacy#961)

## Summary

The `/cockpit:auto` **request-changes postcondition guardrail** — introduced by agency #422 (PR #425, merged as `2467758` on 2026-07-15) — is broken on `develop` (`bf4a16a`). Leg 1 of the postcondition instructs an implementation to read `response.comments.length` from the response of `POST /repos/{o}/{r}/pulls/{n}/reviews`, but that response has **no `comments` field**. A literal implementation therefore:

1. Always sees Leg 1 fail on a successful POST (undefined vs. expected count).
2. Sleeps 2000 ms and **retries the POST — posting a duplicate review**.
3. Re-presents the G.2 verdict gate with a spurious "postcondition failed after retry" notice.

The guardrail as specified never confirms a real success and double-posts reviews. The 2026-07-16 snappoll run (christrudelpw/snappoll#2, #7, #8, #13) avoided the double-post only because the operator hand-verified against the correct fields — i.e., by **not** following the contract verbatim.

This feature re-specifies Leg 1 to verify inline-comment landing via a **separate** GitHub endpoint (`GET /repos/{o}/{r}/pulls/{n}/comments`) filtered to `pull_request_review_id == response.id`, and hardens Leg 2's author-login match against the REST vs. GraphQL bot-login rendering drift (`generacy-ai[bot]` vs. `generacy-ai`).

## Scope

Two files must be edited in lockstep, both of which pin the same rule:

- `packages/claude-plugin-cockpit/commands/auto.md` (the playbook — `auto.md:305` for Leg 1 prose, `auto.md:330` for Leg 2 binding)
- `specs/422-summary-auto-md-s/contracts/postcondition-check.md` (the contract that the playbook pin-tests reference)

A regression test must also be added or updated so that the postcondition passes for a known-good POST and fails only when the review genuinely did not land.

Note: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins the playbook by exact heading strings and contract rules. Any heading rename or contract wording change in `auto.md` must **re-pin** the assertion in the same PR (per [CLAUDE.md](../../CLAUDE.md) "Cockpit playbook pins").

## User Stories

### US1: Cockpit operator running `/cockpit:auto` on a PR needing changes

**As a** cockpit operator invoking `/cockpit:auto` on a PR that requires changes,
**I want** the request-changes postcondition to confirm a successful review POST on the first attempt,
**So that** the guardrail does not double-post reviews or spuriously re-present the verdict gate.

**Acceptance Criteria**:
- [ ] A single-comment `request-changes` POST that lands correctly passes Leg 1 on the first check — no retry, no re-present, no duplicate review on the PR.
- [ ] When the POST truly fails (e.g., 4xx/5xx, or the review or comments do not appear on the PR), Leg 1 correctly reports failure and the retry-once-then-re-present flow proceeds as designed.

### US2: Future implementer reading the contract

**As a** future implementer or agent reading `contracts/postcondition-check.md` and `auto.md`,
**I want** Leg 1 to name a field that actually exists on the GitHub REST response,
**So that** a literal, faithful implementation of the contract passes the postcondition.

**Acceptance Criteria**:
- [ ] Neither `auto.md` nor `contracts/postcondition-check.md` reference `response.comments` (or `response.comments.length`).
- [ ] Leg 1 references only fields observed on the actual `POST …/reviews` response: `_links, author_association, body, commit_id, html_url, id, node_id, pull_request_url, state, submitted_at, user`.

### US3: Robustness against bot-login rendering drift

**As a** guardrail author,
**I want** Leg 2's author-login comparison to treat `generacy-ai` and `generacy-ai[bot]` as the same identity,
**So that** an implementation that binds `<acting-bot-login>` to a REST-derived login (rather than the GraphQL `viewer.login`) still passes.

**Acceptance Criteria**:
- [ ] Leg 2 compares login identifiers after stripping a trailing `[bot]` suffix, or documents an equivalent normalization step.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | In `contracts/postcondition-check.md` § Leg 1 and `auto.md:305` D.2 prose, replace the `response.comments.length == bundle.comments.length` rule with a rule that (a) issues `GET /repos/{o}/{r}/pulls/{n}/comments`, (b) filters the returned array to entries where `pull_request_review_id == response.id`, and (c) compares that filtered count to `bundle.comments.length`. | P0 | Must-fix. This is the root defect. |
| FR-002 | Neither `auto.md` nor `contracts/postcondition-check.md` may read `response.comments` in any leg. | P0 | Guardrail against reintroduction. |
| FR-003 | In `contracts/postcondition-check.md` § Leg 2 and `auto.md:330`, normalize both sides of the `author.login` comparison by stripping a trailing `[bot]` suffix before the `==`. | P1 | Defense-in-depth against a REST-bound `<acting-bot-login>`. |
| FR-004 | Update `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins to match the new heading strings and contract rules produced by FR-001 and FR-003. | P0 | Required by CLAUDE.md "Cockpit playbook pins" — re-pin, do not weaken. |
| FR-005 | Add or update a regression test that (a) asserts the postcondition passes for a synthetic known-good POST result (review-id and matching inline comments present on the PR) and (b) asserts it fails when the review did not land (missing review-id or comment-count mismatch). | P0 | Prevents future regressions of the guardrail semantics. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | First-attempt pass rate on a successful single-comment `request-changes` POST | 100% | End-to-end verification against a real PR (e.g., a fresh throwaway PR in a scratch repo) — one review lands, guardrail confirms without retry or re-present. |
| SC-002 | Duplicate review posts caused by the guardrail | 0 | Inspect the PR timeline after a successful guardrail run — exactly one review submitted by the acting bot. |
| SC-003 | Contract references to non-existent response fields | 0 | Text search of `auto.md` and `contracts/postcondition-check.md` — no matches for `response.comments` or `response.comments.length`. |
| SC-004 | Regression test coverage of the postcondition | Pass on known-good, fail on genuine miss | Run the new/updated test — both fixtures produce the expected verdict. |
| SC-005 | Playbook-pin test drift | 0 pins failing on `main` after merge | `pnpm -F @tetrad/claude-plugin-cockpit test playbook-verification` passes. |

## Assumptions

- The `GET /repos/{o}/{r}/pulls/{n}/comments` endpoint returns comment objects that carry a `pull_request_review_id` field linking each comment to the review that created it. (This is documented GitHub REST v3 behavior — confirm during /plan.)
- The Leg 2 GraphQL path (`viewer.login` vs. `reviewThreads…author.login`) is not changing — the FR-003 normalization is additive hardening, not a semantic change to what identity is being asserted.
- The postcondition contract is authoritative only for the `/cockpit:auto` playbook; other cockpit playbooks that post reviews (if any) will be audited but are out of scope for this feature unless they also import the same contract.

## Out of Scope

- Rewriting the broader G.2 verdict-gate flow, retry policy, or timing constants (2000 ms sleep).
- Any change to `approve` or `comment` post flows — only `request-changes` is broken here.
- Changing how `<acting-bot-login>` is bound in the playbook (REST vs. GraphQL); FR-003 hardens the comparison instead.
- Migrating the postcondition contract out of `specs/422-summary-auto-md-s/` into a shared location (may be reasonable later, not required to fix the bug).

---

*Generated by speckit; enhanced from generacy-ai/agency#429.*
