import type * as vscode from 'vscode';
import type {
  ToolCallEvent,
  ActivityFilter,
  ActivityStats,
  ToolUsageStats,
  ActivityFeedConfig,
  ActivityEventBatch,
} from '../types';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('ActivityService');

/**
 * Default configuration for the activity service.
 */
const DEFAULT_CONFIG: ActivityFeedConfig = {
  maxEvents: 1000,
  refreshInterval: 0, // Disabled by default (real-time updates)
  autoScroll: true,
};

/**
 * Event type for activity service events.
 */
export interface ActivityServiceEvent {
  type: 'tool_call' | 'batch_update' | 'clear';
  event?: ToolCallEvent;
  batch?: ActivityEventBatch;
}

/**
 * Service for managing activity events from the Agency event stream.
 * Maintains an in-memory buffer of tool call events and provides
 * filtering, statistics, and real-time event streaming.
 */
export class ActivityService {
  private static _instance: ActivityService | null = null;

  private _vscodeModule: typeof vscode | null = null;
  private _initialized = false;
  private readonly _disposables = new DisposableManager();
  private _events: ToolCallEvent[] = [];
  private _config: ActivityFeedConfig = { ...DEFAULT_CONFIG };

  // Event emitter for activity updates
  private _onActivityUpdate:
    | vscode.EventEmitter<ActivityServiceEvent>
    | undefined;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): ActivityService {
    if (!ActivityService._instance) {
      ActivityService._instance = new ActivityService();
    }
    return ActivityService._instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static reset(): void {
    if (ActivityService._instance) {
      ActivityService._instance.dispose();
      ActivityService._instance = null;
    }
  }

  /**
   * Event that fires when activity is updated.
   */
  get onActivityUpdate(): vscode.Event<ActivityServiceEvent> | undefined {
    return this._onActivityUpdate?.event;
  }

  /**
   * Initialize the service with VS Code module.
   */
  async initialize(vscodeModule: typeof vscode): Promise<void> {
    if (this._initialized) {
      log.warn('ActivityService already initialized');
      return;
    }

    this._vscodeModule = vscodeModule;
    this._onActivityUpdate = new vscodeModule.EventEmitter<ActivityServiceEvent>();
    this._disposables.add(this._onActivityUpdate);
    this._initialized = true;

    log.info('ActivityService initialized');
  }

  /**
   * Configure the activity service.
   */
  setConfig(config: Partial<ActivityFeedConfig>): void {
    this._config = { ...this._config, ...config };
    log.debug('Config updated', this._config);
  }

  /**
   * Get the current configuration.
   */
  getConfig(): ActivityFeedConfig {
    return { ...this._config };
  }

  /**
   * Add a tool call event to the buffer.
   * Enforces the maxEvents limit by removing oldest events.
   */
  addEvent(event: ToolCallEvent): void {
    this._events.unshift(event); // Add to front (newest first)

    // Enforce max events limit
    if (this._events.length > this._config.maxEvents) {
      this._events.splice(this._config.maxEvents);
    }

    // Emit the update
    this._onActivityUpdate?.fire({
      type: 'tool_call',
      event,
    });

    log.debug(`Added event: ${event.toolName} (${event.status})`);
  }

  /**
   * Update an existing event (e.g., when status changes from pending to success).
   */
  updateEvent(eventId: string, updates: Partial<ToolCallEvent>): void {
    const index = this._events.findIndex((e) => e.id === eventId);
    if (index === -1) {
      log.warn(`Event not found for update: ${eventId}`);
      return;
    }

    this._events[index] = { ...this._events[index], ...updates } as ToolCallEvent;

    // Emit the update
    this._onActivityUpdate?.fire({
      type: 'tool_call',
      event: this._events[index],
    });

    log.debug(`Updated event: ${eventId}`);
  }

  /**
   * Add a batch of events (for initial load or sync).
   */
  addBatch(events: ToolCallEvent[], isFullRefresh = false): void {
    if (isFullRefresh) {
      this._events = events.slice(0, this._config.maxEvents);
    } else {
      // Prepend new events
      this._events = [...events, ...this._events].slice(0, this._config.maxEvents);
    }

    // Emit batch update
    this._onActivityUpdate?.fire({
      type: 'batch_update',
      batch: {
        events,
        isFullRefresh,
        timestamp: Date.now(),
      },
    });

    log.debug(`Added batch of ${events.length} events (fullRefresh: ${isFullRefresh})`);
  }

  /**
   * Get all events, optionally filtered.
   */
  getEvents(filter?: ActivityFilter): ToolCallEvent[] {
    if (!filter) {
      return [...this._events];
    }

    return this._filterEvents(this._events, filter);
  }

  /**
   * Get events grouped by time period.
   */
  getEventsByTimePeriod(): {
    lastMinute: ToolCallEvent[];
    lastFiveMinutes: ToolCallEvent[];
    older: ToolCallEvent[];
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    const lastMinute: ToolCallEvent[] = [];
    const lastFiveMinutes: ToolCallEvent[] = [];
    const older: ToolCallEvent[] = [];

    for (const event of this._events) {
      if (event.startedAt >= oneMinuteAgo) {
        lastMinute.push(event);
      } else if (event.startedAt >= fiveMinutesAgo) {
        lastFiveMinutes.push(event);
      } else {
        older.push(event);
      }
    }

    return { lastMinute, lastFiveMinutes, older };
  }

  /**
   * Get activity statistics.
   */
  getStats(filter?: ActivityFilter): ActivityStats {
    const events = filter ? this._filterEvents(this._events, filter) : this._events;
    return this._calculateStats(events);
  }

  /**
   * Clear all events.
   */
  clear(): void {
    this._events = [];
    this._onActivityUpdate?.fire({ type: 'clear' });
    log.info('Activity events cleared');
  }

  /**
   * Get the total number of events in the buffer.
   */
  getEventCount(): number {
    return this._events.length;
  }

  /**
   * Filter events by criteria.
   */
  private _filterEvents(events: ToolCallEvent[], filter: ActivityFilter): ToolCallEvent[] {
    let result = events;

    if (filter.toolName) {
      const searchTerm = filter.toolName.toLowerCase();
      result = result.filter((e) =>
        e.toolName.toLowerCase().includes(searchTerm)
      );
    }

    if (filter.namespace) {
      result = result.filter((e) => e.namespace === filter.namespace);
    }

    if (filter.pluginId) {
      result = result.filter((e) => e.pluginId === filter.pluginId);
    }

    if (filter.agentId) {
      result = result.filter((e) => e.agentId === filter.agentId);
    }

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      result = result.filter((e) => statuses.includes(e.status));
    }

    if (filter.isError !== undefined) {
      result = result.filter((e) => e.isError === filter.isError);
    }

    if (filter.startTime) {
      result = result.filter((e) => e.startedAt >= filter.startTime!);
    }

    if (filter.endTime) {
      result = result.filter((e) => e.startedAt <= filter.endTime!);
    }

    if (filter.containerId) {
      result = result.filter((e) => e.containerId === filter.containerId);
    }

    if (filter.offset) {
      result = result.slice(filter.offset);
    }

    if (filter.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  /**
   * Calculate statistics for a set of events.
   */
  private _calculateStats(events: ToolCallEvent[]): ActivityStats {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    let successCount = 0;
    let errorCount = 0;
    let timeoutCount = 0;
    let pendingCount = 0;
    const durations: number[] = [];
    const toolCounts = new Map<string, { success: number; error: number; durations: number[] }>();
    let recentCallCount = 0;

    for (const event of events) {
      // Count by status
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

      // Track duration
      if (event.duration !== undefined) {
        durations.push(event.duration);
      }

      // Track per-tool stats
      const toolKey = event.namespace ? `${event.namespace}/${event.toolName}` : event.toolName;
      const toolStats = toolCounts.get(toolKey) || { success: 0, error: 0, durations: [] };
      if (event.status === 'success') {
        toolStats.success++;
      } else if (event.status === 'error' || event.status === 'timeout') {
        toolStats.error++;
      }
      if (event.duration !== undefined) {
        toolStats.durations.push(event.duration);
      }
      toolCounts.set(toolKey, toolStats);

      // Count calls in last minute for rate calculation
      if (event.startedAt >= oneMinuteAgo) {
        recentCallCount++;
      }
    }

    // Calculate average duration
    const averageDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    // Calculate median duration
    let medianDuration: number | undefined;
    if (durations.length > 0) {
      const sorted = [...durations].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianDuration =
        sorted.length % 2 !== 0
          ? sorted[mid]
          : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
    }

    // Build top tools list
    const topTools: ToolUsageStats[] = Array.from(toolCounts.entries())
      .map(([toolName, stats]) => {
        const total = stats.success + stats.error;
        const avgDur =
          stats.durations.length > 0
            ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
            : 0;
        const [namespace, name] = toolName.includes('/')
          ? toolName.split('/')
          : [undefined, toolName];
        return {
          toolName: name,
          namespace,
          callCount: total,
          successRate: total > 0 ? stats.success / total : 0,
          averageDuration: avgDur,
        };
      })
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 10);

    // Determine time range
    const startTime =
      events.length > 0
        ? Math.min(...events.map((e) => e.startedAt))
        : now;
    const endTime =
      events.length > 0
        ? Math.max(...events.map((e) => e.completedAt || e.startedAt))
        : now;

    return {
      totalCalls: events.length,
      successCount,
      errorCount,
      timeoutCount,
      pendingCount,
      averageDuration,
      medianDuration,
      callsPerMinute: recentCallCount,
      topTools,
      timeRange: {
        start: startTime,
        end: endTime,
      },
    };
  }

  /**
   * Dispose of service resources.
   */
  dispose(): void {
    this._disposables.dispose();
    this._events = [];
    this._initialized = false;
    this._vscodeModule = null;
    this._onActivityUpdate = undefined;
    log.debug('ActivityService disposed');
  }
}
