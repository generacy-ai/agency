# Research: In-memory telemetry storage provider

## Technology Decisions

### Subscription Pattern: Observer with Error Isolation

**Decision**: Implement pub-sub with Map-based subscriber storage and try-catch error isolation.

**Alternatives Considered**:
1. **EventEmitter**: Built-in Node.js pattern, but doesn't provide subscriber-level error isolation by default
2. **RxJS Observables**: Powerful but adds dependency overhead for simple use case
3. **Simple callback array**: Lacks efficient removal without indexOf

**Rationale**: Map provides O(1) subscriber management with UUID keys. Error isolation via try-catch ensures one failing subscriber doesn't affect others or the recording operation.

### Ring Buffer Implementation

**Decision**: Use array with shift() for FIFO eviction.

**Alternatives Considered**:
1. **Circular buffer with index**: More memory efficient for very large buffers
2. **Linked list**: Constant-time operations but more complex
3. **Third-party library** (e.g., `denque`): Adds dependency

**Rationale**: For 10,000 events (the default), array shift() performance is acceptable. V8 optimizes this case. If performance becomes an issue, can switch to circular buffer implementation internally without API changes.

### Factory Function vs Constructor Options

**Decision**: Provide both factory function (`createTelemetryManager`) and direct construction.

**Rationale**:
- Factory provides "batteries included" convenience for common cases
- Direct construction allows advanced customization
- Follows patterns in libraries like Winston, Pino

## Implementation Patterns

### Subscriber Callback Signature

```typescript
type SubscriberCallback = (event: ToolCallEvent) => void;
```

Synchronous signature keeps the API simple. Subscribers that need async handling can:
1. Queue events internally
2. Use setImmediate/queueMicrotask

### Unsubscribe Pattern

Return a cleanup function rather than requiring the caller to track IDs:

```typescript
const unsubscribe = provider.subscribe(callback);
// Later:
unsubscribe();
```

This pattern:
- Matches modern React hooks conventions
- Prevents memory leaks from lost subscriber IDs
- Enables easy cleanup in tests

### Duration Threshold Filter

Add `durationThresholdMs` as a "greater than or equal" filter:

```typescript
if (filter.durationThresholdMs !== undefined) {
  results = results.filter(e => e.durationMs >= filter.durationThresholdMs);
}
```

**Design choice**: Single threshold rather than min/max range because the primary use case is "show slow calls" (debugging). If min/max needed later, it's a non-breaking addition.

## Memory Considerations

### Event Size Estimation

Typical `ToolCallEvent` without inputs/outputs:
- id: 36 bytes (UUID string)
- timestamp: 24 bytes (ISO string)
- toolName: ~20 bytes (average)
- serverName: ~20 bytes (average)
- durationMs: 8 bytes (number)
- success: 1 byte (boolean)
- **Total**: ~110 bytes base

With inputs/outputs captured: 500 bytes - 2KB typical

### Memory Budget

For 10,000 events at 500 bytes average:
- **5MB** typical memory usage
- Well under 20MB success criteria

## References

- [Node.js EventEmitter docs](https://nodejs.org/api/events.html)
- [MCP SDK Server patterns](https://github.com/modelcontextprotocol/sdk)
- [Zod schema validation](https://zod.dev)
