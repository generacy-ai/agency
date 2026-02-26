import { z } from 'zod';
import { ISOTimestampSchema } from '../common/timestamps.js';
import { createPrefixedIdSchema } from '../common/ids.js';

// =============================================================================
// Permission Scope
// =============================================================================

export const PermissionCategorySchema = z.enum([
  'repo',
  'issues',
  'pull_requests',
  'actions',
  'contents',
  'metadata',
  'administration',
  'checks',
  'deployments',
  'discussions',
  'environments',
  'members',
  'organization_hooks',
  'organization_projects',
  'pages',
  'projects',
  'security_events',
  'secrets',
  'workflows',
]);
export type PermissionCategory = z.infer<typeof PermissionCategorySchema>;

export const PermissionLevelSchema = z.enum(['read', 'write', 'admin', 'none']);
export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

export const PermissionScopeSchema = z.object({
  category: PermissionCategorySchema,
  level: PermissionLevelSchema,
});
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

export const PermissionScopeDefinitionSchema = z.object({
  scope: PermissionScopeSchema,
  description: z.string().min(1),
  required: z.boolean(),
  createdAt: ISOTimestampSchema,
  updatedAt: ISOTimestampSchema,
});
export type PermissionScopeDefinition = z.infer<typeof PermissionScopeDefinitionSchema>;

// =============================================================================
// Progressive Permission Request
// =============================================================================

export const ProgressivePermissionRequestIdSchema = createPrefixedIdSchema('ppr');

export const RequestStatusSchema = z.enum(['pending', 'approved', 'rejected', 'revoked']);
export type RequestStatus = z.infer<typeof RequestStatusSchema>;

export namespace ProgressivePermissionRequest {
  export const V1 = z.object({
    id: ProgressivePermissionRequestIdSchema,
    appId: z.string().min(1),
    requestedScopes: z.array(PermissionScopeSchema),
    rationale: z.string().optional(),
    status: RequestStatusSchema,
    createdAt: ISOTimestampSchema,
    respondedAt: ISOTimestampSchema.optional(),
    expiresAt: ISOTimestampSchema.optional(),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const ProgressivePermissionRequestSchema = ProgressivePermissionRequest.Latest;
export type ProgressivePermissionRequest = ProgressivePermissionRequest.Latest;

// =============================================================================
// Webhook Event
// =============================================================================

export const WebhookEventTypeSchema = z.enum([
  'issues.opened',
  'issues.closed',
  'issues.edited',
  'issues.labeled',
  'issues.unlabeled',
  'issues.assigned',
  'issues.unassigned',
  'pull_request.opened',
  'pull_request.closed',
  'pull_request.merged',
  'pull_request.edited',
  'pull_request.review_requested',
  'pull_request.synchronize',
  'push',
  'release.published',
  'release.created',
  'check_run.completed',
  'check_suite.completed',
  'deployment.created',
  'deployment_status.created',
  'workflow_run.completed',
  'workflow_run.requested',
  'installation.created',
  'installation.deleted',
  'installation_repositories.added',
  'installation_repositories.removed',
  'repository.created',
  'repository.deleted',
  'repository.archived',
  'member.added',
  'member.removed',
  'organization.member_added',
  'organization.member_removed',
  'create',
  'delete',
  'fork',
  'star.created',
  'star.deleted',
  'ping',
  'status',
  'commit_comment.created',
  'issue_comment.created',
]);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

export namespace WebhookEvent {
  export const V1 = z.object({
    id: z.string().min(1),
    type: WebhookEventTypeSchema,
    repository: z.string().regex(/^[^/]+\/[^/]+$/, 'Must be owner/repo format'),
    action: z.string().optional(),
    timestamp: ISOTimestampSchema,
    payload: z.record(z.unknown()),
  });

  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;

  export const VERSIONS = { v1: V1 } as const;
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

export const WebhookEventSchema = WebhookEvent.Latest;
export type WebhookEvent = WebhookEvent.Latest;
