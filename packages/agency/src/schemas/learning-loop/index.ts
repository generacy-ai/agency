import { z } from 'zod';
import { TimestampSchema, OptionalTimestampSchema } from '../common/timestamps.js';
import { createPrefixedIdSchema, UserIdSchema } from '../common/ids.js';
import { OverrideReasonSchema } from '../extension-comms/index.js';

// =============================================================================
// Learning Scope (shared within learning-loop)
// =============================================================================

export const LearningScopeAppliesToSchema = z.enum([
  'this_decision',
  'this_project',
  'this_domain',
  'general',
]);

export const LearningScopeSchema = z
  .object({
    appliesTo: LearningScopeAppliesToSchema,
    domain: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (data) =>
      data.appliesTo !== 'this_domain' ||
      (data.domain !== undefined && data.domain.length > 0),
    { message: 'domain required when appliesTo is this_domain', path: ['domain'] }
  );

// =============================================================================
// Coaching Data
// =============================================================================

export const LearningCoachingDataIdSchema = createPrefixedIdSchema('coaching');

export namespace LearningCoachingData {
  export const V1 = z.object({
    id: LearningCoachingDataIdSchema,
    decisionId: z.string().min(1),
    timestamp: TimestampSchema,
    overrideReason: OverrideReasonSchema,
    explanation: z.string().optional(),
    scope: LearningScopeSchema,
    suggestedUpdate: z.unknown().optional(),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const LearningCoachingDataSchema = LearningCoachingData.Latest;
export type LearningCoachingData = LearningCoachingData.Latest;

// =============================================================================
// Knowledge Update
// =============================================================================

export const KnowledgeUpdateIdSchema = createPrefixedIdSchema('update');

export const KnowledgeUpdateTypeSchema = z.enum([
  'new_principle',
  'refine_principle',
  'new_pattern',
  'context_update',
  'no_update',
]);
export type KnowledgeUpdateType = z.infer<typeof KnowledgeUpdateTypeSchema>;

export const KnowledgeChangeTargetTypeSchema = z.enum([
  'philosophy',
  'principle',
  'pattern',
  'context',
]);

export const KnowledgeChangeOperationSchema = z.enum(['create', 'update', 'deprecate']);

export const UpdateStatusSchema = z.enum(['pending', 'applied', 'rejected']);
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>;

export namespace KnowledgeUpdate {
  export const V1 = z.object({
    id: KnowledgeUpdateIdSchema,
    type: KnowledgeUpdateTypeSchema,
    targetType: KnowledgeChangeTargetTypeSchema,
    operation: KnowledgeChangeOperationSchema,
    targetId: z.string().optional(),
    proposed: z.record(z.unknown()),
    status: UpdateStatusSchema,
    createdAt: TimestampSchema,
    appliedAt: OptionalTimestampSchema,
    rejectionReason: z.string().optional(),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const KnowledgeUpdateSchema = KnowledgeUpdate.Latest;
export type KnowledgeUpdate = KnowledgeUpdate.Latest;

// =============================================================================
// Pattern Candidate
// =============================================================================

export const PatternCandidateIdSchema = createPrefixedIdSchema('pattern');

export const LearningPatternStatusSchema = z.enum([
  'detected',
  'presented',
  'accepted',
  'rejected',
]);
export type LearningPatternStatus = z.infer<typeof LearningPatternStatusSchema>;

export namespace PatternCandidate {
  export const V1 = z.object({
    id: PatternCandidateIdSchema,
    userId: UserIdSchema,
    description: z.string().min(1),
    domains: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    supportingDecisions: z.array(z.string()),
    status: LearningPatternStatusSchema,
    createdAt: TimestampSchema,
    reviewedAt: OptionalTimestampSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const PatternCandidateSchema = PatternCandidate.Latest;
export type PatternCandidate = PatternCandidate.Latest;

// =============================================================================
// Learning Event
// =============================================================================

export const LearningEventIdSchema = createPrefixedIdSchema('event');

export const LearningEventTypeSchema = z.enum([
  'decision_made',
  'coaching_provided',
  'pattern_detected',
  'principle_created',
  'principle_refined',
  'context_updated',
]);
export type LearningEventType = z.infer<typeof LearningEventTypeSchema>;

export namespace LearningEvent {
  export const V1 = z.object({
    id: LearningEventIdSchema,
    userId: UserIdSchema,
    type: LearningEventTypeSchema,
    relatedId: z.string().optional(),
    details: z.record(z.unknown()),
    timestamp: TimestampSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const LearningEventSchema = LearningEvent.Latest;
export type LearningEvent = LearningEvent.Latest;

// =============================================================================
// Learning Session
// =============================================================================

export const LearningSessionIdSchema = createPrefixedIdSchema('session');

export namespace LearningSession {
  export const V1 = z.object({
    id: LearningSessionIdSchema,
    userId: UserIdSchema,
    events: z.array(LearningEventIdSchema),
    principlesCreated: z.number().int().nonnegative(),
    principlesRefined: z.number().int().nonnegative(),
    patternsDetected: z.number().int().nonnegative(),
    startedAt: TimestampSchema,
    endedAt: OptionalTimestampSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const LearningSessionSchema = LearningSession.Latest;
export type LearningSession = LearningSession.Latest;
