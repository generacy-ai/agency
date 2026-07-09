# Tasks: Isolate implementation-review's `/code-review` invocation in a subagent

**Input**: Design documents from `/specs/390-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/subagent-boundary.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = subagent boundary; US2 = strict return schema; US3 = governance amendment)

## Phase 1: Setup / Baseline

- [ ] T001 Confirm branch state (`git status` clean, on `390-found-during-cockpit-v1`) and that `packages/claude-plugin-cockpit/commands/review.md` and `packages/claude-plugin-cockpit/README.md` are at their post-#388 shape (fusion rule sentence exactly once; Terminal Outcome Check fence markers intact; README line 7 still contains the "single documented exception" clause). Establish the pre-edit greppable baseline for the invariants listed in `data-model.md` C1–C13.

## Phase 2: Core Implementation — review.md sub-branch A restructure

- [ ] T002 [US1] Replace step 3 sub-branch A's opening bullets in `packages/claude-plugin-cockpit/commands/review.md` (lines ~38–43): remove the "Invoke Claude Code's built-in `/code-review` slash command" bullet and the "Capture `/code-review`'s output verbatim" bullet. Insert an Agent tool invocation directive with `subagent_type: "general-purpose"` (fixed — no `code-reviewer` preference, no fallback path), `description: "Code review PR #<n>"`, and a `prompt` argument that carries the review-scope instructions. Anchor string for later grep: `subagent_type: "general-purpose"`. (data-model.md C1; contract §C.1; FR-001)

- [ ] T003 [US1][US2] In the same sub-branch A of `packages/claude-plugin-cockpit/commands/review.md`, add — as a fenced quotation of the subagent prompt — the review-scope + return-schema directives (contract §C.2, §C.3): (a) parent passes only the PR reference `<owner>/<repo>#<n>`, subagent fetches its own diff via `gh pr diff <owner>/<repo>#<n>` and is explicitly permitted to read surrounding files and run bounded verification (e.g. `node -e` repros); (b) verify-before-report clause; (c) findings schema `{file, line, summary, failure_scenario}` verbatim; (d) error shape `{"error": "<description>"}` verbatim; (e) the phrase "The entire return message MUST be a single JSON value" verbatim; (f) the prohibition on prose wrappers or fenced code blocks; (g) the subagent MUST NOT invoke `/code-review` or any other slash command from inside the sub-turn. (FR-002, FR-003; contract §C.2, §C.3; AP-8 defense)

