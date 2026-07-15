# Tasks: Inline-thread request-changes contract

**Input**: Design documents from `/specs/422-summary-auto-md-s/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: All tasks serve the single user story — the request-changes verdict flow must post per-finding inline threads verified by a postcondition. Tag: `[US1]`.

## Overview

Two-file playbook amendment. No code, no dependencies, no new packages. Every edit lands in `packages/claude-plugin-cockpit/commands/{auto.md,review.md}` and cites the contracts in `specs/422-summary-auto-md-s/contracts/` as the source of the exact JSON shapes, GraphQL query, marker string, and ledger templates. Contract artifacts already exist (written during `/plan`) and are load-bearing — tasks below reference them by section, not restate them.

## Phase 1: `auto.md` amendments

Tasks within this phase touch the same file (`packages/claude-plugin-cockpit/commands/auto.md`) and must run **sequentially** to avoid conflicting edits. Each amendment is scoped to a single section so they compose cleanly.

- [ ] T001 [US1] Amend `auto.md` §D.2 (Apply verdict → `request-changes` branch, currently around line 181) in `packages/claude-plugin-cockpit/commands/auto.md`.
  - Replace the one-liner ("post a `COMMENT` review with per-finding inline threads … no `advance` call") with the four-step guardrail per `contracts/request-changes-post.md` §Preconditions/POST body/Postconditions and `contracts/postcondition-check.md` §Combined verdict.
  - Steps to spell out in D.2 prose (not restate the JSON — cite the contract file):
    1. Pre-validate — fetch PR diff with `gh pr diff <owner>/<repo>#<pr-n>`, parse hunk headers, assign each `Finding` an `AnchorCheck` per data-model.md.
    2. Compose bundle — anchored → `comments[]`, unanchored → body block under `<!-- generacy-cockpit:unanchored-findings -->` + `## General findings (no file anchor)`, per contract §Unanchored-block shape. Refuse to POST when total findings == 0.
    3. POST — `gh api -X POST /repos/{o}/{r}/pulls/{n}/reviews --input <bundle>`; capture `.id`, `.submitted_at`, `.comments[].length`.
    4. Verify (two legs) — Leg 1 `response.comments.length == bundle.comments.length`; Leg 2 GraphQL `reviewThreads(first:50)` filtered to `!isResolved AND author == <acting-bot> AND createdAt >= submitted_at` count ≥ `bundle.comments.length`.
    5. On failure: sleep 2s, retry POST once; on second failure re-present G.2 (see T003) with the failure notice prepended.
  - Add explicit "no `cockpit_advance`" reminder — unresolved threads own the transition via `PrFeedbackMonitorService`.

- [ ] T002 [US1] Amend `auto.md` §D.3 (Apply verdict step, currently around line 203, "Apply verdict — same as D.2") in `packages/claude-plugin-cockpit/commands/auto.md`.
  - D.3 currently defers to D.2 by reference. After T001, that reference already inherits the guardrail — verify the "same as D.2" wording is unambiguous for the amended flow and, if needed, add a one-line callout ("On `request-changes`: run the D.2 guardrail; the acting-bot-login used for the Leg-2 filter is the PR-author credential per the Generacy single-credential rule.") to make the PR-scope specifics explicit.
  - Do NOT duplicate the four-step guardrail body — keep D.3 a pointer to D.2 as today.

- [ ] T003 [US1] Amend `auto.md` §G.2 (Review verdict gate, currently around lines 549–592) in `packages/claude-plugin-cockpit/commands/auto.md`.
  - In the "on selection" branch table (around line 586), replace the `request-changes` row ("post COMMENT review with per-finding inline threads") with "post via D.2 guardrail (pre-validate → POST → two-leg verify → retry-once → re-present on failure)".
  - Add a **G.2 re-presentation shape** subsection (Q3=A per research.md R4) describing what a re-presented gate looks like after a retry-then-fail: prepended failure notice with the POST/GraphQL error `code`/`message` verbatim, a `postcondition failed after retry` line, then the original findings table and the same `AskUserQuestion` (`approve` / `request-changes` / `abort`). Note that re-selecting `request-changes` starts a fresh POST with a fresh retry allowance (retry counter is per-attempt, not per-verdict).
  - Note the invariant: G.2 `abort` and `approve` branches are unchanged.

