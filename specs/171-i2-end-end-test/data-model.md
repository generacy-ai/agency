# Data Model: GitHub Provider E2E Tests

## Core Types

### Test Configuration

```typescript
/**
 * Configuration for GitHub E2E tests.
 */
interface GitHubTestConfig extends SpecKitConfig {
  backlog: {
    provider: 'github';
  };
}

/**
 * Test context shared across tests.
 */
interface TestContext {
  /** Test run identifier (timestamp-based) */
  testId: string;
  /** Working directory for the test */
  cwd: string;
  /** Created issues to clean up */
  createdIssues: number[];
  /** Created branches to clean up */
  createdBranches: string[];
  /** Whether to preserve resources for debugging */
  preserveResources: boolean;
}
```

### Tool Input/Output Types

```typescript
// =============================================================================
// get_ticket
// =============================================================================

interface GetTicketInput {
  ref: string; // '#123', 'owner/repo#123', or full URL
}

interface GetTicketOutput {
  ref: {
    provider: 'github';
    id: string;      // Issue number as string
    url: string;     // Full GitHub URL
    raw: string;     // Original reference
  };
  title: string;
  body?: string;
  state: 'open' | 'in_progress' | 'closed';
  labels: string[];
  url: string;
  meta: {
    assignees: string[];
    milestone?: {
      title: string;
      number: number;
    };
  };
}

// =============================================================================
// create_ticket
// =============================================================================

interface CreateTicketInput {
  title: string;
  body?: string;
  labels?: string[];
}

interface CreateTicketOutput {
  created: boolean;
  id: string;     // Issue number
  url: string;    // Full GitHub URL
}

// =============================================================================
// create_feature
// =============================================================================

interface CreateFeatureInput {
  description: string;
  short_name?: string;
  number?: number;
}

interface CreateFeatureOutput {
  success: boolean;
  branch: string;         // Created branch name
  featureDir: string;     // Path to specs/<number>-<name>/
  specFile: string;       // Path to spec.md
}

// =============================================================================
// tasks_to_issues
// =============================================================================

interface TasksToIssuesInput {
  grouping?: 'per-task' | 'per-story' | 'per-phase';
  dry_run?: boolean;
  epic_number?: number;
  feature_dir?: string;
  cwd?: string;
}

interface TasksToIssuesOutput {
  success: boolean;
  groupingStrategy: string;
  issuesCreated: number;
  issues: Array<{
    number: number;
    url: string;
    title: string;
    taskIds: string[];
    groupId: string;
  }>;
  tasksIncluded: number;
  tasksSkipped: number;
  skippedReasons: string[];
  dryRun: boolean;
}
```

### Error Types

```typescript
/**
 * Error response from tools.
 */
interface ToolErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Provider-specific errors.
 */
interface ProviderErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

type ErrorCode =
  | 'NOT_FOUND'
  | 'AUTH_ERROR'
  | 'PROVIDER_ERROR'
  | 'INVALID_INPUT'
  | 'GH_CLI_NOT_FOUND'
  | 'GH_NOT_AUTHENTICATED';
```

## Test Data Structures

### Test Issue Fixture

```typescript
/**
 * Created test issue for E2E tests.
 */
interface TestIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  createdAt: Date;
}

/**
 * Factory for creating test issues.
 */
interface TestIssueFactory {
  create(title: string, body?: string): Promise<TestIssue>;
  close(number: number): Promise<void>;
  cleanup(): Promise<void>;
}
```

### Test Branch Fixture

```typescript
/**
 * Created test branch for E2E tests.
 */
interface TestBranch {
  name: string;
  createdAt: Date;
}

/**
 * Factory for managing test branches.
 */
interface TestBranchFactory {
  create(name: string): Promise<TestBranch>;
  delete(name: string): Promise<void>;
  cleanup(): Promise<void>;
}
```

## Validation Rules

### Issue Reference Formats

| Format | Example | Validation |
|--------|---------|------------|
| Number only | `#123` | `/^#\d+$/` |
| Owner/repo | `owner/repo#123` | `/^[^/]+\/[^#]+#\d+$/` |
| Full URL | `https://github.com/owner/repo/issues/123` | URL pattern |

### Branch Naming

```typescript
// From config.branches.pattern
const pattern = '{paddedNumber}-{slug}';

// Example: 171-i2-end-end-test
// Matches: /^\d{3}-[a-z0-9-]+$/
```

### Label Constraints

- Labels are strings
- Max length: 50 characters (GitHub limit)
- Can contain: alphanumeric, `-`, `_`, ` `, `:`, `/`

## Relationships

```
TestContext
  ├── testId: unique identifier
  ├── createdIssues[] ──► GitHub Issues
  └── createdBranches[] ──► Git Branches

GitHubProvider
  ├── uses ──► SpecKitConfig
  ├── produces ──► Ticket
  └── depends on ──► gh CLI

Tool (get_ticket, create_ticket, etc.)
  ├── input ──► Schema-validated params
  ├── output ──► JSON response
  └── uses ──► BacklogProvider
```

---

*Generated by speckit*
