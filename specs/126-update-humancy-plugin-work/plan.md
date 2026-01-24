# Implementation Plan: Update humancy plugin to work with humancy-cloud API

**Feature**: Update `@generacy-ai/agency-plugin-humancy` to integrate with humancy-cloud REST API
**Branch**: `126-update-humancy-plugin-work`
**Status**: Complete

## Summary

Refactor the Humancy plugin from internal channel messaging to HTTP-based communication with the humancy-cloud REST API. The main changes involve:

1. Adding an HTTP client for REST API endpoints
2. Implementing SSE (Server-Sent Events) for real-time response delivery
3. Simplifying connection modes from `Direct/VIA_GENERACY/Offline` to `Direct/Cloud/Offline`
4. Adding API key authentication for production use

## Technical Context

| Item | Value |
|------|-------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20+ |
| Module System | ESM |
| Build | tsc |
| Test Framework | Vitest |
| Validation | Zod |
| HTTP Client | Native fetch (Node 20+) |
| SSE Client | eventsource-parser or native EventSource |

## Project Structure

```text
packages/agency-plugin-humancy/
├── src/
│   ├── index.ts                      # Package exports
│   ├── plugin.ts                     # Main plugin class
│   ├── manifest.ts                   # Plugin manifest
│   ├── connection/
│   │   ├── index.ts                  # Connection exports
│   │   ├── types.ts                  # ConnectionMode enum (MODIFY)
│   │   └── detector.ts               # Mode detection (MODIFY)
│   ├── http/                         # NEW: HTTP client layer
│   │   ├── index.ts                  # HTTP exports
│   │   ├── client.ts                 # HumancyHttpClient class
│   │   ├── sse.ts                    # SSE stream handler
│   │   └── types.ts                  # HTTP request/response types
│   ├── storage/
│   │   ├── index.ts                  # Storage exports
│   │   └── decision-store.ts         # Decision record storage
│   ├── tools/
│   │   ├── index.ts                  # Tool exports
│   │   ├── ask-question.ts           # (MODIFY for cloud mode)
│   │   ├── request-review.ts         # (MODIFY for cloud mode)
│   │   ├── request-decision.ts       # (MODIFY for cloud mode)
│   │   ├── notify.ts                 # (MODIFY for cloud mode)
│   │   ├── get-decision-outcome.ts   # (MODIFY for cloud mode)
│   │   └── report-decision-result.ts # (MODIFY for cloud mode)
│   ├── types/
│   │   ├── index.ts                  # Type exports
│   │   ├── requests.ts               # Request types
│   │   ├── responses.ts              # Response types
│   │   ├── decision-record.ts        # Three-layer types
│   │   └── three-layer.ts            # Three-layer model
│   └── __tests__/                    # Unit tests
│       ├── http/                     # NEW: HTTP client tests
│       │   ├── client.test.ts
│       │   └── sse.test.ts
│       └── ...                       # Existing tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Architecture

### HTTP Client Layer

A new `http/` module provides REST API communication:

```typescript
// http/client.ts
export class HumancyHttpClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: HttpClientConfig);

  async createDecision(request: CreateDecisionRequest): Promise<DecisionCreatedResponse>;
  async getDecision(id: string): Promise<DecisionResponse>;
  async subscribeToDecision(id: string): AsyncGenerator<SSEEvent>;
}
```

### SSE Stream Handler

```typescript
// http/sse.ts
export class SSEHandler {
  connect(url: string): void;
  onMessage(callback: (event: SSEEvent) => void): void;
  onError(callback: (error: Error) => void): void;
  close(): void;
}
```

### Connection Mode Changes

Rename `VIA_GENERACY` to `CLOUD` and update detection logic:

```typescript
// connection/types.ts
export enum ConnectionMode {
  DIRECT = 'direct',      // IPC to local VS Code extension
  CLOUD = 'cloud',        // HTTP to generacy.ai/api/humancy (renamed from VIA_GENERACY)
  OFFLINE = 'offline',    // Queued for later delivery
}
```

## Configuration

| Config Key | Env Var | Default | Description |
|------------|---------|---------|-------------|
| `humancy.apiUrl` | `HUMANCY_API_URL` | `https://generacy.ai/api/humancy` | API base URL |
| `humancy.apiKey` | `GENERACY_API_KEY` | (none) | API key for auth |
| `humancy.timeout` | - | `60000` | Default timeout (ms) |
| `humancy.mode` | - | (auto-detect) | Force connection mode |

## Implementation Phases

### Phase 1: HTTP Client Infrastructure
- Create `http/types.ts` with API request/response types
- Create `http/client.ts` with HumancyHttpClient class
- Create `http/sse.ts` with SSE stream handler
- Add unit tests for HTTP client

### Phase 2: Connection Mode Updates
- Rename `VIA_GENERACY` to `CLOUD` in connection/types.ts
- Update ConnectionModeDetector for cloud mode detection
- Add API URL and key configuration handling
- Update existing tests

### Phase 3: Tool Integration
- Update `request-decision.ts` to use HTTP client in cloud mode
- Update `ask-question.ts` to use HTTP client in cloud mode
- Update `request-review.ts` to use HTTP client in cloud mode
- Update `notify.ts` to use HTTP client in cloud mode
- Update `get-decision-outcome.ts` for cloud mode
- Update `report-decision-result.ts` for cloud mode
- Maintain backward compatibility with direct mode

### Phase 4: Testing & Documentation
- Integration tests with mock server
- SSE stream handling tests
- Error scenario coverage
- Update README with new configuration

## API Contract

Based on humancy-cloud documentation:

### POST /api/humancy/decisions
Create a new decision request.

Request:
```typescript
{
  question: string;
  options: Array<{id: string; label: string; description?: string}>;
  context?: string;
  urgency: 'blocking_now' | 'blocking_soon' | 'when_available';
  domain?: string[];
  timeout?: number;
}
```

Response:
```typescript
{
  id: string;
  status: 'pending' | 'resolved' | 'expired';
  createdAt: string;
  expiresAt: string;
}
```

### GET /api/humancy/decisions/:id
Get decision details.

Response:
```typescript
{
  id: string;
  status: 'pending' | 'resolved' | 'expired';
  question: string;
  options: Array<{id: string; label: string}>;
  selectedOption?: string;
  respondedAt?: string;
  baseline?: { optionId: string; confidence: number };
  protege?: { optionId: string; reasoning: string };
  human?: { optionId: string; note?: string };
}
```

### GET /api/humancy/decisions/:id/events
SSE stream for real-time updates.

Events:
```typescript
event: decision_resolved
data: { selectedOption: string; respondedAt: string }

event: decision_expired
data: { reason: string }

event: heartbeat
data: { timestamp: string }
```

## Error Handling

| Error Type | HTTP Status | Handling |
|------------|-------------|----------|
| Auth failure | 401 | Return clear error, suggest checking API key |
| Not found | 404 | Return "Decision not found" |
| Rate limited | 429 | Return error with retry-after header info |
| Server error | 5xx | Retry with exponential backoff |
| Network error | - | Fall back to offline mode if possible |
| Timeout | - | Return actionable message with elapsed time |

## Dependencies

No new runtime dependencies needed:
- `fetch` is available in Node.js 20+
- SSE parsing can use native `EventSource` or lightweight parser
- Keep `zod` for validation

## Rollback Plan

If issues arise:
1. The `DIRECT` mode is preserved for local development
2. Connection mode can be forced via config
3. Offline mode provides fallback for failed cloud connections
