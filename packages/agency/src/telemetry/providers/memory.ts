import type {
  ToolCallEvent,
  TelemetryFilter,
  StatsFilter,
  ToolStats,
} from '../schemas.js';
import type { TelemetryStorageProvider, MemoryProviderOptions } from '../types.js';

/**
 * Default maximum number of events to store in memory.
 */
const DEFAULT_MAX_EVENTS = 10000;

/**
 * In-memory telemetry storage provider.
 * Stores events in an array with configurable max size and FIFO eviction.
 * Primarily for development, testing, and debugging purposes.
 */
export class MemoryStorageProvider implements TelemetryStorageProvider {
  readonly name = 'memory';
  private events: ToolCallEvent[] = [];
  private maxEvents: number;
  private initialized = false;

  constructor(options: MemoryProviderOptions = {}) {
    this.maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.events = [];
    this.initialized = false;
  }

  async record(event: ToolCallEvent): Promise<void> {
    this.events.push(event);

    // FIFO eviction when limit reached
    if (this.maxEvents > 0 && this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  /**
   * Query stored events with optional filtering.
   * @param filter Filter criteria for events
   * @returns Array of matching events
   */
  async query(filter: TelemetryFilter = {}): Promise<ToolCallEvent[]> {
    let results = this.events.slice();

    // Apply filters
    if (filter.toolName !== undefined) {
      results = results.filter((e) => e.toolName === filter.toolName);
    }

    if (filter.serverName !== undefined) {
      results = results.filter((e) => e.serverName === filter.serverName);
    }

    if (filter.sessionId !== undefined) {
      results = results.filter((e) => e.sessionId === filter.sessionId);
    }

    if (filter.success !== undefined) {
      results = results.filter((e) => e.success === filter.success);
    }

    if (filter.startTime !== undefined) {
      const startDate = new Date(filter.startTime);
      results = results.filter((e) => new Date(e.timestamp) >= startDate);
    }

    if (filter.endTime !== undefined) {
      const endDate = new Date(filter.endTime);
      results = results.filter((e) => new Date(e.timestamp) <= endDate);
    }

    // Apply pagination
    const offset = filter.offset ?? 0;
    const limit = filter.limit;

    if (limit !== undefined) {
      results = results.slice(offset, offset + limit);
    } else if (offset > 0) {
      results = results.slice(offset);
    }

    return results;
  }

  /**
   * Get aggregated statistics for stored events.
   * @param filter Filter criteria for stats calculation
   * @returns Aggregated statistics
   */
  async getStats(filter: StatsFilter = {}): Promise<ToolStats> {
    let events = this.events.slice();

    // Apply filters
    if (filter.toolName !== undefined) {
      events = events.filter((e) => e.toolName === filter.toolName);
    }

    if (filter.serverName !== undefined) {
      events = events.filter((e) => e.serverName === filter.serverName);
    }

    if (filter.startTime !== undefined) {
      const startDate = new Date(filter.startTime);
      events = events.filter((e) => new Date(e.timestamp) >= startDate);
    }

    if (filter.endTime !== undefined) {
      const endDate = new Date(filter.endTime);
      events = events.filter((e) => new Date(e.timestamp) <= endDate);
    }

    // Calculate statistics
    const totalCalls = events.length;
    const successCount = events.filter((e) => e.success).length;
    const errorCount = totalCalls - successCount;

    if (totalCalls === 0) {
      return {
        totalCalls: 0,
        successCount: 0,
        errorCount: 0,
        avgDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
      };
    }

    const durations = events.map((e) => e.durationMs);
    const sortedDurations = [...durations].sort((a, b) => a - b);

    const sum = durations.reduce((acc, d) => acc + d, 0);
    const avgDurationMs = sum / totalCalls;
    const minDurationMs = sortedDurations[0]!;
    const maxDurationMs = sortedDurations[sortedDurations.length - 1]!;

    // Calculate percentiles
    const p50DurationMs = this.percentile(sortedDurations, 50);
    const p95DurationMs = this.percentile(sortedDurations, 95);
    const p99DurationMs = this.percentile(sortedDurations, 99);

    return {
      totalCalls,
      successCount,
      errorCount,
      avgDurationMs,
      minDurationMs,
      maxDurationMs,
      p50DurationMs,
      p95DurationMs,
      p99DurationMs,
    };
  }

  /**
   * Get the count of stored events.
   * Useful for testing and debugging.
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Get all stored events.
   * Useful for testing and debugging.
   */
  getAllEvents(): ToolCallEvent[] {
    return this.events.slice();
  }

  /**
   * Clear all stored events.
   * Useful for testing and debugging.
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Check if the provider has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Calculate percentile value from sorted array.
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0]!;

    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedValues[lower]!;
    }

    const fraction = index - lower;
    return sortedValues[lower]! + fraction * (sortedValues[upper]! - sortedValues[lower]!);
  }
}
