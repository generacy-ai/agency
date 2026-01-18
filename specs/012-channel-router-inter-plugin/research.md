# Research: Channel Router Implementation

## Technology Decisions

### Semver Version Matching

**Decision**: Use `semver` npm package for version compatibility.

**Rationale**:
- Standard Node.js semver implementation
- Well-tested edge cases
- Supports range matching via `semver.satisfies()`

**Implementation**:
```typescript
import semver from 'semver';

function isVersionCompatible(available: string, minRequired: string): boolean {
  const availableParsed = semver.parse(available);
  const requiredParsed = semver.parse(minRequired);

  if (!availableParsed || !requiredParsed) return false;

  // Same major version, and available >= required
  return availableParsed.major === requiredParsed.major &&
         semver.gte(available, minRequired);
}
```

### Request/Response Pattern

**Decision**: Use correlation IDs with per-channel pending response maps.

**Pattern**:
1. Caller generates correlation ID (or uses existing one)
2. Router stores resolve/reject in `pendingResponses` map
3. Subscriber responds by sending message with same correlation ID
4. Router intercepts responses, resolves pending promise
5. Timeout cleans up pending entry

**Alternatives Considered**:
- Dedicated request/response channels → Too complex, requires channel pairs
- Global pending map → Works but channel-scoped is cleaner
- Callback-based → Promises are more ergonomic

### Error Aggregation

**Decision**: Collect all handler errors, complete all deliveries, then report.

**Implementation**:
```typescript
async send<T>(channel: string, message: MessageEnvelope<T>): Promise<void> {
  const state = this.channels.get(channel);
  const errors: Error[] = [];

  // Parallel delivery
  await Promise.allSettled(
    [...state.subscribers].map(async (handler) => {
      try {
        await handler(message);
      } catch (error) {
        errors.push(error as Error);
      }
    })
  );

  if (errors.length > 0) {
    throw new AggregateError(errors, 'One or more handlers failed');
  }
}
```

### Parallel vs Sequential Delivery

**Decision**: Parallel delivery using `Promise.allSettled`.

**Rationale**:
- Standard pub/sub pattern
- Spec mentions "concurrent delivery"
- Independent handlers shouldn't block each other
- `Promise.allSettled` ensures all handlers run even if some fail

## Implementation Patterns

### Channel Naming Convention

Built-in channels use dot-notation namespacing:
- `agency.*` - Core agency channels
- `plugin.{pluginId}.*` - Plugin-specific channels

### Built-in Channels

| Channel | Owner | Message Types | Purpose |
|---------|-------|---------------|---------|
| `agency.lifecycle` | `@generacy-ai/agency` | `start`, `stop`, `reload` | Plugin lifecycle events |
| `agency.mode` | `@generacy-ai/agency` | `change` | Mode change notifications |
| `agency.telemetry` | `@generacy-ai/agency` | `event`, `metric` | Telemetry aggregation |
| `agency.humancy` | `@generacy-ai/agency` | `*` | Bridge to Humancy |

### Cross-Component Pairing

For channels that bridge components (Agency ↔ Humancy ↔ Generacy):

```typescript
const agencyHumancyChannel: ChannelDefinition = {
  name: 'agency.humancy',
  version: '1.0.0',
  owner: '@generacy-ai/agency',
  messageTypes: ['*'],
  pairedWith: {
    component: 'humancy',
    channelId: 'humancy.agency',
  },
};
```

The `findPair` method locates matching channels for bridging.

## Key Sources

- [Node.js semver package](https://www.npmjs.com/package/semver)
- [MCP Protocol - Tool patterns](https://modelcontextprotocol.io/)
- Existing Agency codebase patterns in `packages/agency/src/`
