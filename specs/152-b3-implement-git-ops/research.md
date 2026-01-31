# Research: B3 - Implement git_ops tool

## Technology Decisions

### 1. Git Library: simple-git

**Decision**: Use `simple-git` library for git operations.

**Rationale**:
- Already a dependency in `agency-plugin-spec-kit` (`"simple-git": "^3.30.0"`)
- Provides a clean async/Promise-based API
- Used consistently across the codebase (see `utils/git.ts`)
- Handles edge cases like detached HEAD, bare repos, etc.

**Alternatives Considered**:
- **child_process/exec**: Lower-level, would require parsing git output manually
- **isomorphic-git**: Pure JavaScript but adds significant bundle size
- **nodegit**: Native bindings, complex setup and potential compatibility issues

### 2. Input Validation: Zod

**Decision**: Use Zod for runtime parameter validation.

**Rationale**:
- Already a dependency (`"zod": "^3.24.0"`)
- Type-safe schema validation
- Generates clear error messages
- Consistent with other Agency tools

### 3. Error Handling Pattern

**Decision**: Use existing `createError()` function with `GIT_OPERATION_FAILED` error code.

**Rationale**:
- Consistent error format across all spec-kit tools
- Error code already defined in `types/errors.ts`
- Provides structured errors with context for debugging

## Implementation Patterns

### Tool Factory Pattern

All spec-kit tools follow the factory pattern:

```typescript
export function createGitOpsTool(
  config: SpecKitConfig,
  core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.git_ops',
    description: '...',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding', 'research'],
    inputSchema: { ... },
    async execute(params: unknown): Promise<ToolResult> { ... }
  };
}
```

### Result Format

All tools return JSON-stringified results:

```typescript
return {
  content: [
    {
      type: 'text',
      text: JSON.stringify({ success: true, ... }),
    },
  ],
};
```

### Error Format

```typescript
return {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        success: false,
        error: createError('GIT_OPERATION_FAILED', 'message', { context }),
      }),
    },
  ],
};
```

## simple-git API Reference

### Initialization
```typescript
import { simpleGit, SimpleGit } from 'simple-git';
const git: SimpleGit = simpleGit(workingDirectory);
```

### Operations

| Operation | simple-git Method |
|-----------|------------------|
| create_branch | `git.checkoutLocalBranch(name)` |
| checkout | `git.checkout(name)` |
| fetch | `git.fetch(['--all', '--prune'])` |
| status | `git.status()` |
| current_branch | `git.revparse(['--abbrev-ref', 'HEAD'])` |

### Status Response Structure
```typescript
interface StatusResult {
  not_added: string[];      // Untracked files
  modified: string[];       // Modified but not staged
  staged: string[];         // Staged for commit
  deleted: string[];        // Deleted files
  isClean(): boolean;       // No changes
}
```

## Key Sources

- [simple-git documentation](https://github.com/steveukx/git-js)
- Existing implementation: `utils/git.ts` (lines 42-54 for `getCurrentBranch`)
- Tool patterns: `tools/get-paths.ts`, `tools/check-prereqs.ts`
