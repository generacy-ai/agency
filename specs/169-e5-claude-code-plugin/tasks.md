# Tasks: E5: Claude Code plugin: clarify command

**Input**: Design documents from `/specs/169-e5-claude-code-plugin/`
**Prerequisites**: plan.md (required), spec.md (required), research.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

- [x] T001 [US1] Create plugin directory structure at `packages/claude-plugin-agency-spec-kit/commands/` if not exists

## Phase 2: Core Implementation

- [x] T002 [US1] Create `packages/claude-plugin-agency-spec-kit/commands/clarify.md` with command frontmatter
- [x] T003 [US1] Implement prerequisite check workflow step (check_prereqs for spec.md)
- [x] T004 [US1] Implement spec analysis logic for identifying underspecified areas
- [x] T005 [US1] Implement clarification question generation with structured format (topic, context, question, options)
- [x] T006 [US1] Implement question persistence using manage_clarifications(operation: 'append')
- [x] T007 [US1] Implement answer collection via direct prompts
- [x] T008 [US1] Implement spec.md update with clarified information
- [x] T009 [US1] Implement label management (waiting-for:clarification, completed:clarification)

## Phase 3: Validation

- [x] T010 Verify command file exists at correct path
- [x] T011 Verify all workflow steps documented in command
- [x] T012 Verify MCP tool calls use correct namespace (agency_spec_kit.*)

## Dependencies & Execution Order

All tasks have been completed. The clarify command implementation exists at `packages/claude-plugin-agency-spec-kit/commands/clarify.md` (230 lines) and includes:

1. **Prerequisite checking** - Uses `check_prereqs` MCP tool
2. **Spec analysis** - Identifies ambiguous areas, missing criteria, undefined terms
3. **Question generation** - Creates structured questions with topic/context/question/options
4. **Question persistence** - Uses `manage_clarifications(operation: 'append')`
5. **Answer collection** - Direct prompts within Claude Code session
6. **Spec update** - Integrates answers back into spec.md
7. **Label management** - Tracks workflow state via GitHub labels
8. **Workflow integration** - Works with `/autodev:continue`

## Summary

| Phase | Tasks | Complete |
|-------|-------|----------|
| Setup | 1 | 1 |
| Core Implementation | 8 | 8 |
| Validation | 3 | 3 |
| **Total** | **12** | **12** |

All tasks complete. The clarify command is fully implemented and ready for use.
