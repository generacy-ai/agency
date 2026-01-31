# Tasks: D3: Implement update_ticket tool

**Input**: Design documents from `/specs/162-d3-implement-update-ticket/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Core Implementation

- [X] T001 [US1] Create `src/tools/update-ticket.ts` with tool factory function signature
  - File: `packages/agency-plugin-spec-kit/src/tools/update-ticket.ts`
  - Follow `createXxxTool(config, getProvider)` pattern from get-ticket.ts
  - Define tool name, description, namespace, outputPattern, modes
  - Define inputSchema with ref (required), title, body, state, add_labels, remove_labels

- [X] T002 [US1] Implement input validation in execute function
  - Validate ref is non-empty string
  - Validate title is non-empty after trim (if provided)
  - Validate state is 'open' or 'closed' (if provided)
  - Return isError: true with helpful messages for invalid input

- [X] T003 [US1] Implement provider resolution using detectTicketRef
  - Use `detectTicketRef()` to parse ref and determine provider
  - Handle auto-detection like get-ticket.ts pattern
  - Fall back to default provider for bare numbers

- [X] T004 [US1] Implement label calculation logic
  - Create helper function to calculate new labels from add/remove params
  - Fetch current labels via `provider.getLabels()` if label operations specified
  - Calculate: `(currentLabels - remove_labels) + add_labels`
  - Return undefined if no label changes requested

- [X] T005 [US1] Implement core update logic calling provider.updateTicket()
  - Build TicketUpdates object with title, body, labels (if changed)
  - Call `provider.updateTicket(ref, updates)`
  - Track which fields were changed for response

- [X] T006 [US1] Implement state change handling
  - Handle state separately from provider.updateTicket (not in TicketUpdates)
  - For GitHub: use gh issue close/reopen commands
  - Add 'state' to changes array if state was updated

- [X] T007 [US1] Implement error handling for NotFoundError
  - Catch NotFoundError from provider
  - Return user-friendly error response with isError: true
  - Let auth and other errors propagate

- [X] T008 [US1] Implement terse output response format
  - Return `{ updated: true, id, url, changes: [...] }`
  - Follow create-ticket's outputPattern: 'terse' format
  - List changed fields in changes array

## Phase 2: Integration

- [X] T009 [US1] Export createUpdateTicketTool from `src/tools/index.ts`
  - Add import statement
  - Add to exports
  - Add to createTools() array

## Phase 3: Testing

- [X] T010 [P] [US1] Create test file `tests/update-ticket-tool.test.ts`
  - File: `packages/agency-plugin-spec-kit/tests/update-ticket-tool.test.ts`
  - Set up mock provider for testing
  - Test input validation (invalid ref, empty title, invalid state)

- [X] T011 [P] [US1] Add tests for label calculation logic
  - Test add-only labels
  - Test remove-only labels
  - Test combined add and remove
  - Test no label changes

- [X] T012 [P] [US1] Add tests for successful updates
  - Test title update only
  - Test body update only
  - Test partial updates (multiple fields)
  - Verify changes array in response

- [X] T013 [P] [US1] Add tests for state changes
  - Test closing an open ticket
  - Test reopening a closed ticket
  - Test state change combined with other updates

- [X] T014 [P] [US1] Add tests for error handling
  - Test NotFoundError returns user-friendly error
  - Test auth errors propagate
  - Verify error response format

## Dependencies & Execution Order

**Sequential Dependencies**:
- T001 must complete first (creates the file)
- T002-T008 can proceed after T001 (all build on the tool file)
- T009 depends on T001-T008 (export the completed tool)
- T010-T014 depend on T009 (need tool exported for testing)

**Parallel Opportunities**:
- T010-T014 can run in parallel (marked with [P]) - different test scenarios
- T002-T008 are conceptually sequential within the same file

**Recommended Execution**:
1. Phase 1: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008
2. Phase 2: T009
3. Phase 3: T010, T011, T012, T013, T014 (parallel)
