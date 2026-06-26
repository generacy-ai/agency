# Tasks: `/cockpit:review` command (Epic Cockpit A2.4)

**Input**: Design documents from `/specs/354-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/command.md, quickstart.md, clarifications.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

Implementation note: the entire deliverable is one new markdown verb file at `packages/claude-plugin-cockpit/commands/review.md` plus an optional README row update. Most authoring tasks edit the same file and therefore cannot run in parallel; parallel markers are reserved for tasks that touch genuinely different files.

## Phase 1: Setup & Preflight

- [X] T001 Confirm the cockpit plugin scaffold (#350) is present: verify `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` exists and that `packages/claude-plugin-cockpit/commands/` exists (with `.gitkeep`). No file changes.
- [X] T002 [P] Confirm the four runtime dependencies are reachable in the host environment per plan.md Phase 0: `/code-review` (host skill), `AskUserQuestion` (host primitive), `/cockpit:advance` (G1.2 / #788), `/cockpit:review-context` (G1.3 / #789). Record presence/absence in the PR description; missing G1.2/G1.3 is acceptable — the command must fail-fast at runtime in that case.
- [X] T003 [P] Read the sibling style template `packages/claude-plugin-agency-spec-kit/commands/plan.md` to match its YAML-frontmatter + markdown shape (per research D1). No file changes — informational only.

## Phase 2: Core Implementation — `commands/review.md`

All tasks in this phase edit the single new file `packages/claude-plugin-cockpit/commands/review.md`. They are ordered so each step builds on the previous; do them sequentially.

- [X] T010 [US3] Create `packages/claude-plugin-cockpit/commands/review.md` with YAML frontmatter (`description:` matching the README row text) and an outline of the body sections (`Arguments`, `Behaviour — impl`, `Behaviour — non-impl`, `Modes`, `Failure modes`, `Help`). Reference: contracts/command.md.
- [X] T011 [US3] Implement argument parsing in `commands/review.md`: required `--gate <name>` (valid set: `specify`, `clarify`, `plan`, `tasks`, `impl`), optional `--mode <assist|auto|manual>` (default `assist`), and bare / `--help` invocation handling (FR-002, FR-010). Reference: data-model E1, E2; contracts/command.md § Invocation.
- [X] T012 [US3] Implement the help/discovery branch in `commands/review.md`: bare invocation and `--help` list the supported gates with their canonical artifact (or "PR via review-context" for `impl`) and the three modes with one-line descriptions (FR-010, SC-001). Reference: contracts/command.md § Bare / `--help` output.
- [X] T013 [US1][US2] Implement feature-context resolution in `commands/review.md`: parse current git branch, extract `<issue#>` prefix, find the unique `specs/<issue#>-*` directory; fail-fast with candidates if zero or multiple matches (research D7). Reference: data-model E4.
- [X] T014 [US1] Implement the `impl` gate branch in `commands/review.md`: call `/cockpit:review-context`, surface its message verbatim on failure, then call `/code-review` on the returned diff and emit its summary verbatim (FR-003, FR-005, US1 acceptance). Reference: research D2; data-model E7.
- [X] T015 [US1] Implement the final-line invariant for the `impl` branch in `commands/review.md`: detect whether `/code-review`'s output already ends with `Suggested decision: <verb>`; reuse if present, append otherwise (FR-005, SC-005, plan.md Open Risk row 3). Reference: data-model E7 rendering rule.
- [X] T016 [US2] Implement the non-`impl` gate branch in `commands/review.md`: resolve artifact path via the locked Q1 mapping (`specify`→`spec.md`, `clarify`→`clarifications.md`, `plan`→`plan.md`, `tasks`→`tasks.md`), read the file, emit three H2 sections in order — `## Blockers`, `## Open questions`, `## Suggested decision` — with empty sections rendered as `- (none)` (FR-004, FR-005). Reference: data-model E3, E6; research D4.
- [X] T017 [US2] Implement the default decision rule for non-`impl` gates in `commands/review.md`: blockers non-empty → `request-changes`; blockers empty but open questions non-empty → `request-changes`; both empty → `approve`. End the summary with the literal `Suggested decision: <verb>` line. Reference: data-model E6 decision rule; SC-005.
- [X] T018 [US1][US2][US4] Implement `assist` mode in `commands/review.md`: after the summary, invoke `AskUserQuestion` with three options (approve / request-changes / abort). On `approve`, call `/cockpit:advance --gate <name>`; on `request-changes` or `abort`, leave labels untouched (FR-006, FR-007, FR-008, US1 + US2 acceptance). Reference: research D6; contracts/command.md § Side-effect contract.
- [X] T019 [US4] Implement `auto` mode in `commands/review.md`: emit the summary; if `Suggested decision: approve`, call `/cockpit:advance --gate <name>` without prompting; otherwise stop with the open items (FR-006, US4 acceptance). Reference: data-model E2.
- [X] T020 [US4] Implement `manual` mode in `commands/review.md`: emit summary only; never invoke `/cockpit:advance` regardless of suggested decision (FR-006, US4 acceptance — final bullet). Reference: data-model E2.
- [X] T021 [US1][US2] Implement label-transition reporting in `commands/review.md`: after a successful `/cockpit:advance`, echo a single line `Labels: waiting-for:<gate> → completed:<gate> on #<issue>` using the response from `/cockpit:advance` (FR-007, US1 + US2 acceptance). Reference: data-model E8; contracts/command.md § Output schema.
- [X] T022 [US3] Implement the fail-fast failure-mode block in `commands/review.md` covering all six `ReviewError` kinds: `unknown-gate`, `unknown-mode`, `feature-resolution-failed`, `review-context-failed`, `artifact-missing`, `advance-not-installed` (FR-009, SC-004). Each path emits exactly one `Error: <sentence>` line and mutates no labels. Reference: data-model E9; contracts/command.md § Failure.

