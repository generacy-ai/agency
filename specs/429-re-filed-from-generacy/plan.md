# Implementation Plan: Fix `auto.md` request-changes postcondition Leg 1

**Feature**: Correct the D.2/D.3 `request-changes` postcondition so Leg 1 counts inline comments via `GET /repos/{o}/{r}/pulls/{n}/comments` filtered on `pull_request_review_id == response.id` (instead of the non-existent `response.comments` field on the POST reply), give Leg 1 its own inline poll to absorb REST read-replica lag, and encode a `[bot]`-suffix-strip + case-insensitive normalization for every login comparison in the postcondition contract.
**Branch**: `429-re-filed-from-generacy`
**Status**: Complete

## Summary

The `/cockpit:auto` request-changes guardrail introduced by agency #422 encoded a Leg 1 rule that reads a field the GitHub REST API never returns. `POST /repos/{o}/{r}/pulls/{n}/reviews` responds with `{_links, author_association, body, commit_id, html_url, id, node_id, pull_request_url, state, submitted_at, user}` — no `comments` field. So the specified check `response.comments.length == bundle.comments.length` evaluates against `undefined.length`, "fails" on every real success, triggers the outer 2 s retry, and re-POSTs the review (a duplicate). The 2026-07-16 snappoll run confirmed the defect is still present on `develop@bf4a16a` — the operator worked around it by verifying against the correct fields by hand.

This feature is a **contract-doc-only** fix. It touches four files that encode or reference the buggy rule:

- `packages/claude-plugin-cockpit/commands/auto.md` (D.2 § step 4 Leg 1 prose, line 305 today)
- `packages/claude-plugin-cockpit/commands/review.md` (step 5 sub-step 4 Leg 1 prose, line 123 today)
- `specs/422-summary-auto-md-s/contracts/postcondition-check.md` (§ Leg 1 rule + failure interpretation)
- `specs/422-summary-auto-md-s/contracts/request-changes-post.md` (§ Execution `Capture` list + § Postconditions Leg 1)

Every occurrence of `response.comments.length` is replaced by a paginated GET-and-filter rule; a `[bot]`-suffix-strip + case-fold normalization is added at the top of `postcondition-check.md` and threaded through Leg 2's `author.login` comparison; and `playbook-verification.test.ts` gains contract-drift assertions that (1) require the corrected Leg 1 wording to be present in `postcondition-check.md` and (2) require the substring `response.comments.length` to be absent from both `postcondition-check.md` and `request-changes-post.md` so any regression fails CI.

Per the Q5 clarification the FR-005 regression test is re-interpreted: the postcondition's executor is the `/cockpit:auto` LLM interpreting `auto.md` at runtime — there is no compiled TS implementation to HTTP-mock — so behavior verification lives as an executable-documentation fixture pair in `specs/429-re-filed-from-generacy/fixtures/` while the automated regression is the contract-drift pin in `playbook-verification.test.ts`.

## Technical Context

| Field | Value |
|---|---|
| Language | Markdown (playbook contracts + spec docs) |
| Runtime | Claude Code session (parent loop) + `gh` CLI (`gh api` REST, `gh api graphql`) |
| APIs | REST `POST /repos/{o}/{r}/pulls/{n}/reviews` (unchanged), REST `GET /repos/{o}/{r}/pulls/{n}/comments` (**new** in Leg 1), GraphQL `pullRequest.reviewThreads` (Leg 2, unchanged) |
| Files touched | 4 markdown files (2 playbooks + 2 contract docs) + `playbook-verification.test.ts` (new pin) + a fixture pair in this spec dir |
| Dependencies | None new. `gh` CLI already required by preflight. |
| Analyzer schema | Unchanged (SB.2 return, unaffected by this fix) |

The parent loop already uses `gh api` for REST and `gh api graphql` for GraphQL; the only new shell verb is a `gh api --paginate` call on `/pulls/{n}/comments`. No new tool binding, no new dependency.

## Project Structure

