import type * as vscode from 'vscode';
import type {
  ToolCallEvent,
  ActivityFilter,
  ActivityStats,
  ActivityEventBatch,
  ToolUsageStats,
  ToolCallStatus,
} from '../types';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('ActivityService');

/** Default maximum number of events to store */
const DEFAULT_MAX_EVENTS = 1000;

/** Minimum allowed buffer size */
const MIN_BUFFER_SIZE = 100;

/**
 * Simple event emitter for VS Code-style events.
 */
class EventEmitter<T> {
  private _listeners: Set<(value: T) => void> = new Set();

  get event(): (listener: (value: T) => void) => vscode.Disposable {
    return (listener: (value: T) => void): vscode.Disposable => {
      this._listeners.add(listener);
      return {
        dispose: () => {
          this._listeners.delete(listener);
        },
      };
    };
  }

  fire(value: T): void {
    for (const listener of this._listeners) {
      try {
        listener(value);
      } catch (error) {
        log.error('Error in event listener', error);
      }
    }
  }

  dispose(): void {
    this._listeners.clear();
  }
}

/**
 * Ring buffer (circular buffer) for fixed-size FIFO storage.
 * Provides O(1) insertion with automatic eviction when full.
 */
class RingBuffer<T> {
  private _items: (T | undefined)[];
  private _head = 0; // Next write position
  private _count = 0; // Current number of items

  constructor(private _maxSize: number) {
    this._items = new Array(_maxSize);
  }

  /**
   * Add an item to the buffer.
   * If the buffer is full, the oldest item is evicted.
   *
   * @returns The evicted item if the buffer was full, undefined otherwise
   */
  push(item: T): T | undefined {
    const evicted = this._count === this._maxSize ? this._items[this._head] : undefined;
    this._items[this._head] = item;
    this._head = (this._head + 1) % this._maxSize;
    this._count = Math.min(this._count + 1, this._maxSize);
    return evicted;
  }

  /**
   * Get all items in insertion order (oldest first).
   */
  toArray(): T[] {
    if (this._count === 0) return [];

    const result: T[] = [];
    // Calculate start position (oldest item)
    const start = this._count < this._maxSize ? 0 : this._head;

    for (let i = 0; i < this._count; i++) {
      const index = (start + i) % this._maxSize;
      result.push(this._items[index] as T);
    }

    return result;
  }

  /**
   * Clear all items from the buffer.
   */
  clear(): void {
    this._items = new Array(this._maxSize);
    this._head = 0;
    this._count = 0;
  }

  /**
   * Get the current number of items in the buffer.
   */
  get size(): number {
    return this._count;
  }

  /**
   * Get the maximum capacity of the buffer.
   */
  get maxSize(): number {
    return this._maxSize;
  }

  /**
   * Resize the buffer to a new maximum size.
   * If the new size is smaller, oldest items are evicted.
   */
  resize(newMaxSize: number): void {
    const items = this.toArray();
    this._maxSize = newMaxSize;
    this._items = new Array(newMaxSize);
    this._head = 0;
    this._count = 0;

    // Re-add items (will evict if new size is smaller)
    const startIndex = items.length > newMaxSize ? items.length - newMaxSize : 0;
    for (let i = startIndex; i < items.length; i++) {
      this.push(items[i]);
    }
  }
}

/**
 * ActivityService provides real-time monitoring of agent tool invocations.
 *
 * This is a singleton service that:
 * - Maintains an in-memory buffer of tool call events
 * - Supports filtering events by various criteria
 * - Calculates activity statistics
 * - Emits events for new tool calls
 *
 * @example
 * ```typescript
 * // In extension activation
 * const activityService = ActivityService.getInstance();
 * await activityService.initialize(vscode);
 *
 * // Listen for new tool calls
 * activityService.onToolCall((event) => {
 *   console.log(`Tool called: ${event.toolName}`);
 * });
 *
 * // Get filtered events
 * const errors = activityService.getEvents({ isError: true });
 *
 * // Get statistics
 * const stats = activityService.getStats();
 * ```
 */
export class ActivityService {
  private static _instance: ActivityService | undefined;

  private _vscodeModule: typeof vscode | null = null;
  private _initialized = false;
  private _disposables = new DisposableManager();

  // Event buffer
  private _buffer: RingBuffer<ToolCallEvent>;

  // Event emitters
  private _onToolCall = new EventEmitter<ToolCallEvent>();
  private _onBatch = new EventEmitter<ActivityEventBatch>();

  /**
   * Private constructor to enforce singleton pattern.
   * Use ActivityService.getInstance() to get the instance.
   */
  private constructor() {
    this._buffer = new RingBuffer<ToolCallEvent>(DEFAULT_MAX_EVENTS);
  }

