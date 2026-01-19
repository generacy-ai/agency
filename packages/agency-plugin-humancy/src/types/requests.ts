/**
 * Request types for Humancy plugin
 *
 * Defines the message types sent from agents to humans.
 */

import { z } from 'zod';
import { tradeoffsSchema, decisionContextSchema } from './decision-record.js';

/**
 * Urgency levels for human interaction requests
 */
export enum Urgency {
  /** Agent is blocked, needs immediate response */
  BLOCKING_NOW = 'blocking_now',
  /** Agent can continue briefly but needs response soon */
  BLOCKING_SOON = 'blocking_soon',
  /** Informational, no rush */
  WHEN_AVAILABLE = 'when_available',
}

/**
 * Base fields common to all request types
 */
export interface BaseRequest {
  /** UUID v4 for correlation */
  id: string;
  /** Priority level */
  urgency: Urgency;
  /** Additional context for human */
  context?: string;
  /** Max wait time in milliseconds */
  timeout?: number;
  /** When request was created */
  timestamp: Date;
}

/**
 * Request for humancy.ask_question tool
 */
export interface QuestionRequest extends BaseRequest {
  type: 'question';
  /** The freeform question */
  question: string;
}

/**
 * Request for humancy.request_review tool
 */
export interface ReviewRequest extends BaseRequest {
  type: 'review';
  /** Path or content to review */
  artifact: string;
}

/**
 * Tradeoffs for decision options
 */
export interface Tradeoffs {
  /** Advantages of this option */
  pros: string[];
  /** Disadvantages of this option */
  cons: string[];
}

/**
 * Option for decision requests (enhanced with tradeoffs)
 */
export interface DecisionOption {
  /** Unique identifier for selection */
  id: string;
  /** Display text */
  label: string;
  /** Optional explanation */
  description?: string;
  /** Optional tradeoff analysis for this option */
  tradeoffs?: Tradeoffs;
}

/**
 * Structured context for decision requests
 */
export interface RequestDecisionContext {
  /** Project-level constraints that may apply */
  projectConstraints?: string[];
  /** Related issue reference */
  relatedIssue?: string;
  /** Additional context fields */
  [key: string]: unknown;
}

/**
 * Request for humancy.request_decision tool (enhanced with three-layer support)
 */
export interface DecisionRequest extends BaseRequest {
  type: 'decision';
  /** The decision question */
  question: string;
  /** Available choices */
  options: DecisionOption[];
  /** Domain tags for principle matching */
  domain?: string[];
  /** Structured context for decision */
  decisionContext?: RequestDecisionContext;
  /** Whether to include baseline/protégé recommendations in response */
  includeRecommendations?: boolean;
}

/**
 * Request for humancy.notify tool (fire-and-forget)
 */
export interface NotificationRequest {
  /** UUID v4 for tracking */
  id: string;
  type: 'notification';
  /** The notification message */
  message: string;
  /** Additional context */
  context?: string;
  /** Notification priority */
  urgency: Urgency;
  /** When notification was created */
  timestamp: Date;
}

/**
 * Union of all request types
 */
export type HumancyRequest =
  | QuestionRequest
  | ReviewRequest
  | DecisionRequest
  | NotificationRequest;

// Zod schemas for validation

export const urgencySchema = z.enum([
  'blocking_now',
  'blocking_soon',
  'when_available',
]);

export const decisionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  tradeoffs: tradeoffsSchema.optional(),
});

export const askQuestionParamsSchema = z.object({
  question: z.string().min(1).max(10000),
  context: z.string().max(50000).optional(),
  urgency: urgencySchema.default('when_available'),
  timeout: z.number().positive().max(300000).optional(),
});

export const requestReviewParamsSchema = z.object({
  artifact: z.string().min(1),
  context: z.string().max(50000).optional(),
  urgency: urgencySchema.default('blocking_soon'),
  timeout: z.number().positive().max(300000).optional(),
});

export const requestDecisionParamsSchema = z.object({
  question: z.string().min(1).max(10000),
  options: z.array(decisionOptionSchema).min(2).max(10),
  context: z.string().max(50000).optional(),
  urgency: urgencySchema.default('blocking_soon'),
  timeout: z.number().positive().max(300000).optional(),
  // Enhanced three-layer fields (all optional for backward compatibility)
  domain: z.array(z.string()).optional(),
  decisionContext: decisionContextSchema.optional(),
  includeRecommendations: z.boolean().optional(),
});

export const notifyParamsSchema = z.object({
  message: z.string().min(1).max(10000),
  context: z.string().max(50000).optional(),
  urgency: urgencySchema.default('when_available'),
});

/**
 * Parameter types inferred from Zod schemas
 */
export type AskQuestionParams = z.infer<typeof askQuestionParamsSchema>;
export type RequestReviewParams = z.infer<typeof requestReviewParamsSchema>;
export type RequestDecisionParams = z.infer<typeof requestDecisionParamsSchema>;
export type NotifyParams = z.infer<typeof notifyParamsSchema>;
