/**
 * Three-layer decision model types
 *
 * Defines types for the three-layer decision model:
 * 1. Baseline (System AI recommendation)
 * 2. Protégé (Human's trained AI recommendation)
 * 3. Human (Final decision)
 *
 * TODO: Align with generacy-ai/contracts#27 when available
 */

import { z } from 'zod';

/**
 * Base recommendation from any layer (baseline or protégé)
 */
export interface Recommendation {
  /** ID of the recommended option */
  optionId: string;
  /** Confidence level 0-100 */
  confidence: number;
  /** Reasoning for the recommendation */
  reasoning: string[];
}

/**
 * Protégé recommendation with applied principles
 */
export interface ProtegeRecommendation extends Recommendation {
  /** Principles from constitution that influenced this recommendation */
  appliedPrinciples: string[];
}

/**
 * Human's final decision with coaching metadata
 */
export interface HumanDecision {
  /** ID of the option selected by human */
  optionId: string;
  /** Whether human agreed with protégé */
  matchedProtege: boolean;
  /** Coaching feedback if human disagreed with protégé */
  coaching: string | null;
}

/**
 * Complete three-layer recommendation breakdown
 */
export interface ThreeLayerBreakdown {
  baseline: Recommendation;
  protege: ProtegeRecommendation;
  human: HumanDecision;
}

// Zod schemas for validation

/**
 * Schema for base recommendation
 */
export const recommendationSchema = z.object({
  optionId: z.string().min(1),
  confidence: z.number().min(0).max(100),
  reasoning: z.array(z.string()),
});

/**
 * Schema for protégé recommendation (extends base with principles)
 */
export const protegeRecommendationSchema = recommendationSchema.extend({
  appliedPrinciples: z.array(z.string()),
});

/**
 * Schema for human decision
 */
export const humanDecisionSchema = z.object({
  optionId: z.string().min(1),
  matchedProtege: z.boolean(),
  coaching: z.string().nullable(),
});

/**
 * Schema for complete three-layer breakdown
 */
export const threeLayerBreakdownSchema = z.object({
  baseline: recommendationSchema,
  protege: protegeRecommendationSchema,
  human: humanDecisionSchema,
});

// Type inference from schemas
export type RecommendationData = z.infer<typeof recommendationSchema>;
export type ProtegeRecommendationData = z.infer<typeof protegeRecommendationSchema>;
export type HumanDecisionData = z.infer<typeof humanDecisionSchema>;
export type ThreeLayerBreakdownData = z.infer<typeof threeLayerBreakdownSchema>;
