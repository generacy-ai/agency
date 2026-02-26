import { z } from 'zod';
import { ISOTimestampSchema } from '../common/timestamps.js';
import { UserIdSchema } from '../common/ids.js';
import { TrainingLevelSchema, MetricsTrendSchema } from '../attribution-metrics/index.js';

// =============================================================================
// Common Export Types
// =============================================================================

export const ExportVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export type ExportVersion = z.infer<typeof ExportVersionSchema>;

export const PortabilityLevelSchema = z.enum(['full', 'redacted', 'abstracted']);
export type PortabilityLevel = z.infer<typeof PortabilityLevelSchema>;

// =============================================================================
// Decision History Export
// =============================================================================

export const RecommendationSummarySchema = z.object({
  optionId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export const DecisionRecordSchema = z.object({
  id: z.string().min(1),
  timestamp: ISOTimestampSchema,
  domain: z.array(z.string().min(1)).min(1),
  title: z.string().optional(),
  baseline: RecommendationSummarySchema.optional(),
  protege: RecommendationSummarySchema.optional(),
  humanDecision: z.object({
    optionId: z.string().min(1),
    wasOverride: z.boolean().optional(),
    reasoning: z.string().optional(),
  }),
  outcome: z.enum(['success', 'partial_success', 'failure', 'unknown']).optional(),
  outcomeRecordedAt: ISOTimestampSchema.optional(),
  coachingProvided: z.boolean().optional(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

export const ExportDateRangeSchema = z.object({
  from: ISOTimestampSchema.optional(),
  to: ISOTimestampSchema.optional(),
});

export const ExportStatisticsSchema = z.object({
  byOutcome: z.record(z.number()).optional(),
  overrideCount: z.number().int().nonnegative().optional(),
  coachingCount: z.number().int().nonnegative().optional(),
});

export namespace DecisionHistoryExport {
  export const V1 = z.object({
    exportVersion: ExportVersionSchema,
    exportedAt: ISOTimestampSchema,
    decisions: z.array(DecisionRecordSchema),
    dateRange: ExportDateRangeSchema.optional(),
    totalCount: z.number().int().nonnegative(),
    includedDomains: z.array(z.string()).optional(),
    statistics: ExportStatisticsSchema.optional(),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const DecisionHistoryExportSchema = DecisionHistoryExport.Latest;
export type DecisionHistoryExport = DecisionHistoryExport.Latest;

// =============================================================================
// Knowledge Export
// =============================================================================

export namespace KnowledgeExport {
  export const V1 = z.object({
    exportVersion: ExportVersionSchema,
    exportedAt: ISOTimestampSchema,
    userId: UserIdSchema,
    philosophy: z.record(z.unknown()).optional(),
    principles: z.array(z.record(z.unknown())),
    patterns: z.array(z.record(z.unknown())),
    context: z.record(z.unknown()).optional(),
    portabilityLevel: PortabilityLevelSchema,
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const KnowledgeExportSchema = KnowledgeExport.Latest;
export type KnowledgeExport = KnowledgeExport.Latest;

// =============================================================================
// Protege Data Export
// =============================================================================

export namespace ProtegeDataExport {
  export const V1 = z.object({
    exportVersion: ExportVersionSchema,
    exportedAt: ISOTimestampSchema,
    userId: UserIdSchema,
    coachingHistory: z.array(z.record(z.unknown())),
    trainingMetrics: z.record(z.unknown()),
    trainingLevel: TrainingLevelSchema,
    improvementTrends: z.array(MetricsTrendSchema),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const ProtegeDataExportSchema = ProtegeDataExport.Latest;
export type ProtegeDataExport = ProtegeDataExport.Latest;

// =============================================================================
// Workflow Cloud State
// =============================================================================

export namespace WorkflowCloudState {
  export const V1 = z.object({
    exportVersion: ExportVersionSchema,
    exportedAt: ISOTimestampSchema,
    workflows: z.array(z.record(z.unknown())),
    executions: z.array(z.record(z.unknown())),
    lastExecutionTime: ISOTimestampSchema.optional(),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const WorkflowCloudStateSchema = WorkflowCloudState.Latest;
export type WorkflowCloudState = WorkflowCloudState.Latest;

// =============================================================================
// Queue State
// =============================================================================

export namespace QueueState {
  export const V1 = z.object({
    exportVersion: ExportVersionSchema,
    exportedAt: ISOTimestampSchema,
    items: z.array(z.record(z.unknown())),
    filters: z.array(z.record(z.unknown())),
    totalPending: z.number().int().nonnegative(),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const QueueStateSchema = QueueState.Latest;
export type QueueState = QueueState.Latest;
