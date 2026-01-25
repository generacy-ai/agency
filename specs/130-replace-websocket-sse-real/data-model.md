# Data Model: SSE Event Types

## Core Entities

### SSE Event Types (Updated)

The SSE event types are updated to use colon-separated naming per the cross-platform API contract.

```typescript
// Terminal events
interface DecisionResolvedEvent {
  type: 'decision:resolved';
  selectedOption: string;
  respondedAt: string;
  timestamp: string;
  baseline?: { optionId: string; confidence: number };
  protege?: { optionId: string; reasoning: string };
  human?: { optionId: string; note?: string };
}

interface DecisionExpiredEvent {
  type: 'decision:expired';
  reason: string;
  timestamp: string;
}

// Informational events
interface DecisionCreatedEvent {
  type: 'decision:created';
  decisionId: string;
  timestamp: string;
}

interface DecisionUpdatedEvent {
  type: 'decision:updated';
  status: string;
  timestamp: string;
}

// Keep-alive
interface HeartbeatEvent {
  type: 'heartbeat';
  timestamp: string;
}

// Union type
type SSEEvent =
  | DecisionResolvedEvent
  | DecisionExpiredEvent
  | DecisionCreatedEvent
  | DecisionUpdatedEvent
  | HeartbeatEvent;
```

### Validation Schema (Zod)

```typescript
const sseEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('decision:resolved'),
    selectedOption: z.string(),
    respondedAt: z.string(),
    timestamp: z.string(),
    baseline: z.object({ optionId: z.string(), confidence: z.number() }).optional(),
    protege: z.object({ optionId: z.string(), reasoning: z.string() }).optional(),
    human: z.object({ optionId: z.string(), note: z.string().optional() }).optional(),
  }),
  z.object({
    type: z.literal('decision:expired'),
    reason: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('decision:created'),
    decisionId: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('decision:updated'),
    status: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('heartbeat'),
    timestamp: z.string(),
  }),
]);
```

## SSE Endpoint Contract

```
GET /api/humancy/decisions/{id}/events
Accept: text/event-stream
Authorization: Bearer <api-key>

Response: text/event-stream
  event: decision:resolved
  data: {"type":"decision:resolved","selectedOption":"opt-1","respondedAt":"...","timestamp":"..."}

  event: heartbeat
  data: {"type":"heartbeat","timestamp":"..."}
```

## Relationships

```
HumancyHttpClient
  ├── createDecision() → POST /decisions → DecisionCreatedResponse
  ├── getDecision()    → GET /decisions/:id → DecisionApiResponse
  └── getEventsUrl()   → constructs SSE URL

SSEHandler
  └── subscribeToDecision(url) → AsyncGenerator<SSEEvent>
       ├── yields DecisionCreatedEvent
       ├── yields DecisionUpdatedEvent
       ├── yields HeartbeatEvent
       └── terminates on DecisionResolvedEvent | DecisionExpiredEvent

request-decision tool (cloud mode)
  1. httpClient.createDecision(request) → created
  2. sseHandler.subscribeToDecision(httpClient.getEventsUrl(created.id))
  3. Iterate events until terminal (resolved/expired) or timeout
  4. Return result
```
