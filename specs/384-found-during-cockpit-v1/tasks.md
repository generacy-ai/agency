# Tasks: Fix cockpit review approve path (422 on own PR) and enforce approval gate terminal check

**Input**: Design documents from `/specs/384-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, contracts/review-command.contract.md, quickstart.md, clarifications.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

**Scope note**: All edits target ONE file — `packages/claude-plugin-cockpit/commands/review.md`. Because every edit modifies the same file, the edits themselves are sequential (no `[P]` inside Phase 2). Verification greps can be parallelized (Phase 3). Smoke tests are sequential because they run in the same session.

## Phase 1: Setup

- [ ] T001 Confirm working branch is `384-found-during-cockpit-v1` and working tree is clean before editing (`git status` shows no uncommitted changes to `packages/claude-plugin-cockpit/commands/review.md`). Open `specs/384-found-during-cockpit-v1/contracts/review-command.contract.md` and `packages/claude-plugin-cockpit/commands/review.md` side by side; the contract file is the byte-level reference for every edit below.

## Phase 2: Core Implementation — edit `packages/claude-plugin-cockpit/commands/review.md`

Apply edits bottom-up to minimize line-number churn (per quickstart.md §Apply the fix).

- [ ] T002 [US2] Append the new `## Terminal Outcome Check` section at the end of `packages/claude-plugin-cockpit/commands/review.md` (after `## Examples`). Copy the full block from `specs/384-found-during-cockpit-v1/contracts/review-command.contract.md §14` verbatim: heading `## Terminal Outcome Check`, `<!-- BEGIN terminal-check -->` fence, prose body (three-marker enumeration in order approve → request-changes → abort, no-state-probe prohibition, unbounded step-5-only loop-back, passive raw-JSON reminder), inline `<!-- Rationale: ... -->` comment, `<!-- END terminal-check -->` fence. FR-003, FR-004, FR-007, FR-008, FR-009.

- [ ] T003 [US1] Update the ONE `## Examples` section sentence in `packages/claude-plugin-cockpit/commands/review.md` that quotes `event: APPROVE` on the approve path. Replace with the `event: COMMENT` form specified in `contracts/review-command.contract.md §13` (adds the `(no inline threads, so PrFeedbackMonitorService stays quiet)` clarification). FR-001, narrative consistency with T005.

- [ ] T004 [US2] Replace step 8 in `packages/claude-plugin-cockpit/commands/review.md` with the emission-including form from `contracts/review-command.contract.md §10`. Preserve the "no `Labels:` / no state / no PR review" clauses, then add the literal `Aborted: no changes to gate <gate>; no PR review posted.` emission, then the inline `<!-- ... -->` rationale comment tying the emission to the Terminal Outcome Check's marker set. FR-005.

- [ ] T005 [US1] Edit step 6's first sub-branch in `packages/claude-plugin-cockpit/commands/review.md` (the `implementation-review AND non-blocking findings present` case). Apply `contracts/review-command.contract.md §8` verbatim: flip `event: APPROVE` → `event: COMMENT` in the payload description and prose, remove the now-redundant `Do NOT post an accompanying event: COMMENT review` clause, and replace the inline `<!-- ... -->` rationale comment with the new self-APPROVE-forbidden wording (includes the FR-002 language "Self-APPROVE is forbidden by GitHub and semantically empty; revisit if multi-credential reviewer identities ever ship."). Leave the other sub-branches of step 6 and the CLI-advance bullet untouched. FR-001, FR-002.

- [ ] T006 [US3] Insert a new bullet into step 3 of `packages/claude-plugin-cockpit/commands/review.md` between the current `Capture /code-review's output verbatim as the review summary body.` bullet and the `Classify each finding.` bullet. Content is from `contracts/review-command.contract.md §5` verbatim, starting with `**MUST NOT print raw JSON under any circumstance.**`. Leave every other bullet in step 3 (classification, findings-summary table shape, `Suggested decision:` derivation) unchanged. FR-006.

