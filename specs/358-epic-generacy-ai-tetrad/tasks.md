# Tasks: `/cockpit:file` orchestrator

**Input**: Design documents from `/specs/358-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/file-command.schema.md, contracts/manifest-handoff.schema.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = primary `/cockpit:file` deliverable; this issue has a single user story per spec.md)

---

## Phase 1: Setup & Reference Re-verification

- [ ] T001 Re-read `packages/claude-plugin-cockpit/commands/watch.md` and `packages/claude-plugin-cockpit/commands/review.md` to confirm playbook conventions (frontmatter shape, argument table format, engine-boundary notes, inline error envelope precedent).
- [ ] T002 [P] Re-read `packages/claude-plugin-agency-spec-kit/commands/taskstoissues.md` to confirm how the user-driven sibling invokes `spec_kit.tasks_to_issues`, so the new playbook can compose it without re-asking for `grouping` or other parameters.
- [ ] T003 [P] Re-verify the `spec_kit.tasks_to_issues` signature at `packages/agency-plugin-spec-kit/src/tools/tasks-to-issues.ts:288` (params: `grouping`, `dry_run`, `epic_number`, `feature_dir`, `cwd`) and confirm it is exported in `packages/agency-plugin-spec-kit/src/manifest.ts:30`.

## Phase 2: Core Implementation

- [ ] T010 [US1] Create `packages/claude-plugin-cockpit/commands/file.md` with `---`-fenced YAML frontmatter containing a one-line `description:` for `/help` registration (mirror `commands/watch.md:1-3`).
- [ ] T011 [US1] In `commands/file.md`, write the **Summary** section: one short paragraph stating the orchestration boundary ("composes `spec_kit.tasks_to_issues` and `generacy cockpit manifest sync`; owns no resolution, no parsing, no label mutation; every responsibility is delegated to the engines").
- [ ] T012 [US1] In `commands/file.md`, write the **Arguments** section per `contracts/file-command.schema.md`: single optional positional `<epic-ref>` (bare `#N`, `owner/repo#N`, or URL); document that ref resolution is engine-owned; include the `--help` flag row.
- [ ] T013 [US1] In `commands/file.md`, write the **Instructions** section as the six-step procedure from `quickstart.md` §2: (1) validate args / branch to Help, (2) locate `tasks.md` via `spec_kit.check_prereqs`, (3) dispatch `spec_kit.tasks_to_issues` with `epic_number=epic_ref|omit`, `dry_run=false`, (4) check engine result and apply FR-005 (no `manifest sync` after a `tasks_to_issues` failure), (5) dispatch `generacy cockpit manifest sync <parent-ref>`, (6) emit Shape B success report or Shape A failure with FR-006 `next:` recovery line.
- [ ] T014 [US1] In `commands/file.md`, write the **Notes** trailer covering: idempotency (FR-009: fully-filed → engine no-op, sync still runs); partial-state behavior (clarifications Q3 + US2-AC3 — file only unfiled blocks, reuse recorded parent); engine boundaries (Q2: artifact handoff, not JSON pipe; Q5: engine-side parent dedup, no sidecar state); cross-repo out-of-scope (Q4); explicit list of what the playbook does NOT do (no ref parsing, no `tasks.md` edits, no `.yaml` edits, no direct GitHub API).
- [ ] T015 [US1] In `commands/file.md`, embed the Help / discovery output block verbatim from `contracts/file-command.schema.md` §"Help / discovery" so the `--help` branch in step 1 has a documented output shape.
- [ ] T016 [US1] In `commands/file.md`, embed the three error/report envelope shapes (Shape A / Shape B / Shape C) verbatim from `contracts/file-command.schema.md` so step 6 and the `--help` flag branch have explicit output templates; label each engine's stderr with the `[tasks_to_issues]` / `[manifest sync]` source prefix per research.md D7.

## Phase 3: Validation (Manual Smoke Tests)

<!-- Phase boundary: Phase 2 complete (commands/file.md written) before running these checks. -->

