/**
 * Decision record types for outcome tracking
 *
 * Enables decision attribution by storing requests
 * and their outcomes for later analysis.
 *
 * TODO: Align with generacy-ai/contracts#27 when available
 */

import { z } from 'zod';
import {
  threeLayerBreakdownSchema,
  type ThreeLayerBreakdown,
} from './three-layer.js';

/**
 * Structured context for decision requests
 */
export interface DecisionContext {
  /** Project-level constraints that may apply */
  projectConstraints?: string[];
  /** Related issue reference */
  relatedIssue?: string;
  /** Additional context fields */
  [key: string]: unknown;
}

/**
 * Outcome reported after decision implementation
 */
export interface DecisionOutcome {
  /** Result of the decision */
  result: 'success' | 'failure' | 'mixed';
  /** Additional details about the outcome */
  details?: string;
  /** When outcome was reported */
  reportedAt: Date;
  /** Quality score for attribution (computed) */
  quality?: number;
}

/**
 * Option as stored in decision record
 */
export interface StoredDecisionOption {
  /** Unique identifier for selection */
  id: string;
  /** Display text */
  label: string;
  /** Optional explanation */
  description?: string;
  /** Optional tradeoff analysis */
  tradeoffs?: {
    pros: string[];
    cons: string[];
  };
}

/**
 * Complete decision record for storage and retrieval
 */
export interface DecisionRecord {
  /** Unique decision identifier */
  decisionId: string;
  /** Original request details */
  request: {
    question: string;
    options: StoredDecisionOption[];
    domain?: string[];
    context?: DecisionContext;
    timestamp: Date;
  };
  /** Three-layer breakdown (if requested) */
  threeLayer?: ThreeLayerBreakdown;
  /** Final selected option */
  selectedOption: string;
  /** When decision was made */
  decidedAt: Date;
  /** Outcome data (if reported) */
  outcome?: DecisionOutcome;
}

// Zod schemas for validation

/**
 * Schema for decision context
 */
export const decisionContextSchema = z
  .object({
    projectConstraints: z.array(z.string()).optional(),
    relatedIssue: z.string().optional(),
  })
  .passthrough(); // Allow additional fields

/**
 * Schema for decision outcome
 */
export const decisionOutcomeSchema = z.object({
  result: z.enum(['success', 'failure', 'mixed']),
  details: z.string().optional(),
  reportedAt: z.date(),
  quality: z.number().min(0).max(100).optional(),
});

/**
 * Schema for tradeoffs
 */
export const tradeoffsSchema = z.object({
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

/**
 * Schema for stored decision option
 */
export const storedDecisionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  tradeoffs: tradeoffsSchema.optional(),
});

/**
 * Schema for decision record
 */
export const decisionRecordSchema = z.object({
  decisionId: z.string().uuid(),
  request: z.object({
    question: z.string(),
    options: z.array(storedDecisionOptionSchema),
    domain: z.array(z.string()).optional(),
    context: decisionContextSchema.optional(),
    timestamp: z.date(),
  }),
  threeLayer: threeLayerBreakdownSchema.optional(),
  selectedOption: z.string(),
  decidedAt: z.date(),
  outcome: decisionOutcomeSchema.optional(),
});

/**
 * Schema for report decision result parameters
 */
export const reportDecisionResultParamsSchema = z.object({
  decisionId: z.string().uuid(),
  outcome: z.enum(['success', 'failure', 'mixed']),
  details: z.string().optional(),
});

/**
 * Schema for get decision outcome parameters
 */
export const getDecisionOutcomeParamsSchema = z.object({
  decisionId: z.string().uuid(),
});

// Type inference from schemas
export type DecisionContextData = z.infer<typeof decisionContextSchema>;
export type DecisionOutcomeData = z.infer<typeof decisionOutcomeSchema>;
export type DecisionRecordData = z.infer<typeof decisionRecordSchema>;
export type ReportDecisionResultParams = z.infer<typeof reportDecisionResultParamsSchema>;
export type GetDecisionOutcomeParams = z.infer<typeof getDecisionOutcomeParamsSchema>;
