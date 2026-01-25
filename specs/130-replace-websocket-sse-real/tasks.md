# Tasks: Replace WebSocket with SSE for Real-Time Updates

**Input**: Design documents from `/specs/130-replace-websocket-sse-real/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Align SSE Event Types with API Contract

- [X] T001 Update SSE event type literals and Zod schemas in `packages/agency-plugin-humancy/src/http/types.ts` — rename `decision_resolved` to `decision:resolved`, `decision_expired` to `decision:expired`, and add `decision:created` and `decision:updated` event types with their interfaces and Zod discriminated union members
- [X] T002 [P] Update terminal event checks in `packages/agency-plugin-humancy/src/http/sse.ts` — change `streamEvents` to check for `decision:resolved` and `decision:expired` (colon-separated) as terminal events
- [X] T003 [P] Update SSE test expectations in `packages/agency-plugin-humancy/src/__tests__/http/sse.test.ts` — change all event type string literals from underscore-separated to colon-separated format and add test cases for new `decision:created` and `decision:updated` event types

## Phase 2: Wire SSEHandler into Cloud Mode Decision Flow

- [X] T004 [P] Add `getEventsUrl(decisionId: string)` method to `HumancyHttpClient` in `packages/agency-plugin-humancy/src/http/client.ts` — constructs SSE endpoint URL `/api/humancy/decisions/{id}/events`
- [X] T005 [P] Add `getAuthHeaders()` method to `HumancyHttpClient` in `packages/agency-plugin-humancy/src/http/client.ts` if not already present — returns authorization headers needed for SSE connection
- [X] T006 Replace `pollForDecision` with `waitForDecisionSSE` in `packages/agency-plugin-humancy/src/tools/request-decision.ts` — after `createDecision()`, construct SSE URL via `httpClient.getEventsUrl(decisionId)`, create `SSEHandler` with auth headers, subscribe via async generator, iterate events until `decision:resolved` or `decision:expired`, handle timeout via `AbortController` + `setTimeout`, remove `pollForDecision` function entirely
- [X] T007 Update cloud mode tests in `packages/agency-plugin-humancy/src/__tests__/tools/request-decision.test.ts` — replace polling mocks with SSE mocks, test resolved/expired/timeout scenarios using the new `waitForDecisionSSE` flow

## Phase 3: Plugin Initialization

- [X] T008 Update `packages/agency-plugin-humancy/src/plugin.ts` to ensure SSEHandler can access auth headers at construction time — verify initialization path passes necessary config through to tools that create SSEHandler instances

## Phase 4: Documentation Cleanup

- [X] T009 Check `docs/updated/` directory for WebSocket references and update to SSE if files exist — replace `wss://api.generacy.ai/ws/decisions` with `GET /api/humancy/decisions/{id}/events`, update communication flow diagrams, remove `websocket/` directory references. If files don't exist in this repo, mark doc-related acceptance criteria as N/A

## Phase 5: Verify and Build

- [X] T010 Run `pnpm typecheck` and fix any type errors introduced by event type changes
- [X] T011 Run `pnpm test` and fix any failing tests
- [X] T012 Run `pnpm build` and verify clean build

## Dependencies & Execution Order

**Phase boundaries (sequential)**:
- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

**Within Phase 1**:
- T001 must complete first (types are the foundation)
- T002 and T003 can run in parallel after T001 (marked [P], different files)

**Within Phase 2**:
- T004 and T005 can run in parallel (marked [P], same file but independent methods)
- T006 depends on T004 and T005 (needs `getEventsUrl` and `getAuthHeaders`)
- T007 depends on T006 (tests the new implementation)

**Within Phase 5**:
- T010 → T011 → T012 must run sequentially (each may produce fixes needed by the next)

**Parallel opportunities**:
- Phase 1: T002 ∥ T003 (after T001)
- Phase 2: T004 ∥ T005 (before T006)
