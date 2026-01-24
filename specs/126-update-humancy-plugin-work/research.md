# Research: Humancy Plugin API Integration

## Technology Decisions

### HTTP Client: Native Fetch

**Decision**: Use Node.js 20+ native `fetch` API

**Rationale**:
- No additional dependencies needed
- Native performance
- Familiar API for developers
- Supports all required features (headers, timeout via AbortController)

**Alternatives Considered**:
- `node-fetch` - No longer needed with native fetch
- `axios` - Adds dependency, more features than needed
- `undici` - Lower level, more complex

### SSE Client: eventsource-parser

**Decision**: Use `eventsource-parser` for SSE stream parsing

**Rationale**:
- Lightweight (~3KB)
- Works with any transport (fetch streams)
- No polyfill needed for Node.js
- Well-maintained

**Alternatives Considered**:
- Native `EventSource` - Not available in Node.js environment
- `eventsource` package - Heavier, designed for browser polyfill
- Manual parsing - More code to maintain, edge cases

**Implementation Note**: If dependencies are a concern, SSE protocol is simple enough to parse manually:
```typescript
// Minimal SSE parser
function parseSSE(chunk: string): { event?: string; data: string }[] {
  const events: { event?: string; data: string }[] = [];
  let currentEvent: string | undefined;
  let currentData: string[] = [];

  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      currentData.push(line.slice(5).trim());
    } else if (line === '') {
      if (currentData.length > 0) {
        events.push({ event: currentEvent, data: currentData.join('\n') });
      }
      currentEvent = undefined;
      currentData = [];
    }
  }
  return events;
}
```

### Authentication: Bearer Token

**Decision**: Use `Authorization: Bearer <API_KEY>` header

**Rationale**:
- Standard HTTP authentication pattern
- Matches platform documentation
- Easy to implement and debug

**Configuration Priority**:
1. `GENERACY_API_KEY` environment variable (recommended for CI/production)
2. `agency.config.humancy.apiKey` configuration value
3. No auth (local development / direct mode only)

### Connection Mode Architecture

**Decision**: Simplify from three modes to clearer naming

| Old Mode | New Mode | Transport | Auth Required |
|----------|----------|-----------|---------------|
| DIRECT | DIRECT | IPC | No |
| VIA_GENERACY | CLOUD | HTTP/SSE | Yes (production) |
| OFFLINE | OFFLINE | Local queue | No |

**Detection Logic**:
```typescript
async detect(): ConnectionMode {
  // 1. Explicit config always wins
  if (config.humancy.mode) return config.humancy.mode;

  // 2. Check for direct mode (VS Code extension)
  if (await this.canConnectDirect()) return DIRECT;

  // 3. Check for cloud mode (API endpoint reachable)
  if (this.hasApiConfig()) return CLOUD;

  // 4. Fallback to offline
  return OFFLINE;
}
```

## Implementation Patterns

### Retry Logic

Use exponential backoff for transient failures:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (!isRetryable(error)) throw error;
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastError;
}

function isRetryable(error: unknown): boolean {
  // Retry on network errors and 5xx server errors
  if (error instanceof TypeError) return true; // Network error
  if (error instanceof HttpError && error.status >= 500) return true;
  return false;
}
```

### SSE Reconnection

Handle SSE stream disconnections:

```typescript
class SSEStream {
  private abortController?: AbortController;
  private reconnectAttempts = 0;
  private maxReconnects = 5;

  async connect(url: string, onEvent: (e: SSEEvent) => void): Promise<void> {
    this.abortController = new AbortController();

    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal: this.abortController.signal,
      });

      for await (const event of parseSSEStream(response.body)) {
        this.reconnectAttempts = 0; // Reset on successful event
        onEvent(event);
      }
    } catch (error) {
      if (this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        await sleep(1000 * this.reconnectAttempts);
        return this.connect(url, onEvent);
      }
      throw error;
    }
  }

  close(): void {
    this.abortController?.abort();
  }
}
```

### Request Timeout

Use AbortController for request timeouts:

```typescript
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## API Response Mapping

### Decision Creation

```typescript
// Plugin request format → API format
function toApiRequest(params: RequestDecisionParams): CreateDecisionApiRequest {
  return {
    question: params.question,
    options: params.options.map(o => ({
      id: o.id,
      label: o.label,
      description: o.description,
    })),
    context: params.context,
    urgency: params.urgency,
    domain: params.domain,
    timeout: params.timeout,
  };
}

// API response → Plugin response format
function fromApiResponse(api: DecisionApiResponse): DecisionResponse {
  return {
    requestId: api.id,
    decisionId: api.id,
    selectedOption: api.selectedOption,
    respondedAt: new Date(api.respondedAt),
    baseline: api.baseline,
    protege: api.protege,
    human: api.human,
  };
}
```

## Security Considerations

### API Key Handling

1. Never log API keys
2. Use environment variables in production
3. Validate API key format before use
4. Clear from memory when possible

### Request Validation

- Validate all incoming parameters with Zod schemas
- Sanitize context strings (max length, no injection)
- Validate option IDs match expected format

## Testing Strategy

### Unit Tests
- HTTP client request/response formatting
- SSE event parsing
- Connection mode detection
- Error handling paths

### Integration Tests (with mock server)
- Full request/response cycle
- SSE stream lifecycle
- Authentication flows
- Timeout handling

### Mock Server

```typescript
// test/mocks/humancy-cloud.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/humancy/decisions', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: 'test-decision-123',
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
  }),

  http.get('/api/humancy/decisions/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      status: 'resolved',
      selectedOption: 'option-a',
      respondedAt: new Date().toISOString(),
    });
  }),
];
```

## References

- [Platform Documentation](./clarifications.md) - Clarification answers with API details
- [SSE Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [Node.js Fetch API](https://nodejs.org/docs/latest-v20.x/api/globals.html#fetch)
- [eventsource-parser](https://github.com/rexxars/eventsource-parser)
