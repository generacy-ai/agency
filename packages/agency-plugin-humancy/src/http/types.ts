/**
 * HTTP Client Types for Humancy Cloud API
 *
 * Types for REST API request/response communication with humancy-cloud.
 */

import { z } from 'zod';

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

/**
 * Default HTTP client configuration
 */
export const DEFAULT_HTTP_CONFIG: HttpClientConfig = {
  baseUrl: 'https://generacy.ai/api/humancy',
  timeout: 60000,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
};

/**
 * Decision option for API request
 */
export interface ApiDecisionOption {
  /** Unique identifier for the option */
  id: string;
  /** Display text for the option */
  label: string;
  /** Optional description */
  description?: string;
  /** Optional tradeoffs analysis */
  tradeoffs?: {
    pros?: string[];
    cons?: string[];
  };
}

/**
 * Request to create a decision via REST API
 */
export interface CreateDecisionApiRequest {
  /** The decision question */
  question: string;

  /** Available choices (2-10 options) */
  options: ApiDecisionOption[];

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
 * Three-layer model components in API response
 */
export interface ApiBaselineRecommendation {
  optionId: string;
  confidence: number;
}

export interface ApiProtegeRecommendation {
  optionId: string;
  reasoning: string;
}

export interface ApiHumanDecision {
  optionId: string;
  note?: string;
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
  options: ApiDecisionOption[];

  /** Selected option ID (if resolved) */
  selectedOption?: string;

  /** When the human responded (if resolved) */
  respondedAt?: string;

  /** Baseline agent recommendation (three-layer model) */
  baseline?: ApiBaselineRecommendation;

  /** Protege agent recommendation (three-layer model) */
  protege?: ApiProtegeRecommendation;

  /** Human decision (three-layer model) */
  human?: ApiHumanDecision;
}

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
  type: 'decision:resolved';

  /** Selected option ID */
  selectedOption: string;

  /** When the human responded */
  respondedAt: string;

  /** Three-layer data if available */
  baseline?: ApiBaselineRecommendation;
  protege?: ApiProtegeRecommendation;
  human?: ApiHumanDecision;
}

/**
 * Decision expired event
 */
export interface DecisionExpiredEvent extends BaseSSEEvent {
  type: 'decision:expired';

  /** Reason for expiration */
  reason: string;
}

/**
 * Decision created event
 */
export interface DecisionCreatedEvent extends BaseSSEEvent {
  type: 'decision:created';

  /** Decision ID */
  decisionId: string;
}

/**
 * Decision updated event
 */
export interface DecisionUpdatedEvent extends BaseSSEEvent {
  type: 'decision:updated';

  /** Current status */
  status: string;
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
  | DecisionCreatedEvent
  | DecisionUpdatedEvent
  | HeartbeatEvent;

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

  /** Check if rate limited */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** Check if not found */
  get isNotFound(): boolean {
    return this.status === 404;
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

// ============= Zod Validation Schemas =============

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
 * API option validation
 */
export const apiDecisionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  tradeoffs: z
    .object({
      pros: z.array(z.string()).optional(),
      cons: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * API request validation
 */
export const createDecisionApiRequestSchema = z.object({
  question: z.string().min(1).max(10000),
  options: z.array(apiDecisionOptionSchema).min(2).max(10),
  context: z.string().max(50000).optional(),
  urgency: z.enum(['blocking_now', 'blocking_soon', 'when_available']),
  domain: z.array(z.string()).optional(),
  timeout: z.number().positive().optional(),
});

/**
 * Decision created response validation
 */
export const decisionCreatedResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'resolved', 'expired']),
  createdAt: z.string(),
  expiresAt: z.string(),
});

/**
 * Decision API response validation
 */
export const decisionApiResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'resolved', 'expired']),
  question: z.string(),
  options: z.array(apiDecisionOptionSchema),
  selectedOption: z.string().optional(),
  respondedAt: z.string().optional(),
  baseline: z
    .object({
      optionId: z.string(),
      confidence: z.number(),
    })
    .optional(),
  protege: z
    .object({
      optionId: z.string(),
      reasoning: z.string(),
    })
    .optional(),
  human: z
    .object({
      optionId: z.string(),
      note: z.string().optional(),
    })
    .optional(),
});

/**
 * SSE event validation
 */
export const sseEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('decision:resolved'),
    selectedOption: z.string(),
    respondedAt: z.string(),
    timestamp: z.string(),
    baseline: z
      .object({
        optionId: z.string(),
        confidence: z.number(),
      })
      .optional(),
    protege: z
      .object({
        optionId: z.string(),
        reasoning: z.string(),
      })
      .optional(),
    human: z
      .object({
        optionId: z.string(),
        note: z.string().optional(),
      })
      .optional(),
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
