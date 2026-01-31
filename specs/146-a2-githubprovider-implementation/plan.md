# Implementation Plan: A2: GitHubProvider Implementation (gh CLI)

**Feature**: GitHub backlog provider using gh CLI
**Branch**: `146-a2-githubprovider-implementation`
**Status**: Complete

## Summary

Implement a GitHubProvider that uses the `gh` CLI for GitHub issue operations. This provides an alternative to the existing Octokit-based implementation, allowing users authenticated via `gh auth login` to interact with GitHub Issues without requiring GITHUB_TOKEN environment variable.

## Technical Context

- **Language**: TypeScript (ES modules)
- **Runtime**: Node.js 20+
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **Target Directory**: `packages/agency-plugin-spec-kit/src/providers/`
- **Dependencies**: Node.js `child_process` module (execFileSync)
- **Testing Framework**: Vitest

## Design Decisions (from Clarifications)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repository Context | Auto-detect via `gh repo view --json nameWithOwner` | Simplest user experience, no manual config needed |
| Error Types | GitHub-specific error classes | Defines `GitHubCliError`, `GitHubAuthError`, `GitHubNotFoundError` in the provider file |
| CLI Execution | Sync execFileSync wrapped in async | Matches reference implementation pattern, simpler code |

## Architecture

The gh CLI-based provider will coexist with the existing Octokit-based provider:

```
packages/agency-plugin-spec-kit/src/providers/
├── github.ts          # Existing Octokit-based implementation
├── github-cli.ts      # NEW: gh CLI-based implementation (this issue)
├── types.ts           # BacklogProvider interface
├── errors.ts          # Shared error types
├── registry.ts        # Provider factory registry
└── index.ts           # Exports
```

## Implementation Approach

### 1. Create github-cli.ts Provider

The new provider implements `BacklogProvider` using `gh` CLI commands:

```typescript
export class GitHubCliProvider implements BacklogProvider {
  readonly name: BacklogProviderName = 'github';

  private repoContext: { owner: string; repo: string } | null = null;

  // Auto-detect on first use via: gh repo view --json nameWithOwner
  private async ensureRepoContext(): Promise<{ owner: string; repo: string }>;

  // Core CRUD using gh CLI
  async getTicket(ref: string): Promise<Ticket>;      // gh issue view
  async createTicket(params): Promise<Ticket>;         // gh issue create
  async updateTicket(ref, updates): Promise<Ticket>;   // gh issue edit
  async setLabels(ref, labels): Promise<void>;         // gh issue edit --add-label/--remove-label
  async getLabels(ref): Promise<string[]>;             // gh issue view --json labels
  async searchTickets(query): Promise<Ticket[]>;       // gh search issues

  // Auth check: gh auth status
  async checkAuth(): Promise<AuthCheckResult>;

  // URL/ref handling
  getTicketUrl(ref: string): string;
  parseRef(input: string): TicketRef | null;
}
```

### 2. CLI Execution Pattern

Following the reference implementation pattern:

```typescript
function ghExec(args: string[], cwd?: string): string {
  return execFileSync('gh', args, {
    encoding: 'utf-8',
    cwd: cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024, // 10MB
  }).trim();
}
```

### 3. Error Handling

Define GitHub-specific error classes:

```typescript
export class GitHubCliError extends ProviderError {
  constructor(message: string, public readonly command?: string) {
    super(message, 'github');
    this.name = 'GitHubCliError';
  }
}

export class GitHubCliAuthError extends AuthError {
  constructor(message: string) {
    super(message, 'github');
    this.name = 'GitHubCliAuthError';
  }
}

export class GitHubCliNotFoundError extends NotFoundError {
  constructor(message: string, ref?: string) {
    super(message, 'github', ref);
    this.name = 'GitHubCliNotFoundError';
  }
}
```

### 4. gh CLI Commands Mapping

| Method | gh CLI Command |
|--------|---------------|
| getTicket | `gh issue view <number> --json title,body,state,labels,url,assignees,milestone` |
| createTicket | `gh issue create --title "..." --body "..." --label "..."` |
| updateTicket | `gh issue edit <number> --title "..." --body "..."` |
| setLabels | `gh issue edit <number> --add-label "..." --remove-label "..."` |
| getLabels | `gh issue view <number> --json labels` |
| searchTickets | `gh search issues --state all --json ... -- <query>` |
| checkAuth | `gh auth status` |
| getRepoContext | `gh repo view --json nameWithOwner` |

## Project Structure Changes

```
packages/agency-plugin-spec-kit/src/providers/
├── github.ts          # [EXISTING] Octokit implementation
├── github-cli.ts      # [NEW] gh CLI implementation
├── types.ts           # [UNCHANGED]
├── errors.ts          # [UNCHANGED - reuse existing errors]
├── registry.ts        # [MODIFY] Add 'github-cli' factory registration
└── index.ts           # [MODIFY] Export GitHubCliProvider

tests/providers/
└── github-cli.test.ts # [NEW] Unit tests
```

## Key Implementation Details

### Repository Context Auto-Detection

```typescript
private async ensureRepoContext(): Promise<{ owner: string; repo: string }> {
  if (this.repoContext) return this.repoContext;

  try {
    const result = ghExec(['repo', 'view', '--json', 'nameWithOwner']);
    const data = JSON.parse(result);
    const [owner, repo] = data.nameWithOwner.split('/');
    this.repoContext = { owner, repo };
    return this.repoContext;
  } catch (error) {
    throw new GitHubCliError(
      'Failed to detect repository context. Ensure you are in a git repository with a GitHub remote.',
      'gh repo view'
    );
  }
}
```

### Rate Limiting & Retry

Implement exponential backoff for transient errors:

```typescript
async function withRetry<T>(fn: () => T, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (error) {
      if (!isTransientError(error) || attempt === maxRetries) throw error;
      await sleep(Math.min(1000 * Math.pow(2, attempt), 10000));
    }
  }
  throw new Error('Unreachable');
}
```

## Testing Strategy

1. **Unit tests**: Mock `execFileSync` to test command construction and response parsing
2. **Error handling tests**: Verify proper error classification (auth, not-found, rate-limit)
3. **Integration tests** (optional, requires gh auth): Run against actual GitHub

## Out of Scope

- Migrating existing code to use this provider (separate issue)
- Pull request operations (issues only)
- Project/milestone management
- GraphQL API operations

## Success Criteria

1. ✅ `GitHubCliProvider` implements all `BacklogProvider` interface methods
2. ✅ Uses `gh` CLI for all GitHub operations
3. ✅ Supports authentication check via `gh auth status`
4. ✅ Parses GitHub URLs and issue numbers correctly
5. ✅ Handles rate limiting with exponential backoff
6. ✅ Handles errors gracefully with appropriate error types
7. ✅ Supports label operations
8. ✅ Unit tests pass

## Next Steps

Run `/speckit:tasks` to generate the implementation task list.
