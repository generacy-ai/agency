# Tasks: Fuse cockpit review findings presentation and approval prompt

**Input**: Design documents from `/specs/388-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/fused-step.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files/edit regions, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 / US2 / US3)

**Target file** (single-file playbook edit — FR-011 / C9):
- `packages/claude-plugin-cockpit/commands/review.md`

Sibling playbooks (`clarify.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) are OUT OF SCOPE and must not be modified.

---

## Phase 1: Setup

- [ ] T001 Read `packages/claude-plugin-cockpit/commands/review.md` end-to-end to confirm the pre-fusion step layout matches `data-model.md`'s "Pre-fusion step layout" (steps 1..9, defect at step 3 ending turn before step 5).
- [ ] T002 [P] Capture baseline grep counts on the pre-edit file for regression comparison after edit:
  - `grep -c "MUST NOT print raw JSON" packages/claude-plugin-cockpit/commands/review.md`
  - `grep -c "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/review.md`
  - `grep -c "<!-- END terminal-check -->" packages/claude-plugin-cockpit/commands/review.md`
  - `grep -c "Suggested decision:" packages/claude-plugin-cockpit/commands/review.md`
  - `grep -c "delivered AS PART OF the same response that invokes AskUserQuestion" packages/claude-plugin-cockpit/commands/review.md` (expected 0 pre-edit)

## Phase 2: Core Edit — Fuse steps 3/4/5 into new step 3

- [ ] T003 [US1] In `packages/claude-plugin-cockpit/commands/review.md`, replace the current steps 3, 4, and 5 with a single new step 3 titled "**Fused analysis + approval prompt**". Preserve steps 1 (Parse arguments) and 2 (Pre-flight) verbatim above the fused step.
- [ ] T004 [US1] Insert the FR-002 rule sentence at the head of the new step 3 body, exactly once, verbatim:
  > *The findings summary is delivered AS PART OF the same response that invokes `AskUserQuestion` — presenting findings in a response that does not invoke `AskUserQuestion` is a protocol violation. Do not end a response between completing the analysis and invoking the prompt.*
- [ ] T005 [US1] Inside new step 3, add the internal `--gate` branch structure per contract C.2:
  - `implementation-review` → implementation-review sub-branch (C.3)
  - `spec-review` / `clarification-review` / `plan-review` / `tasks-review` → artifact-review sub-branch (C.4)
- [ ] T006 [US1][US2] Populate the implementation-review sub-branch (C.3) in this exact order:
  1. Invoke `/code-review` (retained cross-slash-command exception language from pre-fusion step 3).
  2. Capture output verbatim.
  3. Classify each finding blocking/non-blocking (retained classification prose).
  4. **[FR-006 / C.2 placement]** Inline clause `MUST NOT print raw JSON under any circumstance.` — MUST be the line IMMEDIATELY before the findings-summary table rendering instruction.
  5. Render findings-summary table as prose (retained table shape from pre-fusion step 3, including zero-findings row `| (none) | | | |`).
  6. Append `Suggested decision: <approve|request-changes|abort>` line (retained derivation rules).
- [ ] T007 [US1] Populate the artifact-review sub-branch (C.4) with the retained pre-fusion step 4 body: read the artifact, produce `## Blockers` / `## Open questions` / `## Suggested decision` three-section summary (empty sections → `- (none)`), append `Suggested decision:` line.
- [ ] T008 [US1] Add the convergence block (C.5) after both sub-branches: single shared `AskUserQuestion` invocation with:
  - `question`: full summary (normal) or digest (fallback per FR-004 — model judgment ~4 KB rough guide; digest MUST carry artifact/PR identifier + blocking count + non-blocking count + "see table above" pointer).
  - `options` in exact order: `approve`, `request-changes`, `abort`.
  - Explicit reminder that the response containing the tool call MUST also contain the prose summary (never in separate turns).
