import { describe, it, expect } from 'vitest';
import {
  FeatureEntitlementSchema,
  FeatureEntitlement,
  ResetPeriodSchema,
  parseFeatureEntitlement,
  safeParseFeatureEntitlement,
} from '../feature-entitlement.js';

describe('ResetPeriodSchema', () => {
  it('accepts valid reset periods', () => {
    expect(ResetPeriodSchema.safeParse('daily').success).toBe(true);
    expect(ResetPeriodSchema.safeParse('weekly').success).toBe(true);
    expect(ResetPeriodSchema.safeParse('monthly').success).toBe(true);
    expect(ResetPeriodSchema.safeParse('yearly').success).toBe(true);
    expect(ResetPeriodSchema.safeParse('never').success).toBe(true);
  });

  it('rejects invalid reset periods', () => {
    expect(ResetPeriodSchema.safeParse('hourly').success).toBe(false);
    expect(ResetPeriodSchema.safeParse('DAILY').success).toBe(false);
    expect(ResetPeriodSchema.safeParse('').success).toBe(false);
  });
});

describe('FeatureEntitlementSchema', () => {
  const validEntitlement = {
    feature: 'workflow_automation',
    enabled: true,
    limit: 100,
    resetPeriod: 'monthly',
  };

  describe('valid entitlements', () => {
    it('accepts valid entitlement with all fields', () => {
      const result = FeatureEntitlementSchema.safeParse(validEntitlement);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.feature).toBe('workflow_automation');
        expect(result.data.enabled).toBe(true);
        expect(result.data.limit).toBe(100);
        expect(result.data.resetPeriod).toBe('monthly');
      }
    });

    it('accepts entitlement without optional limit', () => {
      const entitlement = { feature: 'basic_feature', enabled: true };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(true);
    });

    it('accepts entitlement with null limit (unlimited)', () => {
      const entitlement = { feature: 'unlimited_feature', enabled: true, limit: null };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(true);
    });

    it('accepts disabled feature', () => {
      const entitlement = { feature: 'premium_feature', enabled: false };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(false);
      }
    });

    it('accepts zero limit', () => {
      const entitlement = { feature: 'metered_feature', enabled: true, limit: 0 };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid entitlements', () => {
    it('rejects empty feature identifier', () => {
      const entitlement = { ...validEntitlement, feature: '' };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(false);
    });

    it('rejects missing feature', () => {
      const entitlement = { enabled: true };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(false);
    });

    it('rejects missing enabled flag', () => {
      const entitlement = { feature: 'some_feature' };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(false);
    });

    it('rejects negative limit', () => {
      const entitlement = { ...validEntitlement, limit: -1 };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(false);
    });

    it('rejects invalid reset period', () => {
      const entitlement = { ...validEntitlement, resetPeriod: 'invalid' };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(false);
    });

    it('rejects non-integer limit', () => {
      const entitlement = { ...validEntitlement, limit: 10.5 };
      const result = FeatureEntitlementSchema.safeParse(entitlement);
      expect(result.success).toBe(false);
    });
  });

  describe('versioned namespace', () => {
    it('supports V1 schema access', () => {
      const result = FeatureEntitlement.V1.safeParse(validEntitlement);
      expect(result.success).toBe(true);
    });

    it('supports getVersion helper', () => {
      const schema = FeatureEntitlement.getVersion('v1');
      const result = schema.safeParse(validEntitlement);
      expect(result.success).toBe(true);
    });

    it('Latest points to V1', () => {
      expect(FeatureEntitlement.Latest).toBe(FeatureEntitlement.V1);
    });
  });

  describe('parse helpers', () => {
    it('parseFeatureEntitlement returns valid entitlement', () => {
      const entitlement = parseFeatureEntitlement(validEntitlement);
      expect(entitlement.feature).toBe(validEntitlement.feature);
    });

    it('parseFeatureEntitlement throws on invalid data', () => {
      expect(() => parseFeatureEntitlement({})).toThrow();
    });

    it('safeParseFeatureEntitlement returns success result', () => {
      const result = safeParseFeatureEntitlement(validEntitlement);
      expect(result.success).toBe(true);
    });

    it('safeParseFeatureEntitlement returns failure result', () => {
      const result = safeParseFeatureEntitlement({});
      expect(result.success).toBe(false);
    });
  });
});
