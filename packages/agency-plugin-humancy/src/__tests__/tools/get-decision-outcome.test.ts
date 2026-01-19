/**
 * Tests for humancy.get_decision_outcome tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGetDecisionOutcomeTool } from '../../tools/get-decision-outcome.js';
import { DecisionStore } from '../../storage/index.js';
import type { DecisionRecord } from '../../types/index.js';

describe('humancy.get_decision_outcome', () => {
  let store: DecisionStore;

  const createMockRecord = (overrides: Partial<DecisionRecord> = {}): DecisionRecord => ({
    decisionId: crypto.randomUUID(),
    request: {
      question: 'Redis or Postgres?',
      options: [
        { id: 'redis', label: 'Redis' },
        { id: 'postgres', label: 'Postgres' },
      ],
      domain: ['backend'],
      timestamp: new Date(),
    },
    selectedOption: 'postgres',
    decidedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    store = new DecisionStore();
  });

  afterEach(() => {
    store.shutdown();
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      const tool = createGetDecisionOutcomeTool(store);
      expect(tool.name).toBe('humancy.get_decision_outcome');
    });

    it('should require decisionId parameter', () => {
      const tool = createGetDecisionOutcomeTool(store);
      expect(tool.inputSchema.required).toContain('decisionId');
    });
  });

  describe('execute', () => {
    it('should reject invalid decisionId format', async () => {
      const tool = createGetDecisionOutcomeTool(store);
      const result = await tool.execute({ decisionId: 'not-a-uuid' });
      expect(result.isError).toBe(true);
    });

    it('should return error for non-existent decision', async () => {
      const tool = createGetDecisionOutcomeTool(store);
      const result = await tool.execute({
        decisionId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('not found');
    });

    it('should return decision record without outcome', async () => {
      const record = createMockRecord();
      store.store(record);

      const tool = createGetDecisionOutcomeTool(store);
      const result = await tool.execute({ decisionId: record.decisionId });

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain(record.selectedOption);
      expect((result.content[0] as { text: string }).text).toContain('no outcome reported');
    });

    it('should return decision record with outcome', async () => {
      const record = createMockRecord({
        outcome: {
          result: 'success',
          details: 'It worked!',
          reportedAt: new Date(),
        },
      });
      store.store(record);

      const tool = createGetDecisionOutcomeTool(store);
      const result = await tool.execute({ decisionId: record.decisionId });

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('success');
    });

    it('should include three-layer breakdown when present', async () => {
      const record = createMockRecord({
        threeLayer: {
          baseline: {
            optionId: 'redis',
            confidence: 72,
            reasoning: ['Faster'],
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
        },
      });
      store.store(record);

      const tool = createGetDecisionOutcomeTool(store);
      const result = await tool.execute({ decisionId: record.decisionId });

      expect(result.isError).toBeFalsy();
      // The result should include three-layer data
      const content = result.content[0] as { text: string };
      expect(content.text).toBeDefined();
    });

    it('should include domain when present', async () => {
      const record = createMockRecord({
        request: {
          question: 'Test?',
          options: [{ id: 'a', label: 'A' }],
          domain: ['architecture', 'backend'],
          timestamp: new Date(),
        },
      });
      store.store(record);

      const tool = createGetDecisionOutcomeTool(store);
      const result = await tool.execute({ decisionId: record.decisionId });

      expect(result.isError).toBeFalsy();
    });
  });
});
