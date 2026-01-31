# Quickstart: B3 - git_ops Tool

## Installation

The `spec_kit.git_ops` tool is part of the `@generacy-ai/agency-plugin-spec-kit` package.

```bash
# From the agency monorepo root
pnpm install
pnpm build
```

## Usage

The tool is automatically registered when the spec-kit plugin is loaded.

### Operations

#### Get Current Branch

```json
{
  "operation": "current_branch"
}
```

Response:
```json
{
  "success": true,
  "branch": "152-b3-implement-git-ops"
}
```

#### Check Status

```json
{
  "operation": "status"
}
```

Response:
```json
{
  "success": true,
  "clean": false,
  "staged": ["src/tools/git-ops.ts"],
  "unstaged": ["src/tools/index.ts"],
  "untracked": [],
  "conflicted": [],
  "current_branch": "152-b3-implement-git-ops",
  "tracking": "origin/152-b3-implement-git-ops",
  "ahead": 1,
  "behind": 0
}
```

#### Create Branch

```json
{
  "operation": "create_branch",
  "branch_name": "feature/new-feature"
}
```

Response:
```json
{
  "success": true,
  "branch": "feature/new-feature"
}
```

#### Checkout Branch

```json
{
  "operation": "checkout",
  "branch_name": "main"
}
```

Response:
```json
{
  "success": true,
  "branch": "main"
}
```

#### Fetch

```json
{
  "operation": "fetch",
  "fetch_all": true,
  "prune": true
}
```

Response:
```json
{
  "success": true,
  "fetched": true
}
```

### Working Directory

All operations support an optional `cwd` parameter to specify the working directory:

```json
{
  "operation": "status",
  "cwd": "/path/to/repo"
}
```

## Error Handling

When an operation fails:

```json
{
  "success": false,
  "error": {
    "code": "GIT_OPERATION_FAILED",
    "message": "Failed to checkout branch: branch 'nonexistent' not found",
    "context": {
      "operation": "checkout",
      "branch_name": "nonexistent"
    }
  }
}
```

## Troubleshooting

### "Not a git repository"

Ensure the working directory (or `cwd` parameter) points to a valid git repository.

### "Branch already exists"

When creating a branch, ensure the branch name doesn't already exist. Use `checkout` instead.

### "Branch not found"

When checking out, ensure the branch exists locally or remotely. Run `fetch` first if checking out a remote branch.
