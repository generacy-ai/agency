# Tasks: I3 - End-to-end test: Jira provider flow

**Input**: Design documents from `/specs/172-i3-end-end-test/`
**Prerequisites**: plan.md (required), spec.md (required), research.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story/acceptance criteria this task addresses

## Phase 1: Setup & Test Infrastructure

- [X] T001 Create integration test directory structure at `packages/agency-plugin-spec-kit/tests/integration/`
- [X] T002 [P] Create test utilities file `packages/agency-plugin-spec-kit/tests/integration/test-utils.ts` with mock response factories and skip conditions
- [X] T003 [P] Create base test file `packages/agency-plugin-spec-kit/tests/integration/jira-flow.test.ts` with imports and describe blocks

## Phase 2: Core Ticket Operations

- [X] T010 [AC1] Implement `get_ticket fetches Jira issue by key` test - validates PROJ-N reference parsing
- [X] T011 [P] [AC1] Implement `get_ticket parses Jira URLs` test - validates full URL parsing with provider detection
- [X] T012 [P] [AC5] Implement `get_ticket extracts Jira metadata correctly` test - validates issueType, priority, assignee, jiraStatus
- [X] T013 [P] [AC5] Implement `get_ticket maps Jira status to normalized state` test - validates status normalization (Done→closed, In Progress→in_progress, Open→open)

## Phase 3: Ticket Creation

- [X] T020 [AC3] Implement `create_ticket creates Jira issue` test - validates POST to /rest/api/3/issue
- [X] T021 [P] [AC5] Implement `create_ticket uses Story issue type by default` test - validates default issue type handling
- [X] T022 [P] [AC5] Implement `create_ticket converts body to ADF format` test - validates markdown to ADF conversion

## Phase 4: Feature Creation from Ticket

- [X] T030 [AC2] Implement `create_feature initializes from Jira ticket` test - validates spec directory creation from Jira issue

## Phase 5: Error Handling

- [X] T040 [AC5] Implement `handles invalid Jira key format` test - validates key format validation
- [X] T041 [P] [AC5] Implement `handles authentication failure (401)` test - validates auth error handling
- [X] T042 [P] [AC5] Implement `handles not found (404)` test - validates missing issue handling
- [X] T043 [P] [AC5] Implement `handles permission denied (403)` test - validates permission error handling
- [X] T044 [P] [AC5] Implement `handles rate limiting (429)` test - validates rate limit handling

## Phase 6: tasks_to_issues Integration

- [X] T050 [AC4] Implement `tasks_to_issues creates Jira issues` test - validates task conversion to Jira issues
- [X] T051 [P] [AC4] Implement `tasks_to_issues links to parent epic` test - validates epic linking behavior

## Phase 7: Documentation & Polish

- [X] T060 [AC6] Document Jira-specific behaviors in test file comments
- [X] T061 [P] Add real Jira API test mode with skip conditions when `TEST_REAL_JIRA=true`
- [X] T062 [P] Verify all tests pass with `pnpm test`

## Dependencies & Execution Order

### Sequential Dependencies
1. **T001 → T002, T003**: Directory must exist before creating files
2. **T002, T003 → T010-T062**: Test utilities and base structure needed for all tests
3. **Phase 2-6 can run in parallel** after Phase 1 completes
4. **T060-T062** (Phase 7) should run after all test implementations

### Parallel Opportunities
- **T002 + T003**: Test utils and base test file have no dependencies on each other
- **T011 + T012 + T013**: Different test cases with no shared state
- **T021 + T022**: Different aspects of create_ticket
- **T041-T044**: Error scenarios are independent
- **T051**: Can run in parallel with T050 if implemented independently

### Test File Structure
All tests go in: `packages/agency-plugin-spec-kit/tests/integration/jira-flow.test.ts`

```
jira-flow.test.ts
├── describe('Jira E2E Integration Tests')
│   ├── describe('get_ticket')
│   │   ├── test('fetches by key')           # T010
│   │   ├── test('parses URL')               # T011
│   │   ├── test('extracts metadata')        # T012
│   │   └── test('normalizes status')        # T013
│   ├── describe('create_ticket')
│   │   ├── test('creates issue')            # T020
│   │   ├── test('uses Story type')          # T021
│   │   └── test('converts to ADF')          # T022
│   ├── describe('create_feature')
│   │   └── test('initializes from ticket')  # T030
│   ├── describe('error handling')
│   │   ├── test('invalid key')              # T040
│   │   ├── test('auth failure')             # T041
│   │   ├── test('not found')                # T042
│   │   ├── test('permission denied')        # T043
│   │   └── test('rate limiting')            # T044
│   └── describe('tasks_to_issues')
│       ├── test('creates issues')           # T050
│       └── test('links to epic')            # T051
```
