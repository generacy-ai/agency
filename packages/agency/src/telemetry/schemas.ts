import { z } from 'zod';

/**
 * Version 1 of the ToolCallEvent schema.
 * Uses .passthrough() to allow future fields without breaking changes.
 */
export const ToolCallEventV1 = z.object({
  /** Unique event identifier (UUID v4) */
  id: z.string().uuid(),

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
