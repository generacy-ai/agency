# Data Model: Core Telemetry Capture

## Core Entities

### ToolCallEvent

The primary telemetry event emitted for each tool call.

```typescript
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
```

### TelemetryStorageProvider

Interface that all storage providers must implement.

```typescript
/**
 * Storage provider interface for telemetry events.
 * Providers receive events and store them for later retrieval or analysis.
 */
export interface TelemetryStorageProvider {
  /** Unique provider name for registration */
  readonly name: string;

  /**
   * Initialize the provider (connect to storage, etc.)
   * Called once when provider is registered.
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the provider gracefully.
   * Called when provider is unregistered or system shuts down.
   */
  shutdown(): Promise<void>;

  /**
   * Record a telemetry event.
   * Called for each tool call event. Should not throw.
   * @param event The telemetry event to record
   */
  record(event: ToolCallEvent): Promise<void>;

  /**
   * Query stored events (optional capability).
   * Not all providers need to support querying.
   * @param filter Filter criteria for events
   */
  query?(filter: TelemetryFilter): Promise<ToolCallEvent[]>;

  /**
   * Get aggregated statistics (optional capability).
   * @param filter Filter criteria for stats calculation
   */
  getStats?(filter: StatsFilter): Promise<ToolStats>;
}
```

### TelemetryFilter

Filter criteria for querying events.

```typescript
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
```

### StatsFilter

Filter criteria for statistics queries.

```typescript
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
```

### ToolStats

Aggregated statistics for tool calls.

```typescript
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
```

## Configuration

### TelemetryConfig

Configuration for the telemetry system.

```typescript
export const TelemetryConfigSchema = z.object({
  /** Enable or disable telemetry globally */
  enabled: z.boolean().default(true),

  /** Capture tool input arguments */
  captureInputs: z.boolean().default(true),

  /** Capture tool output results */
  captureOutputs: z.boolean().default(true),

  /** List of provider names to auto-initialize */
  providers: z.array(z.string()).default(['memory']),
});

export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

/** Default configuration */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: true,
  captureInputs: true,
  captureOutputs: true,
  providers: ['memory'],
};
```

## Memory Provider Specific Types

### MemoryProviderOptions

Configuration options for the memory storage provider.

```typescript
export const MemoryProviderOptionsSchema = z.object({
  /** Maximum number of events to store (0 = unlimited) */
  maxEvents: z.number().int().nonnegative().default(10000),
});

export type MemoryProviderOptions = z.infer<typeof MemoryProviderOptionsSchema>;
```

## Relationships

```
┌─────────────────────┐
│  TelemetryConfig    │
└──────────┬──────────┘
           │ configures
           ▼
┌─────────────────────┐         ┌─────────────────────┐
│  TelemetryManager   │────────▶│    TelemetryBus     │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           │ manages                       │ emits to
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│ StorageProvider[]   │◀────────│   ToolCallEvent     │
└─────────────────────┘         └─────────────────────┘
           │
           │ implements
           ▼
┌─────────────────────┐
│MemoryStorageProvider│
└─────────────────────┘
```

## Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| ToolCallEvent.id | Valid UUID v4 | "Invalid event ID format" |
| ToolCallEvent.timestamp | ISO 8601 datetime | "Invalid timestamp format" |
| ToolCallEvent.toolName | Non-empty string | "Tool name is required" |
| ToolCallEvent.serverName | Non-empty string | "Server name is required" |
| ToolCallEvent.durationMs | Non-negative number | "Duration cannot be negative" |
| TelemetryFilter.limit | Positive integer | "Limit must be positive" |
| TelemetryFilter.offset | Non-negative integer | "Offset cannot be negative" |

---

*Generated by speckit*
