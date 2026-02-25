import { z } from 'zod';
import { ulid } from 'ulid';
import { ISOTimestampSchema } from '../../common/timestamps.js';
import { FeatureEntitlementSchema } from './feature-entitlement.js';
import { SubscriptionStatusSchema } from './humancy-tier.js';

// ULID regex: 26 characters, Crockford Base32
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Branded type for Generacy subscription IDs.
 */
export type GeneracySubscriptionId = string & { readonly __brand: 'GeneracySubscriptionId' };

/**
 * Schema for validating Generacy subscription IDs (ULID format).
 */
export const GeneracySubscriptionIdSchema = z
  .string()
  .regex(ULID_REGEX, 'Invalid ULID format for GeneracySubscriptionId')
  .transform((val) => val as GeneracySubscriptionId);

/**
 * Generate a new Generacy subscription ID.
 */
export function generateGeneracySubscriptionId(): GeneracySubscriptionId {
  return ulid() as GeneracySubscriptionId;
}

/**
 * Organization subscription tiers for Generacy platform.
 * Starter: Small teams, basic features
 * Team: Growing teams, advanced collaboration
 * Enterprise: Large organizations, full features, SLA
 */
export const GeneracyTierSchema = z.enum(['starter', 'team', 'enterprise']);
export type GeneracyTier = z.infer<typeof GeneracyTierSchema>;

/**
 * Versioned GeneracySubscriptionTier schema namespace.
 *
 * Represents an organization's subscription on the Generacy platform.
 * Generacy subscriptions are per-organization with seat-based licensing.
 *
 * @example
 * ```typescript
 * const subscription = GeneracySubscriptionTier.Latest.parse({
 *   id: '01HQVJ5KWXYZ1234567890ABCD',
 *   tier: 'team',
 *   orgId: '01HQVJ5KWXYZ1234567890ORGG',
 *   status: 'active',
 *   seatCount: 50,
 *   usedSeats: 35,
 *   entitlements: [
 *     { feature: 'workflow_automation', enabled: true, limit: 100 },
 *     { feature: 'advanced_analytics', enabled: true },
 *   ],
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: '2024-01-15T10:30:00Z',
 *   currentPeriodStart: '2024-01-01T00:00:00Z',
 *   currentPeriodEnd: '2024-02-01T00:00:00Z',
 * });
 * ```
 */
export namespace GeneracySubscriptionTier {
  /**
   * V1: Original Generacy subscription tier schema.
   * Organization subscriptions with seat-based licensing.
   */
  export const V1 = z.object({
    /** Unique subscription identifier (ULID) */
    id: GeneracySubscriptionIdSchema,

    /** Subscription tier level */
    tier: GeneracyTierSchema,

    /** Organization ID this subscription belongs to (ULID) */
    orgId: z.string().regex(ULID_REGEX, 'Invalid ULID format for orgId'),

    /** Current subscription status */
    status: SubscriptionStatusSchema,

    /** Total number of seats purchased */
    seatCount: z.number().int().positive('Seat count must be positive'),

    /** Number of seats currently in use */
    usedSeats: z.number().int().nonnegative('Used seats must be non-negative'),

    /** Feature entitlements for this subscription */
    entitlements: z.array(FeatureEntitlementSchema),

    /** ISO 8601 timestamp when subscription was created */
    createdAt: ISOTimestampSchema,

    /** ISO 8601 timestamp when subscription was last updated */
    updatedAt: ISOTimestampSchema,

    /** ISO 8601 timestamp when current billing period started */
    currentPeriodStart: ISOTimestampSchema,

    /** ISO 8601 timestamp when current billing period ends */
    currentPeriodEnd: ISOTimestampSchema,

    /** ISO 8601 timestamp when trial ends (if trialing) */
    trialEnd: ISOTimestampSchema.optional(),

    /** ISO 8601 timestamp when subscription was canceled (if canceled) */
    canceledAt: ISOTimestampSchema.optional(),
  }).refine(
    (data) => data.usedSeats <= data.seatCount,
    {
      message: 'Used seats cannot exceed seat count',
      path: ['usedSeats'],
    }
  ).refine(
    (data) => new Date(data.currentPeriodStart) < new Date(data.currentPeriodEnd),
    {
      message: 'currentPeriodStart must be before currentPeriodEnd',
      path: ['currentPeriodStart'],
    }
  );

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

/** Backward-compatible alias for GeneracySubscriptionTier schema */
export const GeneracySubscriptionTierSchema = GeneracySubscriptionTier.Latest;

/** Backward-compatible alias for GeneracySubscriptionTier type */
export type GeneracySubscriptionTier = GeneracySubscriptionTier.Latest;

// Validation functions
export const parseGeneracySubscriptionTier = (data: unknown): GeneracySubscriptionTier =>
  GeneracySubscriptionTierSchema.parse(data);

export const safeParseGeneracySubscriptionTier = (data: unknown) =>
  GeneracySubscriptionTierSchema.safeParse(data);
