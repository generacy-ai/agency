# Data Model: Humancy Plugin

## Core Entities

### Urgency

Defines priority levels for human interaction requests.

```typescript
enum Urgency {
  BLOCKING_NOW = 'blocking_now',    // Agent blocked, immediate response needed
  BLOCKING_SOON = 'blocking_soon',  // Agent can continue briefly
  WHEN_AVAILABLE = 'when_available' // Informational, no rush
}
```

### ConnectionMode

Defines how the plugin connects to Humancy.

```typescript
enum ConnectionMode {
  DIRECT = 'direct',         // Local IPC to VS Code extension
  VIA_GENERACY = 'generacy', // Routed through orchestration layer
  OFFLINE = 'offline'        // Queue for later delivery
}
```

## Request Types

### BaseRequest

Common fields for all request types.

```typescript
interface BaseRequest {
  id: string;              // UUID v4 for correlation
  urgency: Urgency;
  context?: string;        // Additional context for human
  timeout?: number;        // Max wait time in ms
  timestamp: Date;         // When request was created
}
```

### QuestionRequest

For `humancy.ask_question` tool.

```typescript
interface QuestionRequest extends BaseRequest {
  type: 'question';
  question: string;        // The freeform question
}
```

### ReviewRequest

For `humancy.request_review` tool.

```typescript
interface ReviewRequest extends BaseRequest {
  type: 'review';
  artifact: string;        // Path or content to review
}
```

### DecisionRequest

For `humancy.request_decision` tool.

```typescript
interface DecisionRequest extends BaseRequest {
  type: 'decision';
  question: string;        // The decision question
  options: DecisionOption[];
}

interface DecisionOption {
  id: string;              // Unique identifier for selection
  label: string;           // Display text
  description?: string;    // Optional explanation
}
```

### NotificationRequest

For `humancy.notify` tool.

```typescript
interface NotificationRequest {
  id: string;
  type: 'notification';
  message: string;
  context?: string;
  urgency: Urgency;
  timestamp: Date;
}
```

### Unified Request Type

```typescript
type HumancyRequest =
  | QuestionRequest
  | ReviewRequest
  | DecisionRequest
  | NotificationRequest;
```

## Response Types

### QuestionResponse

Response to `ask_question`.

```typescript
interface QuestionResponse {
  requestId: string;       // Correlation with request
  type: 'text';
  response: string;        // Human's freeform text
  respondedAt: Date;
}
```

### ReviewResponse

Response to `request_review`.

```typescript
interface ReviewResponse {
  requestId: string;
  type: 'approval';
  status: ReviewStatus;
  comments?: string;       // Required if rejected/changes_requested
  respondedAt: Date;
}

enum ReviewStatus {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CHANGES_REQUESTED = 'changes_requested'
}
```

### DecisionResponse

Response to `request_decision`.

```typescript
interface DecisionResponse {
  requestId: string;
  type: 'selection';
  selectedOption: string;  // ID of the selected option
  respondedAt: Date;
}
```

### Unified Response Type

```typescript
type HumancyResponse =
  | QuestionResponse
  | ReviewResponse
  | DecisionResponse;
```

## Tool Parameter Types

### AskQuestionParams

```typescript
interface AskQuestionParams {
  question: string;
  context?: string;
  urgency?: Urgency;       // Default: WHEN_AVAILABLE
  timeout?: number;        // Default: 30000ms
}
```

### RequestReviewParams

```typescript
interface RequestReviewParams {
  artifact: string;
  context?: string;
  urgency?: Urgency;       // Default: BLOCKING_SOON
  timeout?: number;
}
```

### RequestDecisionParams

```typescript
interface RequestDecisionParams {
  question: string;
  options: DecisionOption[];
  context?: string;
  urgency?: Urgency;       // Default: BLOCKING_SOON
  timeout?: number;
}
```

### NotifyParams

```typescript
interface NotifyParams {
  message: string;
  context?: string;
  urgency?: Urgency;       // Default: WHEN_AVAILABLE
}
```

## Validation Rules

### Request Validation (Zod Schemas)

```typescript
const urgencySchema = z.enum([
  'blocking_now',
  'blocking_soon',
  'when_available'
]);

const decisionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional()
});

const askQuestionSchema = z.object({
  question: z.string().min(1).max(10000),
  context: z.string().max(50000).optional(),
  urgency: urgencySchema.default('when_available'),
  timeout: z.number().positive().max(300000).optional()
});

const requestReviewSchema = z.object({
  artifact: z.string().min(1),
  context: z.string().max(50000).optional(),
  urgency: urgencySchema.default('blocking_soon'),
  timeout: z.number().positive().max(300000).optional()
});

const requestDecisionSchema = z.object({
  question: z.string().min(1).max(10000),
  options: z.array(decisionOptionSchema).min(2).max(10),
  context: z.string().max(50000).optional(),
  urgency: urgencySchema.default('blocking_soon'),
  timeout: z.number().positive().max(300000).optional()
});

const notifySchema = z.object({
  message: z.string().min(1).max(10000),
  context: z.string().max(50000).optional(),
  urgency: urgencySchema.default('when_available')
});
```

## Entity Relationships

```
┌─────────────────┐
│  HumancyPlugin  │
└────────┬────────┘
         │ sends
         ▼
┌─────────────────┐       ┌─────────────────┐
│ HumancyRequest  │──────▶│  Channel Router │
└────────┬────────┘       └────────┬────────┘
         │                         │
         │                         │ delivers
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│  Urgency Level  │       │Humancy Extension│
└─────────────────┘       └────────┬────────┘
                                   │
                                   │ responds
                                   ▼
                          ┌─────────────────┐
                          │ HumancyResponse │
                          └─────────────────┘
```

## Message Envelope Format

Following channel router conventions:

```typescript
interface MessageEnvelope<T> {
  id: string;              // UUID
  channel: 'agency.humancy';
  sender: string;          // Plugin ID
  timestamp: Date;
  payload: T;              // HumancyRequest or HumancyResponse
  correlationId?: string;  // Links response to request
}
```
