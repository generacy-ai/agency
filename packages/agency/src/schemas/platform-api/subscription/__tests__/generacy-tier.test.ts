import { describe, it, expect } from 'vitest';
import {
  GeneracySubscriptionTierSchema,
  GeneracySubscriptionTier,
  GeneracySubscriptionIdSchema,
  generateGeneracySubscriptionId,
  GeneracyTierSchema,
  parseGeneracySubscriptionTier,
  safeParseGeneracySubscriptionTier,
} from '../generacy-tier.js';

const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ts = '2024-01-15T10:30:00Z';

describe('GeneracySubscriptionIdSchema', () => {
  it('accepts valid ULID', () => {
    expect(GeneracySubscriptionIdSchema.safeParse(validUlid).success).toBe(true);
  });

  it('rejects invalid ULID', () => {
    expect(GeneracySubscriptionIdSchema.safeParse('bad').success).toBe(false);
  });
});

describe('generateGeneracySubscriptionId', () => {
  it('generates valid ULID', () => {
    const id = generateGeneracySubscriptionId();
    expect(GeneracySubscriptionIdSchema.safeParse(id).success).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateGeneracySubscriptionId()));
    expect(ids.size).toBe(10);
  });
});

describe('GeneracyTierSchema', () => {
  it('accepts valid tiers', () => {
    for (const tier of ['free', 'basic', 'standard', 'professional', 'enterprise']) {
      expect(GeneracyTierSchema.safeParse(tier).success).toBe(true);
    }
  });

  it('rejects invalid tier', () => {
    expect(GeneracyTierSchema.safeParse('platinum').success).toBe(false);
  });
});

describe('GeneracySubscriptionTierSchema', () => {
  const validSubscription = {
    id: validUlid,
    tier: 'standard',
    orgId: validUlid,
    status: 'active',
    seatCount: 50,
    usedSeats: 35,
    entitlements: [{ feature: 'analytics', enabled: true }],
    createdAt: ts,
    updatedAt: ts,
    currentPeriodStart: '2024-01-01T00:00:00Z',
    currentPeriodEnd: '2024-02-01T00:00:00Z',
  };

  it('parses valid subscription', () => {
    const result = GeneracySubscriptionTierSchema.safeParse(validSubscription);
    expect(result.success).toBe(true);
  });

  it('accepts optional trialEnd and canceledAt', () => {
    const result = GeneracySubscriptionTierSchema.safeParse({
      ...validSubscription,
      trialEnd: '2024-01-31T00:00:00Z',
      canceledAt: ts,
    });
    expect(result.success).toBe(true);
  });

  it('rejects usedSeats > seatCount', () => {
    const result = GeneracySubscriptionTierSchema.safeParse({
      ...validSubscription,
      usedSeats: 51,
    });
    expect(result.success).toBe(false);
  });

  it('rejects currentPeriodStart after currentPeriodEnd', () => {
    const result = GeneracySubscriptionTierSchema.safeParse({
      ...validSubscription,
      currentPeriodStart: '2024-03-01T00:00:00Z',
      currentPeriodEnd: '2024-02-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid orgId', () => {
    const result = GeneracySubscriptionTierSchema.safeParse({
      ...validSubscription,
      orgId: 'bad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative seatCount', () => {
    const result = GeneracySubscriptionTierSchema.safeParse({
      ...validSubscription,
      seatCount: -1,
    });
    expect(result.success).toBe(false);
  });

  it('allows usedSeats equal to seatCount', () => {
    const result = GeneracySubscriptionTierSchema.safeParse({
      ...validSubscription,
      seatCount: 10,
      usedSeats: 10,
    });
    expect(result.success).toBe(true);
  });
});

describe('GeneracySubscriptionTier namespace', () => {
  it('has V1 and Latest', () => {
    expect(GeneracySubscriptionTier.V1).toBeDefined();
    expect(GeneracySubscriptionTier.Latest).toBe(GeneracySubscriptionTier.V1);
  });

  it('getVersion returns V1', () => {
    expect(GeneracySubscriptionTier.getVersion('v1')).toBe(GeneracySubscriptionTier.V1);
  });
});

describe('parse helpers', () => {
  const valid = {
    id: validUlid,
    tier: 'basic',
    orgId: validUlid,
    status: 'active',
    seatCount: 5,
    usedSeats: 2,
    entitlements: [],
    createdAt: ts,
    updatedAt: ts,
    currentPeriodStart: '2024-01-01T00:00:00Z',
    currentPeriodEnd: '2024-02-01T00:00:00Z',
  };

  it('parseGeneracySubscriptionTier succeeds', () => {
    expect(() => parseGeneracySubscriptionTier(valid)).not.toThrow();
  });

  it('parseGeneracySubscriptionTier throws for invalid', () => {
    expect(() => parseGeneracySubscriptionTier({})).toThrow();
  });

  it('safeParseGeneracySubscriptionTier returns result', () => {
    expect(safeParseGeneracySubscriptionTier(valid).success).toBe(true);
    expect(safeParseGeneracySubscriptionTier({}).success).toBe(false);
  });
});
