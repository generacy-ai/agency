# Feature Specification: Core telemetry capture

**Branch**: `003-core-telemetry-capture` | **Date**: 2026-01-17 | **Status**: Draft

## Summary

Implement core telemetry capture in Agency that intercepts all MCP tool calls and emits events to registered storage providers.

## Parent Epic

#2 - Tool Call Telemetry & Observability

## Dependencies

- generacy-ai/contracts#2 - Telemetry event schemas (soft dependency - will define schema locally with compatibility layer)

## Design Decisions

The following decisions were made based on clarification discussions:

### Interception Approach: Event Bus (Option C)

The architecture uses an event bus pattern for telemetry interception:
- Aligns with existing channel/message patterns in Agency
- Allows telemetry to be one of many subscribers (future: analytics, debugging, Humancy integration)
- Is "additive-only" - existing tools don't need modification
- Plugins simply emit events; they don't need to know about telemetry

### Built-in Providers: Memory Provider as Reference (Option B)

Include one reference implementation (memory provider) for:
- Testing that the interface actually works
- Demonstrating expected behavior
- Zero-config dev experience

File provider has filesystem concerns (paths, permissions, rotation) that make it a better fit as a separate plugin.

### Provider Failure Handling: Log Warning and Continue (Option B)

Telemetry should never impact tool execution, but silent failure makes debugging impossible. A logged warning provides visibility without blocking. This aligns with the "terse output pattern" - minimal impact on success.

### Recording Mode: Fire-and-Forget (Option B)

The <5ms overhead requirement mandates fire-and-forget async recording. Synchronous waiting for storage (especially network-based providers) could easily violate this constraint.

### Schema Source: Local Definition with Compatibility Layer (Option C)

Define ToolCallEvent schema locally using Zod versioning pattern with `.passthrough()` to allow `@generacy-ai/contracts` to adopt this schema later without breaking changes.

## Requirements

### Interception Layer

- Implement event bus for tool call notifications
- Emit events before and after each tool execution
- Calculate duration, detect success/failure
- Emit `ToolCallEvent` to all registered storage providers via fire-and-forget pattern

### Event Data

Capture for each tool call:
- Tool and server identification
- Full inputs (respecting privacy settings)
- Full outputs or error details
- Timing metrics
- Session context

### Storage Provider Interface

```typescript
interface TelemetryStorageProvider {
  name: string;
  
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Events
  record(event: ToolCallEvent): Promise<void>;
  
  // Queries (optional - not all providers need to support)
  query?(filter: TelemetryFilter): Promise<ToolCallEvent[]>;
  getStats?(filter: StatsFilter): Promise<ToolStats>;
}
```

### Registration API

```typescript
// In Agency core
agency.telemetry.registerProvider(provider: TelemetryStorageProvider);
agency.telemetry.unregisterProvider(name: string);
```

### Configuration

```json
{
  "telemetry": {
    "enabled": true,
    "captureInputs": true,
    "captureOutputs": true,
    "providers": ["memory"]
  }
}
```

### ToolCallEvent Schema

Define locally with versioning for future contracts compatibility:

```typescript
import { z } from 'zod';

export const ToolCallEventV1 = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  toolName: z.string(),
  serverName: z.string(),
  sessionId: z.string().optional(),

  // Inputs (optional based on privacy settings)
  inputs: z.record(z.unknown()).optional(),

  // Outputs (optional based on privacy settings)
  outputs: z.unknown().optional(),
  error: z.string().optional(),

  // Timing
  durationMs: z.number(),
  success: z.boolean(),
}).passthrough(); // Allow future fields

export const ToolCallEvent = ToolCallEventV1;
export type ToolCallEvent = z.infer<typeof ToolCallEvent>;
```

## Acceptance Criteria

- [ ] All MCP tool calls emit telemetry events via event bus
- [ ] Storage provider interface defined and documented
- [ ] Memory provider included as reference implementation
- [ ] At least one provider can be registered and receives events
- [ ] Privacy settings respected (inputs/outputs can be omitted)
- [ ] Minimal performance overhead (<5ms per call) via fire-and-forget recording
- [ ] Provider failures logged as warnings, never block tool execution

## User Stories

### US1: Plugin Developer Telemetry

**As a** plugin developer,
**I want** to receive telemetry events for all tool calls,
**So that** I can build debugging, analytics, or observability features.

**Acceptance Criteria**:
- [ ] Can register a storage provider via `agency.telemetry.registerProvider()`
- [ ] Provider receives `ToolCallEvent` for every tool execution
- [ ] Events include timing, inputs/outputs (if enabled), and success/failure

### US2: Privacy-Aware Telemetry

**As a** user concerned about privacy,
**I want** to configure what data telemetry captures,
**So that** sensitive inputs/outputs are not logged.

**Acceptance Criteria**:
- [ ] Can disable telemetry entirely via `enabled: false`
- [ ] Can disable input capture via `captureInputs: false`
- [ ] Can disable output capture via `captureOutputs: false`

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Event bus for tool call notifications | P1 | Core interception mechanism |
| FR-002 | TelemetryStorageProvider interface | P1 | Provider contract |
| FR-003 | Provider registration/unregistration | P1 | Runtime provider management |
| FR-004 | Memory provider implementation | P1 | Reference implementation |
| FR-005 | Fire-and-forget async recording | P1 | Performance requirement |
| FR-006 | Configuration schema | P2 | Privacy controls |
| FR-007 | Provider failure logging | P2 | Error handling |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Telemetry overhead | <5ms | Benchmark tool calls with/without telemetry |
| SC-002 | Event coverage | 100% | All tool calls emit events |
| SC-003 | Provider isolation | No impact | Provider failures don't affect tool execution |

## Assumptions

- MCP SDK provides hooks or extension points for tool call interception
- Async event emission is acceptable (events may be slightly delayed)
- Memory provider is sufficient for initial testing/development

## Out of Scope

- File storage provider (separate plugin)
- Event persistence across restarts
- Event aggregation or analytics
- Query API implementation (optional interface method)
- Real-time streaming of events

---

*Generated by speckit*
