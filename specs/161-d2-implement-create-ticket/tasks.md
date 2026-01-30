# Tasks: D2 - Implement create_ticket tool

**Input**: Design documents from `/specs/161-d2-implement-create-ticket/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Implementation

- [ ] T001 Create `packages/agency-plugin-spec-kit/src/tools/create-ticket.ts` with factory function
- [ ] T002 Add input validation for required `title` parameter
- [ ] T003 Add structured error response for invalid input
- [ ] T004 Implement execute handler calling provider.createTicket()
- [ ] T005 Return terse JSON response: `{ created: true, id, url }`

## Phase 2: Integration

- [ ] T006 Update `packages/agency-plugin-spec-kit/src/tools/index.ts` to import createCreateTicketTool
- [ ] T007 Add createCreateTicketTool to createTools() array
- [ ] T008 Export createCreateTicketTool from index.ts

## Phase 3: Testing

- [ ] T009 [P] Create `packages/agency-plugin-spec-kit/tests/create-ticket-tool.test.ts`
- [ ] T010 [P] Add unit test for successful ticket creation
- [ ] T011 [P] Add unit test for missing title validation error
- [ ] T012 [P] Add unit test for empty title validation error
- [ ] T013 Verify all providers work with create_ticket (GitHub, Jira, Shortcut, Local)

## Phase 4: Verification

- [ ] T014 Run `pnpm build` and verify no type errors
- [ ] T015 Run `pnpm test` in agency-plugin-spec-kit package
- [ ] T016 Verify tool appears in MCP server tool listing

## Dependencies & Execution Order

**Sequential dependencies**:
- T001-T005 must complete before T006-T008 (file must exist before importing)
- T006-T008 must complete before T009-T013 (integration needed for tests)
- T009-T013 must complete before T014-T016 (tests before verification)

**Parallel opportunities**:
- T009-T012 can run in parallel (independent test files/functions)
- T014-T016 could run in parallel but recommended sequential for clear feedback

**Critical path**: T001 → T006 → T009 → T014
