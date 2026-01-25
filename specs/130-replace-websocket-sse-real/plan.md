# Implementation Plan: Replace WebSocket with SSE for Real-Time Updates

**Feature**: Replace polling-based decision response handling with the existing SSE client in agency-plugin-humancy
**Branch**: `130-replace-websocket-sse-real`
**Status**: Complete

## Summary

The agency-plugin-humancy already has a fully implemented SSE client (`SSEHandler`) that is not currently wired into the decision request flow. The `request-decision` tool uses HTTP polling (`pollForDecision`) to wait for decision resolution. This plan replaces polling with SSE streaming, aligns event type naming with the cross-platform API contract, and removes WebSocket references from documentation.

**Key Finding**: No WebSocket code exists in this repository. The SSE client infrastructure is already built. The work is primarily about:
1. Wiring SSEHandler into `executeCloudMode` (replacing `pollForDecision`)
2. Aligning SSE event types with the platform API contract
3. Removing stale WebSocket references from docs (if applicable)

## Technical Context

- **Language**: TypeScript 5.7.3, Node.js 20+
- **Build**: pnpm workspaces + turborepo
- **Test Framework**: vitest 3.0.4
- **Validation**: zod 3.24.1
- **Package**: `@generacy-ai/agency-plugin-humancy`

### Dependencies

- `@generacy-ai/agency` (peer) — core plugin API
- `@modelcontextprotocol/sdk` — MCP protocol (in core)
- Node.js native `fetch` — used by SSEHandler and HumancyHttpClient

## Project Structure

```text
packages/agency-plugin-humancy/
├── src/
│   ├── plugin.ts                         # HumancyPlugin lifecycle
│   ├── http/
│   │   ├── sse.ts                        # SSEHandler (EXISTING - needs wiring)
│   │   ├── client.ts                     # HumancyHttpClient (EXISTING)
│   │   ├── types.ts                      # Types + Zod schemas (MODIFY event types)
│   │   └── index.ts                      # Exports
│   ├── tools/
│   │   ├── request-decision.ts           # MODIFY: replace polling with SSE
│   │   └── ...
│   ├── connection/
│   │   └── ...                           # ConnectionModeDetector (unchanged)
│   └── __tests__/
│       ├── http/
│       │   ├── sse.test.ts               # MODIFY: update event type expectations
│       │   └── client.test.ts            # Unchanged
│       └── tools/
│           └── request-decision.test.ts  # MODIFY: test SSE integration
```

## Implementation Approach

### Phase 1: Align SSE Event Types with API Contract

The current implementation uses underscore-separated event types (`decision_resolved`, `decision_expired`). The cross-platform API contract specifies colon-separated names (`decision:created`, `decision:updated`, `decision:resolved`). These must be aligned.

**Files Modified**:
- `src/http/types.ts` — Update `SSEEvent` union, Zod schema discriminants, and type interfaces
- `src/http/sse.ts` — Update terminal event checks in `streamEvents`
- `src/__tests__/http/sse.test.ts` — Update test expectations

**Event Type Mapping**:
| Old | New | Notes |
|-----|-----|-------|
| `decision_resolved` | `decision:resolved` | Terminal event |
| `decision_expired` | `decision:expired` | Terminal event (keep expired, spec implies it) |
| `heartbeat` | `heartbeat` | Unchanged |
| (none) | `decision:created` | New — emitted by server on creation |
| (none) | `decision:updated` | New — emitted by server on status change |

### Phase 2: Wire SSEHandler into Cloud Mode Decision Flow

Replace the `pollForDecision` function in `request-decision.ts` with SSE-based streaming via `SSEHandler`.

**Files Modified**:
- `src/tools/request-decision.ts` — Replace `pollForDecision` with `waitForDecisionSSE`
- `src/__tests__/tools/request-decision.test.ts` — Update cloud mode tests

**Approach**:
1. After `httpClient.createDecision()`, construct SSE URL via `httpClient.getEventsUrl(decisionId)`
2. Create `SSEHandler` with auth headers from `httpClient.getAuthHeaders()`
3. Subscribe via `sseHandler.subscribeToDecision(url)` async generator
4. Iterate events, return on `decision:resolved` or `decision:expired`
5. Handle timeout via `AbortController` + `setTimeout`
6. Remove `pollForDecision` function entirely

**Timeout Handling**:
- Set overall timeout via `setTimeout` → calls `sseHandler.close()`
- SSEHandler has its own `connectionTimeoutMs` for initial connection
- Decision timeout (user-specified) governs total wait time

### Phase 3: Update Plugin Initialization

Pass SSEHandler configuration through the plugin initialization path.

**Files Modified**:
- `src/plugin.ts` — Ensure SSEHandler can access auth headers at construction time
- No new dependencies — SSEHandler is already exported from `http/`

### Phase 4: Documentation Cleanup

The spec references 4 doc files under `docs/updated/` that do not exist in this repository. Per clarification Q2 (pending), these likely belong in other repos. The plan handles both cases:

**If docs exist (or should be created)**:
- Update WebSocket references to SSE endpoints
- Replace `wss://api.generacy.ai/ws/decisions` with `GET /api/humancy/decisions/{id}/events`

**If docs are out of scope**:
- No doc changes needed in this repo
- Mark doc-related acceptance criteria as N/A for this issue

### Phase 5: Test Updates

Update all tests to reflect the new SSE-based flow.

**Files Modified**:
- `src/__tests__/http/sse.test.ts` — Update event type literals
- `src/__tests__/tools/request-decision.test.ts` — Replace polling mocks with SSE mocks

## Key Technical Decisions

1. **Replace polling entirely** — No fallback to polling. SSE is the supported transport for cloud mode. The existing SSEHandler already handles reconnection with exponential backoff.

2. **Keep SSEHandler as async generator** — The current API (`async *subscribeToDecision`) is well-designed for this use case. No architectural changes needed.

3. **Event type naming follows API contract** — Use colon-separated names (`decision:resolved`) to match the cross-platform convention defined in the issue.

4. **Timeout semantics preserved** — The user-facing `timeout` parameter behavior doesn't change. Internally, polling is replaced with SSE + AbortController timeout.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Server doesn't support SSE yet | Medium | SSEHandler already handles connection errors gracefully. Server repos (generacy-cloud, humancy-cloud) are tracked in parallel issues. |
| Event type naming disagreement | Low | Clarification Q4 is pending. Plan implements spec-defined names; easy to adjust if answer differs. |
| Reconnection edge cases | Low | SSEHandler already implements exponential backoff with max retries. Well-tested. |

## Out of Scope

- Server-side SSE implementation (handled in generacy-cloud #67, humancy-cloud #19)
- VS Code extension SSE client (handled in humancy #30)
- Bidirectional communication (SSE is unidirectional by design — fits the use case)
- `GET /api/humancy/decisions/events` (all-decisions stream) — only per-decision stream needed for this tool
