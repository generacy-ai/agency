# Tool Call Events and Telemetry

This module provides schemas and types for capturing tool call events, statistics, and metrics in the Generacy agent execution environment.

## Purpose

Tool call telemetry enables:
- Tracking of tool invocation events with session correlation
- Aggregation of tool usage statistics and success rates
- Error categorization and analysis
- Time-window based performance metrics
- Anonymous metrics for privacy-preserving analytics

## Migrated from @generacy-ai/contracts

This module was migrated from `@generacy-ai/contracts/telemetry/` as part of the contracts retirement effort (Issue 246-1-9).

## Exports

- **ToolCallEventSchema**: Schema for individual tool call events with inputs, duration, and results
- **ToolStatsSchema**: Schema for aggregated tool statistics (total calls, success rate, avg duration)
- **ErrorCategorySchema**: Schema for categorizing tool errors (validation, execution, timeout, permission)
- **TimeWindowSchema**: Schema for time-based analysis windows
- **AnonymousToolMetricSchema**: Schema for privacy-preserving tool metrics

## Usage

```typescript
import {
  ToolCallEventSchema,
  ToolStatsSchema,
  ErrorCategory
} from '@generacy-ai/agency';

// Capture a tool call event
const event = ToolCallEventSchema.parse({
  id: generateId(),
  version: '1.0.0',
  timestamp: new Date().toISOString(),
  sessionId: sessionId,
  server: 'agency-001',
  tool: 'file.read_content',
  inputs: { path: '/path/to/file' },
  durationMs: 45,
  success: true
});

// Track tool statistics
const stats = ToolStatsSchema.parse({
  tool: 'git.commit_changes',
  totalCalls: 150,
  successRate: 0.98,
  avgDurationMs: 230,
  errorCategories: {
    [ErrorCategory.VALIDATION]: 2,
    [ErrorCategory.EXECUTION]: 1
  }
});
```

## Integration

This module integrates with the existing `TelemetryInterceptor` in `../interceptor.ts` to capture tool call events during agent execution. Events are published to the telemetry bus for analysis and monitoring.
