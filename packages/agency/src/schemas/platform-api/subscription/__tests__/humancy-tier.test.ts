import { describe, it, expect } from 'vitest';
import {
  HumancySubscriptionTierSchema,
  HumancySubscriptionTier,
  HumancyTierSchema,
  SubscriptionStatusSchema,
  HumancySubscriptionIdSchema,
  generateHumancySubscriptionId,
  parseHumancySubscriptionTier,
  safeParseHumancySubscriptionTier,
} from '../humancy-tier.js';

describe('HumancyTierSchema', () => {
  it('accepts valid tier values', () => {
    expect(HumancyTierSchema.safeParse('free').success).toBe(true);
    expect(HumancyTierSchema.safeParse('pro').success).toBe(true);
    expect(HumancyTierSchema.safeParse('enterprise').success).toBe(true);
  });

  it('rejects invalid tier values', () => {
    expect(HumancyTierSchema.safeParse('starter').success).toBe(false);
    expect(HumancyTierSchema.safeParse('team').success).toBe(false);
    expect(HumancyTierSchema.safeParse('FREE').success).toBe(false);
    expect(HumancyTierSchema.safeParse('').success).toBe(false);
  });
});

describe('SubscriptionStatusSchema', () => {
  it('accepts valid status values', () => {
    expect(SubscriptionStatusSchema.safeParse('active').success).toBe(true);
    expect(SubscriptionStatusSchema.safeParse('trialing').success).toBe(true);
    expect(SubscriptionStatusSchema.safeParse('past_due').success).toBe(true);
    expect(SubscriptionStatusSchema.safeParse('canceled').success).toBe(true);
    expect(SubscriptionStatusSchema.safeParse('expired').success).toBe(true);
    expect(SubscriptionStatusSchema.safeParse('paused').success).toBe(true);
  });

  it('rejects invalid status values', () => {
    expect(SubscriptionStatusSchema.safeParse('pending').success).toBe(false);
    expect(SubscriptionStatusSchema.safeParse('ACTIVE').success).toBe(false);
    expect(SubscriptionStatusSchema.safeParse('').success).toBe(false);
  });
});

describe('HumancySubscriptionIdSchema', () => {
  it('accepts valid ULID format', () => {
    const validId = '01KFH56GVE2NZA62CKMTEVX4JE';
    const result = HumancySubscriptionIdSchema.safeParse(validId);
    expect(result.success).toBe(true);
  });

  it('rejects invalid ULID format', () => {
    expect(HumancySubscriptionIdSchema.safeParse('invalid-id').success).toBe(false);
    expect(HumancySubscriptionIdSchema.safeParse('123').success).toBe(false);
    expect(HumancySubscriptionIdSchema.safeParse('').success).toBe(false);
  });
});

