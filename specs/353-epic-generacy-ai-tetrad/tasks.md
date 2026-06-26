# Tasks: /cockpit:clarify verb

**Input**: Design documents from `/specs/353-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, clarifications.md, contracts/ (cockpit-advance.md, cockpit-clarify-context.md, github-comment.md)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (this issue has a single primary story; all tasks are tagged `[US1]`)

## Phase 1: Setup & Pre-flight

- [X] T001 Verify `generacy cockpit clarify-context --issue <n>` exists and emits the expected open-question shape (JSON or `Q[N]: …` text). If the actual shape differs from `specs/353-epic-generacy-ai-tetrad/contracts/cockpit-clarify-context.md`, update that contract before writing the verb (plan Phase 0). **Reconciled 2026-06-26**: actual shape is `<issue>` positional (no `--issue` flag) + JSON output `{issue, clarificationComment, spec, plan, codeReferences}`; contract rewritten.
- [X] T002 [P] Verify `generacy cockpit advance --gate clarification --issue <n>` is the canonical invocation (G1.2 / #788). If the gate-name flag differs, reconcile by updating `specs/353-epic-generacy-ai-tetrad/contracts/cockpit-advance.md` (plan Phase 0). **Reconciled 2026-06-26**: `--gate clarification` flag is correct; issue is positional (no `--issue` flag); contract updated.
- [X] T003 [P] Run `gh auth status` in the target dev environment to confirm `gh` is installed and authenticated against `generacy-ai/agency`; record any setup steps needed in `specs/353-epic-generacy-ai-tetrad/quickstart.md` if a gap is found (plan Phase 0). **Verified**: `gh` authenticated as `christrudelpw` against `github.com`.
- [X] T004 [P] Re-read `packages/claude-plugin-agency-spec-kit/commands/clarify.md` to lock the reference frontmatter + step-section shape that the new verb must mirror (research Pattern in research.md §Implementation Patterns).

## Phase 2: Author the verb file (US1)

- [X] T010 [US1] Create `packages/claude-plugin-cockpit/commands/clarify.md` with YAML frontmatter — `description:` matching the `/cockpit:clarify` row in `packages/claude-plugin-cockpit/README.md` — plus the title `# Cockpit Clarify` and a one-paragraph overview (plan Phase 1.1; research Pattern §Verb file frontmatter).
- [X] T011 [US1] In `packages/claude-plugin-cockpit/commands/clarify.md`, add the `## Arguments` section documenting `$ARGUMENTS` as the optional issue number with leading `#` stripped (data-model `IssueResolution`).
- [X] T012 [US1] In `packages/claude-plugin-cockpit/commands/clarify.md`, add `### Step 1: Resolve target issue` with the precedence `$ARGUMENTS` → `/^(\d+)-/` branch capture → hard error with the literal message `no child issue resolvable; pass --issue <n>` (D3 in research.md; data-model `IssueResolution`).
- [X] T013 [US1] In `packages/claude-plugin-cockpit/commands/clarify.md`, add `### Step 2: Fetch open questions` instructing a Bash invocation of `generacy cockpit clarify-context <issue-ref>` (positional, qualified `owner/repo#n`) and parsing the `clarificationComment.body` markdown into the `OpenQuestion` shape (data-model `OpenQuestion`; contracts/cockpit-clarify-context.md). Handles exit-3 gate-refusal and null comment as no-op exits.
- [X] T014 [US1] In `packages/claude-plugin-cockpit/commands/clarify.md`, add `### Step 3: Draft answers` requiring per-question grounding in `spec.md`/`plan.md`/repo files with a `provenance` citation, and rendering `_no draft — insufficient context_` verbatim for un-groundable questions with `grounded: false` (D4; data-model `DraftedAnswer`).
- [X] T015 [US1] In `packages/claude-plugin-cockpit/commands/clarify.md`, add `### Step 4: Present drafts for approval` covering the four verdicts (`approved`, `edited`, `rejected`, `skipped`), the `⚠ ungrounded` UI cue for `grounded: false` drafts, and a pre-confirm summary showing remaining-pending count (data-model `ApprovalDecision`; plan Open Risks row "Partial-approval semantics misread").
- [X] T016 [US1] In `packages/claude-plugin-cockpit/commands/clarify.md`, add `### Step 5: Post comment` instructing assembly of the body into a tempfile at `/tmp/cockpit-clarify-answers-<issue>-<timestamp>.md` with line 1 = `<!-- generacy-cockpit:clarification-answers -->`, blank line, then ascending `### Q<n>` blocks; post via `gh issue comment <n> --body-file <tempfile>` (never `-b "…"`); skip posting and exit 0 if no Q-block would be emitted (D2, D6 in research.md; data-model `PostedComment`; contracts/github-comment.md).
- [X] T017 [US1] In `packages/claude-plugin-cockpit/commands/clarify.md`, add `### Step 6: Advance gate (conditional)` invoking `generacy cockpit advance --gate clarification <issue-ref>` (positional ref) only when every `OpenQuestion` in this run has an `ApprovalDecision` with verdict ∈ {`approved`, `edited`} AND `gh issue comment` exited zero; otherwise exit 0 with a status summary listing pending question numbers (D7; data-model `GateAdvanceSignal`; contracts/cockpit-advance.md).
- [X] T018 [US1] In `packages/claude-plugin-cockpit/commands/clarify.md`, add the `## Constraints` and `## Post-Command Check` sections mirroring `packages/claude-plugin-agency-spec-kit/commands/clarify.md`; the constraints MUST call out marker-on-line-1, one-comment-per-run, append-only (no comment edits), and `gh` as a hard runtime dependency (research §Implementation Patterns; plan §Technical Context §Constraints).