  /**
   * Get the singleton ActivityService instance.
   * Creates a new instance if one doesn't exist.
   */
  static getInstance(): ActivityService {
    if (!ActivityService._instance) {
      ActivityService._instance = new ActivityService();
    }
    return ActivityService._instance;
  }

  /**
   * Reset the singleton instance.
   * This is primarily for testing purposes.
   */
  static reset(): void {
    if (ActivityService._instance) {
      ActivityService._instance.dispose();
      ActivityService._instance = undefined;
    }
  }

  /**
   * Initialize the ActivityService.
   * Must be called before using other methods.
   *
   * @param vscodeModule The VS Code module for API access
   */
  async initialize(vscodeModule: typeof vscode): Promise<void> {
    if (this._initialized) {
      log.debug('ActivityService already initialized');
      return;
    }

    this._vscodeModule = vscodeModule;
    this._initialized = true;
    log.info('ActivityService initialized');
  }

  /**
   * Check if the service has been initialized.
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Subscription
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Event fired when a new tool call is added.
   */
  get onToolCall(): (listener: (event: ToolCallEvent) => void) => vscode.Disposable {
    return this._onToolCall.event;
  }

  /**
   * Event fired when a batch of events is added.
   */
  get onBatch(): (listener: (batch: ActivityEventBatch) => void) => vscode.Disposable {
    return this._onBatch.event;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Buffer Management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add a single tool call event to the buffer.
   *
   * @param event The tool call event to add
   */
  addEvent(event: ToolCallEvent): void {
    this._ensureInitialized();

    // Validate required fields
    if (!event.id || !event.toolName) {
      log.warn('Invalid event: missing id or toolName', event);
      return;
    }

    this._buffer.push(event);
    this._onToolCall.fire(event);
    log.debug(`Added event: ${event.toolName} (${event.id})`);
  }

  /**
   * Add multiple tool call events to the buffer.
   * Fires a batch event instead of individual events.
   *
   * @param events The tool call events to add
   */
  addEvents(events: ToolCallEvent[]): void {
    this._ensureInitialized();

    for (const event of events) {
      if (event.id && event.toolName) {
        this._buffer.push(event);
      }
    }

    const batch: ActivityEventBatch = {
      events,
      isFullRefresh: false,
      timestamp: Date.now(),
    };

    this._onBatch.fire(batch);
    log.debug(`Added ${events.length} events in batch`);
  }

  /**
   * Get events matching the specified filter criteria.
   *
   * @param filter Optional filter criteria
   * @returns Array of matching events (newest first by default)
   */
  getEvents(filter?: ActivityFilter): ToolCallEvent[] {
    this._ensureInitialized();

    let events = this._buffer.toArray();

    if (filter) {
      events = this._applyFilter(events, filter);
    }

    // Return newest first (reverse of insertion order)
    events = events.reverse();

    // Apply pagination
    if (filter?.offset !== undefined && filter.offset > 0) {
      events = events.slice(filter.offset);
    }

    if (filter?.limit !== undefined && filter.limit > 0) {
      events = events.slice(0, filter.limit);
    }

    return events;
  }

  /**
   * Get a single event by its ID.
   *
   * @param id The event ID to find
   * @returns The event if found, undefined otherwise
   */
  getEventById(id: string): ToolCallEvent | undefined {
    this._ensureInitialized();
    return this._buffer.toArray().find((event) => event.id === id);
  }

  /**
   * Clear all events from the buffer.
   */
  clearEvents(): void {
    this._ensureInitialized();

    this._buffer.clear();

    const batch: ActivityEventBatch = {
      events: [],
      isFullRefresh: true,
      timestamp: Date.now(),
    };

    this._onBatch.fire(batch);
    log.info('Events cleared');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Set the maximum buffer size.
   *
   * @param maxEvents Maximum number of events to store
   */
  setBufferSize(maxEvents: number): void {
    this._ensureInitialized();

    const effectiveSize = Math.max(maxEvents, MIN_BUFFER_SIZE);
    this._buffer.resize(effectiveSize);
    log.info(`Buffer size set to ${effectiveSize}`);
  }

  /**
   * Get the current maximum buffer size.
   */
  getBufferSize(): number {
    return this._buffer.maxSize;
  }

  /**
   * Get the current number of events in the buffer.
   */
  getEventCount(): number {
    return this._buffer.size;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate activity statistics for the buffered events.
   *
   * @param filter Optional filter to scope the statistics
   * @returns Activity statistics
   */
  getStats(filter?: ActivityFilter): ActivityStats {
    this._ensureInitialized();

    let events = this._buffer.toArray();

    if (filter) {
      // Apply filter but ignore pagination for stats
      const statsFilter: ActivityFilter = { ...filter };
      delete statsFilter.limit;
      delete statsFilter.offset;
      events = this._applyFilter(events, statsFilter);
    }

    // Count by status
    const totalCalls = events.length;
    let successCount = 0;
    let errorCount = 0;
    let timeoutCount = 0;
    let pendingCount = 0;

    for (const event of events) {
      switch (event.status) {
        case 'success':
          successCount++;
          break;
        case 'error':
          errorCount++;
          break;
        case 'timeout':
          timeoutCount++;
          break;
        case 'pending':
        case 'running':
          pendingCount++;
          break;
      }
    }

    // Calculate durations
    const completedEvents = events.filter((e) => e.duration !== undefined && e.duration > 0);
    const durations = completedEvents.map((e) => e.duration!);

    const averageDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    let medianDuration: number | undefined;
    if (durations.length > 0) {
      const sorted = [...durations].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianDuration = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Calculate time range
    const timestamps = events.map((e) => e.startedAt);
    const timeRange = {
      start: timestamps.length > 0 ? Math.min(...timestamps) : Date.now(),
      end: timestamps.length > 0 ? Math.max(...timestamps) : Date.now(),
    };

    // Calculate calls per minute
    const timeRangeMinutes = Math.max((timeRange.end - timeRange.start) / 60000, 1);
    const callsPerMinute = totalCalls / timeRangeMinutes;

    // Calculate top tools
    const toolCounts = new Map<
      string,
      { count: number; successCount: number; totalDuration: number }
    >();

    for (const event of events) {
      const key = event.toolName;
      const existing = toolCounts.get(key) || { count: 0, successCount: 0, totalDuration: 0 };
      existing.count++;
      if (event.status === 'success') {
        existing.successCount++;
      }
      if (event.duration !== undefined) {
        existing.totalDuration += event.duration;
      }
      toolCounts.set(key, existing);
    }

    const topTools: ToolUsageStats[] = Array.from(toolCounts.entries())
      .map(([toolName, data]) => ({
        toolName,
        namespace: events.find((e) => e.toolName === toolName)?.namespace,
        callCount: data.count,
        successRate: data.count > 0 ? data.successCount / data.count : 0,
        averageDuration: data.count > 0 ? data.totalDuration / data.count : 0,
      }))
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 10); // Top 10 tools

    return {
      totalCalls,
      successCount,
      errorCount,
      timeoutCount,
      pendingCount,
      averageDuration,
      medianDuration,
      callsPerMinute,
      topTools,
      timeRange,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Dispose of the ActivityService and clean up resources.
   */
  dispose(): void {
    this._buffer.clear();
    this._onToolCall.dispose();
    this._onBatch.dispose();
    this._disposables.dispose();
    this._vscodeModule = null;
    this._initialized = false;
    log.debug('ActivityService disposed');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Apply filter criteria to an array of events.
   */
  private _applyFilter(events: ToolCallEvent[], filter: ActivityFilter): ToolCallEvent[] {
    return events.filter((event) => {
      // Tool name (partial match, case-insensitive)
      if (
        filter.toolName &&
        !event.toolName.toLowerCase().includes(filter.toolName.toLowerCase())
      ) {
        return false;
      }

      // Namespace (exact match)
      if (filter.namespace && event.namespace !== filter.namespace) {
        return false;
      }

      // Plugin ID (exact match)
      if (filter.pluginId && event.pluginId !== filter.pluginId) {
        return false;
      }

      // Agent ID (exact match)
      if (filter.agentId && event.agentId !== filter.agentId) {
        return false;
      }

      // Container ID (exact match)
      if (filter.containerId && event.containerId !== filter.containerId) {
        return false;
      }

      // Status (single or array match)
      if (filter.status !== undefined) {
        const statusArray: ToolCallStatus[] = Array.isArray(filter.status)
          ? filter.status
          : [filter.status];
        if (!statusArray.includes(event.status)) {
          return false;
        }
      }

      // isError (boolean match)
      if (filter.isError !== undefined && event.isError !== filter.isError) {
        return false;
      }

      // Time range
      if (filter.startTime !== undefined && event.startedAt < filter.startTime) {
        return false;
      }

      if (filter.endTime !== undefined && event.startedAt > filter.endTime) {
        return false;
      }

      return true;
    });
  }

  /**
   * Ensure the service is initialized.
   */
  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('ActivityService not initialized. Call initialize() first.');
    }
  }
}
