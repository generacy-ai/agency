import { z } from 'zod';
import { ulid } from 'ulid';
import { ULID_REGEX } from '../schemas/common/ids.js';

export { ULID_REGEX };

/**
 * Generate a unique event ID using ULID.
 * ULIDs are lexicographically sortable and contain embedded timestamps,
 * making them ideal for time-series telemetry data.
 */
export function generateEventId(): string {
  return ulid();
}

/**
 * Version 1 of the ToolCallEvent schema.
 * Uses .passthrough() to allow future fields without breaking changes.
 */
export const ToolCallEventV1 = z.object({
  /** Unique event identifier (ULID) */
  id: z.string().regex(ULID_REGEX, 'Must be a valid ULID'),

  /** ISO 8601 timestamp when the event was created */
  timestamp: z.string().datetime(),

  /** Name of the tool that was called */
  toolName: z.string().min(1),

  /** Name of the MCP server handling the call */
  serverName: z.string().min(1),

  /** Session identifier (if available from MCP context) */
  sessionId: z.string().optional(),

  /** Tool input arguments (optional based on privacy settings) */
  inputs: z.record(z.unknown()).optional(),

  /** Tool output result (optional based on privacy settings) */
  outputs: z.unknown().optional(),

  /** Error message if the call failed */
  error: z.string().optional(),

  /** Execution duration in milliseconds */
  durationMs: z.number().nonnegative(),

  /** Whether the tool call succeeded */
  success: z.boolean(),

  /** Error category for aggregation (e.g., validation, timeout, permission, network, internal, unknown) */
  errorCategory: z.string().optional(),

  /** Free-form error type detail (complements errorCategory) */
  errorType: z.string().optional(),

  /** Generacy workflow ID */
  workflowId: z.string().optional(),

  /** GitHub issue number */
  issueNumber: z.number().int().optional(),

  /** Workflow phase */
  phase: z.string().optional(),
}).passthrough();

export const ToolCallEvent = ToolCallEventV1;
export type ToolCallEvent = z.infer<typeof ToolCallEvent>;

/**
 * Filter criteria for querying events.
 */
export const TelemetryFilterSchema = z.object({
  /** Filter by tool name */
  toolName: z.string().optional(),

  /** Filter by server name */
  serverName: z.string().optional(),

  /** Filter by session ID */
  sessionId: z.string().optional(),

  /** Filter by success status */
  success: z.boolean().optional(),

  /** Filter events after this timestamp */
  startTime: z.string().datetime().optional(),

  /** Filter events before this timestamp */
  endTime: z.string().datetime().optional(),

  /** Maximum number of events to return */
  limit: z.number().int().positive().optional(),

  /** Offset for pagination */
  offset: z.number().int().nonnegative().optional(),

  /** Filter events with duration >= this threshold (in milliseconds) */
  durationThresholdMs: z.number().nonnegative().optional(),
});

export type TelemetryFilter = z.infer<typeof TelemetryFilterSchema>;

/**
 * Filter criteria for statistics queries.
 */
export const StatsFilterSchema = z.object({
  /** Filter by tool name */
  toolName: z.string().optional(),

  /** Filter by server name */
  serverName: z.string().optional(),

  /** Filter events after this timestamp */
  startTime: z.string().datetime().optional(),

  /** Filter events before this timestamp */
  endTime: z.string().datetime().optional(),
});

export type StatsFilter = z.infer<typeof StatsFilterSchema>;

/**
 * Aggregated statistics for tool calls.
 */
export const ToolStatsSchema = z.object({
  /** Total number of calls */
  totalCalls: z.number().int().nonnegative(),

  /** Number of successful calls */
  successCount: z.number().int().nonnegative(),

  /** Number of failed calls */
  errorCount: z.number().int().nonnegative(),

  /** Average duration in milliseconds */
  avgDurationMs: z.number().nonnegative(),

  /** Minimum duration in milliseconds */
  minDurationMs: z.number().nonnegative(),

  /** Maximum duration in milliseconds */
  maxDurationMs: z.number().nonnegative(),

  /** P50 (median) duration in milliseconds */
  p50DurationMs: z.number().nonnegative().optional(),

  /** P95 duration in milliseconds */
  p95DurationMs: z.number().nonnegative().optional(),

  /** P99 duration in milliseconds */
  p99DurationMs: z.number().nonnegative().optional(),
});

export type ToolStats = z.infer<typeof ToolStatsSchema>;

/**
 * Time windows for aggregated statistics.
 * Used in ToolStatsApiSchema to specify the aggregation period.
 */
export const TimeWindow = {
  LAST_24H: 'last_24h',
  LAST_7D: 'last_7d',
  LAST_30D: 'last_30d',
  ALL_TIME: 'all_time',
} as const;

export type TimeWindow = (typeof TimeWindow)[keyof typeof TimeWindow];

export const TimeWindowSchema = z.enum([
  'last_24h',
  'last_7d',
  'last_30d',
  'all_time',
]);

/**
 * Error categories for telemetry aggregation.
 * Classifies errors consistently for analysis and dashboards.
 */
export const ErrorCategory = {
  VALIDATION: 'validation',
  TIMEOUT: 'timeout',
  PERMISSION: 'permission',
  NETWORK: 'network',
  INTERNAL: 'internal',
  UNKNOWN: 'unknown',
} as const;

export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

export const ErrorCategorySchema = z.enum([
  'validation',
  'timeout',
  'permission',
  'network',
  'internal',
  'unknown',
]);

/**
 * API-facing aggregated tool statistics for leaderboards and dashboards.
 *
 * Separate from the runtime ToolStatsSchema — this schema is used for
 * API responses containing pre-computed metrics aggregated over a time window.
 */
export const ToolStatsApiSchema = z.object({
  /** Schema version for forward compatibility (e.g., "1.0.0") */
  version: z.string().min(1),

  /** MCP server name */
  server: z.string().min(1),

  /** Tool name */
  tool: z.string().min(1),

  /** Aggregation time window */
  timeWindow: TimeWindowSchema,

  /** Total number of tool calls in the window */
  totalCalls: z.number().int().min(0),

  /** Success rate as a decimal (0.0 to 1.0) */
  successRate: z.number().min(0).max(1),

  /** Average execution time in milliseconds */
  avgDurationMs: z.number().min(0),

  /** Median (p50) execution time in milliseconds */
  p50DurationMs: z.number().min(0).optional(),

  /** 95th percentile execution time in milliseconds */
  p95DurationMs: z.number().min(0).optional(),

  /** Count of errors by category */
  errorBreakdown: z.record(ErrorCategorySchema, z.number().int().min(0)).optional(),
});

export type ToolStatsApi = z.infer<typeof ToolStatsApiSchema>;
