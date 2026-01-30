# Tasks: BacklogProvider Interface

**Input**: Design documents from `/specs/142-f3-define-backlogprovider-interface/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, research.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which acceptance criteria this task addresses

## Phase 1: Error Types

- [x] T001 [AC4] Create `packages/agency-plugin-spec-kit/src/providers/errors.ts` with ProviderError base class
- [x] T002 [P] [AC4] Add AuthError class extending ProviderError in `packages/agency-plugin-spec-kit/src/providers/errors.ts`
- [x] T003 [P] [AC4] Add NotFoundError class with optional ref property in `packages/agency-plugin-spec-kit/src/providers/errors.ts`

## Phase 2: Interface Types

- [x] T004 [AC1] Create `packages/agency-plugin-spec-kit/src/providers/types.ts` with BacklogProvider interface
- [x] T005 [P] [AC2] Add TicketCreateParams interface in `packages/agency-plugin-spec-kit/src/providers/types.ts`
- [x] T006 [P] [AC2] Add TicketUpdates type alias in `packages/agency-plugin-spec-kit/src/providers/types.ts`
- [x] T007 [P] [AC2] Add Ticket interface in `packages/agency-plugin-spec-kit/src/providers/types.ts`
- [x] T008 [AC5] Add JSDoc comments documenting optional vs required methods in `packages/agency-plugin-spec-kit/src/providers/types.ts`

## Phase 3: Module Exports

- [x] T009 Create `packages/agency-plugin-spec-kit/src/providers/index.ts` with re-exports for types and errors
- [x] T010 Update `packages/agency-plugin-spec-kit/src/index.ts` to export providers module

## Dependencies & Execution Order

**Phase 1 (Error Types)**:
- T001 must complete first (ProviderError is the base class)
- T002 and T003 can run in parallel after T001 (both extend ProviderError)

**Phase 2 (Interface Types)**:
- T004 must complete first (BacklogProvider depends on supporting types)
- T005, T006, T007 can run in parallel (independent type definitions)
- T008 depends on T004 completion (documenting the interface)

**Phase 3 (Module Exports)**:
- T009 depends on Phase 1 and Phase 2 completion (exports all types)
- T010 depends on T009 (re-exports from package entry point)

**Parallel Opportunities**:
- T002, T003 can run in parallel (after T001)
- T005, T006, T007 can run in parallel (after T004)

**Import Dependency**:
- TicketRef is imported from F2 core types (`../types`) - ensure F2 types exist before Phase 2