## Phase 3: Verification — deterministic greps (can run in parallel)

Every grep below is against `packages/claude-plugin-cockpit/commands/review.md` unless noted. Each corresponds to a contract-file check; any failure means the corresponding Phase 2 edit is incomplete or drifted.

- [ ] T007 [P] [US1] Verify no `event: APPROVE` payload value remains: `grep -n "^[^<]*event: APPROVE" packages/claude-plugin-cockpit/commands/review.md` MUST return 0 hits (contract §8 verification bullet 1). Any hit outside a `<!-- ... -->` rationale comment is a defect.

- [ ] T008 [P] [US1] Verify `event: COMMENT` appears in ≥ 2 payload contexts (step 6 approve path + step 7 request-changes): `grep -c "event: COMMENT" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 (contract §8 verification bullet 2).

- [ ] T009 [P] [US1] Verify FR-002 inline rationale wording: `grep -c "self-APPROVE is forbidden by GitHub" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 (contract §8 verification bullet 3). Also `grep -c "PrFeedbackMonitorService stays quiet" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 (contract §8 verification bullet 4 — semantic-contract clause).

- [ ] T010 [P] [US2] Verify Terminal Outcome Check block presence and fence uniqueness: `grep -c "^## Terminal Outcome Check" packages/claude-plugin-cockpit/commands/review.md` == 1; `grep -c "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/review.md` == 1; `grep -c "<!-- END terminal-check -->" packages/claude-plugin-cockpit/commands/review.md` == 1 (contract §14 verification bullets 1–3).

- [ ] T011 [P] [US2] Verify Terminal Outcome Check block content invariants: `grep -c "Detection is text-emission-only" .../review.md` == 1; `grep -c "MUST NOT exit" .../review.md` == 1; `grep -c "re-invoke step 5 only" .../review.md` == 1; `grep -c "no \`gh api\` calls, no \`generacy cockpit status\` calls" .../review.md` ≥ 1; `grep -c "Passive reminder for the operator" .../review.md` ≥ 1 (contract §14 verification bullets 4–8). FR-004, FR-007, FR-008, FR-009.

- [ ] T012 [P] [US2] Verify step 8's `Aborted:` emission: `grep -c "Aborted: no changes to gate" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1; `grep -n "Aborted:" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 hits (step 8 emission + Terminal Outcome Check enumeration) (contract §10 verification bullets 1–2). FR-005.

- [ ] T013 [P] [US3] Verify step 3's raw-JSON bullet is present and correctly ordered: `grep -c "MUST NOT print raw JSON" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1; `grep -n "Capture .code-review.'s output verbatim\|MUST NOT print raw JSON\|Classify each finding" packages/claude-plugin-cockpit/commands/review.md` MUST show the three bullets in top-to-bottom order: Capture → MUST NOT → Classify (contract §5 verification bullets). FR-006.

