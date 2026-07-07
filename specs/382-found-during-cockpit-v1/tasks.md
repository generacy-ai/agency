# Tasks: Align cockpit review/watch playbooks with CLI vocabulary and PrFeedbackMonitor flow

**Input**: Design documents from `/specs/382-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, contracts/review-command.contract.md, contracts/watch-command.contract.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 vocabulary alignment, US2 request-changes signal delivery, US3 non-blocking approve, US4 watch mapping)

## Phase 1: Setup

- [X] T001 Confirm working branch `382-found-during-cockpit-v1` is checked out and clean; open `packages/claude-plugin-cockpit/commands/review.md`, `packages/claude-plugin-cockpit/commands/watch.md`, `packages/claude-plugin-cockpit/README.md`, `specs/382-found-during-cockpit-v1/contracts/review-command.contract.md`, and `specs/382-found-during-cockpit-v1/contracts/watch-command.contract.md` side by side.

## Phase 2: Core Implementation — `commands/review.md` multi-section rewrite

Sub-tasks below share the same file. Apply bottom-up (highest line number first) to minimize churn between edits. All strings must match `contracts/review-command.contract.md` byte-for-byte.

- [X] T002 [US1] Rewrite Examples section at bottom of `packages/claude-plugin-cockpit/commands/review.md` to the three-paragraph block in contract §13 (uses `--gate implementation-review` and `--gate plan-review` verbatim; documents invalid-value case).
- [X] T003 [US2] Renumber current step 7 (`abort` no-op) to step 8 in `packages/claude-plugin-cockpit/commands/review.md` per contract §10.
- [X] T004 [US2] Insert new step 7 (`request-changes` POSTs `event: COMMENT` PR review via `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` with per-finding inline anchored comments) in `packages/claude-plugin-cockpit/commands/review.md` per contract §9. Include the inline `<!-- ... -->` rationale note referencing `PrFeedbackMonitorService` and `waiting-for:address-pr-feedback`. Include the non-`implementation-review` fallback line.
- [X] T005 [US3] Replace step 6 (advance on approval) in `packages/claude-plugin-cockpit/commands/review.md` with the block from contract §8. Includes the new `event: APPROVE`-with-body sub-branch for non-blocking findings, `Do NOT include ` + "`comments[]`" + ` directive, and the inline `<!-- ... -->` rationale note that inline threads trip `PrFeedbackMonitorService`.
- [X] T006 [US1] Update step 5 (approval prompt) in `packages/claude-plugin-cockpit/commands/review.md` per contract §7 — require the prompt to display the findings-summary table (for `implementation-review`) or the three-section summary (other gates) before showing options; option order must be `approve`, `request-changes`, `abort`.
- [X] T007 [US1] Rename step 4 branch header in `packages/claude-plugin-cockpit/commands/review.md` from "non-`impl` gate branch" to "non-`implementation-review` gate branch" and update the accepted-gate enumeration to `spec-review`, `clarification-review`, `plan-review`, `tasks-review` per contract §6.
- [X] T008 [US1, US3] Rewrite step 3 in `packages/claude-plugin-cockpit/commands/review.md` per contract §5: rename branch from `--gate impl` to `--gate implementation-review`; add the classification instruction (correctness/security/data-integrity ⇒ Blocking? Yes; style/simplification/nit ⇒ Blocking? No); add the `| # | File:line | Finding | Blocking? |` table shape; rewrite the Suggested-decision derivation rules — the middle rule MUST read `All \`No\` (findings present, none blocking) → \`Suggested decision: approve\`` (deleting the pre-fix `non-blocking findings only → request-changes`).
- [X] T009 [US1] Replace step 1 (parse arguments / usage-line gate) in `packages/claude-plugin-cockpit/commands/review.md` per contract §3: gate values become the five verbatim CLI tokens; add the `For \`clarification\`, use \`/cockpit:clarify\`` special-case sub-line; on invalid input, print usage and exit non-zero without reading files, calling CLI, or calling `gh api`.
- [X] T010 [US1, US2] Replace H1 body paragraph in `packages/claude-plugin-cockpit/commands/review.md` per contract §2 (mentions `--gate implementation-review` invoking `/code-review`, `event: COMMENT` on `request-changes`, `PrFeedbackMonitorService` handler).
- [X] T011 [US1] Replace frontmatter (`description:` and `arguments:` block) in `packages/claude-plugin-cockpit/commands/review.md` per contract §1 — enumerate the five verbatim CLI tokens in the `--gate` description; call out `/cockpit:clarify` for the `clarification` gate.
- [X] T012 Do NOT touch the `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block or step 2 (pre-flight) in `packages/claude-plugin-cockpit/commands/review.md`. Confirm untouched by leaving region alone (contract §4, §11, §12).

## Phase 3: Core Implementation — sibling files

- [X] T013 [P] [US4] Rewrite mapping table in `packages/claude-plugin-cockpit/commands/watch.md` per contract §2 of `watch-command.contract.md`: replace the four-row table with the eight-row table (answering-gate row first, then five explicit review rows in `WORKFLOW_LABELS` order — `spec-review`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review` — then `completed:validate`, then error-state fallback). Preserve row-ordering rationale — `waiting-for:clarification` MUST precede `waiting-for:clarification-review`. Do NOT touch any other section of `watch.md`, including the error-conv block.
- [X] T014 [P] [US1] Edit § Available Commands row for `/cockpit:review` in `packages/claude-plugin-cockpit/README.md`: change `` `specify`/`clarify`/`plan`/`tasks` `` to `` `spec-review`/`clarification-review`/`plan-review`/`tasks-review` `` and `` `impl` PR diff `` to `` `implementation-review` PR diff `` per quickstart Edit set C. Do NOT touch any other row or section (in particular § Error Handling is untouched).

