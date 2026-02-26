import { z } from 'zod';
import { TimestampSchema, OptionalTimestampSchema } from '../common/timestamps.js';
import { createPrefixedIdSchema, UserIdSchema } from '../common/ids.js';

// =============================================================================
// Common Enums
// =============================================================================

export const RiskToleranceSchema = z.enum(['conservative', 'moderate', 'aggressive']);
export type RiskTolerance = z.infer<typeof RiskToleranceSchema>;

export const TimeHorizonValueSchema = z.enum(['immediate', 'short', 'medium', 'long']);
export type TimeHorizonValue = z.infer<typeof TimeHorizonValueSchema>;

export const EnergyLevelSchema = z.enum(['high', 'medium', 'low']);
export type EnergyLevel = z.infer<typeof EnergyLevelSchema>;

export const ImportanceLevelSchema = z.enum(['critical', 'high', 'medium', 'low']);
export type ImportanceLevel = z.infer<typeof ImportanceLevelSchema>;

export const BoundaryTypeSchema = z.enum(['absolute', 'contextual']);
export const ConstraintTypeSchema = z.enum(['time', 'budget', 'resources', 'political', 'technical']);
export const ConstraintSeveritySchema = z.enum(['hard', 'soft']);

export const PrincipleStatusSchema = z.enum(['active', 'deprecated', 'under_review']);
export type PrincipleStatus = z.infer<typeof PrincipleStatusSchema>;

export const PatternStatusSchema = z.enum([
  'observed',
  'proposed_principle',
  'rejected',
  'promoted',
]);
export type PatternStatus = z.infer<typeof PatternStatusSchema>;

export const EvidenceOutcomeSchema = z.enum(['confirmed', 'contradicted', 'neutral']);

/** Normalized value between 0 and 1 */
export const NormalizedValueSchema = z.number().min(0).max(1);

// =============================================================================
// Philosophy
// =============================================================================

export const PhilosophyIdSchema = createPrefixedIdSchema('phi');
export const ValueIdSchema = createPrefixedIdSchema('val');
export const BoundaryIdSchema = createPrefixedIdSchema('bnd');
export const MetaPreferenceIdSchema = createPrefixedIdSchema('mpf');

export const ValueSchema = z.object({
  id: ValueIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  weight: NormalizedValueSchema,
  inTensionWith: z.array(ValueIdSchema).optional(),
});
export type Value = z.infer<typeof ValueSchema>;

export const BoundarySchema = z
  .object({
    id: BoundaryIdSchema,
    description: z.string().min(1),
    type: BoundaryTypeSchema,
    context: z.string().optional(),
  })
  .refine(
    (data) => data.type !== 'contextual' || data.context !== undefined,
    { message: 'context required when type is contextual', path: ['context'] }
  );
export type Boundary = z.infer<typeof BoundarySchema>;

export const MetaPreferenceSchema = z.object({
  id: MetaPreferenceIdSchema,
  category: z.string().min(1),
  preference: z.string().min(1),
  strength: NormalizedValueSchema,
});

export const RiskProfileSchema = z.object({
  overall: RiskToleranceSchema,
  domains: z.record(RiskToleranceSchema),
  description: z.string().optional(),
});

export const TimeHorizonSchema = z.object({
  defaultHorizon: TimeHorizonValueSchema,
  domainSpecific: z.record(TimeHorizonValueSchema).optional(),
});

export namespace Philosophy {
  export const V1 = z.object({
    id: PhilosophyIdSchema,
    userId: UserIdSchema,
    values: z.array(ValueSchema),
    metaPreferences: z.array(MetaPreferenceSchema),
    boundaries: z.array(BoundarySchema),
    riskProfile: RiskProfileSchema,
    timeHorizon: TimeHorizonSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const PhilosophySchema = Philosophy.Latest;
export type Philosophy = Philosophy.Latest;

// =============================================================================
// Principle
// =============================================================================

export const PrincipleIdSchema = createPrefixedIdSchema('pri');

export const EvidenceRecordSchema = z.object({
  decisionId: z.string().min(1),
  outcome: EvidenceOutcomeSchema,
  timestamp: TimestampSchema,
  notes: z.string().optional(),
});

export namespace Principle {
  export const V1 = z.object({
    id: PrincipleIdSchema,
    userId: UserIdSchema,
    statement: z.string().min(1),
    description: z.string().optional(),
    domains: z.array(z.string()),
    status: PrincipleStatusSchema,
    confidence: NormalizedValueSchema,
    supportingEvidence: z.array(EvidenceRecordSchema),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    deprecatedAt: OptionalTimestampSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const PrincipleSchema = Principle.Latest;
export type Principle = Principle.Latest;

// =============================================================================
// Pattern
// =============================================================================

export const PatternIdSchema = createPrefixedIdSchema('pat');

export namespace Pattern {
  export const V1 = z.object({
    id: PatternIdSchema,
    userId: UserIdSchema,
    description: z.string().min(1),
    domains: z.array(z.string()),
    frequency: z.string().min(1),
    confidence: NormalizedValueSchema,
    status: PatternStatusSchema,
    examples: z.array(z.string()),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const PatternSchema = Pattern.Latest;
export type Pattern = Pattern.Latest;

// =============================================================================
// User Context
// =============================================================================

export const UserContextIdSchema = createPrefixedIdSchema('ctx');
export const PriorityIdSchema = createPrefixedIdSchema('pty');
export const ConstraintIdSchema = createPrefixedIdSchema('cst');

export const PrioritySchema = z.object({
  id: PriorityIdSchema,
  description: z.string().min(1),
  importance: ImportanceLevelSchema,
});

export const ConstraintSchema = z.object({
  id: ConstraintIdSchema,
  description: z.string().min(1),
  severity: ConstraintSeveritySchema,
  type: ConstraintTypeSchema,
});

export namespace UserContext {
  export const V1 = z.object({
    id: UserContextIdSchema,
    userId: UserIdSchema,
    priorities: z.array(PrioritySchema),
    constraints: z.array(ConstraintSchema),
    energyLevel: EnergyLevelSchema,
    focus: z.array(z.string()),
    assumptions: z.array(z.string()),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const UserContextSchema = UserContext.Latest;
export type UserContext = UserContext.Latest;

// =============================================================================
// Individual Knowledge (composite)
// =============================================================================

export const IndividualKnowledgeSchema = z.object({
  userId: UserIdSchema,
  philosophy: PhilosophySchema,
  principles: z.array(PrincipleSchema),
  patterns: z.array(PatternSchema),
  context: UserContextSchema,
  lastUpdated: TimestampSchema,
});
export type IndividualKnowledge = z.infer<typeof IndividualKnowledgeSchema>;