## Phase 3: Documentation

- [X] T020 [P] [US1] Update `packages/claude-plugin-cockpit/README.md`: remove the "(coming in #351–#360)" marker from the `/cockpit:clarify` row and reflect the shipped behavior (plan Phase 1.2; project structure §Source Code).

## Phase 4: Local validation (plan Phase 2)

- [ ] T030 [US1] Walk through `specs/353-epic-generacy-ai-tetrad/quickstart.md` against a real epic-child issue that has ≥1 pending clarification question; capture the issue number used so subsequent verification tasks reference the same fixture.
- [ ] T031 [US1] Verify the full-approval path: approve every drafted answer, run the verb, then `gh issue view <n> --comments | head -n 1` to confirm the first line is exactly `<!-- generacy-cockpit:clarification-answers -->`; confirm `generacy cockpit advance --gate clarification --issue <n>` fired (label/state change visible on the issue) (plan Phase 2 bullet 1; quickstart.md verification step).
- [ ] T032 [US1] Verify the partial-approval path: approve a strict subset (e.g., 2 of 3 questions), confirm a single comment is posted containing only the approved Q-blocks, and confirm `generacy cockpit advance` was NOT invoked (no label/state change) (D7 in research.md; plan Phase 2 bullet 2).
- [ ] T033 [US1] Verify the hard-error path: check out a branch that does not match `###-*` (or use a temporary branch), invoke `/cockpit:clarify` with no `$ARGUMENTS`, confirm exit is non-zero and stderr/output contains the literal `no child issue resolvable; pass --issue <n>` (D3; plan Phase 2 bullet 3).
- [ ] T034 [US1] Verify the ungrounded-stub path: pick a question whose answer is not findable in `spec.md`/`plan.md`/repo, confirm Step 3 renders `_no draft — insufficient context_` verbatim, confirm Step 4 flags it as `⚠ ungrounded`, and confirm Step 5/6 behavior matches the developer's verdict on it (D4; plan Phase 2 bullet 4).
- [ ] T035 [US1] Verify the all-rejected/skipped path: reject or skip every drafted answer, confirm the verb exits without posting a marker-only comment and without invoking advance (data-model `PostedComment` validation: "posted only if at least one Q-block would be emitted").

## Dependencies & Execution Order

**Phase order**: 1 → 2 → 3 → 4. Phase 4 cannot start until the verb file (Phase 2) and README row (Phase 3) are in tree.

**Within Phase 1**:
- T001 has no parallel constraint with T002/T003/T004 (different commands, different artifacts). All four can run in parallel; only T001 may produce a contract edit that needs to land before T013/T016 are authored.

**Within Phase 2** (the verb file):
- T010–T018 all modify the same file (`packages/claude-plugin-cockpit/commands/clarify.md`) — they MUST run sequentially in the listed order to avoid stomping each other.

**Within Phase 3**:
- T020 touches a different file (`README.md`) and can start in parallel with Phase 2's tail (T018 already done is not required for T020 — both files are independent). It is marked `[P]` for that reason but is gated on Phase 2 completion only if the description text is being copied across; safe default is to run it after T010 once the frontmatter `description:` is settled.

**Within Phase 4** (validation):
- T030 must complete first (it picks the live fixture issue). T031–T035 each exercise a distinct path; they share the fixture issue but exercise different verdicts/branches, so they are sequential against the same upstream state (run them in order against fresh runs of the verb).

**Parallel opportunities**:
- Phase 1: T001, T002, T003, T004 in parallel.
- Phase 2 → 3 overlap: T020 may run as soon as T010 lands the frontmatter `description:` line; it does not block on T011–T018.

## Next Step

Run `/speckit:implement` to begin executing these tasks against this branch.
