# Tool Call Events and Telemetry

This module provides schemas and types for capturing tool call events, statistics, and metrics in the Generacy agent execution environment.

## Purpose

Tool call telemetry enables:
- Tracking of tool invocation events with session correlation
- Aggregation of tool usage statistics and success rates
- Error categorization and analysis
- Time-window based performance metrics

## Migrated from @generacy-ai/contracts

This module was migrated from `@generacy-ai/contracts/telemetry/` as part of the contracts retirement effort (Issue #296).

## Exports

- **ToolCallEventV1** / **ToolCallEvent**: Schema for individual tool call events with inputs, duration, and results
- **ToolStatsSchema**: Schema for runtime-aggregated tool statistics (total calls, counts, duration percentiles)
- **ToolStatsApiSchema**: Schema for API-facing aggregated statistics (success rate, error breakdown, time windows)
- **ErrorCategorySchema**: Schema for categorizing tool errors (validation, timeout, permission, network, internal, unknown)
- **TimeWindowSchema**: Schema for time-based analysis windows
- **generateEventId**: ULID-based event ID generator

## Usage

```typescript
import {
  ToolCallEventV1,
  ToolStatsApiSchema,
  ErrorCategory,
  generateEventId,
} from '@generacy-ai/agency';

// Capture a tool call event
const event = ToolCallEventV1.parse({
  id: generateEventId(),
  timestamp: new Date().toISOString(),
  toolName: 'file.read_content',
  serverName: 'agency-001',
  inputs: { path: '/path/to/file' },
  durationMs: 45,
  success: true,
});

// API-facing aggregated statistics
const apiStats = ToolStatsApiSchema.parse({
  version: '1.0.0',
  server: 'agency-001',
  tool: 'source_control.commit_changes',
  timeWindow: 'last_7d',
  totalCalls: 150,
  successRate: 0.98,
  avgDurationMs: 230,
  errorBreakdown: {
    [ErrorCategory.VALIDATION]: 2,
    [ErrorCategory.INTERNAL]: 1,
  },
});
```

## Integration

This module integrates with the existing `TelemetryInterceptor` in `../interceptor.ts` to capture tool call events during agent execution. Events are published to the telemetry bus for analysis and monitoring.
