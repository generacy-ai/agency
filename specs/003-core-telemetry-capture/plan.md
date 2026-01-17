# Implementation Plan: Core Telemetry Capture

**Feature**: Telemetry interception for MCP tool calls with event bus and provider interface
**Branch**: `003-core-telemetry-capture`
**Status**: Complete

## Summary

Implement core telemetry capture that intercepts all MCP tool calls and emits events to registered storage providers. Uses an event bus pattern for extensibility, with a memory provider as reference implementation. Fire-and-forget recording ensures <5ms overhead.

## Technical Context

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.x (ES2022 target)
- **Key Dependencies**:
  - `@modelcontextprotocol/sdk` ^1.5.0 - MCP server/client infrastructure
  - `zod` ^3.24.1 - Runtime validation and schema definition
- **Package**: `@generacy-ai/agency` (core)
- **Build**: TypeScript with ES modules

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agency Core                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐  │
│  │ MCP Server  │────▶│ Telemetry    │────▶│ Event Bus       │  │
│  │ (wrapped)   │     │ Interceptor  │     │ (TelemetryBus)  │  │
│  └─────────────┘     └──────────────┘     └────────┬────────┘  │
│                                                     │           │
│                                            ┌────────┴────────┐  │
│                                            ▼                 ▼  │
│                                   ┌──────────────┐  ┌──────────┐│
│                                   │MemoryProvider│  │ Plugin   ││
│                                   │ (built-in)   │  │ Provider ││
│                                   └──────────────┘  └──────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
packages/agency/src/
├── index.ts                      # Main exports (add telemetry exports)
├── telemetry/
│   ├── index.ts                  # Telemetry module exports
│   ├── schemas.ts                # ToolCallEvent Zod schemas (versioned)
│   ├── types.ts                  # TypeScript interfaces
│   ├── bus.ts                    # TelemetryBus event emitter
│   ├── interceptor.ts            # Tool call interception logic
│   ├── manager.ts                # TelemetryManager (main API)
│   ├── config.ts                 # Configuration schema and defaults
│   └── providers/
│       ├── index.ts              # Provider exports
│       └── memory.ts             # MemoryStorageProvider implementation
└── __tests__/
    └── telemetry/
        ├── schemas.test.ts       # Schema validation tests
        ├── bus.test.ts           # Event bus tests
        ├── interceptor.test.ts   # Interception tests
        ├── manager.test.ts       # Manager integration tests
        └── memory-provider.test.ts # Memory provider tests
```

## Implementation Strategy

### Phase 1: Core Schema & Types

Define the foundational types and schemas for telemetry events.

**Files**: `schemas.ts`, `types.ts`

- Define `ToolCallEventV1` Zod schema with `.passthrough()` for forward compatibility
- Export TypeScript types derived from Zod schemas
- Define `TelemetryStorageProvider` interface
- Define filter types for optional query methods

### Phase 2: Event Bus

Implement the internal event distribution mechanism.

**Files**: `bus.ts`

- Create `TelemetryBus` class using Node.js `EventEmitter`
- Support subscribe/unsubscribe for providers
- Implement fire-and-forget `emit()` that catches and logs provider errors
- Track provider registration status

### Phase 3: Tool Call Interceptor

Create the interception layer for MCP tool handlers.

**Files**: `interceptor.ts`

- Create `wrapToolHandler()` function that wraps existing handlers
- Capture timing (start/end) around handler execution
- Build `ToolCallEvent` with all required fields
- Handle both success and error cases
- Respect privacy configuration (inputs/outputs)

### Phase 4: Configuration

Define and validate telemetry configuration.

**Files**: `config.ts`

- Define `TelemetryConfig` Zod schema
- Provide sensible defaults (enabled, capture all)
- Export configuration type

### Phase 5: Telemetry Manager

Create the main public API for telemetry.

**Files**: `manager.ts`

- Implement `TelemetryManager` class
- Public methods: `registerProvider()`, `unregisterProvider()`
- Integrate with `TelemetryBus` for event distribution
- Provide `wrapServer()` method to instrument MCP servers
- Handle configuration merging

### Phase 6: Memory Provider

Implement reference storage provider.

**Files**: `providers/memory.ts`

- Implement `TelemetryStorageProvider` interface
- Store events in memory array with configurable max size
- Implement optional `query()` method for testing
- Implement `getStats()` for basic statistics

### Phase 7: Integration & Exports

Wire everything together and export public API.

**Files**: `index.ts`, `telemetry/index.ts`

- Export all public types and classes
- Create convenience factory functions
- Document usage in JSDoc comments

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Event emission | Node.js EventEmitter | Simple, battle-tested, no external deps |
| Schema validation | Zod with `.passthrough()` | Forward-compatible, type-safe |
| Handler wrapping | Function wrapper pattern | Non-invasive, works with existing code |
| Async recording | Fire-and-forget (no await) | Meets <5ms overhead requirement |
| Error isolation | try-catch per provider | One failing provider doesn't affect others |

## Integration Points

### MCP Server Integration

Tool handlers are wrapped at registration time:

```typescript
// Before (standard MCP)
server.setRequestHandler(CallToolRequestSchema, handler);

// After (with telemetry)
const wrappedHandler = telemetry.wrapToolHandler(handler, config);
server.setRequestHandler(CallToolRequestSchema, wrappedHandler);
```

### Provider Registration

```typescript
import { TelemetryManager, MemoryStorageProvider } from '@generacy-ai/agency';

const telemetry = new TelemetryManager(config);
telemetry.registerProvider(new MemoryStorageProvider());
```

## Testing Strategy

| Test Type | Coverage Target | Approach |
|-----------|-----------------|----------|
| Unit | Schemas, Bus, Interceptor | Isolated tests with mocks |
| Integration | Manager with providers | Real provider instances |
| Performance | <5ms overhead | Benchmark tests |

## Dependencies

- No new runtime dependencies (uses existing `zod`)
- Test dependencies: `vitest` (already in devDependencies)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP SDK changes handler API | High | Wrapper pattern isolates changes |
| Memory provider unbounded growth | Medium | Configurable max event count |
| Provider errors cascade | High | Isolated try-catch per provider |

---

*Generated by speckit*
