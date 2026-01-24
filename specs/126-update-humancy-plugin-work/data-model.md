# Data Model: Humancy Plugin API Integration

## Core Entities

### HTTP Client Configuration

```typescript
/**
 * Configuration for HumancyHttpClient
 */
export interface HttpClientConfig {
  /** Base URL for API (default: https://generacy.ai/api/humancy) */
  baseUrl: string;

  /** API key for authentication (optional for local dev) */
  apiKey?: string;

  /** Request timeout in milliseconds (default: 60000) */
  timeout: number;

  /** Maximum retry attempts (default: 3) */
  maxRetries: number;

  /** Base delay for exponential backoff in ms (default: 1000) */
  retryBaseDelayMs: number;
}
```

### API Request Types

```typescript
/**
 * Request to create a decision via REST API
 */
export interface CreateDecisionApiRequest {
  /** The decision question */
  question: string;

  /** Available choices (2-10 options) */
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;

  /** Additional context for the decision */
  context?: string;

  /** Urgency level */
  urgency: 'blocking_now' | 'blocking_soon' | 'when_available';

  /** Domain tags for principle matching */
  domain?: string[];

  /** Timeout in milliseconds for this decision */
  timeout?: number;
}

/**
 * Response from creating a decision
 */
export interface DecisionCreatedResponse {
  /** Unique decision ID */
  id: string;

  /** Current status */
  status: 'pending' | 'resolved' | 'expired';

  /** When the decision was created */
  createdAt: string;

  /** When the decision will expire */
  expiresAt: string;
}

/**
 * Response from getting a decision
 */
export interface DecisionApiResponse {
  /** Unique decision ID */
  id: string;

  /** Current status */
  status: 'pending' | 'resolved' | 'expired';

  /** The decision question */
  question: string;

  /** Available choices */
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;

  /** Selected option ID (if resolved) */
  selectedOption?: string;

  /** When the human responded (if resolved) */
  respondedAt?: string;

  /** Baseline agent recommendation (three-layer model) */
  baseline?: {
    optionId: string;
    confidence: number;
  };

  /** Protégé agent recommendation (three-layer model) */
  protege?: {
    optionId: string;
    reasoning: string;
  };

  /** Human decision (three-layer model) */
  human?: {
    optionId: string;
    note?: string;
  };
}
```

### SSE Event Types

```typescript
/**
 * Base SSE event
 */
export interface BaseSSEEvent {
  /** Event type */
  type: string;

  /** Event timestamp */
  timestamp: string;
}

/**
 * Decision resolved event
 */
export interface DecisionResolvedEvent extends BaseSSEEvent {
  type: 'decision_resolved';

  /** Selected option ID */
  selectedOption: string;

  /** When the human responded */
  respondedAt: string;

  /** Three-layer data if available */
  baseline?: { optionId: string; confidence: number };
  protege?: { optionId: string; reasoning: string };
  human?: { optionId: string; note?: string };
}

/**
 * Decision expired event
 */
export interface DecisionExpiredEvent extends BaseSSEEvent {
  type: 'decision_expired';

  /** Reason for expiration */
  reason: string;
}

/**
 * Heartbeat event for connection keep-alive
 */
export interface HeartbeatEvent extends BaseSSEEvent {
  type: 'heartbeat';
}

/**
 * Union of all SSE event types
 */
export type SSEEvent =
  | DecisionResolvedEvent
  | DecisionExpiredEvent
  | HeartbeatEvent;
```

### Connection Mode Updates

```typescript
/**
 * Connection modes for Humancy communication (updated)
 */
export enum ConnectionMode {
  /** Direct IPC to local VS Code extension */
  DIRECT = 'direct',

  /** HTTP to generacy.ai/api/humancy (renamed from VIA_GENERACY) */
  CLOUD = 'cloud',

  /** Queue for later delivery (offline mode) */
  OFFLINE = 'offline',
}

/**
 * Extended connection state with HTTP client info
 */
export interface ConnectionState {
  /** Current connection mode */
  mode: ConnectionMode;

  /** Whether currently connected */
  connected: boolean;

  /** Last successful connection time */
  lastConnected?: Date;

  /** Error if connection failed */
  error?: string;

  /** HTTP client info (cloud mode only) */
  httpClientInfo?: {
    baseUrl: string;
    authenticated: boolean;
  };
}
```

