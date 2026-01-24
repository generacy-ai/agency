# Tasks: Update humancy plugin to work with humancy-cloud API

**Input**: Design documents from `/specs/126-update-humancy-plugin-work/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: HTTP Client Infrastructure

### Setup

- [ ] T001 [US1] Create `packages/agency-plugin-humancy/src/http/types.ts` with API request/response types from data-model.md (HttpClientConfig, CreateDecisionApiRequest, DecisionCreatedResponse, DecisionApiResponse)
- [ ] T002 [P] [US1] Create `packages/agency-plugin-humancy/src/http/index.ts` with module exports

### HTTP Client

- [ ] T003 [US1] Create `packages/agency-plugin-humancy/src/http/client.ts` with HumancyHttpClient class implementing:
  - Constructor with HttpClientConfig parameter
  - `createDecision(request)` - POST /api/humancy/decisions
  - `getDecision(id)` - GET /api/humancy/decisions/:id
  - Private `fetchWithTimeout()` helper using AbortController
  - Private `withRetry()` helper for exponential backoff
  - Authorization header injection when apiKey is configured

### SSE Handler

- [ ] T004 [US2] Create `packages/agency-plugin-humancy/src/http/sse.ts` with SSE event types (BaseSSEEvent, DecisionResolvedEvent, DecisionExpiredEvent, HeartbeatEvent, SSEEvent union) and SSEHandler class implementing:
  - `subscribeToDecision(id)` - AsyncGenerator<SSEEvent> connecting to GET /api/humancy/decisions/:id/events
  - Manual SSE parsing (event/data fields)
  - Reconnection logic with exponential backoff
  - AbortController for cleanup

### HTTP Client Tests

- [ ] T005 [P] [US1] Create `packages/agency-plugin-humancy/src/__tests__/http/client.test.ts` with unit tests:
  - createDecision success and error cases
  - getDecision success and error cases
  - Timeout handling
  - Retry logic for 5xx errors
  - Authentication header injection
- [ ] T006 [P] [US2] Create `packages/agency-plugin-humancy/src/__tests__/http/sse.test.ts` with unit tests:
  - SSE event parsing
  - Stream lifecycle
  - Reconnection behavior
  - Timeout and cleanup

---

## Phase 2: Connection Mode Updates

### Type Updates

- [ ] T007 Modify `packages/agency-plugin-humancy/src/connection/types.ts`:
  - Rename `VIA_GENERACY` to `CLOUD` in ConnectionMode enum
  - Add httpClientInfo to ConnectionState interface
  - Update JSDoc comments

### Detector Updates

- [ ] T008 Modify `packages/agency-plugin-humancy/src/connection/detector.ts`:
  - Update detection logic to return CLOUD when API config present
  - Add `hasApiConfig()` private method checking HUMANCY_API_URL or config
  - Update mode priority: explicit config > direct > cloud > offline

### Configuration

- [ ] T009 [P] Add configuration handling for HTTP client:
  - Support `HUMANCY_API_URL` env var (default: `https://generacy.ai/api/humancy`)
  - Support `GENERACY_API_KEY` env var for authentication
  - Support `humancy.timeout` config (default: 60000ms)

### Connection Mode Tests

- [ ] T010 Update existing connection tests in `packages/agency-plugin-humancy/src/__tests__/connection/` for CLOUD mode:
  - Test VIA_GENERACY → CLOUD rename
  - Test hasApiConfig detection
  - Test configuration priority order

---

## Phase 3: Tool Integration

### Request Decision Tool

- [ ] T011 [US1] Modify `packages/agency-plugin-humancy/src/tools/request-decision.ts`:
  - Import HumancyHttpClient
  - Add cloud mode branch in execute() checking connection mode
  - Call httpClient.createDecision() for cloud mode
  - Map tool params to API request format
  - Map API response to tool response format
  - Maintain existing direct mode behavior

### Ask Question Tool

- [ ] T012 [P] [US1] Modify `packages/agency-plugin-humancy/src/tools/ask-question.ts`:
  - Add cloud mode support using HumancyHttpClient
  - Convert freeform question to decision API format
  - Handle response mapping

### Request Review Tool

- [ ] T013 [P] [US1] Modify `packages/agency-plugin-humancy/src/tools/request-review.ts`:
  - Add cloud mode support using HumancyHttpClient
  - Convert review request to decision API format
  - Handle response mapping

### Notify Tool

- [ ] T014 [P] [US1] Modify `packages/agency-plugin-humancy/src/tools/notify.ts`:
  - Add cloud mode support for notifications
  - Notifications may use a simplified API endpoint or decision with single option

### Get Decision Outcome Tool

- [ ] T015 [US2] Modify `packages/agency-plugin-humancy/src/tools/get-decision-outcome.ts`:
  - Add cloud mode support using SSE subscription
  - Use httpClient.subscribeToDecision() for real-time updates
  - Handle decision_resolved and decision_expired events
  - Map SSE events to tool response format
  - Maintain polling fallback via getDecision()

### Report Decision Result Tool

- [ ] T016 [P] Modify `packages/agency-plugin-humancy/src/tools/report-decision-result.ts`:
  - Add cloud mode support
  - POST result to API if applicable

### Plugin Class Updates

- [ ] T017 Modify `packages/agency-plugin-humancy/src/plugin.ts`:
  - Instantiate HumancyHttpClient when mode is CLOUD
  - Pass client reference to tools via context
  - Handle client lifecycle (init/cleanup)

---

## Phase 4: Testing & Documentation

### Integration Tests

- [ ] T018 [US1] [US2] Create integration tests with mock server in `packages/agency-plugin-humancy/src/__tests__/integration/`:
  - Full decision creation → SSE response cycle
  - Error scenarios (401, 404, 5xx, network)
  - Timeout handling
  - Mode fallback behavior

### Error Scenario Tests

- [ ] T019 [P] Add error scenario coverage:
  - Auth failure (401) - clear error message
  - Not found (404) - decision not found
  - Rate limited (429) - retry-after handling
  - Server error (5xx) - retry with backoff
  - Network error - offline mode fallback
  - Timeout - actionable message with elapsed time

### Offline Mode Tests

- [ ] T020 [P] [US3] Add tests for offline queue sync:
  - Queue decisions when offline
  - Sync when coming online
  - Notification of sync status

### README Updates

- [ ] T021 [P] Update `packages/agency-plugin-humancy/README.md`:
  - Document new configuration options (HUMANCY_API_URL, GENERACY_API_KEY)
  - Document connection modes (Direct, Cloud, Offline)
  - Add usage examples for cloud mode
  - Document error handling

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1** (HTTP Client) must complete before Phase 3 (Tool Integration)
- **Phase 2** (Connection Mode) can run in parallel with Phase 1
- **Phase 3** depends on Phase 1 and Phase 2
- **Phase 4** (Testing) can partially overlap with Phase 3

### Task Dependencies Within Phases
- T001 → T003 (types before client)
- T001 → T004 (types before SSE handler)
- T003, T004 → T005, T006 (implementation before tests)
- T007 → T008 (types before detector)
- T011 → T012-T016 (request-decision pattern can be reused)
- T011-T016 → T017 (tools before plugin class)

### Parallel Opportunities
- T002 can run with T001
- T005, T006 can run in parallel
- T009 can run with T007, T008
- T012, T013, T014, T016 can all run in parallel (independent tools)
- T019, T020, T021 can all run in parallel
