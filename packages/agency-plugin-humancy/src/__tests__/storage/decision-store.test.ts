/**
 * Tests for DecisionStore
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DecisionStore } from '../../storage/decision-store.js';
import type { DecisionRecord, DecisionOutcome } from '../../types/index.js';

describe('DecisionStore', () => {
  let store: DecisionStore;

  const createMockRecord = (overrides: Partial<DecisionRecord> = {}): DecisionRecord => ({
    decisionId: crypto.randomUUID(),
    request: {
      question: 'Test question?',
      options: [
        { id: 'a', label: 'Option A' },
        { id: 'b', label: 'Option B' },
      ],
      timestamp: new Date(),
    },
    selectedOption: 'a',
    decidedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    store = new DecisionStore();
  });

  afterEach(() => {
    store.shutdown();
  });

  describe('store', () => {
    it('should store a decision record', () => {
      const record = createMockRecord();
      store.store(record);
      expect(store.size).toBe(1);
    });

    it('should allow retrieving stored record', () => {
      const record = createMockRecord();
      store.store(record);
      const retrieved = store.get(record.decisionId);
      expect(retrieved).toEqual(record);
    });

    it('should enforce max records limit', () => {
      const smallStore = new DecisionStore({ maxRecords: 3 });
      try {
        const records = Array.from({ length: 5 }, () => createMockRecord());
        for (const record of records) {
          smallStore.store(record);
        }
        expect(smallStore.size).toBe(3);
        // Only the last 3 records should be present
        expect(smallStore.has(records[0]!.decisionId)).toBe(false);
        expect(smallStore.has(records[1]!.decisionId)).toBe(false);
        expect(smallStore.has(records[2]!.decisionId)).toBe(true);
        expect(smallStore.has(records[3]!.decisionId)).toBe(true);
        expect(smallStore.has(records[4]!.decisionId)).toBe(true);
      } finally {
        smallStore.shutdown();
      }
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent record', () => {
      const result = store.get('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should return the correct record by ID', () => {
      const record1 = createMockRecord();
      const record2 = createMockRecord();
      store.store(record1);
      store.store(record2);

      expect(store.get(record1.decisionId)).toEqual(record1);
      expect(store.get(record2.decisionId)).toEqual(record2);
    });
  });

  describe('has', () => {
    it('should return false for non-existent record', () => {
      expect(store.has('non-existent-id')).toBe(false);
    });

    it('should return true for existing record', () => {
      const record = createMockRecord();
      store.store(record);
      expect(store.has(record.decisionId)).toBe(true);
    });
  });

  describe('updateOutcome', () => {
    it('should update outcome for existing record', () => {
      const record = createMockRecord();
      store.store(record);

      const outcome: DecisionOutcome = {
        result: 'success',
        details: 'It worked!',
        reportedAt: new Date(),
      };

      const updated = store.updateOutcome(record.decisionId, outcome);
      expect(updated).toBe(true);

      const retrieved = store.get(record.decisionId);
      expect(retrieved?.outcome).toEqual(outcome);
    });

    it('should return false for non-existent record', () => {
      const outcome: DecisionOutcome = {
        result: 'failure',
        reportedAt: new Date(),
      };

      const updated = store.updateOutcome('non-existent-id', outcome);
      expect(updated).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all stored records', () => {
      const record1 = createMockRecord();
      const record2 = createMockRecord();
      store.store(record1);
      store.store(record2);

      const all = store.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual(record1);
      expect(all).toContainEqual(record2);
    });

    it('should return empty array when no records', () => {
      expect(store.getAll()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all records', () => {
      store.store(createMockRecord());
      store.store(createMockRecord());
      expect(store.size).toBe(2);

      store.clear();
      expect(store.size).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove expired records', () => {
      // Create store with short TTL
      const shortTTLStore = new DecisionStore({ ttlMs: 100 });
      try {
        const oldRecord = createMockRecord({
          decidedAt: new Date(Date.now() - 200), // 200ms ago
        });
        const newRecord = createMockRecord({
          decidedAt: new Date(), // now
        });

        shortTTLStore.store(oldRecord);
        shortTTLStore.store(newRecord);

        const removed = shortTTLStore.cleanup();
        expect(removed).toBe(1);
        expect(shortTTLStore.has(oldRecord.decisionId)).toBe(false);
        expect(shortTTLStore.has(newRecord.decisionId)).toBe(true);
      } finally {
        shortTTLStore.shutdown();
      }
    });

    it('should not remove records within TTL', () => {
      const record = createMockRecord();
      store.store(record);

      const removed = store.cleanup();
      expect(removed).toBe(0);
      expect(store.has(record.decisionId)).toBe(true);
    });
  });

  describe('size', () => {
    it('should return correct count', () => {
      expect(store.size).toBe(0);
      store.store(createMockRecord());
      expect(store.size).toBe(1);
      store.store(createMockRecord());
      expect(store.size).toBe(2);
    });
  });

  describe('shutdown', () => {
    it('should be callable multiple times without error', () => {
      store.shutdown();
      store.shutdown();
      // No error thrown
    });

    it('should still allow operations after shutdown (without cleanup interval)', () => {
      store.shutdown();
      const record = createMockRecord();
      store.store(record);
      expect(store.get(record.decisionId)).toEqual(record);
    });
  });
});