### Error Types

```typescript
/**
 * HTTP error with status code
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'HttpError';
  }

  /** Check if error is retriable */
  get isRetryable(): boolean {
    return this.status >= 500;
  }

  /** Check if auth error */
  get isAuthError(): boolean {
    return this.status === 401;
  }
}

/**
 * SSE connection error
 */
export class SSEConnectionError extends Error {
  constructor(
    public reason: 'timeout' | 'network' | 'server_error' | 'max_retries',
    message: string
  ) {
    super(message);
    this.name = 'SSEConnectionError';
  }
}

/**
 * Decision timeout error
 */
export interface DecisionTimeoutError {
  type: 'timeout';
  decisionId: string;
  elapsedMs: number;
  configuredTimeoutMs: number;
  suggestion: string;
}
```

## Validation Schemas

```typescript
import { z } from 'zod';

/**
 * HTTP client config validation
 */
export const httpClientConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1).optional(),
  timeout: z.number().positive().max(300000).default(60000),
  maxRetries: z.number().min(0).max(10).default(3),
  retryBaseDelayMs: z.number().positive().default(1000),
});

/**
 * API request validation
 */
export const createDecisionApiRequestSchema = z.object({
  question: z.string().min(1).max(10000),
  options: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      description: z.string().optional(),
    })
  ).min(2).max(10),
  context: z.string().max(50000).optional(),
  urgency: z.enum(['blocking_now', 'blocking_soon', 'when_available']),
  domain: z.array(z.string()).optional(),
  timeout: z.number().positive().optional(),
});

/**
 * SSE event validation
 */
export const sseEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('decision_resolved'),
    selectedOption: z.string(),
    respondedAt: z.string(),
    timestamp: z.string(),
    baseline: z.object({
      optionId: z.string(),
      confidence: z.number(),
    }).optional(),
    protege: z.object({
      optionId: z.string(),
      reasoning: z.string(),
    }).optional(),
    human: z.object({
      optionId: z.string(),
      note: z.string().optional(),
    }).optional(),
  }),
  z.object({
    type: z.literal('decision_expired'),
    reason: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('heartbeat'),
    timestamp: z.string(),
  }),
]);
```

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HumancyPlugin                               │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ ConnectionMode  │  │ HumancyHttpClient │  │  DecisionStore   │   │
│  │    Detector     │  │                  │  │                  │   │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬─────────┘   │
│           │                    │                     │             │
│           v                    v                     v             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                         Tools                               │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │    │
│  │  │ask_question  │  │request_review│  │request_decision  │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │    │
│  │  │   notify     │  │get_outcome   │  │report_result     │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    HumancyHttpClient                                │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                    REST Methods                             │    │
│  │  createDecision() → POST /api/humancy/decisions            │    │
│  │  getDecision()    → GET /api/humancy/decisions/:id         │    │
│  │  subscribeToDecision() → GET /api/humancy/decisions/:id/events │ │
│  └────────────────────────────────────────────────────────────┘    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │
│  │  SSEHandler    │  │  RetryHandler  │  │  AuthHandler   │       │
│  └────────────────┘  └────────────────┘  └────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

## Configuration Hierarchy

```
Priority 1 (highest): Explicit tool parameters
  └── timeout, urgency, etc. passed to tool call

Priority 2: Plugin configuration
  └── agency.config.humancy.* values

Priority 3: Environment variables
  └── HUMANCY_API_URL, GENERACY_API_KEY

Priority 4 (lowest): Defaults
  └── baseUrl: https://generacy.ai/api/humancy
  └── timeout: 60000
  └── mode: auto-detect
```
