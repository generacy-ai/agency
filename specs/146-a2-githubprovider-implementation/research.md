# Research: GitHubCliProvider Implementation

## Technology Decisions

### 1. gh CLI vs Octokit API

**Decision**: Use `gh` CLI (this implementation)

| Aspect | gh CLI | Octokit |
|--------|--------|---------|
| Authentication | Browser-based via `gh auth login` | Requires GITHUB_TOKEN env var |
| Rate Limiting | Automatic retry prompts | Manual handling required |
| Setup Complexity | Single auth command | Token generation + env var |
| CI/CD Suitability | Requires gh auth setup | Excellent with PAT/GITHUB_TOKEN |
| Offline Testing | N/A | Can mock HTTP |

**Rationale**: gh CLI provides a better developer experience for local development, while Octokit (existing implementation) remains available for CI/CD environments.

### 2. Sync vs Async Execution

**Decision**: Synchronous `execFileSync` wrapped in async methods

**Rationale**:
- Matches reference implementation pattern
- Simpler error handling
- Each gh CLI call is atomic
- Async wrapper maintains interface compatibility
- Performance impact minimal (gh CLI is I/O bound anyway)

### 3. Error Classification

**Decision**: Define GitHub-specific error classes extending shared base errors

```typescript
GitHubCliError extends ProviderError      // General gh CLI failures
GitHubCliAuthError extends AuthError      // gh auth status failures
GitHubCliNotFoundError extends NotFoundError  // 404-like responses
```

**Rationale**: Allows consumers to catch provider-specific errors while also catching by category (all AuthErrors).

## Implementation Patterns

### Command Execution

Use `execFileSync` to avoid shell injection vulnerabilities:

```typescript
// SAFE: Arguments passed as array, not interpolated into shell
execFileSync('gh', ['issue', 'view', '123', '--json', 'title']);

// UNSAFE: Would allow command injection via user input
execSync(`gh issue view ${userInput} --json title`);
```

### JSON Output Parsing

Always request JSON output for reliable parsing:

```typescript
const result = execFileSync('gh', [
  'issue', 'view', '123',
  '--json', 'title,body,state,labels'
]);
const issue = JSON.parse(result);
```

### Retry with Exponential Backoff

```typescript
const TRANSIENT_ERRORS = [
  'rate limit', 'ECONNRESET', 'ETIMEDOUT',
  '502', '503', '504', 'socket hang up'
];

async function withRetry<T>(fn: () => T, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (error) {
      if (!isTransient(error) || attempt === maxRetries) throw error;
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
}
```

## Alternatives Considered

### 1. Use execa Library

**Rejected**: Adds external dependency for minimal benefit. Node's `child_process` is sufficient.

### 2. Full Async with spawn

**Rejected**: More complex error handling, streaming not needed for our use case.

### 3. Shared gh Utility Module

**Considered**: Could extract gh CLI utilities into a shared module. Deferred to future refactoring.

## Reference Implementation Analysis

Source: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/github.ts`

Key patterns adopted:
1. `execFileSync` for command execution (security)
2. `withRetry` for transient error handling
3. JSON output parsing with field selection
4. Buffer size increase for large outputs (10MB)

Key differences:
1. Implements full `BacklogProvider` interface
2. Uses shared error types from errors.ts
3. Adds repo context auto-detection

## gh CLI Command Reference

### Issue Operations

```bash
# View issue
gh issue view 123 --json title,body,state,labels,url,assignees,milestone

# Create issue
gh issue create --title "Title" --body "Body" --label "bug,priority:high"

# Edit issue
gh issue edit 123 --title "New title" --body "New body"

# Edit labels
gh issue edit 123 --add-label "new-label" --remove-label "old-label"
```

### Search

```bash
# Search issues in current repo
gh search issues --state all --limit 100 --json number,title,body,state,url,labels -- "is:open label:bug"
```

### Authentication

```bash
# Check auth status (exit 0 if authenticated)
gh auth status

# Get current repo
gh repo view --json nameWithOwner
```

## Security Considerations

1. **Command Injection**: Mitigated by using `execFileSync` with array arguments
2. **Credential Storage**: Delegated to gh CLI (uses system keychain)
3. **Rate Limiting**: Handled with exponential backoff
4. **Error Messages**: Sanitize before logging (no secrets in output)

## Performance Notes

- gh CLI adds ~100-200ms overhead per call (process spawn)
- Acceptable for typical workflows (1-10 operations)
- For bulk operations, Octokit provider is more efficient
- Consider caching repo context after first detection
