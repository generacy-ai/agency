# Data Model: In-memory telemetry storage provider

## Core Entities

### ToolCallEvent (existing)

Defined in `packages/agency/src/telemetry/schemas.ts`:

```typescript
interface ToolCallEvent {
  id: string;               // UUID v4
  timestamp: string;        // ISO 8601
  toolName: string;
  serverName: string;
  sessionId?: string;
  inputs?: Record<string, unknown>;
  outputs?: unknown;
  error?: string;
  durationMs: number;
  success: boolean;
}
```

### TelemetryFilter (enhancement needed)

Current definition + new field:

```typescript
interface TelemetryFilter {
  toolName?: string;
  serverName?: string;
  sessionId?: string;
  success?: boolean;
  startTime?: string;       // ISO 8601
  endTime?: string;         // ISO 8601
  limit?: number;
  offset?: number;
  durationThresholdMs?: number;  // NEW: Filter events >= this duration
}
```

### ToolStats (existing)

```typescript
interface ToolStats {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50DurationMs?: number;
  p95DurationMs?: number;
  p99DurationMs?: number;
}
```

## New Types

### SubscriberCallback

```typescript
type SubscriberCallback = (event: ToolCallEvent) => void;
```

### MemoryProviderOptions (enhancement)

```typescript
interface MemoryProviderOptions {
  maxEvents?: number;  // Default: 10000, 0 = unlimited
}
```

### CreateTelemetryManagerOptions (new)

```typescript
interface CreateTelemetryManagerOptions extends Partial<TelemetryConfig> {
  storage?: 'memory' | TelemetryStorageProvider;
  maxEvents?: number;  // Passed to MemoryStorageProvider if storage='memory'
}
```

## Interface Changes

### MemoryStorageProvider Interface

Enhanced from base `TelemetryStorageProvider`:

```typescript
interface MemoryTelemetryProvider extends TelemetryStorageProvider {
  // From base interface
  readonly name: string;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  record(event: ToolCallEvent): Promise<void>;
  query(filter: TelemetryFilter): Promise<ToolCallEvent[]>;
  getStats(filter: StatsFilter): Promise<ToolStats>;

  // Memory-specific additions
  subscribe(callback: SubscriberCallback): () => void;
  clear(): void;
  getBufferSize(): number;
  getEventCount(): number;  // Alias for getBufferSize
  getAllEvents(): ToolCallEvent[];
}
```

## Validation Rules

### TelemetryFilter Validation (Zod)

```typescript
const TelemetryFilterSchema = z.object({
  toolName: z.string().optional(),
  serverName: z.string().optional(),
  sessionId: z.string().optional(),
  success: z.boolean().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  durationThresholdMs: z.number().nonnegative().optional(),  // NEW
});
```

## Entity Relationships

```
┌─────────────────────┐
│  TelemetryManager   │
│                     │
│  - config           │
│  - bus              │
└─────────┬───────────┘
          │ registers
          ▼
┌─────────────────────┐
│ MemoryStorageProvider│
│                     │
│  - events[]         │───── stores ────▶ ToolCallEvent[]
│  - subscribers{}    │
│  - maxEvents        │
└─────────────────────┘
          │
          │ notifies
          ▼
┌─────────────────────┐
│  SubscriberCallback │
│  (multiple)         │
└─────────────────────┘
```
