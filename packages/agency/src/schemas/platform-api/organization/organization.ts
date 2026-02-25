import { z } from 'zod';
import { ISOTimestampSchema } from '../../common/timestamps.js';
import { OrganizationIdSchema, generateOrganizationId } from '../../common/ids.js';

// Re-export OrganizationId types from common/ids for convenience
export { OrganizationIdSchema, generateOrganizationId };
export type { OrganizationId } from '../../common/ids.js';

// ULID regex for validation
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Organization slug validation.
 * Slugs must be lowercase alphanumeric with hyphens, 3-50 characters.
 * Cannot start or end with a hyphen, and cannot have consecutive hyphens.
 */
export const OrganizationSlugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(50, 'Slug must not exceed 50 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must be lowercase alphanumeric with single hyphens (no leading/trailing/consecutive hyphens)'
  );

export type OrganizationSlug = z.infer<typeof OrganizationSlugSchema>;

/**
 * Subscription tier reference for organizations.
 * Mirrors the Generacy subscription tiers from the subscription schemas.
 */
export const OrganizationSubscriptionTierSchema = z.enum([
  'starter',
  'team',
  'enterprise',
]);
export type OrganizationSubscriptionTier = z.infer<typeof OrganizationSubscriptionTierSchema>;

/**
 * Versioned Organization schema namespace.
 *
 * Represents an organization entity with membership and subscription management.
 *
 * @example
 * ```typescript
 * // Use latest version
 * const org = Organization.Latest.parse({
 *   id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   name: 'Acme Corporation',
 *   slug: 'acme-corp',
 *   ownerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   subscriptionTier: 'team',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: '2024-01-15T10:30:00Z',
 * });
 *
 * // Use specific version
 * const v1Org = Organization.getVersion('v1').parse(data);
 * ```
 */
export namespace Organization {
  /**
   * V1: Original organization schema.
   * Supports organization management with subscription tiers.
   */
  export const V1 = z.object({
    /** Unique organization identifier (ULID) */
    id: OrganizationIdSchema,

    /** Display name of the organization */
    name: z.string().min(1, 'Organization name is required').max(100, 'Name too long'),

    /** URL-friendly unique identifier for the organization */
    slug: OrganizationSlugSchema,

    /** User ID of the organization owner */
    ownerId: z.string().regex(ULID_REGEX, 'Invalid ULID format for ownerId'),

    /** Current subscription tier */
    subscriptionTier: OrganizationSubscriptionTierSchema,

    /** Optional description of the organization */
    description: z.string().max(500, 'Description too long').optional(),

    /** Optional avatar URL */
    avatarUrl: z.string().url('Invalid avatar URL').optional(),

    /** ISO 8601 timestamp when the organization was created */
    createdAt: ISOTimestampSchema,

    /** ISO 8601 timestamp when the organization was last updated */
    updatedAt: ISOTimestampSchema,

    /** ISO 8601 timestamp when the organization was archived (soft delete) */
    archivedAt: ISOTimestampSchema.optional(),
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

/** Backward-compatible alias for Organization schema */
export const OrganizationSchema = Organization.Latest;

/** Backward-compatible alias for Organization type */
export type Organization = Organization.Latest;

// Validation functions
export const parseOrganization = (data: unknown): Organization =>
  OrganizationSchema.parse(data);

export const safeParseOrganization = (data: unknown) =>
  OrganizationSchema.safeParse(data);