describe('generateHumancySubscriptionId', () => {
  it('generates valid ULID', () => {
    const id = generateHumancySubscriptionId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('generates unique IDs', () => {
    const id1 = generateHumancySubscriptionId();
    const id2 = generateHumancySubscriptionId();
    expect(id1).not.toBe(id2);
  });
});

describe('HumancySubscriptionTierSchema', () => {
  const validSubscription = {
    id: '01KFH56GVE2NZA62CKMTEVX4JE',
    tier: 'pro',
    userId: '01KFH56GVK0BC25SB67GE4229S',
    status: 'active',
    entitlements: [
      { feature: 'advanced_analytics', enabled: true },
      { feature: 'priority_support', enabled: true },
    ],
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    currentPeriodStart: '2024-01-01T00:00:00Z',
    currentPeriodEnd: '2024-02-01T00:00:00Z',
  };

  describe('valid subscriptions', () => {
    it('accepts valid subscription with all required fields', () => {
      const result = HumancySubscriptionTierSchema.safeParse(validSubscription);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tier).toBe('pro');
        expect(result.data.status).toBe('active');
        expect(result.data.entitlements).toHaveLength(2);
      }
    });

    it('accepts free tier subscription', () => {
      const subscription = { ...validSubscription, tier: 'free' };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(true);
    });

    it('accepts enterprise tier subscription', () => {
      const subscription = { ...validSubscription, tier: 'enterprise' };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(true);
    });

    it('accepts subscription with trial end', () => {
      const subscription = {
        ...validSubscription,
        status: 'trialing',
        trialEnd: '2024-01-31T00:00:00Z',
      };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(true);
    });

    it('accepts subscription with canceled at', () => {
      const subscription = {
        ...validSubscription,
        status: 'canceled',
        canceledAt: '2024-01-20T10:00:00Z',
      };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(true);
    });

    it('accepts active subscription after trial with trialEnd set', () => {
      const subscription = {
        ...validSubscription,
        status: 'active',
        trialEnd: '2024-01-14T00:00:00Z',
      };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(true);
    });

    it('accepts empty entitlements array', () => {
      const subscription = { ...validSubscription, entitlements: [] };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(true);
    });

    it('accepts all valid statuses', () => {
      const statuses = ['active', 'trialing', 'past_due', 'canceled', 'expired', 'paused'];
      for (const status of statuses) {
        // Remove trialEnd for non-trial statuses that would violate the refinement
        const subscription = {
          ...validSubscription,
          status,
        };
        const result = HumancySubscriptionTierSchema.safeParse(subscription);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('invalid subscriptions', () => {
    it('rejects invalid subscription ID format', () => {
      const subscription = { ...validSubscription, id: 'invalid-id' };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(false);
    });

    it('rejects invalid user ID format', () => {
      const subscription = { ...validSubscription, userId: 'invalid-user-id' };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(false);
    });

    it('rejects invalid tier value', () => {
      const subscription = { ...validSubscription, tier: 'starter' };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(false);
    });

    it('rejects invalid status value', () => {
      const subscription = { ...validSubscription, status: 'pending' };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(false);
    });

    it('rejects period start after period end', () => {
      const subscription = {
        ...validSubscription,
        currentPeriodStart: '2024-03-01T00:00:00Z',
        currentPeriodEnd: '2024-02-01T00:00:00Z',
      };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(false);
    });

    it('rejects invalid timestamp format', () => {
      const subscription = { ...validSubscription, createdAt: '2024-01-15' };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(false);
    });

    it('rejects invalid entitlement in array', () => {
      const subscription = {
        ...validSubscription,
        entitlements: [{ feature: '', enabled: true }],
      };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
      expect(HumancySubscriptionTierSchema.safeParse({}).success).toBe(false);
      expect(HumancySubscriptionTierSchema.safeParse({ id: validSubscription.id }).success).toBe(
        false
      );
    });

    it('rejects trialEnd for incompatible statuses', () => {
      const subscription = {
        ...validSubscription,
        status: 'expired',
        trialEnd: '2024-01-31T00:00:00Z',
      };
      const result = HumancySubscriptionTierSchema.safeParse(subscription);
      expect(result.success).toBe(false);
    });
  });

  describe('versioned namespace', () => {
    it('supports V1 schema access', () => {
      const result = HumancySubscriptionTier.V1.safeParse(validSubscription);
      expect(result.success).toBe(true);
    });

    it('supports getVersion helper', () => {
      const schema = HumancySubscriptionTier.getVersion('v1');
      const result = schema.safeParse(validSubscription);
      expect(result.success).toBe(true);
    });

    it('Latest points to V1', () => {
      expect(HumancySubscriptionTier.Latest).toBe(HumancySubscriptionTier.V1);
    });
  });

  describe('parse helpers', () => {
    it('parseHumancySubscriptionTier returns valid subscription', () => {
      const subscription = parseHumancySubscriptionTier(validSubscription);
      expect(subscription.tier).toBe(validSubscription.tier);
    });

    it('parseHumancySubscriptionTier throws on invalid data', () => {
      expect(() => parseHumancySubscriptionTier({})).toThrow();
    });

    it('safeParseHumancySubscriptionTier returns success result', () => {
      const result = safeParseHumancySubscriptionTier(validSubscription);
      expect(result.success).toBe(true);
    });

    it('safeParseHumancySubscriptionTier returns failure result', () => {
      const result = safeParseHumancySubscriptionTier({});
      expect(result.success).toBe(false);
    });
  });
});
