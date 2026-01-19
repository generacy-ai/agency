/**
 * Tests for three-layer decision model schemas
 */

import { describe, it, expect } from 'vitest';
import {
  recommendationSchema,
  protegeRecommendationSchema,
  humanDecisionSchema,
  threeLayerBreakdownSchema,
} from '../../types/three-layer.js';
import {
  decisionContextSchema,
  decisionOutcomeSchema,
  decisionRecordSchema,
  tradeoffsSchema,
  storedDecisionOptionSchema,
} from '../../types/decision-record.js';

describe('Three-layer schema validation', () => {
  describe('recommendationSchema', () => {
    it('should accept valid recommendation', () => {
      const valid = {
        optionId: 'option-1',
        confidence: 85,
        reasoning: ['Fast', 'Reliable'],
      };
      expect(recommendationSchema.safeParse(valid).success).toBe(true);
    });

    it('should reject empty optionId', () => {
      const invalid = {
        optionId: '',
        confidence: 85,
        reasoning: ['Fast'],
      };
      expect(recommendationSchema.safeParse(invalid).success).toBe(false);
    });

    it('should reject confidence below 0', () => {
      const invalid = {
        optionId: 'opt',
        confidence: -1,
        reasoning: [],
      };
      expect(recommendationSchema.safeParse(invalid).success).toBe(false);
    });

    it('should reject confidence above 100', () => {
      const invalid = {
        optionId: 'opt',
        confidence: 101,
        reasoning: [],
      };
      expect(recommendationSchema.safeParse(invalid).success).toBe(false);
    });

    it('should accept confidence at boundaries', () => {
      expect(
        recommendationSchema.safeParse({
          optionId: 'opt',
          confidence: 0,
          reasoning: [],
        }).success
      ).toBe(true);

      expect(
        recommendationSchema.safeParse({
          optionId: 'opt',
          confidence: 100,
          reasoning: [],
        }).success
      ).toBe(true);
    });
  });

  describe('protegeRecommendationSchema', () => {
    it('should accept valid protégé recommendation', () => {
      const valid = {
        optionId: 'option-1',
        confidence: 90,
        reasoning: ['Matches constraints'],
        appliedPrinciples: ['prefer-fewer-services'],
      };
      expect(protegeRecommendationSchema.safeParse(valid).success).toBe(true);
    });

    it('should require appliedPrinciples', () => {
      const invalid = {
        optionId: 'option-1',
        confidence: 90,
        reasoning: ['Fast'],
      };
      expect(protegeRecommendationSchema.safeParse(invalid).success).toBe(false);
    });

    it('should accept empty appliedPrinciples array', () => {
      const valid = {
        optionId: 'option-1',
        confidence: 90,
        reasoning: [],
        appliedPrinciples: [],
      };
      expect(protegeRecommendationSchema.safeParse(valid).success).toBe(true);
    });
  });

  describe('humanDecisionSchema', () => {
    it('should accept valid human decision', () => {
      const valid = {
        optionId: 'option-2',
        matchedProtege: true,
        coaching: null,
      };
      expect(humanDecisionSchema.safeParse(valid).success).toBe(true);
    });

    it('should accept coaching when not matching protégé', () => {
      const valid = {
        optionId: 'option-1',
        matchedProtege: false,
        coaching: 'I prefer the other option because...',
      };
      expect(humanDecisionSchema.safeParse(valid).success).toBe(true);
    });

    it('should require coaching to be string or null', () => {
      const invalid = {
        optionId: 'option-1',
        matchedProtege: false,
        coaching: 123,
      };
      expect(humanDecisionSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('threeLayerBreakdownSchema', () => {
    it('should accept complete three-layer breakdown', () => {
      const valid = {
        baseline: {
          optionId: 'redis',
          confidence: 72,
          reasoning: ['Faster for sessions'],
        },
        protege: {
          optionId: 'postgres',
          confidence: 85,
          reasoning: ['Matches constraint'],
          appliedPrinciples: ['prefer-fewer-services'],
        },
        human: {
          optionId: 'postgres',
          matchedProtege: true,
          coaching: null,
        },
      };
      expect(threeLayerBreakdownSchema.safeParse(valid).success).toBe(true);
    });

    it('should reject missing baseline', () => {
      const invalid = {
        protege: {
          optionId: 'postgres',
          confidence: 85,
          reasoning: [],
          appliedPrinciples: [],
        },
        human: {
          optionId: 'postgres',
          matchedProtege: true,
          coaching: null,
        },
      };
      expect(threeLayerBreakdownSchema.safeParse(invalid).success).toBe(false);
    });
  });
});

describe('Decision record schema validation', () => {
  describe('tradeoffsSchema', () => {
    it('should accept valid tradeoffs', () => {
      const valid = {
        pros: ['Fast', 'Built-in TTL'],
        cons: ['Another service to manage'],
      };
      expect(tradeoffsSchema.safeParse(valid).success).toBe(true);
    });

    it('should accept empty arrays', () => {
      const valid = {
        pros: [],
        cons: [],
      };
      expect(tradeoffsSchema.safeParse(valid).success).toBe(true);
    });

    it('should reject non-string items', () => {
      const invalid = {
        pros: [123],
        cons: ['valid'],
      };
      expect(tradeoffsSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('storedDecisionOptionSchema', () => {
    it('should accept option with tradeoffs', () => {
      const valid = {
        id: 'redis',
        label: 'Redis',
        description: 'In-memory cache',
        tradeoffs: {
          pros: ['Fast'],
          cons: ['More infra'],
        },
      };
      expect(storedDecisionOptionSchema.safeParse(valid).success).toBe(true);
    });

    it('should accept option without tradeoffs', () => {
      const valid = {
        id: 'postgres',
        label: 'Postgres',
      };
      expect(storedDecisionOptionSchema.safeParse(valid).success).toBe(true);
    });
  });

  describe('decisionContextSchema', () => {
    it('should accept valid context', () => {
      const valid = {
        projectConstraints: ['prefer-fewer-services'],
        relatedIssue: '#142',
      };
      expect(decisionContextSchema.safeParse(valid).success).toBe(true);
    });

    it('should allow additional fields', () => {
      const valid = {
        projectConstraints: [],
        customField: 'custom value',
        nestedData: { foo: 'bar' },
      };
      const result = decisionContextSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data['customField']).toBe('custom value');
      }
    });
  });

  describe('decisionOutcomeSchema', () => {
    it('should accept valid outcome', () => {
      const valid = {
        result: 'success',
        details: 'Everything worked',
        reportedAt: new Date(),
      };
      expect(decisionOutcomeSchema.safeParse(valid).success).toBe(true);
    });

    it('should accept all result types', () => {
      const results = ['success', 'failure', 'mixed'];
      for (const result of results) {
        expect(
          decisionOutcomeSchema.safeParse({
            result,
            reportedAt: new Date(),
          }).success
        ).toBe(true);
      }
    });

    it('should reject invalid result', () => {
      const invalid = {
        result: 'partial',
        reportedAt: new Date(),
      };
      expect(decisionOutcomeSchema.safeParse(invalid).success).toBe(false);
    });

    it('should validate quality range', () => {
      expect(
        decisionOutcomeSchema.safeParse({
          result: 'success',
          reportedAt: new Date(),
          quality: -1,
        }).success
      ).toBe(false);

      expect(
        decisionOutcomeSchema.safeParse({
          result: 'success',
          reportedAt: new Date(),
          quality: 101,
        }).success
      ).toBe(false);

      expect(
        decisionOutcomeSchema.safeParse({
          result: 'success',
          reportedAt: new Date(),
          quality: 75,
        }).success
      ).toBe(true);
    });
  });

  describe('decisionRecordSchema', () => {
    it('should accept complete decision record', () => {
      const valid = {
        decisionId: '550e8400-e29b-41d4-a716-446655440000',
        request: {
          question: 'Redis or Postgres?',
          options: [
            { id: 'redis', label: 'Redis' },
            { id: 'postgres', label: 'Postgres' },
          ],
          domain: ['backend', 'architecture'],
          timestamp: new Date(),
        },
        selectedOption: 'postgres',
        decidedAt: new Date(),
      };
      expect(decisionRecordSchema.safeParse(valid).success).toBe(true);
    });

    it('should require valid UUID for decisionId', () => {
      const invalid = {
        decisionId: 'not-a-uuid',
        request: {
          question: 'Test?',
          options: [{ id: 'a', label: 'A' }],
          timestamp: new Date(),
        },
        selectedOption: 'a',
        decidedAt: new Date(),
      };
      expect(decisionRecordSchema.safeParse(invalid).success).toBe(false);
    });
  });
});
