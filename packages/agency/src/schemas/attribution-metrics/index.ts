import { z } from 'zod';
import { TimestampSchema, OptionalTimestampSchema } from '../common/timestamps.js';
import { createPrefixedIdSchema, UserIdSchema } from '../common/ids.js';

// =============================================================================
// Common Enums
// =============================================================================

export const OutcomeSchema = z.enum(['success', 'partial_success', 'failure', 'unknown']);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const OutcomeWhoWasRightSchema = z.enum([
  'baseline',
  'protege',
  'human_unique',
  'all_aligned',
  'unknown',
]);

export const ValueSourceSchema = z.enum([
  'system',
  'protege_wisdom',
  'human_judgment',
  'collaboration',
  'none',
]);

export const TrendDirectionSchema = z.enum(['improving', 'stable', 'declining']);
export type TrendDirection = z.infer<typeof TrendDirectionSchema>;

export const PeriodTypeSchema = z.enum([
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'all_time',
]);
export type PeriodType = z.infer<typeof PeriodTypeSchema>;

export const TrainingLevelSchema = z.enum(['novice', 'developing', 'proficient', 'expert']);
export type TrainingLevel = z.infer<typeof TrainingLevelSchema>;

// =============================================================================
// Decision Outcome
// =============================================================================

export const OutcomeIdSchema = createPrefixedIdSchema('outcome');

export const OutcomeAttributionSchema = z.object({
  whoWasRight: OutcomeWhoWasRightSchema,
  valueSource: ValueSourceSchema,
  baselineAlternativeOutcome: z.string().optional(),
  protegeAlternativeOutcome: z.string().optional(),
});

export namespace DecisionOutcome {
  export const V1 = z.object({
    id: OutcomeIdSchema,
    decisionId: z.string().min(1),
    outcome: OutcomeSchema,
    outcomeDetails: z.string().optional(),
    validatedAt: TimestampSchema,
    baselineWouldHaveWorked: z.boolean().nullable().optional(),
    protegeWouldHaveWorked: z.boolean().nullable().optional(),
    humanDecisionWorked: z.boolean().nullable().optional(),
    attribution: OutcomeAttributionSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const DecisionOutcomeSchema = DecisionOutcome.Latest;
export type DecisionOutcome = DecisionOutcome.Latest;

// =============================================================================
// Domain Metrics
// =============================================================================

export const DomainMetricsSchema = z.object({
  domain: z.string().min(1),
  totalDecisions: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  humanCorrectRate: z.number().min(0).max(1),
  protegeCorrectRate: z.number().min(0).max(1),
  baselineCorrectRate: z.number().min(0).max(1),
  averageConfidence: z.number().min(0).max(1),
  overrideRate: z.number().min(0).max(1),
});
export type DomainMetrics = z.infer<typeof DomainMetricsSchema>;

// =============================================================================
// Volume Metrics
// =============================================================================

export const VolumeMetricsSchema = z.object({
  period: PeriodTypeSchema,
  startDate: TimestampSchema,
  endDate: TimestampSchema,
  totalDecisions: z.number().int().nonnegative(),
  decisionsByDomain: z.record(z.number()),
  decisionsByOutcome: z.record(z.number()),
});
export type VolumeMetrics = z.infer<typeof VolumeMetricsSchema>;

// =============================================================================
// Metrics Trend
// =============================================================================

export const MetricsPeriodSchema = z.object({
  period: PeriodTypeSchema,
  value: z.number(),
  startDate: TimestampSchema,
  endDate: TimestampSchema,
});

export const MetricsTrendSchema = z.object({
  metric: z.string().min(1),
  trend: TrendDirectionSchema,
  changePercentage: z.number(),
  periods: z.array(MetricsPeriodSchema),
});
export type MetricsTrend = z.infer<typeof MetricsTrendSchema>;

// =============================================================================
// Individual Metrics
// =============================================================================

export const MetricsIdSchema = createPrefixedIdSchema('metrics');

export const IndividualMetricsSchema = z.object({
  id: MetricsIdSchema,
  userId: UserIdSchema,
  totalDecisions: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  trainingLevel: TrainingLevelSchema,
  improvementRate: z.number().min(0).max(1),
  byDomain: z.record(DomainMetricsSchema),
  lastUpdated: TimestampSchema,
});
export type IndividualMetrics = z.infer<typeof IndividualMetricsSchema>;

// =============================================================================
// Leaderboard Entry
// =============================================================================

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  userId: UserIdSchema,
  displayName: z.string().optional(),
  score: z.number(),
  successRate: z.number().min(0).max(1),
  decisionCount: z.number().int().nonnegative(),
  trainingLevel: TrainingLevelSchema,
  lastUpdated: TimestampSchema,
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

// =============================================================================
// Metrics Report
// =============================================================================

export const ReportIdSchema = createPrefixedIdSchema('report');

export const MetricsReportSchema = z.object({
  id: ReportIdSchema,
  userId: UserIdSchema,
  generatedAt: TimestampSchema,
  period: PeriodTypeSchema,
  summary: z.record(z.unknown()),
  trends: z.array(MetricsTrendSchema),
  recommendations: z.array(z.string()),
  verified: z.boolean(),
  verifiedAt: OptionalTimestampSchema,
});
export type MetricsReport = z.infer<typeof MetricsReportSchema>;
