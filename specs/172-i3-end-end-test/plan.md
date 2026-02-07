# Implementation Plan: I3 - End-to-end test: Jira provider flow

**Feature**: End-to-end integration tests for the spec-kit Jira provider workflow
**Branch**: `172-i3-end-end-test`
**Status**: Complete

## Summary

Create end-to-end integration tests that validate the complete spec-kit workflow using the Jira provider. Tests will use mocked Jira API responses for reliability in CI environments while maintaining the ability to test against real Jira instances when credentials are available.

Based on clarification responses (pending but proceeding with sensible defaults per `completed:clarification` label):
- **Test Environment**: Mocked responses by default, with optional real Jira mode via environment variable
- **Error Handling**: Include comprehensive error scenario tests
- **Test Data**: Use mocked data as primary, with configurable project key for real tests
- **Configuration**: Environment variable-based project key configuration

## Technical Context

- **Language**: TypeScript
- **Test Framework**: Vitest
- **HTTP Mocking**: Vitest mocking (`vi.fn`, `vi.stubGlobal`)
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **API**: Jira REST API v3

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── providers/
│   │   └── jira.ts              # JiraProvider implementation (existing)
│   └── tools/
│       └── *.ts                 # Spec-kit tools (existing)
├── tests/
│   ├── jira-provider.test.ts    # Unit tests (existing)
│   └── integration/
│       └── jira-flow.test.ts    # NEW: E2E integration tests
└── vitest.config.ts
```

## Key Components

### 1. JiraProvider (existing)
Located at `packages/agency-plugin-spec-kit/src/providers/jira.ts`:
- Implements `BacklogProvider` interface
- Methods: `getTicket`, `createTicket`, `updateTicket`, `checkAuth`, `parseRef`, `getTicketUrl`, `setLabels`, `getLabels`
- Uses Jira REST API v3 with Basic Auth (email + API token)
- Handles ADF (Atlassian Document Format) conversion

### 2. Spec-kit Tools
- `get_ticket`: Fetch ticket by reference (PROJ-123 or URL)
- `create_ticket`: Create new Jira issue
- `create_feature`: Create feature branch and spec directory from ticket

### 3. New Integration Test File
`tests/integration/jira-flow.test.ts`:
- Tests complete workflows across multiple tool calls
- Validates Jira-specific behaviors (issue types, priorities, ADF)
- Uses mocked fetch by default, real API optionally

## Test Scenarios

### Scenario 1: Get Ticket by Key
```typescript
test('get_ticket fetches Jira issue by key', async () => {
  // Mock Jira API response
  // Call get_ticket tool with 'PROJ-123'
  // Verify returned ticket structure
});
```

### Scenario 2: Get Ticket by URL
```typescript
test('get_ticket parses Jira URL correctly', async () => {
  // Call with full Jira URL
  // Verify provider detection and ID extraction
});
```

### Scenario 3: Create Ticket
```typescript
test('create_ticket creates Jira issue with Story type', async () => {
  // Mock POST to /rest/api/3/issue
  // Verify default issue type is Story
  // Verify ADF conversion for body
});
```

### Scenario 4: Create Feature from Ticket
```typescript
test('create_feature initializes from Jira ticket', async () => {
  // Mock getTicket
  // Call create_feature with Jira reference
  // Verify spec directory created with ticket content
});
```

### Scenario 5: Error Handling
```typescript
describe('error scenarios', () => {
  test('handles invalid Jira key format');
  test('handles authentication failure (401)');
  test('handles not found (404)');
  test('handles permission denied (403)');
  test('handles rate limiting (429)');
});
```

### Scenario 6: Jira-Specific Fields
```typescript
test('maps Jira status to normalized state', async () => {
  // Done/Closed/Resolved → 'closed'
  // In Progress/Review/Testing → 'in_progress'
  // Open/To Do → 'open'
});

test('extracts Jira metadata correctly', async () => {
  // issueType, priority, assignee, jiraStatus
});
```

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| vitest | ^3.0.5 | Test framework |
| @generacy-ai/agency | workspace:* | Core framework |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JIRA_EMAIL` | Jira account email | For real API tests |
| `JIRA_API_TOKEN` | Jira API token | For real API tests |
| `JIRA_BASE_URL` | Jira instance URL | For real API tests |
| `JIRA_PROJECT_KEY` | Project key (e.g., PROJ) | For real API tests |
| `TEST_REAL_JIRA` | Set to 'true' to enable real API tests | Optional |

## Testing Strategy

1. **Primary Mode (Mocked)**: All tests use mocked fetch responses
   - Fast, deterministic, no external dependencies
   - Runs in CI without credentials
   - Tests all code paths including error handling

2. **Optional Real Mode**: When `TEST_REAL_JIRA=true`
   - Uses actual Jira API
   - Requires valid credentials
   - Uses pre-existing test issues as fixtures
   - Skipped if credentials not available

## Implementation Notes

- Follow existing test patterns from `jira-provider.test.ts`
- Use `vi.stubGlobal('fetch', mockFetch)` for HTTP mocking
- Structure tests similar to `docker.integration.test.ts`
- Include skip conditions for real API tests when credentials unavailable
- Validate all Jira-specific behaviors documented in the spec
