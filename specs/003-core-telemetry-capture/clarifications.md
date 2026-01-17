# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-17 21:25

### Q1: Interception Approach
**Context**: The spec requires intercepting MCP tool calls, but Agency's architecture isn't established yet. The interception approach affects the entire design.
**Question**: Should the interception be middleware-based (wrapping the MCP server), decorator-based (wrapping individual tools), or event-based (subscribing to a tool execution bus)?
**Options**:
- A: Middleware: Wrap MCP server request/response handling
- B: Decorator: Wrap individual tool handlers with telemetry
- C: Event bus: Emit events that telemetry subscribes to

**Answer**: **C - Event bus**: The architecture emphasizes extensibility via channels and plugin registration patterns. An event bus aligns with existing channel/message patterns, allows telemetry to be one of many subscribers (future: analytics, debugging, Humancy integration), is "additive-only" (existing tools don't need modification), and plugins simply emit events without needing to know about telemetry.

### Q2: Built-in Providers
**Context**: The config shows 'memory' and 'file' providers but it's unclear if this feature should include them or just the interface.
**Question**: Should this feature include default storage provider implementations (memory, file), or only define the interface for external providers?
**Options**:
- A: Interface only - providers are separate features/plugins
- B: Include a memory provider as reference implementation
- C: Include both memory and file providers as defaults

**Answer**: **B - Memory provider as reference**: Include one reference implementation for testing that the interface actually works, demonstrating expected behavior, and zero-config dev experience. File provider has filesystem concerns (paths, permissions, rotation) that make it a better fit as a separate plugin later.

### Q3: Provider Failure Handling
**Context**: Storage providers might fail (disk full, network issues). This affects reliability guarantees.
**Question**: When a storage provider fails to record an event, should telemetry: fail silently, log and continue, retry, or throw to the caller?
**Options**:
- A: Fail silently - never impact tool execution
- B: Log warning and continue - fire-and-forget
- C: Retry with backoff, then log and continue

**Answer**: **B - Log warning and continue**: Telemetry should never impact tool execution, but silent failure makes debugging impossible. A logged warning provides visibility without blocking. This aligns with the "terse output pattern" - minimal impact on success.

### Q4: Async vs Sync Recording
**Context**: Recording telemetry could block the tool response or happen asynchronously. This affects the <5ms overhead requirement.
**Question**: Should telemetry recording be synchronous (wait for record() to complete) or fire-and-forget (async background recording)?
**Options**:
- A: Synchronous - wait for all providers to record
- B: Fire-and-forget - record() called but not awaited
- C: Configurable per-provider

**Answer**: **B - Fire-and-forget**: The <5ms overhead requirement essentially mandates this. Synchronous waiting for storage (especially network-based providers) could easily violate this constraint. Fire-and-forget is the only reliable way to guarantee minimal overhead.

### Q5: ToolCallEvent Schema Source
**Context**: The spec references ToolCallEvent from generacy-ai/contracts#2, but that may not exist yet. This blocks implementation.
**Question**: Should this feature define the ToolCallEvent schema locally, or wait for generacy-ai/contracts#2 to define it first?
**Options**:
- A: Define locally - contracts can adopt/align later
- B: Wait for contracts - this feature depends on that schema
- C: Define locally with explicit compatibility layer for future contracts

**Answer**: **C - Define locally with compatibility layer**: Don't block on external dependencies, but plan for future alignment. Follow the Zod versioning pattern: export ToolCallEventV1 schema with .passthrough() to allow @generacy-ai/contracts to adopt this schema later without breaking changes.

