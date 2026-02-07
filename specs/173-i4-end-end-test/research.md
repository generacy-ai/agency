# Research: Local Provider Integration Testing

## Technology Decisions

### Test Framework: Vitest v3

**Decision**: Use Vitest as the test framework

**Rationale**:
- Already configured in `vitest.config.ts`
- Native TypeScript support without extra configuration
- Fast execution with native ES modules
- Compatible mocking system (`vi.fn()`, `vi.mock()`)

**Alternatives Considered**:
- Jest: Would require additional configuration for TypeScript
- Mocha: Less integrated mocking support

### Integration Test Location

**Decision**: Place tests in `tests/integration/local-flow.test.ts`

**Rationale**:
- Follows emerging pattern in the codebase (`docker.integration.test.ts`)
- Separates integration tests from unit tests
- Clear naming convention (`.integration.test.ts`)

### Temp Directory Strategy

**Decision**: Use `node:fs/promises` with `mkdtemp()` for isolated test environments

**Rationale**:
- Each test runs in complete isolation
- No risk of test pollution or state leakage
- Automatic cleanup prevents disk space issues
- Pattern already established in `tests/providers/local.test.ts`

## Implementation Patterns

### LocalProvider Storage Format

The `.specify/local-tickets.json` file uses this schema:

```typescript
interface LocalTicketStore {
  version: 1;
  nextId: number;  // Auto-incrementing counter
  tickets: Record<string, LocalTicket>;
}

interface LocalTicket {
  id: string;           // "LOCAL-001" format
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'in_progress';
  labels: string[];
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

### ID Generation

- Format: `LOCAL-NNN` with zero-padding to 3 digits minimum
- Extends naturally: `LOCAL-999` → `LOCAL-1000`
- Reference parsing accepts: `LOCAL-001`, `local-001`, `001`, `1`

### Atomic File Writes

LocalProvider uses temp file + rename pattern for atomic writes:

```typescript
const tempFile = `${this.storePath}.tmp.${Date.now()}`;
await writeFile(tempFile, JSON.stringify(store, null, 2));
await rename(tempFile, this.storePath);
```

## Tool Integration

### Tool Execution Pattern

MCP tools return `ToolResult` objects:

```typescript
interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;  // JSON.stringify(result)
  }>;
  isError?: boolean;
}
```

### Error Propagation

Per codebase patterns, provider errors propagate through tools:
- `NotFoundError` for missing tickets
- `ProviderError` for I/O and format errors

### Core API Mock

For integration tests, minimal mocking is needed:

```typescript
const createMockCoreAPI = () => ({
  getConfig: vi.fn(() => mockConfig),
  registerTool: vi.fn(),
  // ... other methods return no-ops
});
```

## Key Sources

- `packages/agency-plugin-spec-kit/src/providers/local.ts` - LocalProvider implementation
- `packages/agency-plugin-spec-kit/tests/providers/local.test.ts` - Unit test patterns
- `packages/agency-plugin-spec-kit/tests/create-ticket-tool.test.ts` - Tool test patterns
- `packages/agency-plugin-spec-kit/vitest.config.ts` - Test configuration
