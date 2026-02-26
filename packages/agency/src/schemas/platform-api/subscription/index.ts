// Platform API Subscription Schemas
// Re-exports all subscription-related schemas

// Feature Entitlement
export {
  FeatureEntitlement,
  FeatureEntitlementSchema,
  type FeatureEntitlement as FeatureEntitlementType,
  ResetPeriodSchema,
  type ResetPeriod,
  parseFeatureEntitlement,
  safeParseFeatureEntitlement,
} from './feature-entitlement.js';

// Usage Limit
export {
  UsageLimit,
  UsageLimitSchema,
  type UsageLimit as UsageLimitType,
  OverageBehaviorSchema,
  type OverageBehavior,
  parseUsageLimit,
  safeParseUsageLimit,
} from './usage-limit.js';

// Humancy Subscription Tier (Individual)
export {
  HumancySubscriptionTier,
  HumancySubscriptionTierSchema,
  type HumancySubscriptionTier as HumancySubscriptionTierType,
  HumancySubscriptionIdSchema,
  type HumancySubscriptionId,
  generateHumancySubscriptionId,
  HumancyTierSchema,
  type HumancyTier,
  SubscriptionStatusSchema,
  type SubscriptionStatus,
  parseHumancySubscriptionTier,
  safeParseHumancySubscriptionTier,
} from './humancy-tier.js';

// Generacy Subscription Tier (Organization)
export {
  GeneracySubscriptionTier,
  GeneracySubscriptionTierSchema,
  type GeneracySubscriptionTier as GeneracySubscriptionTierType,
  GeneracySubscriptionIdSchema,
  type GeneracySubscriptionId,
  generateGeneracySubscriptionId,
  GeneracyTierSchema,
  type GeneracyTier,
  parseGeneracySubscriptionTier,
  safeParseGeneracySubscriptionTier,
} from './generacy-tier.js';
