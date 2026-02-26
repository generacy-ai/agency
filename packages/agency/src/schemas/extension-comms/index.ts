import { z } from 'zod';
import { ISOTimestampSchema } from '../common/timestamps.js';
import { createPrefixedIdSchema } from '../common/ids.js';

// =============================================================================
// Coaching Feedback
// =============================================================================

export const CoachingFeedbackIdSchema = createPrefixedIdSchema('cfb');

export const OverrideReasonSchema = z.enum([
  'reasoning_incorrect',
  'missing_context',
  'priorities_changed',
  'exception_case',
  'other',
]);
export type OverrideReason = z.infer<typeof OverrideReasonSchema>;

export const FeedbackProviderTypeSchema = z.enum(['human', 'system']);

export const FeedbackProviderSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().optional(),
  type: FeedbackProviderTypeSchema.default('human'),
});

export const CoachingFeedbackScopeAppliesToSchema = z.enum([
  'this_decision',
  'this_project',
  'this_domain',
  'general',
]);

export const CoachingFeedbackScopeSchema = z
  .object({
    appliesTo: CoachingFeedbackScopeAppliesToSchema,
    domains: z.array(z.string().min(1)).optional(),
    projectId: z.string().optional(),
  })
  .refine(
    (data) =>
      data.appliesTo !== 'this_domain' ||
      (data.domains !== undefined && data.domains.length > 0),
    { message: 'domains required when appliesTo is this_domain', path: ['domains'] }
  )
  .refine(
    (data) => data.appliesTo !== 'this_project' || data.projectId !== undefined,
    { message: 'projectId required when appliesTo is this_project', path: ['projectId'] }
  );

export namespace CoachingFeedback {
  export const V1 = z.object({
    id: CoachingFeedbackIdSchema,
    decisionId: z.string().min(1),
    overrideReason: OverrideReasonSchema,
    explanation: z.string().optional(),
    scope: CoachingFeedbackScopeSchema,
    timestamps: z.object({
      createdAt: ISOTimestampSchema,
      updatedAt: ISOTimestampSchema.optional(),
      decisionAt: ISOTimestampSchema.optional(),
    }),
    providedBy: FeedbackProviderSchema,
    metadata: z.record(z.unknown()).optional(),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const CoachingFeedbackSchema = CoachingFeedback.Latest;
export type CoachingFeedback = CoachingFeedback.Latest;

// =============================================================================
// Decision Queue Filter
// =============================================================================

export const DecisionUrgencySchema = z.enum(['critical', 'high', 'normal', 'low']);
export type DecisionUrgency = z.infer<typeof DecisionUrgencySchema>;

export const DecisionStatusSchema = z.enum([
  'pending',
  'in_progress',
  'resolved',
  'deferred',
  'expired',
]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const DateRangeSchema = z
  .object({
    from: ISOTimestampSchema.optional(),
    to: ISOTimestampSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.from && data.to) return new Date(data.from) <= new Date(data.to);
      return true;
    },
    { message: 'from must be before or equal to to' }
  );

export const DecisionQueueFilterSchema = z.object({
  projectId: z.string().min(1).optional(),
  urgency: z.array(DecisionUrgencySchema).optional(),
  domains: z.array(z.string().min(1)).optional(),
  assignedTo: z.string().min(1).optional(),
  status: z.array(DecisionStatusSchema).optional(),
  dateRange: DateRangeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export type DecisionQueueFilter = z.infer<typeof DecisionQueueFilterSchema>;

// =============================================================================
// SSE Events
// =============================================================================

export const SSEEventTypeSchema = z.enum([
  'decision.created',
  'decision.updated',
  'decision.resolved',
  'workflow.started',
  'workflow.step_completed',
  'workflow.completed',
  'workflow.failed',
  'workflow.paused',
  'coaching.received',
]);
export type SSEEventType = z.infer<typeof SSEEventTypeSchema>;

export const SSEEventSchema = z.object({
  id: z.string().min(1),
  type: SSEEventTypeSchema,
  data: z.unknown(),
  timestamp: ISOTimestampSchema,
  retry: z.number().int().min(0).optional(),
});
export type SSEEvent = z.infer<typeof SSEEventSchema>;

// =============================================================================
// Workflow Definition
// =============================================================================

export const WorkflowIdSchema = createPrefixedIdSchema('wf');
export const WorkflowStepIdSchema = createPrefixedIdSchema('wfs');
export const WorkflowVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const WorkflowStepTypeSchema = z.enum([
  'action',
  'condition',
  'loop',
  'parallel',
  'wait',
  'subprocess',
]);

export const OnErrorSchema = z.enum(['fail', 'continue', 'retry', 'skip']).default('fail');

export const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  initialDelayMs: z.number().int().min(100).default(1000),
  backoffMultiplier: z.number().min(1).default(2),
  maxDelayMs: z.number().int().min(100).default(60000),
});

export const StepBranchSchema = z.object({
  name: z.string().min(1),
  condition: z.string().min(1),
  steps: z.array(WorkflowStepIdSchema).min(1),
});

export const WorkflowStepSchema = z.object({
  id: WorkflowStepIdSchema,
  name: z.string().min(1),
  type: WorkflowStepTypeSchema,
  action: z.string().optional(),
  inputs: z.record(z.unknown()).optional(),
  condition: z.string().optional(),
  branches: z.array(StepBranchSchema).optional(),
  onError: OnErrorSchema,
  retryConfig: RetryConfigSchema.optional(),
  description: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  dependsOn: z.array(WorkflowStepIdSchema).optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const TriggerTypeSchema = z.enum(['manual', 'schedule', 'webhook', 'event']);

export const ScheduleConfigSchema = z.object({
  cron: z.string(),
  timezone: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const WebhookConfigSchema = z.object({
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
  filter: z.string().optional(),
});

export const EventConfigSchema = z.object({
  eventType: z.string(),
  filter: z.string().optional(),
});

export const ManualConfigSchema = z.object({
  confirmationMessage: z.string().optional(),
  promptForInputs: z.boolean().default(true),
});

export const TriggerConfigSchema = z.union([
  ScheduleConfigSchema,
  WebhookConfigSchema,
  EventConfigSchema,
  ManualConfigSchema,
]);

export const WorkflowTriggerSchema = z.object({
  type: TriggerTypeSchema,
  config: TriggerConfigSchema,
});

export const WorkflowParameterTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'array',
  'object',
]);

export const WorkflowParameterSchema = z.object({
  name: z.string().min(1),
  type: WorkflowParameterTypeSchema,
  description: z.string().optional(),
  required: z.boolean().default(true),
  defaultValue: z.unknown().optional(),
  schema: z.record(z.unknown()).optional(),
});

export namespace WorkflowDefinition {
  export const V1 = z.object({
    id: WorkflowIdSchema,
    name: z.string().min(1).max(100),
    version: WorkflowVersionSchema,
    description: z.string().optional(),
    triggers: z.array(WorkflowTriggerSchema).min(1),
    steps: z.array(WorkflowStepSchema).min(1),
    inputs: z.array(WorkflowParameterSchema).default([]),
    outputs: z.array(WorkflowParameterSchema).default([]),
    createdAt: ISOTimestampSchema,
    updatedAt: ISOTimestampSchema,
    enabled: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
    ownerId: z.string().optional(),
    organizationId: z.string().optional(),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const WorkflowDefinitionSchema = WorkflowDefinition.Latest;
export type WorkflowDefinition = WorkflowDefinition.Latest;
