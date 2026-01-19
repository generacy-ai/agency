/**
 * Tests for humancy.report_decision_result tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReportDecisionResultTool } from '../../tools/report-decision-result.js';
import { DecisionStore } from '../../storage/index.js';
import type { DecisionRecord } from '../../types/index.js';

describe('humancy.report_decision_result', () => {
  let store: DecisionStore;

  const createMockRecord = (overrides: Partial<DecisionRecord> = {}): DecisionRecord => ({
    decisionId: crypto.randomUUID(),
    request: {
      question: 'Redis or Postgres?',
      options: [
        { id: 'redis', label: 'Redis' },
        { id: 'postgres', label: 'Postgres' },
      ],
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
      const tool = createReportDecisionResultTool(store);
      expect(tool.name).toBe('humancy.report_decision_result');
    });

    it('should require decisionId and outcome parameters', () => {
      const tool = createReportDecisionResultTool(store);
      expect(tool.inputSchema.required).toContain('decisionId');
      expect(tool.inputSchema.required).toContain('outcome');
    });
  });

  describe('execute', () => {
    it('should reject invalid decisionId format', async () => {
      const tool = createReportDecisionResultTool(store);
      const result = await tool.execute({
        decisionId: 'not-a-uuid',
        outcome: 'success',
      });
      expect(result.isError).toBe(true);
    });

    it('should reject invalid outcome value', async () => {
      const tool = createReportDecisionResultTool(store);
      const result = await tool.execute({
        decisionId: crypto.randomUUID(),
        outcome: 'partial', // invalid
      });
      expect(result.isError).toBe(true);
    });

    it('should return error for non-existent decision', async () => {
      const tool = createReportDecisionResultTool(store);
      const result = await tool.execute({
        decisionId: '550e8400-e29b-41d4-a716-446655440000',
        outcome: 'success',
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('not found');
    });

    it('should report success outcome', async () => {
      const record = createMockRecord();
      store.store(record);

      const tool = createReportDecisionResultTool(store);
      const result = await tool.execute({
        decisionId: record.decisionId,
        outcome: 'success',
        details: 'Everything worked great!',
      });

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('success');

      // Verify outcome was stored
      const updated = store.get(record.decisionId);
      expect(updated?.outcome?.result).toBe('success');
      expect(updated?.outcome?.details).toBe('Everything worked great!');
    });

    it('should report failure outcome', async () => {
      const record = createMockRecord();
      store.store(record);

      const tool = createReportDecisionResultTool(store);
      const result = await tool.execute({
        decisionId: record.decisionId,
        outcome: 'failure',
        details: 'Did not work as expected',
      });

      expect(result.isError).toBeFalsy();

      const updated = store.get(record.decisionId);
      expect(updated?.outcome?.result).toBe('failure');
    });

    it('should report mixed outcome', async () => {
      const record = createMockRecord();
      store.store(record);

      const tool = createReportDecisionResultTool(store);
      const result = await tool.execute({
        decisionId: record.decisionId,
        outcome: 'mixed',
        details: 'Partially worked',
      });

      expect(result.isError).toBeFalsy();

      const updated = store.get(record.decisionId);
      expect(updated?.outcome?.result).toBe('mixed');
    });

    it('should allow reporting without details', async () => {
      const record = createMockRecord();
      store.store(record);

      const tool = createReportDecisionResultTool(store);
      const result = await tool.execute({
        decisionId: record.decisionId,
        outcome: 'success',
      });

      expect(result.isError).toBeFalsy();

      const updated = store.get(record.decisionId);
      expect(updated?.outcome?.result).toBe('success');
      expect(updated?.outcome?.details).toBeUndefined();
    });

    it('should set reportedAt timestamp', async () => {
      const record = createMockRecord();
      store.store(record);

      const beforeReport = new Date();

      const tool = createReportDecisionResultTool(store);
      await tool.execute({
        decisionId: record.decisionId,
        outcome: 'success',
      });

      const afterReport = new Date();

      const updated = store.get(record.decisionId);
      expect(updated?.outcome?.reportedAt).toBeDefined();
      expect(updated!.outcome!.reportedAt.getTime()).toBeGreaterThanOrEqual(
        beforeReport.getTime()
      );
      expect(updated!.outcome!.reportedAt.getTime()).toBeLessThanOrEqual(
        afterReport.getTime()
      );
    });
  });
});
