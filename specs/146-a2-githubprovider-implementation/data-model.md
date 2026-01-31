# Data Model: GitHubCliProvider

## Core Types (Reused from types.ts)

The GitHubCliProvider reuses the existing types from `packages/agency-plugin-spec-kit/src/providers/types.ts`:

### BacklogProvider Interface

```typescript
interface BacklogProvider {
  readonly name: BacklogProviderName;

  // Required CRUD
  getTicket(ref: string): Promise<Ticket>;
  createTicket(params: TicketCreateParams): Promise<Ticket>;
  updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket>;

  // Optional label management
  setLabels?(ref: string, labels: string[]): Promise<void>;
  getLabels?(ref: string): Promise<string[]>;

  // Optional search
  searchTickets?(query: string): Promise<Ticket[]>;

  // Required auth & URL
  checkAuth(): Promise<AuthCheckResult>;
  getTicketUrl(ref: string): string;
  parseRef(input: string): TicketRef | null;
}
```

### Ticket (Output)

```typescript
interface Ticket {
  ref: TicketRef;
  title: string;
  body?: string;
  state: TicketState;      // 'open' | 'closed' | 'in_progress'
  labels: string[];
  url: string;
  meta?: Record<string, unknown>;
}
```

### TicketRef (Reference)

```typescript
interface TicketRef {
  provider: BacklogProviderName;  // 'github'
  id: string;                      // Issue number as string
  url?: string;                    // Full GitHub URL
  raw: string;                     // Original input (e.g., '#123')
}
```

### TicketCreateParams (Input)

```typescript
interface TicketCreateParams {
  title: string;
  body?: string;
  labels?: string[];
}
```

### TicketUpdates (Input)

```typescript
type TicketUpdates = Partial<TicketCreateParams>;
```

### AuthCheckResult

```typescript
interface AuthCheckResult {
  ok: boolean;
  message?: string;
}
```

## New Types for GitHubCliProvider

### RepoContext (Internal)

```typescript
interface RepoContext {
  owner: string;
  repo: string;
}
```

### GhExecOptions (Internal)

```typescript
interface GhExecOptions {
  cwd?: string;
  maxRetries?: number;
}
```

### GitHubIssueJson (gh CLI JSON output)

```typescript
// Response from: gh issue view <num> --json title,body,state,labels,url,assignees,milestone
interface GitHubIssueJson {
  number: number;
  title: string;
  body: string | null;
  state: 'OPEN' | 'CLOSED';
  labels: Array<{ name: string }>;
  url: string;
  assignees: Array<{ login: string }>;
  milestone: { title: string; number: number } | null;
}
```

### GitHubRepoJson (gh CLI JSON output)

```typescript
// Response from: gh repo view --json nameWithOwner
interface GitHubRepoJson {
  nameWithOwner: string;  // "owner/repo"
}
```

## Error Types (New in github-cli.ts)

```typescript
// Base error for gh CLI operations
class GitHubCliError extends ProviderError {
  readonly command?: string;
}

// Authentication failure
class GitHubCliAuthError extends AuthError {
  // e.g., "gh auth login" not run
}

// Resource not found
class GitHubCliNotFoundError extends NotFoundError {
  // e.g., issue #999 doesn't exist
}
```

## State Mapping

| GitHub State | TicketState |
|-------------|-------------|
| OPEN | 'open' (default) |
| OPEN + 'in-progress' label | 'in_progress' |
| CLOSED | 'closed' |

## Validation Rules

### parseRef Input Formats

| Format | Example | Result |
|--------|---------|--------|
| Hash number | `#123` | `{ provider: 'github', id: '123', raw: '#123' }` |
| Plain number | `123` | `{ provider: 'github', id: '123', raw: '123' }` |
| Owner/repo#num | `owner/repo#123` | `{ provider: 'github', id: '123', raw: 'owner/repo#123', url: 'https://...' }` |
| Full URL | `https://github.com/owner/repo/issues/123` | `{ provider: 'github', id: '123', raw: '...', url: '...' }` |
| Invalid | `PROJ-123` | `null` |

### Label Normalization

- Labels are stored as plain strings
- No case normalization (preserve original)
- Empty string labels are filtered out
