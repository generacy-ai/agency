# Quickstart: Jira E2E Tests

## Running the Tests

### Default Mode (Mocked)

```bash
# Run all tests in the spec-kit package
cd packages/agency-plugin-spec-kit
pnpm test

# Run only Jira integration tests
pnpm test tests/integration/jira-flow.test.ts

# Run with verbose output
pnpm test tests/integration/jira-flow.test.ts --reporter=verbose
```

### Real Jira Mode

```bash
# Set required environment variables
export JIRA_EMAIL="your-email@company.com"
export JIRA_API_TOKEN="your-api-token"
export JIRA_BASE_URL="https://your-instance.atlassian.net"
export JIRA_PROJECT_KEY="PROJ"
export TEST_REAL_JIRA="true"

# Run tests
pnpm test tests/integration/jira-flow.test.ts
```

## Getting Jira API Token

1. Go to https://id.atlassian.com/manage/api-tokens
2. Click "Create API token"
3. Give it a name (e.g., "spec-kit-tests")
4. Copy the token value

## Test Structure

```
tests/integration/jira-flow.test.ts
├── describe('Jira E2E Flow')
│   ├── describe('get_ticket')
│   │   ├── 'fetches issue by key'
│   │   ├── 'fetches issue by URL'
│   │   └── 'returns correct metadata'
│   ├── describe('create_ticket')
│   │   ├── 'creates Story issue'
│   │   └── 'includes labels and body'
│   ├── describe('error handling')
│   │   ├── 'handles invalid key format'
│   │   ├── 'handles auth failure'
│   │   └── 'handles not found'
│   └── describe('Jira-specific behaviors')
│       ├── 'maps status to state'
│       └── 'extracts metadata'
```

## Expected Test Output

### Mocked Mode (default)
```
✓ tests/integration/jira-flow.test.ts (12)
   ✓ Jira E2E Flow (12)
      ✓ get_ticket (3)
         ✓ fetches issue by key
         ✓ fetches issue by URL
         ✓ returns correct metadata
      ✓ create_ticket (2)
         ✓ creates Story issue
         ✓ includes labels and body
      ...

Test Files  1 passed (1)
Tests       12 passed (12)
```

### Real API Mode
```
✓ tests/integration/jira-flow.test.ts (6)
   ✓ Jira E2E Flow (real API) (6)
      ✓ fetches real issue
      ✓ validates auth
      ...

⊙ Skipped tests: 0

Test Files  1 passed (1)
Tests       6 passed (6)
```

## Troubleshooting

### "Jira authentication not configured"
- Check `JIRA_EMAIL` and `JIRA_API_TOKEN` environment variables
- Ensure token is valid and not expired

### "Jira configuration missing"
- Set `JIRA_BASE_URL` and `JIRA_PROJECT_KEY`
- Or update `speckit.config.ts` with Jira settings

### "Issue does not exist"
- Verify the test issue exists in Jira
- Check project key matches configured value
- Ensure account has read permissions

### Tests skip with "TEST_REAL_JIRA not set"
- This is expected in mocked mode
- Set `TEST_REAL_JIRA=true` for real API tests

## CI Configuration

### GitHub Actions

```yaml
- name: Run spec-kit tests
  run: pnpm test
  working-directory: packages/agency-plugin-spec-kit

# Optional: Real Jira tests (requires secrets)
- name: Run Jira E2E tests (real API)
  if: github.event_name == 'schedule'
  env:
    JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
    JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
    JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
    JIRA_PROJECT_KEY: ${{ secrets.JIRA_PROJECT_KEY }}
    TEST_REAL_JIRA: 'true'
  run: pnpm test tests/integration/jira-flow.test.ts
```

## Development Commands

```bash
# Watch mode
pnpm test:watch tests/integration/jira-flow.test.ts

# Update snapshots (if any)
pnpm test -u tests/integration/jira-flow.test.ts

# Coverage report
pnpm test:coverage tests/integration/jira-flow.test.ts
```