- [ ] T004 [US1] Update `auto.md` §Ledger cheatsheet (currently around lines 952–955) in `packages/claude-plugin-cockpit/commands/auto.md`.
  - Add rows for the new ledger line shapes per `contracts/postcondition-check.md` §Ledger emission and `contracts/request-changes-post.md` §Ledger:
    - `D.2/D.3 review-verdict` · `postcondition-passed · leg1=<n>/<n> · leg2=<m>/<n>`
    - `D.2/D.3 review-verdict` · `postcondition-failed · attempt=<1|2> · leg1=<a>/<n> · leg2=<b>/<n>` (with `re-present-gate` suffix on attempt=2)
    - `D.2/D.3 review-verdict` · `review-post-retry · attempt=1 · backoff=2s`
  - Update the existing `review-analysis+request-changes` row's outcome column to `posted (<anchored> inline, <unanchored> in body)` matching contract §Ledger.

## Phase 2: `review.md` amendments

Tasks in this phase touch a different file from Phase 1 (`packages/claude-plugin-cockpit/commands/review.md`) so the phase as a whole is `[P]` with Phase 1. Within this phase the tasks touch the same file and must run sequentially.

- [ ] T005 [P] [US1] Amend `review.md` §5 (Post feedback on `request-changes`, currently around lines 117–125) in `packages/claude-plugin-cockpit/commands/review.md`.
  - Replace the current single-POST prose with the four-step guardrail (pre-validate → compose bundle with anchored/unanchored split → POST → two-leg verify → retry-once → re-present G.2 on failure). Cite `../../../specs/422-summary-auto-md-s/contracts/request-changes-post.md` and `contracts/postcondition-check.md` (or the eventual doc anchors if these move) rather than restating the JSON/GraphQL.
  - Preserve the `Feedback posted: N inline comment(s) on PR #<pull_number>` success-line contract but tighten: emit ONLY after both legs pass. `N` is the anchored-finding count.
  - Preserve the "gates other than `implementation-review`" no-op branch verbatim.

- [ ] T006 [P] [US1] Amend `review.md` §Terminal Outcome Check (currently around lines 140–155, the `**request-changes**` bullet) in `packages/claude-plugin-cockpit/commands/review.md`.
  - Update the request-changes bullet to state: "Step 5 executed and emitted the success line matching `Feedback posted: N inline comment(s) on PR #<pull_number>` after both postcondition legs passed" — i.e. the success line's absence is now a hard signal (not a soft one) that the guardrail failed and the gate was re-presented / aborted.
  - Add a bullet for the re-presented-gate outcome: "Terminal outcome may also be a re-presented G.2 with the failure notice prepended, in which case the terminal outcome is whatever verdict the operator selects on the re-presentation."

## Phase 3: Cross-file consistency check

- [ ] T007 [US1] Verify marker string and ledger templates match verbatim across `packages/claude-plugin-cockpit/commands/auto.md`, `packages/claude-plugin-cockpit/commands/review.md`, and `specs/422-summary-auto-md-s/contracts/*.md`.
  - `grep -n 'generacy-cockpit:unanchored-findings' packages/claude-plugin-cockpit/commands/*.md specs/422-summary-auto-md-s/contracts/*.md` — every occurrence must be the identical literal, no whitespace variation.
  - `grep -n 'General findings (no file anchor)' <same paths>` — H2 wording identical.
  - `grep -n 'postcondition-passed\|postcondition-failed\|review-post-retry\|Feedback posted:' <same paths>` — every ledger/success template identical between playbook and contract.
  - Any drift is a defect — fix in the playbook (contracts are the source of truth for these strings).

## Dependencies & Execution Order

**Sequential within phases (same-file conflicts)**:
- Phase 1: T001 → T002 → T003 → T004 (all in `auto.md`)
- Phase 2: T005 → T006 (both in `review.md`)

**Parallel across phases**:
- Phase 1 and Phase 2 touch different files and can run concurrently. An agent handling `auto.md` can run T001–T004 in one session while a second agent handles T005–T006 in `review.md`.

**T007 must run last** — it verifies consistency across the outputs of Phases 1 and 2, so it depends on all preceding tasks.

**Story mapping**: Every task carries `[US1]` because spec.md as delivered had a placeholder user story block; the operational US1 for this branch is the plan.md summary: *"the request-changes verdict flow must post per-finding inline threads verified by a postcondition, so the server-side `PrFeedbackMonitorService` loop actually engages."* All seven tasks contribute to that single story — the split is by file/section boundary, not by story.

## Notes

- No tests are added by this branch — the playbook is markdown; the postcondition is executed at runtime by the parent loop's Bash + `gh api` verbs. `quickstart.md` documents the manual verification path (query `reviewThreads` on a live PR after the amended path runs).
- The generacy-side gate-race companion (server-side flow advancing `implementation-review` after a `request-changes` review) is **out of scope** per plan.md — it lives on the `generacy` repo and requires an engine change.
- Contract docs in `specs/422-summary-auto-md-s/contracts/` are the source of truth for JSON body shape, GraphQL query, marker string, ledger templates, and combined-verdict formula. Playbook amendments cite them; they never restate them (avoids drift between contract and playbook).
