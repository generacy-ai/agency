# Research: SSE Migration for agency-plugin-humancy

## Current State Analysis

### Existing SSE Infrastructure

The `SSEHandler` class in `src/http/sse.ts` is fully implemented with:
- Async generator pattern (`async *subscribeToDecision`)
- Frame parsing (event:, data:, multiline data)
- Automatic reconnection with exponential backoff (max 5 attempts)
- Connection timeout (30s default)
- Abort-based cancellation
- Zod-validated event parsing

**The SSE client is built but not wired into the decision flow.** The `request-decision.ts` tool uses `pollForDecision()` (HTTP GET every 2 seconds) instead.

### No WebSocket Code Exists

A thorough search confirms zero WebSocket usage in agency-plugin-humancy or any agency package source code. WebSocket references appear only in:
- Spec documentation describing the migration
- `node_modules` dependencies (hono, SDK — unrelated)

### Current Polling Implementation

```typescript
// request-decision.ts:320-341
async function pollForDecision(httpClient, decisionId, timeout) {
  const startTime = Date.now();
  const pollInterval = 2000; // Every 2 seconds
  while (Date.now() - startTime < timeout) {
    const response = await httpClient.getDecision(decisionId);
    if (response.status !== 'pending') return response;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  return httpClient.getDecision(decisionId);
}
```

**Problems with polling**:
1. Unnecessary load — 30 requests/minute per pending decision
2. Latency — up to 2s delay between resolution and detection
3. No streaming — can't receive intermediate events (created, updated)

## Technology Decisions

### SSE vs. Polling

| Factor | SSE | Polling |
|--------|-----|---------|
| Latency | Instant event delivery | Up to 2s delay |
| Server load | 1 persistent connection | N requests/minute |
| Reconnection | Built into protocol + SSEHandler | N/A (stateless) |
| Complexity | Already implemented | Already implemented |
| HTTP/2 compatible | Yes, multiplexed | Yes |
| Proxy-friendly | Yes (standard HTTP) | Yes |

**Decision**: Use SSE. Infrastructure is already built. Polling is strictly worse.

### Event Type Naming Convention

Two conventions in play:

1. **Current implementation**: `decision_resolved`, `decision_expired`, `heartbeat` (underscore)
2. **API contract (issue spec)**: `decision:created`, `decision:updated`, `decision:resolved` (colon)

**Decision**: Adopt colon-separated naming to match the cross-platform API contract. This is a coordinated migration across 5 repositories — consistency matters.

**Rationale**:
- Colon-separated is the SSE convention (e.g., `message:type`)
- The server repos will implement these event names
- Updating the client now prevents future breaking changes

### Timeout Architecture

Two timeout layers:

1. **SSEHandler `connectionTimeoutMs`** (30s default): Governs initial HTTP connection establishment
2. **Decision `timeout`** (user-specified, 60s default): Governs total wait for human response

**Decision**: Compose both timeouts:
- SSEHandler handles connection-level timeout internally
- Wrap the async generator iteration with an overall decision timeout via `AbortController` + `setTimeout`
- When decision timeout fires, call `sseHandler.close()` to cleanly abort

## Alternatives Considered

### 1. Keep Polling as Fallback

Could maintain polling as a fallback when SSE connection fails.

**Rejected**: Over-engineering. SSEHandler already has reconnection with exponential backoff (5 retries). If SSE truly can't connect, the server is likely down and polling won't help either.

### 2. Use EventSource API

Browser-native `EventSource` API handles SSE automatically.

**Rejected**: Not available in Node.js without polyfills. The custom `SSEHandler` using `fetch` + `ReadableStream` is the correct approach for Node.js environments and is already implemented.

### 3. Maintain Both Event Name Formats

Support both `decision_resolved` and `decision:resolved` during migration.

**Rejected**: Unnecessary complexity. This is a coordinated migration — all repos update together. The client should use the final format.

## Key Sources

- SSE Specification: https://html.spec.whatwg.org/multipage/server-sent-events.html
- Node.js fetch API with ReadableStream: Used by existing SSEHandler
- Cross-platform migration: Issues linked in spec (generacy#150, generacy-cloud#67, humancy-cloud#19, humancy#30)
