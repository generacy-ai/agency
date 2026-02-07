# Research: Jira E2E Testing

## Technology Decisions

### 1. Test Mode Architecture

**Decision**: Dual-mode testing with mocked responses as default

**Rationale**:
- CI environments don't have Jira credentials
- Mocked tests are fast and deterministic
- Real API tests validate actual integration when needed
- Environment variable toggle (`TEST_REAL_JIRA`) controls mode

**Alternatives Considered**:
- Real Jira only: Rejected - requires credentials, slower, flaky
- Mock only: Rejected - can't validate real API behavior
- Separate test suites: Rejected - duplicates test logic

### 2. HTTP Mocking Strategy

**Decision**: Use `vi.stubGlobal('fetch', mockFetch)` matching existing patterns

**Rationale**:
- Consistent with `jira-provider.test.ts` patterns
- No additional dependencies required
- Full control over response timing and errors
- Works with native fetch used by JiraProvider

**Alternatives Considered**:
- MSW (Mock Service Worker): Heavier, more setup
- Nock: HTTP-level mocking, more complex
- Custom HTTP client: Would require refactoring provider

### 3. Test Data Management

**Decision**: Inline mock responses in test files

**Rationale**:
- Self-contained, readable tests
- No fixture file management
- Easy to customize per test case
- Matches existing test patterns

**Alternatives Considered**:
- Separate fixture files: More setup, harder to modify per-test
- Factory functions: Good for many variants, overkill here
- Recorded responses: Requires initial recording, can become stale

### 4. Test Organization

**Decision**: Single integration test file with describe blocks

**Rationale**:
- All Jira E2E tests in one place
- Shared setup (mocks, config) across tests
- Clear separation from unit tests via `/integration` directory
- Follows `docker.integration.test.ts` pattern

## Implementation Patterns

### Skip Conditions for Real API Tests

```typescript
function skipIfNoJiraCredentials(fn: () => void | Promise<void>) {
  return async () => {
    if (process.env['TEST_REAL_JIRA'] !== 'true') {
      console.log('Skipping: TEST_REAL_JIRA not set');
      return;
    }
    if (!process.env['JIRA_EMAIL'] || !process.env['JIRA_API_TOKEN']) {
      console.log('Skipping: Jira credentials not configured');
      return;
    }
    return fn();
  };
}
```

### Mock Response Factory

```typescript
function createMockJiraIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: '10001',
    key: 'PROJ-123',
    self: 'https://company.atlassian.net/rest/api/3/issue/10001',
    fields: {
      summary: 'Test Issue',
      description: null,
      status: { name: 'Open', statusCategory: { key: 'new', name: 'To Do' } },
      labels: [],
      issuetype: { name: 'Story', id: '1' },
      priority: null,
      assignee: null,
    },
    ...overrides,
  };
}
```

### Testing Tool Execution

```typescript
// Create tool with mocked provider
const tool = createGetTicketTool(config, getProvider);
const result = await tool.execute({ ref: 'PROJ-123' });

// Parse and validate response
expect(result.isError).toBeFalsy();
const parsed = JSON.parse((result.content[0] as { text: string }).text);
expect(parsed.title).toBe('Test Issue');
```

## Jira API Reference

### Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rest/api/3/myself` | GET | Auth check |
| `/rest/api/3/issue/{key}` | GET | Fetch issue |
| `/rest/api/3/issue` | POST | Create issue |
| `/rest/api/3/issue/{key}` | PUT | Update issue |

### ADF (Atlassian Document Format)

Simple paragraph:
```json
{
  "type": "doc",
  "version": 1,
  "content": [{
    "type": "paragraph",
    "content": [{ "type": "text", "text": "Hello" }]
  }]
}
```

### Error Response Format

```json
{
  "errorMessages": ["Issue does not exist or you do not have permission to see it."],
  "errors": {}
}
```

## Key Sources

- Existing tests: `packages/agency-plugin-spec-kit/tests/jira-provider.test.ts`
- Provider implementation: `packages/agency-plugin-spec-kit/src/providers/jira.ts`
- Integration test pattern: `packages/agency-plugin-docker/src/__tests__/integration/docker.integration.test.ts`
- Tool tests: `packages/agency-plugin-spec-kit/tests/get-ticket-tool.test.ts`