## Phase 3: Documentation Polish (optional in this PR)

- [X] T030 [P] Update `packages/claude-plugin-cockpit/README.md`: flip the `/cockpit:review` row from "(coming in #351–#360)" to a live one-line description matching the YAML frontmatter `description:`. Plan.md Phase 2 notes this is cosmetic and can ship in a later PR alongside G1.2/G1.3.

## Phase 4: Manual Validation (per Success Criteria)

Phase 4 tasks are independent manual runs; they touch no source files and can be parallelised across testers/sessions.

- [ ] T040 [P] SC-001: Install/refresh the cockpit plugin and confirm `/cockpit:review` appears in the Claude Code slash-command palette. Run `/cockpit:review --help` and verify the gate + mode list output.
- [ ] T041 [P] SC-002 (US1): On a real epic child issue with an open PR, run `/cockpit:review --gate impl`. Verify `/cockpit:review-context` is called, `/code-review` summary appears, approval drives `/cockpit:advance --gate impl`, and `gh issue view <#>` shows `waiting-for:impl` removed and `completed:impl` added.
- [ ] T042 [P] SC-003 (US2): On an in-progress feature branch, run `/cockpit:review --gate <name>` once per non-`impl` gate (`specify`, `clarify`, `plan`, `tasks`). Verify each reads the correct artifact and, on approval, transitions `waiting-for:<name>` → `completed:<name>`.
- [ ] T043 [P] SC-004: Run a `request-changes` invocation, an `abort` invocation, and a `--mode manual` invocation. Verify with `gh issue view` that NO labels (including `phase:*`, `waiting-for:*`, `completed:*`) changed.
- [ ] T044 [P] SC-005: `grep '^Suggested decision: ' <transcript>` across all runs from T040–T043 and confirm every summary ends with the literal line.

## Dependencies & Execution Order

- **T001–T003 (Setup)** must complete before Phase 2. T002 and T003 can run in parallel with each other and with T001.
- **T010 → T011 → T012 → T013** are strictly sequential (each step extends the same file with content that depends on prior structure).
- **T014–T015 (impl branch)** depend on T013 (feature-context) and can be developed before or after T016–T017 (non-impl branch), but since both edit the same file, do them sequentially. Suggested order: T014 → T015 → T016 → T017.
- **T018–T020 (mode handling)** depend on both gate branches existing (T014–T017) — implement after them.
- **T021 (label-transition reporting)** depends on T018 and T019 (the two paths that can trigger `/cockpit:advance`).
- **T022 (failure modes)** can be implemented incrementally alongside earlier tasks (each branch's failure path next to its happy path), but the final consolidated audit task is listed after all happy paths to ensure full coverage.
- **T030 (README touch-up)** is independent of all Phase 2 tasks and can run in parallel with any of them.
- **Phase 4 (validation)** depends on Phase 2 completion and on the runtime presence of G1.2 (#788) and G1.3 (#789); if either dependency is missing, only T040 and a fail-fast variant of T041/T042 (checking for the `advance-not-installed` / `review-context-failed` error messages) are runnable.

### Parallel opportunities

- T002 ∥ T003 (preflight checks on different inputs, no file changes).
- T030 ∥ any Phase 2 task (different file).
- T040 ∥ T041 ∥ T042 ∥ T043 ∥ T044 (independent manual runs).

### User-story coverage

| Story | Tasks |
|-------|-------|
| US1 (impl PR review) | T013, T014, T015, T018, T021, T041 |
| US2 (non-impl artifact review) | T013, T016, T017, T018, T021, T042 |
| US3 (discoverable gates & modes) | T010, T011, T012, T022 |
| US4 (non-interactive auto/manual) | T018, T019, T020, T043 |
