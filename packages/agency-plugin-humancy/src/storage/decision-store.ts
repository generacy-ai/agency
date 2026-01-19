/**
 * Decision Store for outcome tracking
 *
 * In-memory storage for decision records, enabling outcome
 * reporting and decision attribution.
 */

import type { DecisionRecord, DecisionOutcome } from '../types/index.js';

/**
 * Configuration for DecisionStore
 */
export interface DecisionStoreConfig {
  /** Maximum number of records to store (default: 1000) */
  maxRecords?: number;
  /** TTL in milliseconds for records (default: 24 hours) */
  ttlMs?: number;
}

const DEFAULT_MAX_RECORDS = 1000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * In-memory decision storage with TTL-based cleanup
 */
export class DecisionStore {
  private records: Map<string, DecisionRecord> = new Map();
  private readonly maxRecords: number;
  private readonly ttlMs: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: DecisionStoreConfig = {}) {
    this.maxRecords = config.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;

    // Start periodic cleanup (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);

    // Don't prevent Node.js from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Store a new decision record
   */
  store(record: DecisionRecord): void {
    // Enforce max records limit (remove oldest first)
    if (this.records.size >= this.maxRecords) {
      const oldestKey = this.records.keys().next().value;
      if (oldestKey) {
        this.records.delete(oldestKey);
      }
    }

    this.records.set(record.decisionId, record);
  }

  /**
   * Get a decision record by ID
   */
  get(decisionId: string): DecisionRecord | undefined {
    return this.records.get(decisionId);
  }

  /**
   * Update a decision record with outcome
   */
  updateOutcome(decisionId: string, outcome: DecisionOutcome): boolean {
    const record = this.records.get(decisionId);
    if (!record) {
      return false;
    }

    record.outcome = outcome;
    this.records.set(decisionId, record);
    return true;
  }

  /**
   * Check if a decision record exists
   */
  has(decisionId: string): boolean {
    return this.records.has(decisionId);
  }

  /**
   * Get all decision records (for testing/debugging)
   */
  getAll(): DecisionRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Get count of stored records
   */
  get size(): number {
    return this.records.size;
  }

  /**
   * Remove expired records based on TTL
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, record] of this.records.entries()) {
      const age = now - record.decidedAt.getTime();
      if (age > this.ttlMs) {
        this.records.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all records (for testing)
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Shutdown the store (cleanup interval)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}
