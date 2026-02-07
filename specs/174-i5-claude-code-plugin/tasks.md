# Tasks: I5: Claude Code plugin - remaining commands

**Input**: Design documents from `/specs/174-i5-claude-code-plugin/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which acceptance criterion this task addresses

## Phase 1: Audit & Verification

- [X] T001 Audit `plan.md` command - verify MCP tool references (`packages/claude-plugin-agency-spec-kit/commands/plan.md`)
- [X] T002 [P] Audit `tasks.md` command - verify MCP tool references (`packages/claude-plugin-agency-spec-kit/commands/tasks.md`)
- [X] T003 [P] Audit `taskstoissues.md` command - verify MCP tool references (`packages/claude-plugin-agency-spec-kit/commands/taskstoissues.md`)
- [X] T004 [P] Audit `implement.md` command - verify MCP tool references (`packages/claude-plugin-agency-spec-kit/commands/implement.md`)
- [X] T005 [P] Audit `checklist.md` command - verify MCP tool references (`packages/claude-plugin-agency-spec-kit/commands/checklist.md`)
- [X] T006 [P] Audit `analyze.md` command - verify MCP tool references (`packages/claude-plugin-agency-spec-kit/commands/analyze.md`)

## Phase 2: Updates & Enhancements
<!-- Phase boundary: Complete Phase 1 before starting Phase 2 -->

- [X] T007 Update `taskstoissues.md` to use `tasks_to_issues` MCP tool instead of direct `gh` CLI
- [X] T008 [P] Verify `implement.md` references `merge_from_base` MCP tool for phase boundaries
- [X] T009 [P] Ensure all commands have consistent YAML frontmatter with description field
- [X] T010 [P] Verify all commands include Post-Command Check section

## Phase 3: Testing & Validation
<!-- Phase boundary: Complete Phase 2 before starting Phase 3 -->

- [X] T011 Verify plugin.json correctly references MCP server dependency
- [X] T012 [P] Test `/agency-spec-kit:plan` command execution
- [X] T013 [P] Test `/agency-spec-kit:tasks` command execution
- [X] T014 [P] Test `/agency-spec-kit:taskstoissues` command execution (dry-run mode)
- [X] T015 [P] Test `/agency-spec-kit:implement` command execution
- [X] T016 [P] Test `/agency-spec-kit:checklist` command execution
- [X] T017 [P] Test `/agency-spec-kit:analyze` command execution

## Phase 4: Documentation
<!-- Phase boundary: Complete Phase 3 before starting Phase 4 -->

- [X] T018 Update README.md with command usage examples
- [X] T019 [P] Verify all acceptance criteria are met

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 (Audit) → Phase 2 (Updates) → Phase 3 (Testing) → Phase 4 (Documentation)

**Parallel opportunities within phases**:
- T002-T006 can run in parallel (different command files, no dependencies)
- T008-T010 can run in parallel (independent updates)
- T012-T017 can run in parallel (independent test executions)
- T018-T019 can run in parallel (documentation tasks)

**Task dependencies**:
- T007-T010 depend on T001-T006 (must audit before updating)
- T011-T017 depend on T007-T010 (must update before testing)
- T018-T019 depend on T011-T017 (must test before documenting)
