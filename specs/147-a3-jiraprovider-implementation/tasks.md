# Tasks: JiraProvider Implementation

**Input**: Design documents from `/specs/147-a3-jiraprovider-implementation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = Developer Uses Jira for Backlog Management)

---

## Phase 1: Configuration Setup

- [ ] T001 [US1] Extend JiraConfigSchema in `packages/agency-plugin-spec-kit/src/config.ts` to add optional `email` and `apiToken` fields

---

## Phase 2: Core Implementation

- [ ] T002 [US1] Implement JiraProvider constructor with config extraction and env var fallback in `packages/agency-plugin-spec-kit/src/providers/jira.ts`
- [ ] T003 [P] [US1] Implement `mapJiraStatusToTicketState()` helper function with keyword-based regex matching
- [ ] T004 [P] [US1] Implement `adfToPlainText()` helper function to extract text from Atlassian Document Format
- [ ] T005 [US1] Implement private `request()` method for authenticated Jira API calls with error handling
- [ ] T006 [US1] Implement `checkAuth()` method using `GET /rest/api/3/myself`
- [ ] T007 [US1] Implement `parseRef()` method with project key validation using `detectTicketRef()`
- [ ] T008 [US1] Implement `getTicketUrl()` method to generate Jira browse URLs
- [ ] T009 [US1] Implement `getTicket()` method using `GET /rest/api/3/issue/{issueKey}`
- [ ] T010 [US1] Implement `mapJiraIssueToTicket()` helper to convert Jira response to normalized Ticket
- [ ] T011 [US1] Implement `createTicket()` method using `POST /rest/api/3/issue` with Story default type
- [ ] T012 [US1] Implement `updateTicket()` method using `PUT /rest/api/3/issue/{issueKey}`
- [ ] T013 [US1] Implement `setLabels()` method using `PUT /rest/api/3/issue/{issueKey}` with labels field
- [ ] T014 [US1] Implement `getLabels()` method by delegating to `getTicket()`

---

## Phase 3: Error Handling

- [ ] T015 [US1] Implement `handleApiError()` method to convert HTTP errors to ProviderError/AuthError/NotFoundError

---

## Phase 4: Testing

- [ ] T016 [P] [US1] Create unit tests for `mapJiraStatusToTicketState()` covering all status keywords
- [ ] T017 [P] [US1] Create unit tests for `adfToPlainText()` with various ADF structures
- [ ] T018 [P] [US1] Create unit tests for `parseRef()` with valid/invalid keys and URLs
- [ ] T019 [US1] Create unit tests for `checkAuth()` with mocked fetch responses
- [ ] T020 [US1] Create unit tests for `getTicket()` with mocked Jira API response
- [ ] T021 [US1] Create unit tests for `createTicket()` with mocked Jira API response
- [ ] T022 [US1] Create unit tests for `updateTicket()` with mocked Jira API response
- [ ] T023 [US1] Create unit tests for `setLabels()` with mocked Jira API response
- [ ] T024 [US1] Create unit tests for error handling (401, 403, 404 responses)

---

## Phase 5: Integration & Verification

- [ ] T025 [US1] Verify provider registration works via `registerProviderFactory('jira', ...)`
- [ ] T026 [US1] Verify TypeScript compilation passes with no errors
- [ ] T027 [US1] Run full test suite to ensure no regressions

---

## Dependencies & Execution Order

### Sequential Dependencies
1. **T001** (config) must complete before T002 (constructor)
2. **T002** (constructor) must complete before T005 (request method)
3. **T005** (request method) must complete before T006-T014 (API methods)
4. **T003, T004** (helpers) can run in parallel, before T009-T010
5. **T015** (error handling) should complete before T019-T024 (tests that verify errors)
6. **Phase 4** (testing) should complete before **Phase 5** (verification)

### Parallel Opportunities
- **T003 + T004**: Helper functions have no interdependencies
- **T016 + T017 + T018**: Unit tests for pure functions can run in parallel
- **T006, T007, T008**: These methods don't depend on each other (only on T005)

### Critical Path
T001 → T002 → T005 → T009 → T010 → T011 → T026 → T027
