import { z } from 'zod';
import { ulid } from 'ulid';
import { ISOTimestampSchema } from '../../common/timestamps.js';
import { FeatureEntitlementSchema } from './feature-entitlement.js';

// ULID regex: 26 characters, Crockford Base32
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Branded type for Humancy subscription IDs.
 */
export type HumancySubscriptionId = string & { readonly __brand: 'HumancySubscriptionId' };

/**
 * Schema for validating Humancy subscription IDs (ULID format).
 */
export const HumancySubscriptionIdSchema = z
  .string()
  .regex(ULID_REGEX, 'Invalid ULID format for HumancySubscriptionId')
  .transform((val) => val as HumancySubscriptionId);

/**
 * Generate a new Humancy subscription ID.
 */
export function generateHumancySubscriptionId(): HumancySubscriptionId {
  return ulid() as HumancySubscriptionId;
}

/**
 * Individual subscription tiers for Humancy platform.
 * Free: Basic features, limited usage
 * Pro: Advanced features, higher limits
 * Enterprise: Full features, unlimited usage, priority support
 */
export const HumancyTierSchema = z.enum(['free', 'pro', 'enterprise']);
export type HumancyTier = z.infer<typeof HumancyTierSchema>;

/**
 * Subscription status values.
 */
export const SubscriptionStatusSchema = z.enum([
  'active',      // Currently active subscription
  'trialing',    // In trial period
  'past_due',    // Payment failed, grace period
  'canceled',    // User canceled, still active until period end
  'expired',     // Subscription period ended
  'paused',      // Temporarily paused
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

/**
 * Versioned HumancySubscriptionTier schema namespace.
 *
 * Represents an individual user's subscription on the Humancy platform.
 * Humancy subscriptions are per-user with feature entitlements based on tier.
 *
 * @example
 * ```typescript
 * const subscription = HumancySubscriptionTier.Latest.parse({
 *   id: '01HQVJ5KWXYZ1234567890ABCD',
 *   tier: 'pro',
 *   userId: '01HQVJ5KWXYZ1234567890USER',
 *   status: 'active',
 *   entitlements: [
 *     { feature: 'advanced_analytics', enabled: true },
 *     { feature: 'priority_support', enabled: true },
 *   ],
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: '2024-01-15T10:30:00Z',
 *   currentPeriodStart: '2024-01-01T00:00:00Z',
 *   currentPeriodEnd: '2024-02-01T00:00:00Z',
 * });
 * ```
 */
export namespace HumancySubscriptionTier {
  /**
   * V1: Original Humancy subscription tier schema.
   * Individual user subscriptions with tier-based entitlements.
   */
  export const V1 = z.object({
    /** Unique subscription identifier (ULID) */
    id: HumancySubscriptionIdSchema,

    /** Subscription tier level */
    tier: HumancyTierSchema,

    /** User ID this subscription belongs to (ULID) */
    userId: z.string().regex(ULID_REGEX, 'Invalid ULID format for userId'),

    /** Current subscription status */
    status: SubscriptionStatusSchema,

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
    (data) => new Date(data.currentPeriodStart) < new Date(data.currentPeriodEnd),
    {
      message: 'currentPeriodStart must be before currentPeriodEnd',
      path: ['currentPeriodStart'],
    }
  ).refine(
    (data) => !data.trialEnd || data.status === 'trialing' || data.status === 'active',
    {
      message: 'trialEnd should only be set for trialing or active (post-trial) subscriptions',
      path: ['trialEnd'],
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

/** Backward-compatible alias for HumancySubscriptionTier schema */
export const HumancySubscriptionTierSchema = HumancySubscriptionTier.Latest;

/** Backward-compatible alias for HumancySubscriptionTier type */
export type HumancySubscriptionTier = HumancySubscriptionTier.Latest;

// Validation functions
export const parseHumancySubscriptionTier = (data: unknown): HumancySubscriptionTier =>
  HumancySubscriptionTierSchema.parse(data);

export const safeParseHumancySubscriptionTier = (data: unknown) =>
  HumancySubscriptionTierSchema.safeParse(data);
