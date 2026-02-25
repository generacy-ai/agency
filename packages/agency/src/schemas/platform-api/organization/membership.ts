import { z } from 'zod';
import { ISOTimestampSchema } from '../../common/timestamps.js';
import {
  MembershipIdSchema,
  OrganizationIdSchema,
  generateMembershipId,
} from '../../common/ids.js';

// Re-export MembershipId types from common/ids for convenience
export { MembershipIdSchema, generateMembershipId };
export type { MembershipId } from '../../common/ids.js';

// ULID regex for validation
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Organization member roles with hierarchical permissions.
 * - owner: Full control including billing and deletion
 * - admin: Manage members and settings, but not billing
 * - member: Standard access to organization resources
 * - viewer: Read-only access
 */
export const MemberRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

/**
 * Versioned Membership schema namespace.
 *
 * Represents a user's membership in an organization with a specific role.
 *
 * @example
 * ```typescript
 * // Use latest version
 * const membership = Membership.Latest.parse({
 *   id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   organizationId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   role: 'admin',
 *   joinedAt: '2024-01-15T10:30:00Z',
 * });
 *
 * // Use specific version
 * const v1Membership = Membership.getVersion('v1').parse(data);
 * ```
 */
export namespace Membership {
  /**
   * V1: Original membership schema.
   * Supports organization membership with roles.
   */
  export const V1 = z.object({
    /** Unique membership identifier (ULID) */
    id: MembershipIdSchema,

    /** Organization this membership belongs to */
    organizationId: OrganizationIdSchema,

    /** User ID of the member */
    userId: z.string().regex(ULID_REGEX, 'Invalid ULID format for userId'),

    /** Role of the member in the organization */
    role: MemberRoleSchema,

    /** ISO 8601 timestamp when the user joined the organization */
    joinedAt: ISOTimestampSchema,

    /** Optional display name override for this organization */
    displayName: z.string().max(100, 'Display name too long').optional(),

    /** ISO 8601 timestamp when the membership was last updated */
    updatedAt: ISOTimestampSchema.optional(),

    /** ISO 8601 timestamp when the membership was revoked (soft delete) */
    revokedAt: ISOTimestampSchema.optional(),
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

/** Backward-compatible alias for Membership schema */
export const MembershipSchema = Membership.Latest;

/** Backward-compatible alias for Membership type */
export type Membership = Membership.Latest;

// Validation functions
export const parseMembership = (data: unknown): Membership =>
  MembershipSchema.parse(data);

export const safeParseMembership = (data: unknown) =>
  MembershipSchema.safeParse(data);
