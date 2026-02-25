import { z } from 'zod';
import { ISOTimestampSchema } from '../../common/timestamps.js';
import { InviteIdSchema, OrganizationIdSchema, generateInviteId } from '../../common/ids.js';
import { MemberRoleSchema } from './membership.js';

// Re-export InviteId types from common/ids for convenience
export { InviteIdSchema, generateInviteId };
export type { InviteId } from '../../common/ids.js';

// ULID regex for validation
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Invite status tracking.
 * - pending: Invite sent, awaiting response
 * - accepted: Invite accepted, membership created
 * - expired: Invite expired before acceptance
 * - revoked: Invite manually revoked by admin
 */
export const InviteStatusSchema = z.enum(['pending', 'accepted', 'expired', 'revoked']);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

/**
 * Versioned Invite schema namespace.
 *
 * Represents an invitation to join an organization.
 *
 * @example
 * ```typescript
 * // Use latest version
 * const invite = Invite.Latest.parse({
 *   id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   organizationId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   email: 'user@example.com',
 *   role: 'member',
 *   status: 'pending',
 *   invitedById: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   expiresAt: '2024-01-22T10:30:00Z',
 * });
 *
 * // Use specific version
 * const v1Invite = Invite.getVersion('v1').parse(data);
 * ```
 */
export namespace Invite {
  /**
   * V1: Original invite schema.
   * Supports organization invitations with role assignment.
   */
  export const V1 = z.object({
    /** Unique invite identifier (ULID) */
    id: InviteIdSchema,

    /** Organization this invite is for */
    organizationId: OrganizationIdSchema,

    /** Email address of the invitee */
    email: z.string().email('Invalid email address'),

    /** Role the invitee will have upon acceptance */
    role: MemberRoleSchema,

    /** Current status of the invite */
    status: InviteStatusSchema,

    /** User ID of the person who sent the invite */
    invitedById: z.string().regex(ULID_REGEX, 'Invalid ULID format for invitedById'),

    /** Optional personal message included with the invite */
    message: z.string().max(500, 'Message too long').optional(),

    /** ISO 8601 timestamp when the invite was created */
    createdAt: ISOTimestampSchema,

    /** ISO 8601 timestamp when the invite expires */
    expiresAt: ISOTimestampSchema,

    /** ISO 8601 timestamp when the invite was accepted */
    acceptedAt: ISOTimestampSchema.optional(),

    /** ISO 8601 timestamp when the invite was revoked */
    revokedAt: ISOTimestampSchema.optional(),

    /** User ID of the person who accepted the invite (may differ from email owner) */
    acceptedById: z.string().regex(ULID_REGEX, 'Invalid ULID format for acceptedById').optional(),
  });

  /** Type inference for V1 schema */
  export type V1 = z.infer<typeof V1>;

  /** Latest stable schema - always point to the newest version */
  export const Latest = V1;

  /** Type inference for latest schema */
  export type Latest = V1;

  /**
   * Version registry mapping version keys to their schemas.
   * Use this with getVersion() for dynamic version selection.
   */
  export const VERSIONS = {
    v1: V1,
  } as const;

  /**
   * Get the schema for a specific version.
   * @param version - Version key (e.g., 'v1')
   * @returns The schema for that version
   */
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

/** Backward-compatible alias for Invite schema */
export const InviteSchema = Invite.Latest;

/** Backward-compatible alias for Invite type */
export type Invite = Invite.Latest;

// Validation functions
export const parseInvite = (data: unknown): Invite => InviteSchema.parse(data);

export const safeParseInvite = (data: unknown) => InviteSchema.safeParse(data);