- [ ] T009 [US1] Add the fused step's edge-case notes:
  - Zero findings (implementation-review): still invoke `AskUserQuestion` (FR-008).
  - `/code-review` hard error: route to Error handling class `OTHER`; do NOT invoke `AskUserQuestion`; do NOT emit any Terminal Outcome Check marker (FR-009 / C.3 error clause).

## Phase 3: Renumber and update downstream references

- [ ] T010 [US1] Renumber the four remaining steps in `review.md`: pre-fusion 6 → new 4 (Advance on approval), pre-fusion 7 → new 5 (Post feedback on request-changes), pre-fusion 8 → new 6 (No-op on abort), pre-fusion 9 → new 7 (Non-zero CLI exit → Error handling).
- [ ] T011 [US1] Grep the file for stale step-number references (`step 3`, `step 4`, `step 5`, `step 6`, `step 7`, `step 8`) and update every internal cross-reference to its post-renumber value. Notable known references from the pre-edit file:
  - Step 3's classification note referring to "the `AskUserQuestion` gate in step 5" — becomes "in this same step" (fusion collapses the boundary).
  - Step 6's approval-review body reference to "step 3's table" — target file/line changes to the fused step's table.
  - Step 8 abort marker reference — renumbered to step 6.
- [ ] T012 [US3] Update the Terminal Outcome Check block's step references (retain fence markers `<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->` verbatim, retain the marker list `Labels:` / `Feedback posted:` / `Aborted:` verbatim):
  - Rewrite the three marker bullets to reference post-renumber steps 4/5/6 (were 6/7/8).
  - Rewrite the fallback re-invocation instruction to re-invoke the fused step's `AskUserQuestion` invocation (previously "step 5 only") — retain "do NOT re-invoke `/code-review`, do NOT restart from step 3, do NOT restart from step 1" (updating "step 3" to the new fused step 3).
- [ ] T013 [US3] Update the Terminal Outcome Check block's `<!-- Rationale: ... -->` comment (per Q8=A / FR-010) to record the new layering: fusion structurally guarantees reaching the prompt; this block backstops executing the operator's decision across post-renumber steps 4–6. Remove the now-superseded rationale about "instruction decay after a long sub-invocation" being the primary problem, or reframe it to note that the decay window between steps is now closed and this block covers a different decay window (between operator answer and side-effect execution).
- [ ] T014 [US1] Remove the passive step-3-only raw-JSON reminder inside the Terminal Outcome Check block — enforcement now lives inline at the point of behavior inside the fused step (FR-006 / C.2). If retained, it duplicates a rule that must appear inline.

## Phase 4: Update `## Examples` section

- [ ] T015 [US1] Rewrite each `## Examples` bullet touching the fused step so that analysis-and-prompt happen in the same response block. Specifically:
  - Update the `--gate implementation-review` example to describe a single response containing: `/code-review` invocation → captured output → findings-summary table → `Suggested decision:` line → `AskUserQuestion` in the SAME turn.
  - Update the `--gate plan-review` example to describe the three-section summary and the `AskUserQuestion` invocation in the same response.
- [ ] T016 [US1] Confirm no example describes a pre-fusion shape (analysis in one response, prompt in the next). No example may narrate a turn boundary between the summary and the prompt (FR-012 / C7 / AP-8).

## Phase 5: Static verification