- [ ] T004 [US2] In sub-branch A of `packages/claude-plugin-cockpit/commands/review.md`, immediately after the subagent invocation directive, insert the parent mapping table (four-way branch) directly following the return-schema quote: non-empty JSON array → findings-table branch; `[]` → zero-findings branch (`| (none) | | | |` row per #388); `{"error": "<description>"}` → hard-error → Error handling class `OTHER`, no `AskUserQuestion`; anything else (parse error, other shape) → hard-error class `OTHER` with the raw return message quoted in the fenced block. (FR-004, FR-005; contract §C.4; data-model.md C4)

- [ ] T005 [US1] In sub-branch A of `packages/claude-plugin-cockpit/commands/review.md`, verify the retained `MUST NOT print raw JSON under any circumstance.` clause remains verbatim, inline immediately before the findings-summary table rendering instruction. If the T002 edit moved it, restore it to that position. Confirm the surrounding sentence still explains that the retained clause is defense-in-depth (parent restating structured JSON verbatim is a defect). Do NOT re-word — this is #388's clause and it stays byte-identical. (FR-009; data-model.md C5; contract §C.5 step 2; AP-4 defense)

- [ ] T006 [US1] In sub-branch A of `packages/claude-plugin-cockpit/commands/review.md`, update the "Zero findings" edge case bullet and the "`/code-review` hard error" edge case bullet: rename the latter to "subagent hard error" and state that both `{"error": …}` and unparseable-return cases route to Error handling class `OTHER`, do NOT invoke `AskUserQuestion`, and do NOT emit any Terminal Outcome Check marker. Zero findings (`[]`) still invokes `AskUserQuestion` with the empty-row table (assist-mode preserved). (FR-005; AP-5, AP-6 defenses; contract §C.4)

## Phase 3: Examples section update

- [ ] T007 [US1] In `packages/claude-plugin-cockpit/commands/review.md`'s `## Examples` section (line ~116), rewrite the `/cockpit:review --gate implementation-review` example so it depicts: (i) the Agent tool call with `subagent_type: "general-purpose"`; (ii) the structured JSON return; (iii) the findings-summary table + `Suggested decision:` line + `AskUserQuestion` in one response. Remove any pre-390 wording that describes inline `/code-review` invocation as the mechanism ("invokes `/code-review` on the current epic's open PR, captures its output" phrasing). The example must show no pre-isolation shape anywhere. Leave the `plan-review` example (Sub-branch B) and the error-argument example unchanged. (FR-008; data-model.md § Entity 2; AP-1 defense in examples)

## Phase 4: Governance amendment

- [ ] T008 [P] [US3] Amend `packages/claude-plugin-cockpit/README.md` line 7 (the overview paragraph): remove the substring `single documented exception` and the parenthetical it introduces (`(with a single documented exception: /cockpit:review --gate implementation-review invokes Claude Code's built-in /code-review)`). Replace with: "Cross-command composition uses the Agent tool (subagent boundary); a slash command is never invoked inline in another command's shared context (see #390 for the recurrence pattern this rule closes, following #384 and #388)." The rationale reference `#390` MUST appear in the amended paragraph. Choose anchor string `Cross-command composition` for later grep. (FR-006; data-model.md C9, § Entity 5; contract §C.6; SC-005)

## Phase 5: Verification — static checks

- [ ] T009 [P] Run the static-verification grep suite from `quickstart.md` § "Verification — static checks" against the edited files. Expected exit conditions: (a) `grep -n 'subagent_type: "general-purpose"' review.md` ≥ 1 match inside sub-branch A; (b) `grep -n "/code-review" review.md` returns zero matches in the parent execution path (matches inside a fenced subagent-prompt quotation are acceptable but the preferred implementation ships zero occurrences); (c) `grep -c "MUST NOT print raw JSON" review.md` = 1; (d) `grep -c "delivered AS PART OF the same response that invokes AskUserQuestion" review.md` = 1; (e) `<!-- BEGIN terminal-check -->` and `<!-- END terminal-check -->` counts = 1 each; (f) all three markers `Labels:` / `Feedback posted:` / `Aborted:` still appear in the Terminal Outcome Check block; (g) `grep -c "single documented exception" README.md` = 0; (h) anchor from T008 (`Cross-command composition`) appears ≥ 1 time; (i) `#390` appears in the amended README paragraph. Fix any failing check by returning to the responsible task (T002–T008). (data-model.md C1–C9; quickstart.md static-check section)

- [ ] T010 [P] Verify historical-artifact preservation and sibling-file non-modification with `git diff origin/develop --`: (a) `specs/372-epic-generacy-ai-tetrad/plan.md` shows zero changes (SC-006, C10, AP-11 defense); (b) `packages/claude-plugin-cockpit/commands/{clarify.md,merge.md,queue.md,status.md,watch.md}` all show zero changes (FR-007, C11, AP-12 defense). Any diff output on these paths is a defect — restore the file from `origin/develop`. (SC-006, SC-008; data-model.md C10–C11)

- [ ] T011 [P] Verify no third prompt-side mitigation was added (SC-007 / C12): `git diff origin/develop -- packages/claude-plugin-cockpit/commands/review.md | grep -E "^\+.*(MUST|SHALL|MAY NOT)" | grep -v "MUST NOT print raw JSON"` — read each added MUST/SHALL/MAY-NOT line and confirm it is part of the subagent-boundary contract (invocation directive, return schema, parent mapping) and NOT a new outer-playbook hedge (no new checklists, no new terminal-outcome extensions). If a line is a hedge, remove it. (SC-007; data-model.md C12; AP-9 defense)

## Phase 6: Verification — behavioral

- [ ] T012 Behavioral check per `quickstart.md` § "Verification — behavioral check (one replayed transcript)": open a Claude Code session with the edited plugin loaded (`pnpm build` then reload plugin config or restart session), reproduce a long-analysis `/cockpit:review --gate implementation-review` case similar to `christrudelpw/sniplink#4`, and confirm the parent's response after subagent return contains, in order: (a) the Agent tool call summary; (b) NO free-form prose from inside the sub-turn; (c) NO raw JSON restated from the subagent's return; (d) the findings-summary table as prose; (e) the `Suggested decision:` line; (f) the `AskUserQuestion` invocation in the same response. Any failure mode listed in `quickstart.md` § Troubleshooting → re-check the corresponding static invariant and the sub-branch A directives. (SC-002; single passing transcript is evidence, not proof — SC-001 is closed by continued live smoke-test corpus usage after merge, not by this task)

## Phase 7: PR body

- [ ] T013 [P] [US3] Draft PR body containing the one-line sibling assessment required by SC-008 / C13: confirm that `clarify.md`, `merge.md`, `queue.md`, `status.md`, `watch.md` do not inline-invoke another slash command today. Use a grep of each file for slash-command-invocation patterns as evidence. This is a PR-body artifact (recorded when the PR is opened), not a repo file. (SC-008; data-model.md C13; FR-007)

## Dependencies & Execution Order

**Sequential chain within Phase 2** (all touch the same region of `review.md` sub-branch A — no parallel edits):
- T001 → T002 → T003 → T004 → T005 → T006

**Sequential after Phase 2**:
- T007 (Examples section — same file, different section from T002–T006, but sequential to avoid merge conflicts inside `review.md`)

**Parallel opportunities**:
- T008 [P] (README.md edit) can run in parallel with T002–T007 (different file).
- T009 [P], T010 [P], T011 [P] are read-only static verifications and can run in parallel with each other, after Phase 2–4 complete.
- T013 [P] (PR body draft) can run in parallel with static checks — it inspects sibling files that Phase 2–4 do not touch.

**Behavioral check**:
- T012 depends on all edits (T002–T008) being applied and static checks (T009–T011) passing. It requires a live Claude Code session and cannot be parallelized with the edits.

**Suggested execution order**:
1. T001 (baseline)
2. T002 → T003 → T004 → T005 → T006 → T007 (review.md edits, sequential — same file)
3. T008 in parallel with any of steps 2 (different file)
4. T009, T010, T011, T013 in parallel (all read-only, all independent)
5. T012 (behavioral — requires all prior work applied)

## Notes

- No new file is created; only two existing files are edited.
- No runtime code, no schema, no CLI wiring — this is a playbook edit (like #388).
- The change is intentionally structural (subagent boundary) rather than textual reinforcement; SC-007 forbids a third prompt patch to `review.md` beyond what #384/#388 shipped, so T002–T007 must not introduce new outer-playbook "MUST" clauses beyond the subagent-boundary contract itself.
- After tasks complete, suggested next step: `/speckit:implement` to execute T001–T013 end-to-end, or manual application task-by-task.
