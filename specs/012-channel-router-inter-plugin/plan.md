# Implementation Plan: Channel Router for Inter-Plugin Communication

**Feature**: Channel-based message routing for inter-plugin communication
**Branch**: `012-channel-router-inter-plugin`
**Status**: Complete

## Summary

Enhance the existing `ChannelManager` to fully implement the `ChannelRouter` interface as specified in the requirements. The current implementation provides basic pub/sub functionality but lacks several required features: version compatibility checking, `sendAndWait` (request/response pattern with correlation IDs), `findChannel` with version filtering, `findPair` for cross-component channels, and proper error aggregation on delivery failures.

## Technical Context

- **Language**: TypeScript 5.x (ES2022 target, Node16 module resolution)
- **Runtime**: Node.js 20+
- **Framework**: Pure TypeScript with Zod for runtime validation
- **Testing**: Vitest for unit tests
- **Dependencies**:
  - `semver` package for version compatibility checking
  - `@generacy-ai/contracts` (external) for MessageEnvelope schema (reference only)

## Existing Implementation Analysis

The codebase already has:
- `packages/agency/src/channels/manager.ts` - Basic ChannelManager with register/unregister/send/subscribe
- `packages/agency/src/channels/types.ts` - Core type definitions including MessageHandler, Unsubscribe
- `packages/agency/src/plugins/types.ts` - ChannelDefinition and MessageEnvelope interfaces
- `packages/agency/src/core-api/core-api.ts` - CoreAPI integration with ChannelManager

**Gap Analysis** (what's missing from the spec):
1. ~~`ChannelDefinition.id`~~ - Uses `name` instead (compatible, just naming difference)
2. `ChannelDefinition.version` - Not present, needed for version compatibility
3. `ChannelDefinition.messageTypes` - Not present, needed for validation
4. `ChannelDefinition.pairedWith` - Not present, needed for cross-component pairing
5. `findChannel(id, minVersion?)` - Not implemented
6. `sendAndWait(channelId, message, timeout?)` - Not implemented
7. `findPair(channel)` - Not implemented
8. `getChannels()` - Returns definitions, not just names (partial)
9. Error aggregation on handler failures - Currently swallows errors silently

## Project Structure

```text
packages/agency/src/
├── channels/
│   ├── index.ts           # Public exports (update)
│   ├── types.ts           # Type definitions (update)
│   ├── manager.ts         # ChannelManager class (rename to router.ts, enhance)
│   ├── router.ts          # NEW: ChannelRouter (renamed from manager.ts)
│   ├── version.ts         # NEW: Semver compatibility utilities
│   ├── router.test.ts     # Tests (rename from manager.test.ts, enhance)
│   └── version.test.ts    # NEW: Version utility tests
├── plugins/
│   └── types.ts           # Update ChannelDefinition (add version, messageTypes, pairedWith)
├── core-api/
│   └── types.ts           # Update CoreAPIDependencies interface
└── errors/
    └── agency-error.ts    # Add new error codes (CHANNEL_VERSION_MISMATCH, CHANNEL_TIMEOUT)
```

## Implementation Phases

### Phase 1: Type System Updates
- Update `ChannelDefinition` in `plugins/types.ts` with new fields
- Add new error codes for version mismatch and timeout
- Update `ChannelState` to track pending responses

### Phase 2: Version Compatibility
- Create `version.ts` with semver utilities
- Implement `isVersionCompatible(available, required)` function
- Add tests for version matching

### Phase 3: Router Enhancement
- Rename `manager.ts` to `router.ts` (class remains `ChannelManager` for compatibility, or rename to `ChannelRouter`)
- Add `findChannel(id, minVersion?)` with version filtering
- Add `getChannels()` returning full definitions
- Implement `findPair(channel)` for cross-component channels
- Update error handling to aggregate and report failures

### Phase 4: Request/Response Pattern
- Implement `sendAndWait(channelId, message, timeout?)` with:
  - Correlation ID tracking
  - Response promise management
  - 30-second default timeout
  - Cleanup on timeout/response

### Phase 5: Integration & Built-in Channels
- Update `CoreAPIDependencies` interface
- Register built-in channels on startup:
  - `agency.lifecycle`
  - `agency.mode`
  - `agency.telemetry`
  - `agency.humancy`
- Update exports in `channels/index.ts`

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Version matching | Semver-compatible (same major, >= minor.patch) | Spec requirement; additive compatibility |
| Error handling | Aggregate errors, complete delivery | Graceful degradation per spec |
| Message delivery | Parallel (Promise.all) | Standard pub/sub, parallel execution |
| Default timeout | 30 seconds | Spec requirement |
| Naming | Keep `ChannelManager` or rename to `ChannelRouter` | `ChannelRouter` matches spec class name |

## Testing Strategy

- Unit tests for each new method
- Version compatibility edge cases
- Request/response timeout scenarios
- Error aggregation verification
- Built-in channel registration

## Migration Considerations

- `ChannelManager` can be kept as an alias for backwards compatibility
- Existing channel registrations work unchanged (new fields optional with defaults)
- No breaking changes to public API signatures
