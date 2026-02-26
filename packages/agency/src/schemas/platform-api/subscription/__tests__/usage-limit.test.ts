import { describe, it, expect } from 'vitest';
import {
  UsageLimitSchema,
  UsageLimit,
  OverageBehaviorSchema,
  parseUsageLimit,
  safeParseUsageLimit,
} from '../usage-limit.js';

const ts = '2024-02-01T00:00:00Z';

describe('OverageBehaviorSchema', () => {
  it('accepts valid behaviors', () => {
    for (const b of ['block', 'warn', 'charge', 'throttle']) {
      expect(OverageBehaviorSchema.safeParse(b).success).toBe(true);
    }
  });

  it('rejects invalid behavior', () => {
    expect(OverageBehaviorSchema.safeParse('ignore').success).toBe(false);
  });
});

describe('UsageLimitSchema', () => {
  const validUsage = {
    feature: 'api_calls',
    limit: 10000,
    used: 7500,
    resetAt: ts,
    resetPeriod: 'monthly',
    overageBehavior: 'throttle',
  };

  it('parses valid usage limit', () => {
    const result = UsageLimitSchema.safeParse(validUsage);
    expect(result.success).toBe(true);
  });

  it('accepts all overage behaviors', () => {
    for (const behavior of ['block', 'warn', 'charge', 'throttle']) {
      const result = UsageLimitSchema.safeParse({
        ...validUsage,
        overageBehavior: behavior,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects used > limit when overageBehavior is block', () => {
    const result = UsageLimitSchema.safeParse({
      ...validUsage,
      used: 10001,
      overageBehavior: 'block',
    });
    expect(result.success).toBe(false);
  });

  it('allows used > limit when overageBehavior is not block', () => {
    for (const behavior of ['warn', 'charge', 'throttle']) {
      const result = UsageLimitSchema.safeParse({
        ...validUsage,
        used: 10001,
        overageBehavior: behavior,
      });
      expect(result.success).toBe(true);
    }
  });

  it('allows used == limit with block', () => {
    const result = UsageLimitSchema.safeParse({
      ...validUsage,
      used: 10000,
      overageBehavior: 'block',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing feature', () => {
    const { feature, ...noFeature } = validUsage;
    expect(UsageLimitSchema.safeParse(noFeature).success).toBe(false);
  });

  it('rejects empty feature string', () => {
    expect(UsageLimitSchema.safeParse({ ...validUsage, feature: '' }).success).toBe(false);
  });

  it('rejects negative limit', () => {
    expect(UsageLimitSchema.safeParse({ ...validUsage, limit: -1 }).success).toBe(false);
  });

  it('rejects negative used', () => {
    expect(UsageLimitSchema.safeParse({ ...validUsage, used: -1 }).success).toBe(false);
  });

  it('accepts zero usage', () => {
    const result = UsageLimitSchema.safeParse({ ...validUsage, used: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts all reset periods', () => {
    for (const period of ['daily', 'weekly', 'monthly', 'yearly', 'never']) {
      const result = UsageLimitSchema.safeParse({
        ...validUsage,
        resetPeriod: period,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('UsageLimit namespace', () => {
  it('has V1 and Latest', () => {
    expect(UsageLimit.V1).toBeDefined();
    expect(UsageLimit.Latest).toBe(UsageLimit.V1);
  });

  it('getVersion returns V1', () => {
    expect(UsageLimit.getVersion('v1')).toBe(UsageLimit.V1);
  });
});

describe('parse helpers', () => {
  const valid = {
    feature: 'api_calls',
    limit: 100,
    used: 50,
    resetAt: ts,
    resetPeriod: 'monthly',
    overageBehavior: 'warn',
  };

  it('parseUsageLimit succeeds', () => {
    expect(() => parseUsageLimit(valid)).not.toThrow();
  });

  it('parseUsageLimit throws for invalid', () => {
    expect(() => parseUsageLimit({})).toThrow();
  });

  it('safeParseUsageLimit returns result', () => {
    expect(safeParseUsageLimit(valid).success).toBe(true);
    expect(safeParseUsageLimit({}).success).toBe(false);
  });
});