## Phase 4: Verification (deterministic greps + diff)

Run each from repo root; all must pass before moving to smoke tests. Failing check ⇒ fix the corresponding Phase 2/3 task.

- [X] T015 [US1] Run V1 (five verbatim tokens present in `review.md`): `grep -c "spec-review\|clarification-review\|plan-review\|tasks-review\|implementation-review" packages/claude-plugin-cockpit/commands/review.md` reports ≥ 5.
- [X] T016 [US1] Run V2 (no bare `impl` shorthand as gate value): `grep -nE "\-\-gate impl( |$|>|\|)" packages/claude-plugin-cockpit/commands/review.md packages/claude-plugin-cockpit/commands/watch.md` and `grep -nE "\bimpl\b" packages/claude-plugin-cockpit/README.md` report 0 hits.
- [X] T017 [US1] Run V3 (new Usage line): `grep -c "Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>" packages/claude-plugin-cockpit/commands/review.md` reports ≥ 1.
- [X] T018 [US1] Run V4 (`clarification → /cockpit:clarify` special-case line): `grep -c "For \`clarification\`, use \`/cockpit:clarify\`" packages/claude-plugin-cockpit/commands/review.md` reports ≥ 1.
- [X] T019 [US2] Run V5 (`event: COMMENT` request-changes payload described): `event: COMMENT` ≥ 1, `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` ≥ 1, `N finding(s) requiring changes; see inline comments.` ≥ 1, `waiting-for:address-pr-feedback` ≥ 1, `PrFeedbackMonitorService` ≥ 2 in `packages/claude-plugin-cockpit/commands/review.md`.
- [X] T020 [US3] Run V6 (corrected Suggested-decision rule): `grep -nE "non-blocking findings only.*request-changes" packages/claude-plugin-cockpit/commands/review.md` reports 0 hits; `grep -nE "non-blocking.*approve|All \`No\`.*approve" packages/claude-plugin-cockpit/commands/review.md` reports ≥ 1.
- [X] T021 [US3] Run V7 (findings-summary table with `Blocking?` column): `grep -c "Blocking?" packages/claude-plugin-cockpit/commands/review.md` ≥ 2; `grep -c "^| # | File:line | Finding | Blocking? |" packages/claude-plugin-cockpit/commands/review.md` = 1.
- [X] T022 [US4] Run V8 (five explicit mapping rows in `watch.md`; substitution pattern gone): loop check for each of `spec-review`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review` — each `waiting-for:<token>` and `/cockpit:review --gate <token>` count ≥ 1; `grep -c "waiting-for:<gate>-review" packages/claude-plugin-cockpit/commands/watch.md` = 0. Confirm `waiting-for:clarification` row appears on a lower line number than `waiting-for:clarification-review` row.
- [X] T023 Run V9 (error-conv byte-identity invariant [#378](https://github.com/generacy-ai/agency/issues/378)): `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md)` produces no output; same diff against `commands/status.md` produces no output.
- [X] T024 Run `git diff --stat` and confirm exactly three files modified, all under `packages/claude-plugin-cockpit/` (plan Scale/Scope constraint).

## Phase 5: Manual Smoke Test

Requires a Claude Code session with the local `@generacy-ai/claude-plugin-cockpit` plugin linked, `generacy` and `gh` on `$PATH`, and write access to a test epic with an open impl PR (per plan Testing §Manual smoke test; reference `christrudelpw/sniplink` from [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) findings #12–14).

- [ ] T025 [US1] Case A (vocabulary alignment, SC-001): run `/cockpit:review --gate implementation-review` — confirm `/code-review` runs, findings table with `Blocking?` column renders, `Suggested decision:` line follows, `AskUserQuestion` shows `approve` / `request-changes` / `abort` in that order. Then run `/cockpit:review --gate impl` — confirm literal Usage line prints, `clarification → /cockpit:clarify` sub-line prints, exit non-zero, no `/code-review` invocation.
- [ ] T026 [US2] Case B (`request-changes` posts inline-anchored review, SC-002): on a PR with one contrived-blocking + one contrived-non-blocking finding, select `request-changes`. Verify session prints `Feedback posted: 2 inline comment(s) on PR #<n>`; `gh api .../reviews` shows last review `state: "COMMENTED"` with body `2 finding(s) requiring changes; see inline comments.`; `gh api .../comments` shows two file:line-anchored comments; within one poll cycle `waiting-for:address-pr-feedback` is applied to the epic; NO `Labels:` line printed by the plugin; NO `event: REQUEST_CHANGES` review posted.
- [ ] T027 [US3] Case C (`approve` with non-blocking findings surfaces them body-only, SC-003): on a PR with only non-blocking findings, verify `Suggested decision:` = `approve`, select `approve`. Verify `gh api .../reviews` last review has `state: "APPROVED"` with body containing findings text; `gh api .../comments` count unchanged (no inline threads); session prints `Labels: waiting-for:implementation-review → completed:implementation-review`; one poll cycle later `waiting-for:address-pr-feedback` is NOT applied.
- [ ] T028 [US4] Case D (watch mapping suggests `implementation-review` verbatim, SC-004): from `/cockpit:watch <epic-ref>`, trigger transitions and verify: `waiting-for:implementation-review` emits `· suggested: /cockpit:review --gate implementation-review` (no `impl`); `waiting-for:clarification` emits `· suggested: /cockpit:clarify`; `waiting-for:manual-validation` prints WITHOUT the ` · suggested: …` segment.
- [ ] T029 Error-class parity spot-check (#378 invariant): force MISSING_BINARY (unset `PATH`) and confirm remedy line matches `packages/claude-plugin-cockpit/README.md § Error Handling § MISSING_BINARY` verbatim; force AUTH_FAILURE on the `gh api .../reviews` call (`unset GH_TOKEN; gh auth logout`) and confirm auth-failure remedy prints; force an OTHER exit (nonexistent PR number) and confirm `CLI failed with exit code <N>.` plus stderr in fenced block.

## Phase 6: Ship

- [ ] T030 Stage exactly the three modified files (`packages/claude-plugin-cockpit/commands/review.md`, `packages/claude-plugin-cockpit/commands/watch.md`, `packages/claude-plugin-cockpit/README.md`), commit with message `fix: #382 align cockpit review/watch playbooks with CLI vocabulary and PrFeedbackMonitor flow`, push to `origin/382-found-during-cockpit-v1`, open PR against `develop` referencing spec, clarifications Q1–Q5, and [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) findings #12–14.

## Dependencies & Execution Order

**Sequential file (`review.md`, Phase 2)**: T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 must run in the order listed. All edit the same file (`commands/review.md`), and applying bottom-up (highest line first) minimizes line-number churn between edits. T012 is a "do nothing" guard — no edit, just verify the untouched region remains untouched.

**Parallel opportunity (Phase 3)**: T013 (`watch.md`) and T014 (`README.md`) touch different files from each other and from `review.md`. They can run in parallel with each other AND in parallel with Phase 2's `review.md` sequence. All three targets are marked `[P]` relative to different-file peers.

**Phase 4 depends on Phases 2 + 3 complete**: Each verification (T015–T024) reads the just-edited files. T015–T023 map 1:1 to specific edits (see quickstart §V1–V9 troubleshooting table for which task to re-open on failure).

**Phase 5 depends on Phase 4 all-green**: manual smoke tests require the plugin to be re-linked / re-installed from the edited checkout. If Phase 4 fails, do not spend a smoke-test cycle.

**Phase 6 depends on Phase 5 all-green**: never open the PR before smoke tests pass — the change ships to plugin users on next preview publish, and a broken `event: COMMENT` payload or wrong gate token would break the live cockpit workflow.

**Story coverage**: US1 (vocabulary alignment) spans T002/T006–T011/T013–T018/T025/T028; US2 (request-changes signal) spans T004/T010/T019/T026; US3 (non-blocking approve body-only) spans T005/T008/T020/T021/T027; US4 (watch mapping) spans T013/T022/T028.

---

*Generated by /tasks for issue [generacy-ai/agency#382](https://github.com/generacy-ai/agency/issues/382)*
