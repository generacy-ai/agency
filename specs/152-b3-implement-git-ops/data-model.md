# Data Model: B3 - Implement git_ops tool

## Core Entities

### GitOpsParams (Input)

```typescript
interface GitOpsParams {
  /** Git operation to perform */
  operation: 'create_branch' | 'checkout' | 'fetch' | 'status' | 'current_branch';

  /** Branch name (required for create_branch and checkout) */
  branch_name?: string;

  /** Working directory (defaults to process.cwd()) */
  cwd?: string;

  /** Whether to fetch all remotes (for fetch operation, default: true) */
  fetch_all?: boolean;

  /** Whether to prune deleted remote branches (for fetch, default: true) */
  prune?: boolean;
}
```

### Zod Schema

```typescript
const GitOpsSchema = z.object({
  operation: z.enum(['create_branch', 'checkout', 'fetch', 'status', 'current_branch']),
  branch_name: z.string().optional(),
  cwd: z.string().optional(),
  fetch_all: z.boolean().default(true),
  prune: z.boolean().default(true),
});
```

## Result Types

### Base Result

```typescript
interface GitOpsResult {
  success: boolean;
  error?: McpError;  // Present when success is false
}
```

### Operation-Specific Results

#### CreateBranchResult
```typescript
interface CreateBranchResult extends GitOpsResult {
  success: true;
  branch: string;  // Name of created branch
}
```

#### CheckoutResult
```typescript
interface CheckoutResult extends GitOpsResult {
  success: true;
  branch: string;  // Name of checked out branch
}
```

#### FetchResult
```typescript
interface FetchResult extends GitOpsResult {
  success: true;
  fetched: boolean;  // Whether fetch completed
}
```

#### StatusResult
```typescript
interface StatusResult extends GitOpsResult {
  success: true;
  clean: boolean;           // No uncommitted changes
  staged: string[];         // Files staged for commit
  unstaged: string[];       // Modified but not staged
  untracked: string[];      // New untracked files
  conflicted: string[];     // Files with merge conflicts
  current_branch: string;   // Current branch name
  tracking?: string;        // Remote tracking branch
  ahead: number;            // Commits ahead of remote
  behind: number;           // Commits behind remote
}
```

#### CurrentBranchResult
```typescript
interface CurrentBranchResult extends GitOpsResult {
  success: true;
  branch: string;  // Current branch name or 'HEAD' if detached
}
```

## Validation Rules

### Branch Name Validation

For `create_branch` operation:
- Must not be empty
- Must not contain spaces
- Should follow git branch naming conventions
- Will be validated by git itself for invalid characters

### Operation-Specific Required Fields

| Operation | Required Fields |
|-----------|----------------|
| `create_branch` | `branch_name` |
| `checkout` | `branch_name` |
| `fetch` | none (optional: `fetch_all`, `prune`) |
| `status` | none |
| `current_branch` | none |

## Error Codes

Uses existing error codes from `types/errors.ts`:

| Code | Usage |
|------|-------|
| `GIT_NOT_INITIALIZED` | Working directory is not a git repo |
| `GIT_OPERATION_FAILED` | Git operation failed (with context) |
| `BRANCH_NOT_FOUND` | Checkout target branch doesn't exist |
| `BRANCH_EXISTS` | Create branch name already exists |

## Relationships

```
GitOpsParams (input)
    └── validates via ZodSchema
    └── produces → GitOpsResult (output)
         ├── CreateBranchResult
         ├── CheckoutResult
         ├── FetchResult
         ├── StatusResult
         └── CurrentBranchResult
```
