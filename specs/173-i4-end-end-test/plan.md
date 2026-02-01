# Implementation Plan: End-to-End Test - Local Provider Flow

**Feature**: End-to-end tests for spec-kit Local provider (offline mode)
**Branch**: `173-i4-end-end-test`
**Status**: Complete

## Summary

Create comprehensive integration tests that verify the complete spec-kit workflow using the LocalProvider for offline ticket management. Tests will validate ticket creation, retrieval, persistence, numbering, and full workflow scenarios without requiring network connectivity.

## Technical Context

| Aspect | Value |
|--------|-------|
| Language | TypeScript |
| Test Framework | Vitest v3 |
| Package | `@generacy-ai/agency-plugin-spec-kit` |
| Target Provider | `LocalProvider` |
| Storage Format | `.specify/local-tickets.json` |

## Dependencies

- **I1**: Plugin wired up (spec-kit MCP integration)
- **A4**: LocalProvider implementation (`src/providers/local.ts`)

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── providers/
│   │   ├── local.ts              # LocalProvider implementation
│   │   └── types.ts              # BacklogProvider interface
│   └── tools/
│       ├── create-ticket.ts      # create_ticket tool
│       ├── get-ticket.ts         # get_ticket tool
│       └── create-feature.ts     # create_feature tool
└── tests/
    └── integration/
        └── local-flow.test.ts    # NEW: Integration tests
```

## Implementation Approach

### Test Infrastructure

- Use Vitest's temp directory pattern for isolated test environments
- Each test gets a fresh `.specify/` directory
- Automatic cleanup via `afterEach()` hooks
- Mock only the core API; use real LocalProvider implementation

### Test Scenarios

1. **Create and Retrieve** - Validate ticket lifecycle
2. **Persistence** - Verify JSON file storage
3. **Offline Full Workflow** - End-to-end without network
4. **Ticket Numbering** - Validate LOCAL-NNN format and sequencing
5. **State Management** - Test ticket state transitions
6. **Error Handling** - Verify proper error propagation

### Tool Integration

Tests will use the actual MCP tool implementations:
- `createTicketTool` from `src/tools/create-ticket.ts`
- `getTicketTool` from `src/tools/get-ticket.ts`
- `createFeatureTool` from `src/tools/create-feature.ts`

### Key Patterns

```typescript
// Temp directory setup
let tempDir: string;
beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'local-flow-'));
});
afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// Tool execution helper
const executeTool = async (tool, args) => {
  const result = await tool.execute(args, mockCoreAPI);
  return JSON.parse(result.content[0].text);
};
```

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test runner | Vitest | Already used throughout the codebase |
| Mocking | vi.fn() | Native Vitest mocking |
| File system | Real (temp dirs) | Integration tests need real I/O |
| Network | None | Tests must work offline |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Test pollution | Isolated temp directories per test |
| Race conditions | Sequential test execution for state-dependent tests |
| File system errors | Proper cleanup in afterEach with force flag |

## Out of Scope

- GitHub provider integration tests (separate issue)
- Network-dependent operations
- Performance benchmarking

## Next Steps

After plan approval, run `/speckit:tasks` to generate the detailed task list.
