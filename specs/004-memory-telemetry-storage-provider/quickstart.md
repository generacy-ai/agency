# Quickstart: In-memory telemetry storage provider

## Installation

The memory storage provider is included in `@generacy-ai/agency` core package.

```bash
pnpm add @generacy-ai/agency
```

## Basic Usage

### Using the Factory Function (Recommended)

```typescript
import { createTelemetryManager } from '@generacy-ai/agency';

// Create manager with memory storage (default)
const telemetry = createTelemetryManager({ storage: 'memory' });

// Custom buffer size
const telemetry = createTelemetryManager({
  storage: 'memory',
  maxEvents: 5000
});
```

### Manual Setup

```typescript
import { TelemetryManager, MemoryStorageProvider } from '@generacy-ai/agency';

const manager = new TelemetryManager();
const provider = new MemoryStorageProvider({ maxEvents: 10000 });

await manager.registerProvider(provider);
```

## Querying Events

```typescript
const provider = telemetry.getProvider('memory');

// Get all events
const events = await provider.query({});

// Filter by tool name
const readEvents = await provider.query({ toolName: 'read_file' });

// Filter by duration (slow calls >= 100ms)
const slowCalls = await provider.query({ durationThresholdMs: 100 });

// Filter by time range
const recentEvents = await provider.query({
  startTime: new Date(Date.now() - 3600000).toISOString()  // Last hour
});

// Combined filters
const failedSlowCalls = await provider.query({
  success: false,
  durationThresholdMs: 500
});

// Pagination
const page2 = await provider.query({ offset: 100, limit: 50 });
```

## Real-time Subscriptions

```typescript
const provider = telemetry.getProvider('memory');

// Subscribe to new events
const unsubscribe = provider.subscribe((event) => {
  console.log(`Tool ${event.toolName}: ${event.durationMs}ms`);
});

// Later: clean up
unsubscribe();
```

### Multiple Subscribers

```typescript
// UI component subscription
const unsubscribeUI = provider.subscribe((event) => {
  updateDashboard(event);
});

// Logging subscription
const unsubscribeLogger = provider.subscribe((event) => {
  logger.debug('Tool call', event);
});

// Each subscriber is independent - errors in one don't affect others
```

## Statistics

```typescript
const provider = telemetry.getProvider('memory');

// Overall stats
const stats = await provider.getStats({});
console.log(`Success rate: ${stats.successCount / stats.totalCalls * 100}%`);
console.log(`Avg duration: ${stats.avgDurationMs}ms`);
console.log(`P95 duration: ${stats.p95DurationMs}ms`);

// Stats for specific tool
const toolStats = await provider.getStats({ toolName: 'search' });
```

## Buffer Management

```typescript
const provider = telemetry.getProvider('memory');

// Check buffer size
console.log(`Events in buffer: ${provider.getBufferSize()}`);

// Clear all events
provider.clear();
```

## Integration with MCP Server

```typescript
import { TelemetryManager, MemoryStorageProvider } from '@generacy-ai/agency';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const telemetry = createTelemetryManager({ storage: 'memory' });
const wrap = telemetry.instrumentServer('my-server');

// Wrap tool handlers
const wrappedHandler = wrap(originalHandler, 'tool-name');
```

## Troubleshooting

### Events Not Appearing

1. Check that telemetry is enabled:
   ```typescript
   console.log(telemetry.isEnabled());  // Should be true
   ```

2. Verify provider is registered:
   ```typescript
   console.log(telemetry.getProviderNames());  // Should include 'memory'
   ```

### Memory Usage

The default buffer holds 10,000 events. Adjust if needed:

```typescript
const telemetry = createTelemetryManager({
  storage: 'memory',
  maxEvents: 1000  // Smaller buffer for memory-constrained environments
});
```

### Subscription Cleanup

Always unsubscribe when done to prevent memory leaks:

```typescript
// In React component
useEffect(() => {
  const unsubscribe = provider.subscribe(handleEvent);
  return () => unsubscribe();  // Cleanup on unmount
}, []);
```
