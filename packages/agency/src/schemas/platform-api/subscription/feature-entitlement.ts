import { z } from 'zod';

/**
 * Reset period for feature entitlements and usage limits.
 */
export const ResetPeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'yearly', 'never']);
export type ResetPeriod = z.infer<typeof ResetPeriodSchema>;

/**
 * Versioned FeatureEntitlement schema namespace.
 *
 * Defines feature access permissions within a subscription tier.
 * Features can be enabled/disabled with optional usage limits.
 *
 * @example
 * ```typescript
 * const entitlement = FeatureEntitlement.Latest.parse({
 *   feature: 'workflow_automation',
 *   enabled: true,
 *   limit: 100,
 *   resetPeriod: 'monthly',
 * });
 * ```
 */
export namespace FeatureEntitlement {
  /**
   * V1: Original feature entitlement schema.
   * Supports feature flags with optional limits and reset periods.
   */
  export const V1 = z.object({
    /** Feature identifier (e.g., 'workflow_automation', 'advanced_analytics') */
    feature: z.string().min(1, 'Feature identifier is required'),

    /** Whether the feature is enabled for this tier */
    enabled: z.boolean(),

    /** Optional usage limit (null means unlimited when enabled) */
    limit: z.number().int().nonnegative().nullable().optional(),

    /** Reset period for the limit counter */
    resetPeriod: ResetPeriodSchema.optional(),
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

/** Backward-compatible alias for FeatureEntitlement schema */
export const FeatureEntitlementSchema = FeatureEntitlement.Latest;

/** Backward-compatible alias for FeatureEntitlement type */
export type FeatureEntitlement = FeatureEntitlement.Latest;

// Validation functions
export const parseFeatureEntitlement = (data: unknown): FeatureEntitlement =>
  FeatureEntitlementSchema.parse(data);

export const safeParseFeatureEntitlement = (data: unknown) =>
  FeatureEntitlementSchema.safeParse(data);