- [ ] T014 [P] Verify `<!-- BEGIN error-conv -->` block is byte-identical between `review.md` and `watch.md`: `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md)` MUST print empty output (contract §12 verification bullet — #378 invariant preserved).

- [ ] T015 [P] Verify single-file scope: `git diff --stat --name-only develop...HEAD -- packages/claude-plugin-cockpit/` MUST list only `packages/claude-plugin-cockpit/commands/review.md`. Additionally, `grep -rl "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/` MUST list only `review.md` (no `clarify.md` retrofit — Out of Scope §1). Contract §15 file-level invariants.

## Phase 4: Manual smoke tests (US1/US2/US3 acceptance) — sequential

Run these against a test repo with an epic that has an open `implementation-review` PR. The tetrad-development#88 scenario used `christrudelpw/sniplink`; any comparable single-credential setup works.

- [ ] T016 [US1] Smoke test A (SC-001): approve path on single-credential cluster. Run `/cockpit:review <epic-ref> --gate implementation-review`; at step 5 pick `approve`. Verify: session output ends with `Labels: waiting-for:implementation-review → completed:implementation-review` (no 422, no error-conv branch); `gh api "repos/<owner>/<repo>/pulls/<n>/reviews"` shows `state: "COMMENTED"` (NOT `"APPROVED"`) with the findings text in `body`; `gh api "repos/<owner>/<repo>/pulls/<n>/comments" | jq 'length'` returns 0 net-new (no review threads opened). Quickstart §Smoke test A.

- [ ] T017 [US2] Smoke test B (SC-002): missing-outcome loop-back is unbounded. Run `/cockpit:review <epic-ref> --gate implementation-review`; at step 5's `AskUserQuestion` dismiss without selecting. Verify: Terminal Outcome Check block fires with its missing-marker branch text, then re-invokes step 5 with the same three options and the findings table from session context (NOT a re-run of `/code-review`). Repeat dismissal 3× to prove no retry cap. On the 4th prompt, select `abort`; verify the literal `Aborted: no changes to gate implementation-review; no PR review posted.` line prints and the session exits zero without further loop-back. Quickstart §Smoke test B.

- [ ] T018 [US3] Smoke test C (SC-003): step 3 never prints raw JSON. Run `/cockpit:review <epic-ref> --gate implementation-review` on a PR that `/code-review` will emit findings on. Verify: step 3's output contains the findings-summary table only — no `{"findings": ...}` prose, no JSON dump inline. If `/code-review` returns prose (not JSON) in this session, retry on a different PR to exercise the JSON return path. Quickstart §Smoke test C.

- [ ] T019 [P] Optional AUTH_FAILURE parity spot-check (FR-008 regression guard): with `GH_TOKEN=""`, run the approve path; step 6's `gh api .../reviews` POST fails, and the error-conv `AUTH_FAILURE` branch prints the canonical `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.` text byte-for-byte. Confirms the error-conv block is untouched and the new `COMMENT`-event payload participates in the same three-class classification. Quickstart §Optional smoke test. Parallel with T016–T018 because it can be run in a separate session.

## Dependencies & Execution Order

**Setup → Implementation → Verification → Smoke tests**

1. **T001** (setup) — must complete first.
2. **T002 → T003 → T004 → T005 → T006** (implementation) — sequential because every edit modifies the same file (`packages/claude-plugin-cockpit/commands/review.md`). Bottom-up order per quickstart to minimize line-number churn: append terminal-check block first, then update Examples, then step 8, then step 6, then step 3. Any edit order works so long as the final file matches the contract; bottom-up is the low-friction sequence.
3. **T007–T015** (verification greps) — all `[P]`, can run in parallel after Phase 2 completes. These are read-only checks against the edited file.
4. **T016–T018** (smoke tests) — sequential, since each requires an interactive Claude Code session against the same test epic. **T019** can run in parallel in a separate session with `GH_TOKEN=""` exported.

**User story → task mapping**:
- **US1 (approve path COMMENT, not APPROVE)**: T003, T005, T007, T008, T009, T016.
- **US2 (terminal-outcome backstop)**: T002, T004, T010, T011, T012, T017.
- **US3 (step 3 forbids raw JSON)**: T006, T013, T018.
- **Cross-cutting** (scope/regression guards, no story tag): T001, T014, T015, T019.

**Parallel opportunities**:
- After Phase 2 completes, T007–T015 all run in parallel (9 greps + 1 diff + 1 rg — pure reads, no shared writes).
- T019 can run in parallel with T016–T018 in a separate session.

**Total tasks**: 19. **Phase breakdown**: Setup 1, Implementation 5, Verification 9, Smoke tests 4.

**Suggested next step**: `/speckit:implement` to execute the tasks, or `/speckit:taskstoissues` if this feature should be split into child issues (default grouping `per-story` — would produce three sub-issues, US1/US2/US3).
