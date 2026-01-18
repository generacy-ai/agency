# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-18 03:58

### Q1: Error Handling
**Context**: Docker commands can fail in many ways (daemon not running, permission denied, image not found, network issues). The terse output pattern needs a strategy for these errors.
**Question**: How should Docker errors be formatted in terse output? Should errors include full Docker stderr or be summarized?
**Options**:
- A: Full stderr with exit code in structured format
- B: Summarized error message with error category (network, permission, not found, etc.)
- C: Minimal: exit code and first line of stderr only

**Answer**: *Pending*

### Q2: Logs Streaming
**Context**: Acceptance criteria mentions 'Logs streaming support' but MCP tools return single responses. Streaming requires special handling.
**Question**: What streaming mechanism should docker_compose_logs use?
**Options**:
- A: Follow mode with configurable line limit (returns last N lines then polls for new)
- B: Single snapshot of logs (no real streaming, just tail -N equivalent)
- C: Server-Sent Events (SSE) if MCP SDK supports it

**Answer**: *Pending*

### Q3: Container Tracking
**Context**: The spec mentions 'container lifecycle properly managed' which could mean different things for a stateless MCP tool.
**Question**: Should the plugin track container state across tool calls, or rely on Docker's native state queries?
**Options**:
- A: Stateless - each tool call queries Docker directly for current state
- B: Light caching - cache container list for duration of compose session
- C: Full tracking - maintain container registry with health/status

**Answer**: *Pending*

### Q4: Testing Approach
**Context**: Docker testing can use mocks, Docker-in-Docker, or real Docker. Each has tradeoffs for CI and local dev.
**Question**: What testing strategy should be used for Docker tools?
**Options**:
- A: Mock execa/exec calls - fast but may miss integration issues
- B: Spawn real Docker containers in tests (requires Docker in CI)
- C: Both - unit tests with mocks, integration tests with real Docker

**Answer**: *Pending*

### Q5: Tool Parameters
**Context**: Only docker_compose_up parameters are specified. The other 7 tools need parameter definitions for implementation.
**Question**: Should parameter definitions for all 8 tools be added to the spec before implementation, or should implementer use Docker CLI conventions?
**Options**:
- A: Add full parameter schemas to spec for all tools
- B: Use Docker CLI conventions - implementer defines based on docker --help
- C: Minimal required params in spec, optional params follow Docker CLI

**Answer**: *Pending*

