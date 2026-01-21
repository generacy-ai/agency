/**
 * Activity-related type definitions for the Agency VS Code extension.
 * These types support real-time monitoring of agent tool invocations.
 */

import type { ToolResultContent } from './tool';

/**
 * Status of a tool call.
 */
export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error' | 'timeout';

/**
 * Event representing a tool invocation by an agent.
 * Emitted by Agency core's event stream.
 */
export interface ToolCallEvent {
  /** Unique event identifier */
  id: string;

  /** Tool name that was invoked */
  toolName: string;

  /** Tool namespace/category */
  namespace?: string;

  /** Plugin that provides the tool */
  pluginId?: string;

  /** Agent or session that invoked the tool */
  agentId?: string;

  /** Tool input arguments */
  input: Record<string, unknown>;

  /** Tool output (null if still running) */
  output: ToolResultContent[] | null;

  /** Whether the call resulted in an error */
  isError: boolean;

  /** Error message if isError is true */
  errorMessage?: string;

  /** Current status of the call */
  status: ToolCallStatus;

  /** Timestamp when the call started (ms since epoch) */
  startedAt: number;

  /** Timestamp when the call completed (ms since epoch) */
  completedAt?: number;

  /** Execution duration in milliseconds */
  duration?: number;

  /** Container where the tool was executed */
  containerId?: string;
}

/**
 * Filter criteria for activity feed.
 */
export interface ActivityFilter {
  /** Filter by tool name (partial match) */
  toolName?: string;

  /** Filter by namespace */
  namespace?: string;

  /** Filter by plugin ID */
  pluginId?: string;

  /** Filter by agent ID */
  agentId?: string;

  /** Filter by status */
  status?: ToolCallStatus | ToolCallStatus[];

  /** Filter by error state */
  isError?: boolean;

  /** Filter by time range - start (ms since epoch) */
  startTime?: number;

  /** Filter by time range - end (ms since epoch) */
  endTime?: number;

  /** Filter by container ID */
  containerId?: string;

  /** Maximum number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Aggregated statistics for activity.
 */
export interface ActivityStats {
  /** Total number of tool calls */
  totalCalls: number;

  /** Number of successful calls */
  successCount: number;

  /** Number of failed calls */
  errorCount: number;

  /** Number of timed out calls */
  timeoutCount: number;

  /** Number of pending/running calls */
  pendingCount: number;

  /** Average execution duration in milliseconds */
  averageDuration: number;

  /** Median execution duration in milliseconds */
  medianDuration?: number;

  /** Calls per minute over the last period */
  callsPerMinute: number;

  /** Most frequently called tools */
  topTools: ToolUsageStats[];

  /** Time range of the statistics */
  timeRange: {
    start: number;
    end: number;
  };
}

/**
 * Usage statistics for a single tool.
 */
export interface ToolUsageStats {
  /** Tool name */
  toolName: string;

  /** Namespace */
  namespace?: string;

  /** Number of calls */
  callCount: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Average duration in milliseconds */
  averageDuration: number;
}

/**
 * Activity feed configuration.
 */
export interface ActivityFeedConfig {
  /** Maximum number of events to keep in memory */
  maxEvents: number;

  /** Auto-refresh interval in milliseconds (0 = disabled) */
  refreshInterval: number;

  /** Whether to auto-scroll to new events */
  autoScroll: boolean;

  /** Default filter to apply */
  defaultFilter?: ActivityFilter;
}

/**
 * Activity event batch for efficient updates.
 */
export interface ActivityEventBatch {
  /** Events in this batch */
  events: ToolCallEvent[];

  /** Whether this is a full refresh (replace all) or incremental */
  isFullRefresh: boolean;

  /** Timestamp of the batch */
  timestamp: number;
}