- [ ] T020 [US1] Markdown lint: run `pnpm exec markdownlint packages/claude-plugin-cockpit/commands/file.md` and confirm clean output (or expected project-default tolerances). Verify frontmatter parses and no internal links are broken.
- [ ] T021 [US1] Plugin-loader registration: reload Claude Code with the cockpit plugin installed and confirm `/cockpit:file` appears in `/help` with the `description:` text from frontmatter.
- [ ] T022 [P] [US1] Smoke test — golden path (quickstart.md §4): on a feature branch with a populated `tasks.md` and no `**Epic**:` header, run `/cockpit:file`; verify (a) parent epic created on `gh` remote, (b) `**Epic**: #<n>` written at top of `tasks.md`, (c) `**Issue**: #<n>` written into each `## Task:` block, (d) `manifest sync` invoked, (e) `.generacy/epics/<slug>.yaml` updated, (f) Shape B success report emitted.
- [ ] T023 [P] [US1] Smoke test — idempotency / FR-009 (quickstart.md §5): immediately re-run `/cockpit:file` on the fully-filed manifest; verify `tasks_to_issues` reports zero new issues, `manifest sync` still runs, and Shape B reports `filed 0 issue(s)`.
- [ ] T024 [P] [US1] Smoke test — partial recovery / clarification Q3 + US2-AC3 (quickstart.md §6): delete one `**Issue**: #<n>` line, re-run `/cockpit:file`; verify exactly one new child issue is filed, parent is reused (no duplicate parent), `.yaml` is updated, Shape B reports `filed 1 issue(s)`.
- [ ] T025 [P] [US1] Smoke test — FR-005 failure path (quickstart.md §7): set `GH_TOKEN=invalid` and run `/cockpit:file`; verify Shape A emits with `<step>=tasks_to_issues`, verbatim `gh` error in `detail:`, and that `manifest sync` is NOT called.
- [ ] T026 [P] [US1] Smoke test — FR-006 failure path (quickstart.md §7): induce a `manifest sync` failure (e.g. rename `generacy` on PATH after `tasks_to_issues` succeeds, or pass an invalid engine flag); verify `tasks.md` is fully filed, Shape A emits with `<step>=manifest sync`, and the `next:` slot contains `generacy cockpit manifest sync #<parent>` for manual recovery.

## Phase 4: Polish & Commit

- [ ] T030 [US1] Cross-check `commands/file.md` against `data-model.md` cross-document invariants: confirm playbook (a) does not pre-parse `<epic-ref>` beyond empty/non-empty, (b) does not edit `tasks.md` or the `.yaml`, (c) does not create or read any `.cockpit-file-*` sidecar files, (d) does not pipe JSON between engines, (e) labels stderr with the `[<step>]` source prefix per D7.
- [ ] T031 [US1] Stage `packages/claude-plugin-cockpit/commands/file.md` and create a single commit: `feat(cockpit): /cockpit:file — orchestrate tasks_to_issues + manifest sync (#358)` (per quickstart.md §8). Do not push; let the developer review the diff before pushing.

---

## Dependencies & Execution Order

**Phase order (sequential)**:

Phase 1 → Phase 2 → Phase 3 → Phase 4

- Phase 1 (T001–T003) must complete before Phase 2 (precedent + signature confirmation drives the playbook prose).
- Phase 2 (T010–T016) must complete before Phase 3 (the file must exist to be linted and smoke-tested).
- Phase 3 (T020–T026) must complete before Phase 4 commit so the committed file is known-good.

**Within-phase ordering**:

- **Phase 1**: T001 first (it's the style/conventions reference); T002 and T003 [P] can be done concurrently after T001 since they read different files.
- **Phase 2**: T010 first (creates the file); T011–T016 modify the same file (`commands/file.md`) sequentially in the order listed — they are NOT parallel because they share a file. Each subtask is small (one section).
- **Phase 3**: T020 → T021 first (lint + load gate). Then T022 (golden path) must run before T023 (idempotency needs a fully-filed manifest from T022) and T024 (partial recovery needs a partially-filed manifest derived from T022's output). T025 and T026 [P] are independent of each other and of T023/T024 — they only need a feature branch with a populated `tasks.md`, which T022 has already produced.
- **Phase 4**: T030 before T031 (cross-check before commit).

**Parallel opportunities**:

- T002 ‖ T003 — different files, no ordering between them.
- T023 ‖ T024 ‖ T025 ‖ T026 — all post-golden-path smoke tests, independent of each other.

**Critical path**: T001 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T020 → T021 → T022 → (any of T023/T024/T025/T026) → T030 → T031.

---

*Generated by speckit*
