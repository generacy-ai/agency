# Implementation Plan: In-memory telemetry storage provider

**Feature**: Implement the default in-memory storage provider for real-time telemetry viewing
**Branch**: `004-memory-telemetry-storage-provider`
**Status**: Complete

## Summary

Enhance the existing `MemoryStorageProvider` with real-time subscription support, duration threshold filtering, and a factory function for easy setup. The core storage functionality (ring buffer, FIFO eviction, query, stats) already exists and only needs minor additions.

## Technical Context

- **Language**: TypeScript 5.x
- **Runtime**: Node.js 20+
- **Dependencies**: `zod` (runtime validation), `@modelcontextprotocol/sdk`
- **Build System**: turborepo with pnpm workspaces
- **Test Framework**: vitest

## Dependency Analysis

This feature depends on #3 (Core telemetry capture) which provides:
- `TelemetryStorageProvider` interface ✓ (exists in `types.ts`)
- `ToolCallEvent` type ✓ (exists in `schemas.ts`)
- `TelemetryFilter` type ✓ (exists in `schemas.ts`)
- `TelemetryManager` class ✓ (exists in `manager.ts`)

## Existing Implementation Review

The `MemoryStorageProvider` at `packages/agency/src/telemetry/providers/memory.ts` already implements:
- ✓ Ring buffer with configurable max size (default 10000)
- ✓ FIFO eviction when buffer is full
- ✓ Query with filtering (toolName, serverName, sessionId, success, time range)
- ✓ Stats aggregation with percentiles
- ✓ Clear functionality
- ✓ `getEventCount()` method

## Gap Analysis

| Spec Requirement | Current State | Work Required |
|-----------------|---------------|---------------|
| `durationThresholdMs` filter | Not implemented | Add to query() |
| Real-time subscription | Not implemented | Add subscribe() method |
| Multiple subscribers with error isolation | Not implemented | Implement subscriber management |
| `getBufferSize()` method | `getEventCount()` exists | Rename/add method |
| Factory function | Not implemented | Add `createTelemetryManager()` |

## Project Structure

```
packages/agency/src/
├── telemetry/
│   ├── schemas.ts           # ADD: durationThresholdMs to TelemetryFilter
│   ├── types.ts             # UPDATE: Add subscription types
│   ├── providers/
│   │   ├── memory.ts        # UPDATE: Add subscribe(), getBufferSize()
│   │   └── index.ts         # (existing)
│   ├── factory.ts           # NEW: createTelemetryManager()
│   └── index.ts             # UPDATE: Export factory
└── __tests__/
    └── telemetry/
        ├── memory-provider.test.ts  # UPDATE: Add subscription tests
        └── factory.test.ts          # NEW: Factory tests
```

## Implementation Approach

### 1. Schema Enhancement

Add `durationThresholdMs` to `TelemetryFilterSchema`:

```typescript
// In schemas.ts
durationThresholdMs: z.number().nonnegative().optional(),
```

### 2. Subscription System

Add subscriber management to `MemoryStorageProvider`:

```typescript
type SubscriberCallback = (event: ToolCallEvent) => void;

private subscribers = new Map<string, SubscriberCallback>();

subscribe(callback: SubscriberCallback): () => void {
  const id = crypto.randomUUID();
  this.subscribers.set(id, callback);
  return () => this.subscribers.delete(id);
}

// In record():
for (const [id, callback] of this.subscribers) {
  try {
    callback(event);
  } catch (error) {
    // Log but don't propagate - error isolation
  }
}
```

### 3. Factory Function

```typescript
// In factory.ts
interface CreateTelemetryManagerOptions {
  storage?: 'memory' | TelemetryStorageProvider;
  maxEvents?: number;
  // ... other TelemetryConfig options
}

export function createTelemetryManager(
  options: CreateTelemetryManagerOptions = {}
): TelemetryManager {
  const manager = new TelemetryManager(options);

  if (options.storage === 'memory' || options.storage === undefined) {
    const provider = new MemoryStorageProvider({
      maxEvents: options.maxEvents
    });
    manager.registerProvider(provider);
  } else if (options.storage) {
    manager.registerProvider(options.storage);
  }

  return manager;
}
```

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Use `Map` for subscribers | O(1) add/remove, unique keys via UUID |
| Error isolation via try-catch | Prevents one subscriber from breaking others |
| Synchronous callback invocation | Keep record() simple, subscribers handle async internally |
| Factory returns initialized manager | Batteries-included experience |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Subscription memory leaks | Return unsubscribe function, document cleanup |
| Slow subscribers blocking record() | Document that callbacks should be fast, async handlers for heavy work |
| Breaking changes to existing API | All changes are additive |

## Suggested Next Step

Run `/speckit:tasks` to generate the detailed task list from this plan.