```
packages/claude-plugin-cockpit/
├── commands/
│   ├── auto.md                             # EDIT: D.2 § step 4 Leg 1 prose (line 305 today)
│   └── review.md                           # EDIT: step 5 sub-step 4 Leg 1 prose (line 123 today)
└── tests/
    └── playbook-verification.test.ts       # EDIT: add drift-pin block for corrected Leg 1 + banned substring

specs/422-summary-auto-md-s/contracts/
├── postcondition-check.md                  # EDIT: § Leg 1 rule + failure interpretation +
│                                           #        new "Login normalization" preamble
└── request-changes-post.md                 # EDIT: § Execution Capture list + § Postconditions Leg 1

specs/429-re-filed-from-generacy/
├── spec.md                                 # read-only
├── clarifications.md                       # read-only (Batch 1 resolved 2026-07-16)
├── plan.md                                 # this file
├── research.md                             # decisions + alternatives per clarified answer
├── data-model.md                           # corrected postcondition entities
├── quickstart.md                           # verification steps
├── contracts/
│   ├── leg1-corrected-rule.md              # the corrected Leg 1 rule (canonical)
│   └── login-normalization.md              # the [bot]-strip + case-fold rule (canonical)
└── fixtures/                               # created by /speckit:tasks alongside test edits
    ├── postcond-known-good.md              # synthetic POST/GET/GraphQL responses that pass
    └── postcond-did-not-land.md            # same shape but Leg 1 legitimately fails
```

No files outside `packages/claude-plugin-cockpit/` and `specs/{422,429}-*/` change. The change is contract-shape only — no package version bump, no dependency, no runtime code.

## Constitution Check

No `.specify/memory/constitution.md` exists in this repo (`ls /workspaces/agency/.specify/memory/` returns "No such file or directory"; `/workspaces/agency/.specify/` contains only `templates`). Nothing to check against beyond the invariants embedded in the playbooks themselves and CLAUDE.md:

- **CLAUDE.md § Cockpit playbook pins** — "If your edit breaks a pin, the correct response is to **re-pin the assertion to the NEW contract** in the same PR. Do NOT weaken or delete an assertion to make the test pass." This plan respects the rule: no existing `playbook-verification.test.ts` assertion pins the buggy Leg 1 text today (verified via `grep -n 'Leg\|leg\d\|comments\.length\|reviewThreads\|pull_request_review_id' packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — no matches), so the test change is a pure addition of a drift-pin block for the corrected wording. Every playbook edit stays inside the existing heading structure of D.2 / step 5, so the `readdirSync(COMMANDS_DIR)` sweep and `extractSubheadingBlock`/`extractInstructionsSteps` pins already in the test file continue to hold.
- **`auto.md` § Invariants #4** (no dispatch invokes a `/cockpit:*` slash command) — respected: the corrected guardrail is still `gh api` + gate re-presentation; no new command invocation.
- **`auto.md` § Invariants #1** (never merge on red) — untouched.
- **Loop-trust-boundary principle** — strengthened. The bug is that Leg 1 trusted a field the POST response never carried; the fix verifies against the same read path `PrFeedbackMonitorService` uses (`GET /pulls/{n}/comments` filtered by `pull_request_review_id`), matching the "assertions are advisory, evidence is authoritative" pattern.

## Key Decisions (see research.md)

| Decision | Choice | Anchor |
|---|---|---|
| Third file (`request-changes-post.md`) in scope | Yes — edit alongside the other two to keep the contract set internally consistent | Q1=A |
| GET pagination on the new Leg 1 check | `per_page=100` with early exit once filtered count reaches `bundle.comments.length`; otherwise paginate fully to detect a real undercount | Q2=B |
| Eventual-consistency handling on Leg 1 | Inline poll: 3 attempts with 500 ms → 1 s → 2 s backoff before returning failure; the outer retry only re-POSTs if the inline poll also fails | Q3=B |
| `[bot]` normalization scope | Contract-wide rule for **every** login comparison in `postcondition-check.md`; strip trailing `[bot]` then compare case-insensitively | Q4=D |
| Regression test approach | Contract-drift pin in `playbook-verification.test.ts` (asserts corrected wording present; asserts `response.comments.length` absent); ship the synthetic known-good / did-not-land fixture pair from Q5=D in this spec dir as executable documentation | Q5=C (re-interpreting FR-005) |

**Note on `review.md`**: The spec's Scope names only `auto.md` and `postcondition-check.md`; Q1 adds `request-changes-post.md`. During plan drafting a `grep` for the buggy substring surfaced a fourth occurrence at `packages/claude-plugin-cockpit/commands/review.md:123` (step 5 sub-step 4 Leg 1 prose, in the `/cockpit:review --gate implementation-review` guardrail — which shares the same postcondition contract). It encodes the identical defect and a literal implementer of `/cockpit:review` will double-post reviews for the same reason. Extending the same-PR scope to include it is consistent with the Q1 rationale ("keep the contract set internally consistent so FR-002 is enforceable"). If the operator later disagrees, `review.md` can be dropped from the edit list without changing the shape of the other four artifacts.

## Suggested next step

`/speckit:tasks` — generate the ordered task list for the four (or five, if `review.md` is included) markdown edits, the `playbook-verification.test.ts` re-pin addition, and the two fixture files.
