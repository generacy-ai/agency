# Data Model: ActivityService

**Feature**: ActivityService
**Branch**: `054-tg-015-us3-activityservice`

## Core Types

All types are defined in `packages/agency-extension/src/types/activity.ts`.

### ToolCallEvent

Represents a single tool invocation by an agent.

```typescript
interface ToolCallEvent {
  id: string;                          // Unique identifier (UUID)
  toolName: string;                    // Tool name (e.g., "read_file")
  namespace?: string;                  // Tool category (e.g., "file")
  pluginId?: string;                   // Source plugin
  agentId?: string;                    // Agent/session identifier
  input: Record<string, unknown>;      // Tool parameters
  output: ToolResultContent[] | null;  // Result (null if running)
  isError: boolean;                    // Error flag
  errorMessage?: string;               // Error details
  status: ToolCallStatus;              // Current state
  startedAt: number;                   // Start timestamp (ms)
  completedAt?: number;                // End timestamp (ms)
  duration?: number;                   // Execution time (ms)
  containerId?: string;                // Container context
}

type ToolCallStatus = 'pending' | 'running' | 'success' | 'error' | 'timeout';
```

### ActivityFilter

Filter criteria for querying events.

```typescript
interface ActivityFilter {
  toolName?: string;                   // Partial match (case-insensitive)
  namespace?: string;                  // Exact match
  pluginId?: string;                   // Exact match
  agentId?: string;                    // Exact match
  status?: ToolCallStatus | ToolCallStatus[];  // Status filter
  isError?: boolean;                   // Error filter
  startTime?: number;                  // Range start (ms)
  endTime?: number;                    // Range end (ms)
  containerId?: string;                // Exact match
  limit?: number;                      // Max results
  offset?: number;                     // Pagination offset
}
```

### ActivityStats

Aggregated statistics.

```typescript
interface ActivityStats {
  totalCalls: number;                  // Total event count
  successCount: number;                // Success count
  errorCount: number;                  // Error count
  timeoutCount: number;                // Timeout count
  pendingCount: number;                // Pending/running count
  averageDuration: number;             // Mean duration (ms)
  medianDuration?: number;             // Median duration (ms)
  callsPerMinute: number;              // Rate calculation
  topTools: ToolUsageStats[];          // Top tools by usage
  timeRange: { start: number; end: number };  // Stats time window
}
```

### ToolUsageStats

Per-tool statistics.

```typescript
interface ToolUsageStats {
  toolName: string;                    // Tool identifier
  namespace?: string;                  // Tool category
  callCount: number;                   // Total calls
  successRate: number;                 // Success ratio (0-1)
  averageDuration: number;             // Mean duration (ms)
}
```

### ActivityFeedConfig

Service configuration.

```typescript
interface ActivityFeedConfig {
  maxEvents: number;                   // Buffer size (default: 1000)
  refreshInterval: number;             // UI refresh (ms, 0=disabled)
  autoScroll: boolean;                 // Auto-scroll behavior
  defaultFilter?: ActivityFilter;      // Default filter
}
```

### ActivityEventBatch

Batch update payload.

```typescript
interface ActivityEventBatch {
  events: ToolCallEvent[];             // Event array
  isFullRefresh: boolean;              // Replace all vs incremental
  timestamp: number;                   // Batch timestamp
}
```

## Internal Types

### EventBuffer

Internal ring buffer implementation.

```typescript
// Internal implementation detail
class EventBuffer<T> {
  private items: T[];
  private head: number;
  private size: number;
  private maxSize: number;

  add(item: T): void;
  getAll(): T[];
  clear(): void;
}
```

## Relationships

```
┌──────────────────┐
│  ToolCallEvent   │
│  (main entity)   │
└────────┬─────────┘
         │ filtered by
         ▼
┌──────────────────┐
│  ActivityFilter  │
│  (query params)  │
└────────┬─────────┘
         │ produces
         ▼
┌──────────────────┐
│  ActivityStats   │
│  (aggregation)   │
└────────┬─────────┘
         │ contains
         ▼
┌──────────────────┐
│ ToolUsageStats   │
│ (per-tool stats) │
└──────────────────┘
```

## Validation Rules

| Field | Rule |
|-------|------|
| `ToolCallEvent.id` | Non-empty string (UUID format) |
| `ToolCallEvent.toolName` | Non-empty string |
| `ToolCallEvent.startedAt` | Positive number (ms since epoch) |
| `ToolCallEvent.completedAt` | >= startedAt when present |
| `ToolCallEvent.duration` | Positive number when present |
| `ActivityFilter.limit` | Positive integer when present |
| `ActivityFilter.offset` | Non-negative integer when present |
| `ActivityFeedConfig.maxEvents` | Positive integer (min: 100) |

---

*Generated by speckit*
