# Tasks: Fix `auto.md` request-changes postcondition Leg 1

**Input**: Design documents from `/specs/429-re-filed-from-generacy/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = the sole story: "the postcondition confirms a real success without double-posting or re-presenting")

## Phase 1: Setup — Fixture directory & executable-documentation pair

Documentation fixtures the LLM reads as context (per plan.md § R5 / quickstart.md § "Executable-documentation fixtures"). Not run by CI.

- [ ] T001 [US1] Create fixtures directory `specs/429-re-filed-from-generacy/fixtures/` (mkdir; empty directory is the input to T002 and T003).
- [ ] T002 [P] [US1] Create `specs/429-re-filed-from-generacy/fixtures/postcond-known-good.md` — synthetic 3-comment bundle: paste a fake `POST /reviews` response with keys per data-model.md § PostReviewResponse (id, submitted_at, state, etc.; NO `comments` field); one paginated `GET /pulls/{n}/comments?per_page=100` response page with 3 entries whose `pull_request_review_id == response.id`; matching GraphQL `reviewThreads` payload. Show the `Leg1Check.outcome == "pass"` computation and the `PostcondCounts` combined verdict.
- [ ] T003 [P] [US1] Create `specs/429-re-filed-from-generacy/fixtures/postcond-did-not-land.md` — same synthetic shape as T002 but the paginated GET returns only 2 filtered entries for a 3-comment bundle across all 4 inline-poll attempts. Show `Leg1Check.outcome == "genuine-undercount"`, the ledger line shape `reason=leg1-undercount:2/3` (per data-model.md § RetryLedgerEntry), and the outer 2 s → re-POST flow.

## Phase 2: Contract documents (edits in `specs/422-summary-auto-md-s/contracts/`)

Contract docs first — the four edit sites in playbooks reference these by heading (per contracts/leg1-corrected-rule.md § Application).

- [ ] T010 [US1] Edit `specs/422-summary-auto-md-s/contracts/postcondition-check.md` — add "Login normalization" preamble heading at the top (verbatim from `specs/429-re-filed-from-generacy/contracts/login-normalization.md` § Rule + § Examples). Every Leg 2 `author.login ==` phrasing points at this preamble by name (per data-model.md § LoginNormalization). Prerequisite for T040 assertion 4.
- [ ] T011 [US1] Edit `specs/422-summary-auto-md-s/contracts/postcondition-check.md` — replace § Leg 1 rule text with the corrected procedure from `specs/429-re-filed-from-generacy/contracts/leg1-corrected-rule.md` § Rule (steps 1–6: capture `response.id`/`response.submitted_at` but NOT `response.comments`; `gh api --paginate ...?per_page=100`; filter on `pull_request_review_id == response.id`; early exit; inline poll 500 ms → 1 s → 2 s; `genuine-undercount` outcome feeds the outer retry). Replace § "Failure interpretation" with data-model.md § Leg1Check "Failure interpretation" prose (POST-side per-entry drop / off-by-one hunk-range). Depends on T010 (shares file). Prerequisites for T040 assertions 1 & 2.
- [ ] T012 [US1] Edit `specs/422-summary-auto-md-s/contracts/request-changes-post.md` — § Execution `Capture` list: remove the `.comments[].length` entry (line 74 today); replace with `id` + `submitted_at`. § Postconditions Leg 1: replace `response.comments.length == bundle.comments.length` (line 80 today) with a reference to `postcondition-check.md § Leg 1` (do NOT restate the rule — single source of truth). Prerequisite for T040 assertion 3.

## Phase 3: Playbook edits (parallel — different files)

Both playbook edits inherit the corrected rule by reference. Do NOT restate the procedure inline in either playbook (single source of truth is postcondition-check.md, edited in Phase 2).

- [ ] T020 [P] [US1] Edit `packages/claude-plugin-cockpit/commands/auto.md` — D.2 § step 4 "Leg 1" bullet (currently at line 305 — locate by exact substring `response.comments.length == bundle.comments.length`). Replace with prose that (a) captures `response.id` and `response.submitted_at`, (b) points at `postcondition-check.md § Leg 1` for the paginated-GET-and-filter + inline-poll procedure, (c) states that `genuine-undercount` (not `undefined.length`) triggers the outer 2 s → re-POST retry. Preserve the surrounding heading structure (so existing `readdirSync(COMMANDS_DIR)` sweep pins in `playbook-verification.test.ts` still hold — CLAUDE.md § Cockpit playbook pins invariant).
- [ ] T021 [P] [US1] Edit `packages/claude-plugin-cockpit/commands/review.md` — step 5 sub-step 4 "Leg 1" bullet (currently at line 123 — locate by same exact substring `response.comments.length == bundle.comments.length`). Apply the identical replacement pattern as T020 — reference `postcondition-check.md § Leg 1` by heading, no inline restatement. Same heading-preservation constraint.

## Phase 4: Drift-pin test additions

Contract-drift pins per plan.md § R5 "Pin shape". CLAUDE.md § Cockpit playbook pins invariant: no existing assertion pins the buggy Leg 1 text today (verified in plan.md § Constitution Check), so this is a pure addition — not a re-pin.

- [ ] T040 [US1] Edit `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — add a new `describe` block at the end of the file with four assertions:
  1. `postcondition-check.md` contains the exact string `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments` AND the exact string `pull_request_review_id == response.id` (proves T011 landed).
  2. `postcondition-check.md` does NOT contain the substring `response.comments.length` (regression bar — the buggy phrasing must never return).
  3. `request-changes-post.md` does NOT contain `response.comments.length` AND does NOT contain `.comments[].length` in its § Execution Capture list (proves T012 landed).
  4. `postcondition-check.md` contains the exact heading string `## Login normalization` (proves T010 landed).

  Depends on T010, T011, T012 (assertions read files edited in Phase 2). Does NOT depend on T020/T021 (existing `readdirSync(COMMANDS_DIR)` sweep at `playbook-verification.test.ts:515` already catches heading drift in playbooks — no new pin needed there).