- [ ] T017 [US1] SC-003 check: `grep -c "delivered AS PART OF the same response that invokes AskUserQuestion" packages/claude-plugin-cockpit/commands/review.md` → expect exactly `1`.
- [ ] T018 [P] [US2] SC-004 / C.2 check: `grep -n "MUST NOT print raw JSON" packages/claude-plugin-cockpit/commands/review.md` → expect exactly one match, located inside the fused step 3, on the line immediately preceding the findings-summary table rendering instruction.
- [ ] T019 [P] [US3] C.3 check: `grep -c "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/review.md` and `grep -c "<!-- END terminal-check -->" packages/claude-plugin-cockpit/commands/review.md` → each expect exactly `1`.
- [ ] T020 [P] [US3] C.4 check: `grep -E "Labels:|Feedback posted:|Aborted:" packages/claude-plugin-cockpit/commands/review.md` → confirm all three markers still appear in the Terminal Outcome Check block, unchanged in text.
- [ ] T021 [P] [US1] C.8 check: `grep -c "Suggested decision:" packages/claude-plugin-cockpit/commands/review.md` → expect at least `1` inside the fused step body.
- [ ] T022 [US1] Step-contiguity check: read the numbered instruction list top-to-bottom and confirm step ids form `1..7` with no gaps and no duplicates.
- [ ] T023 [P] C9 sibling non-modification check: `git diff origin/develop -- packages/claude-plugin-cockpit/commands/clarify.md packages/claude-plugin-cockpit/commands/merge.md packages/claude-plugin-cockpit/commands/queue.md packages/claude-plugin-cockpit/commands/status.md packages/claude-plugin-cockpit/commands/watch.md` → expect empty output.
- [ ] T024 [P] SC-007 / C7 examples-adherence check: read every `## Examples` bullet that touches the fused step and confirm zero pre-fusion shapes remain (no narration of a turn boundary between summary and prompt).

## Phase 6: Behavioral verification & PR

- [ ] T025 [US1] Per SC-006: replay one long-analysis `/cockpit:review --gate implementation-review` scenario (see quickstart.md § Verification — behavioral check) and confirm the response containing the findings-summary table ALSO contains the `AskUserQuestion` invocation, in the same turn. If the prompt does not fire in the same turn, re-check T004 (rule sentence at head of fused step) and T008 (converging AskUserQuestion invocation).
- [ ] T026 [US1] Prepare PR description that records the one-line sibling assessment (FR-011): "`clarify.md`'s prompts are per-item and immediately follow each draft (no analysis-then-prompt boundary to fuse); `merge.md` and `queue.md` have no analysis phase preceding their gates."

---

## Dependencies & Execution Order

**Sequential dependencies**:
1. Phase 1 (T001–T002) must complete before Phase 2 — need the pre-edit baseline.
2. Phase 2 (T003–T009) is strictly sequential: T003 removes/replaces the step-3/4/5 region; T004–T009 populate that region in order. Skipping ahead would produce an inconsistent partial state.
3. Phase 3 (T010–T014) depends on Phase 2 completion — renumbering only makes sense after the fusion has collapsed the step count from 9 to 7.
4. Phase 4 (T015–T016) can start after Phase 3 completes, but before Phase 5 static grep checks — examples must be consistent with the new fused step shape.
5. Phase 5 static checks (T017–T024) run after Phase 4 completes.
6. Phase 6 (T025–T026) runs last; T025 requires a running Claude Code session with the updated plugin, T026 needs the finished diff.

**Parallel opportunities**:
- T002 is `[P]` — capture baseline greps in parallel with T001's read (no ordering dependency between them).
- T018, T019, T020, T021 are `[P]` — independent grep commands over the same file after edits are done. T023, T024 also parallel-eligible (independent checks).
- T017 and T022 are sequential-ish (T017 counts the fusion rule sentence, T022 is a structural read); can run alongside the parallel greps but list them separately because they have different verifier steps.

**Story mapping**:
- **US1** (fused step prevents turn boundary): T003–T011, T014–T017, T021–T026 — all core-fusion and examples work.
- **US2** (raw-JSON regression closed by construction): T006 (raw-JSON clause placement), T018 (verifier).
- **US3** (Terminal Outcome Check remains secondary backstop): T012 (renumber references), T013 (rationale update), T019 (fence markers preserved), T020 (marker list preserved).

**Suggested next step**: `/speckit:implement` to begin execution of the fused step edit.
