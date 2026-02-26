import { z } from 'zod';
import { TimestampSchema } from '../common/timestamps.js';
import { createPrefixedIdSchema, UserIdSchema } from '../common/ids.js';

// =============================================================================
// Common Decision Enums
// =============================================================================

export const DecisionConstraintTypeSchema = z.enum([
  'time',
  'budget',
  'resources',
  'political',
  'technical',
]);

export const DecisionConstraintSeveritySchema = z.enum(['hard', 'soft']);

// =============================================================================
// Decision Request
// =============================================================================

export const ThreeLayerDecisionRequestIdSchema = createPrefixedIdSchema('dreq');

export const DecisionOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
});
export type DecisionOption = z.infer<typeof DecisionOptionSchema>;

export const DecisionConstraintSchema = z.object({
  description: z.string().min(1),
  type: DecisionConstraintTypeSchema,
  severity: DecisionConstraintSeveritySchema,
});

export namespace ThreeLayerDecisionRequest {
  export const V1 = z.object({
    id: ThreeLayerDecisionRequestIdSchema,
    userId: UserIdSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    domains: z.array(z.string()),
    options: z.array(DecisionOptionSchema),
    context: z.record(z.unknown()),
    constraints: z.array(DecisionConstraintSchema),
    deadline: TimestampSchema.optional(),
    createdAt: TimestampSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const ThreeLayerDecisionRequestSchema = ThreeLayerDecisionRequest.Latest;
export type ThreeLayerDecisionRequest = ThreeLayerDecisionRequest.Latest;

// =============================================================================
// Baseline Recommendation
// =============================================================================

export const BaselineRecommendationSchema = z.object({
  recommendedOptionId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.array(z.string()),
  score: z.number().min(0).max(1),
});
export type BaselineRecommendation = z.infer<typeof BaselineRecommendationSchema>;

// =============================================================================
// Protege Recommendation
// =============================================================================

export const ProtegeRecommendationSchema = z.object({
  recommendedOptionId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.array(z.string()),
  score: z.number().min(0).max(1),
  humanTrainingUsed: z.array(z.string()),
  divergesFromBaseline: z.boolean(),
});
export type ProtegeRecommendation = z.infer<typeof ProtegeRecommendationSchema>;

// =============================================================================
// Human Decision
// =============================================================================

export const HumanDecisionSchema = z.object({
  chosenOptionId: z.string().min(1),
  reasoning: z.string().optional(),
  coachingProvided: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
  decidedAt: TimestampSchema,
});
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;

// =============================================================================
// Decision Attribution
// =============================================================================

export const WhoWasRightSchema = z.enum(['baseline', 'protege', 'human_unique']);
export const ValueAddedSchema = z.enum(['none', 'protege', 'human', 'both']);

export const DecisionAttributionSchema = z.object({
  whoWasRight: WhoWasRightSchema,
  valueAdded: ValueAddedSchema,
});
export type DecisionAttribution = z.infer<typeof DecisionAttributionSchema>;

// =============================================================================
// Three-Layer Decision (composite)
// =============================================================================

export const ThreeLayerDecisionIdSchema = createPrefixedIdSchema('tld');

export namespace ThreeLayerDecision {
  export const V1 = z.object({
    id: ThreeLayerDecisionIdSchema,
    request: ThreeLayerDecisionRequestSchema,
    baseline: BaselineRecommendationSchema,
    protege: ProtegeRecommendationSchema,
    human: HumanDecisionSchema,
    attribution: DecisionAttributionSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const ThreeLayerDecisionSchema = ThreeLayerDecision.Latest;
export type ThreeLayerDecision = ThreeLayerDecision.Latest;
