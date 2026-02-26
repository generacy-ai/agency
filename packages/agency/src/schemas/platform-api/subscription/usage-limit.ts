import { z } from 'zod';
import { ISOTimestampSchema } from '../../common/timestamps.js';
import { ResetPeriodSchema } from './feature-entitlement.js';

/**
 * Overage behavior when usage limit is exceeded.
 */
export const OverageBehaviorSchema = z.enum([
  'block',      // Block further usage until reset
  'warn',       // Allow usage but warn the user
  'charge',     // Allow usage and charge for overage
  'throttle',   // Allow usage at reduced rate/quality
]);
export type OverageBehavior = z.infer<typeof OverageBehaviorSchema>;

/**
 * Versioned UsageLimit schema namespace.
 *
 * Tracks usage against limits for metered features.
 * Supports various overage behaviors and reset schedules.
 *
 * @example
 * ```typescript
 * const usage = UsageLimit.Latest.parse({
 *   feature: 'api_calls',
 *   limit: 10000,
 *   used: 7500,
 *   resetAt: '2024-02-01T00:00:00Z',
 *   resetPeriod: 'monthly',
 *   overageBehavior: 'throttle',
 * });
 * ```
 */
export namespace UsageLimit {
  /**
   * V1: Original usage limit schema.
   * Tracks usage with configurable overage handling.
   */
  export const V1 = z.object({
    /** Feature identifier this limit applies to */
    feature: z.string().min(1, 'Feature identifier is required'),

    /** Maximum allowed usage for the period */
    limit: z.number().int().nonnegative('Limit must be non-negative'),

    /** Current usage count */
    used: z.number().int().nonnegative('Used count must be non-negative'),

    /** ISO 8601 timestamp when the counter resets */
    resetAt: ISOTimestampSchema,

    /** Reset period for the limit counter */
    resetPeriod: ResetPeriodSchema,

    /** Behavior when limit is exceeded */
    overageBehavior: OverageBehaviorSchema,
  }).refine(
    (data) => data.used <= data.limit || data.overageBehavior !== 'block',
    {
      message: 'Used count cannot exceed limit when overage behavior is block',
      path: ['used'],
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

/** Backward-compatible alias for UsageLimit schema */
export const UsageLimitSchema = UsageLimit.Latest;

/** Backward-compatible alias for UsageLimit type */
export type UsageLimit = UsageLimit.Latest;

// Validation functions
export const parseUsageLimit = (data: unknown): UsageLimit =>
  UsageLimitSchema.parse(data);

export const safeParseUsageLimit = (data: unknown) =>
  UsageLimitSchema.safeParse(data);
