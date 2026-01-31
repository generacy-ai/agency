# Tasks: A4: LocalProvider Implementation

**Input**: Design documents from `/specs/148-a4-localprovider-implementation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Core Implementation

- [X] T001 Define LocalTicketStore and LocalTicket interfaces in `src/providers/local.ts`
- [X] T002 Implement loadStore() method with file read and empty store initialization
- [X] T003 Implement saveStore() method with atomic write (temp file + rename)
- [X] T004 Implement parseRef() with full format support (LOCAL-001, local-1, 001, 1)
- [X] T005 Implement generateId() helper for LOCAL-NNN format with zero-padding
- [X] T006 Implement toTicket() helper for LocalTicket → Ticket conversion
- [X] T007 Implement getTicket() method
- [X] T008 Implement createTicket() method
- [X] T009 Implement updateTicket() method
- [X] T010 Implement checkAuth() to always return { ok: true }
- [X] T011 Implement getTicketUrl() to return local://LOCAL-NNN format
- [X] T012 Implement setLabels() optional method
- [X] T013 Implement getLabels() optional method

## Phase 2: Testing

- [X] T014 [P] Create test file `tests/providers/local.test.ts` with test setup (temp directory)
- [X] T015 [P] Add tests for parseRef() with valid and invalid inputs
- [X] T016 Add tests for loadStore() with missing file and existing file
- [X] T017 Add tests for saveStore() and atomic write behavior
- [X] T018 Add tests for createTicket() and ID generation
- [X] T019 Add tests for getTicket() including NotFoundError
- [X] T020 Add tests for updateTicket() with partial updates
- [X] T021 Add tests for setLabels() and getLabels()
- [X] T022 Add tests for checkAuth() and getTicketUrl()

## Phase 3: Integration

- [X] T023 Verify provider registration in registry.ts (already exists, confirm working)
- [X] T024 Run full test suite and fix any failures
- [X] T025 Verify TypeScript compilation with no errors

## Dependencies & Execution Order

**Phase 1 (Core Implementation)**:
- T001 → T002, T003 (interfaces needed for store methods)
- T002, T003 → T007, T008, T009 (store methods needed for CRUD)
- T004 → T007 (parseRef needed for getTicket)
- T005 → T008 (generateId needed for createTicket)
- T006 → T007, T008, T009 (toTicket needed for all CRUD returns)

**Phase 2 (Testing)**:
- T014, T015 can run in parallel (setup and parseRef tests are independent)
- T016-T022 depend on Phase 1 completion and test setup (T014)

**Phase 3 (Integration)**:
- All Phase 2 tests must pass before integration verification

**Parallel opportunities**:
- T014 and T015 marked with [P] - can be developed simultaneously
- Within Phase 1, some tasks can be partially parallelized but have logical dependencies