## Phase 5: Verify

- [ ] T050 [US1] Run `pnpm --filter '@generacy/claude-plugin-cockpit' test playbook-verification` and confirm all four new assertions from T040 pass, and no existing assertions break. If an existing pin fails, re-pin it to the NEW contract in this same PR (CLAUDE.md § Cockpit playbook pins — do NOT weaken or delete an assertion).
- [ ] T051 [US1] Cross-check the four edited docs against quickstart.md § "Pre-fix vs post-fix signatures in the ledger" — read each edited file end-to-end and confirm no residual `response.comments` or `.comments[].length` references remain anywhere in the two contract docs or the two playbooks. `grep -n 'response\.comments\|\.comments\[\]\.length' packages/claude-plugin-cockpit/commands/auto.md packages/claude-plugin-cockpit/commands/review.md specs/422-summary-auto-md-s/contracts/postcondition-check.md specs/422-summary-auto-md-s/contracts/request-changes-post.md` must return zero matches.

## Dependencies & Execution Order

**Sequential edges**:
- T001 → T002, T003 (directory must exist before files land in it).
- T010 → T011 (both edit the same file; heading preamble added first, then Leg 1 body).
- T010, T011, T012 → T040 (drift-pin assertions read the files edited in Phase 2).
- T040 → T050 (test cannot pass until the assertions are added AND the contract edits land).
- T010, T011, T012, T020, T021 → T051 (grep-sweep verifier reads all four edited files).

**Parallel opportunities** (marked `[P]`):
- **Phase 1**: T002 and T003 run in parallel after T001 (different files, no shared state).
- **Phase 3**: T020 and T021 run in parallel with each other AND with all of Phase 2 (T010/T011/T012). Playbook edits reference contract-doc headings by name — they don't need the contract-doc bodies to land first; the heading strings referenced are stable across T010/T011/T012 anyway.

**Phase boundaries** (sequential):
- Phase 1 (fixtures) is independent of Phases 2–5 — can start immediately, can start last, doesn't gate anything downstream.
- Phase 4 gates on Phase 2 (see edges above).
- Phase 5 gates on Phases 2, 3, and 4.

**Suggested execution shape** for a single agent:
1. Kick off T001 → T002/T003 in parallel (fire-and-forget documentation).
2. Do T010 → T011 → T012 sequentially (single writer to the contract dir).
3. Do T020 and T021 in parallel (or serialize if the same agent is doing both).
4. Do T040 (drift-pin test additions).
5. Do T050 + T051 (verify).

**Total tasks**: 10 (T001, T002, T003, T010, T011, T012, T020, T021, T040, T050, T051 = 11 including verifier — count as 11 items).

## Suggested next step

`/speckit:implement` to begin execution, or `/speckit:taskstoissues` to convert to GitHub issues. Grouping label recommendation: `epic-grouping:per-phase` (five phases → five child issues), since the natural cut is by edit-target group rather than by story (there is only one story).
