# Research: File System Utilities

## Technology Decisions

### Node.js fs/promises API

**Decision**: Use `node:fs/promises` for all file operations.

**Rationale**:
- Native to Node.js, no external dependencies
- Promise-based API works naturally with async/await
- Well-documented and stable

**Alternatives Considered**:
- `fs-extra` - Adds convenience methods but we only need basic operations
- Synchronous `fs` - Would block the event loop

### Error Handling Pattern

**Decision**: Custom error classes extending `Error`.

**Rationale**:
- Spec explicitly requires `FileNotFoundError`, `PermissionError`, `RepoNotFoundError`
- Allows `instanceof` checking for error type discrimination
- Can include additional context (path, cause)

**Alternatives Considered**:
- Using existing `McpError` type - Doesn't support `instanceof`, designed for MCP tool responses
- Union types with discriminated unions - More verbose for callers

### findRepoRoot Behavior

**Decision**: Throw `RepoNotFoundError` instead of returning `null`.

**Rationale**:
- Spec explicitly states "throws `RepoNotFoundError` if not found"
- Fail-fast behavior makes caller code cleaner (no null checks)
- Consistent with other error-throwing functions

**Reference Implementation Difference**:
The speckit implementation returns `null` when no repo is found. Our implementation throws an error per the spec.

## Implementation Patterns

### Error Class Pattern

```typescript
export class FileNotFoundError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'FileNotFoundError';
  }
}
```

Key aspects:
- `name` property set explicitly (not inherited correctly in older JS)
- Optional `path` property for context
- `ErrorOptions` support for `cause` chaining

### Existence Checks

Using `fs.access()` is more efficient than `fs.stat()` for simple existence checks:

```typescript
export async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
```

### Error Code Detection

Node.js file system errors include an `code` property (e.g., `ENOENT`, `EACCES`). Use this for error classification:

```typescript
if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
  throw new FileNotFoundError(`File not found: ${path}`, path, { cause: error });
}
```

## Key Sources

- [Node.js fs/promises API](https://nodejs.org/api/fs.html#promises-api)
- Reference implementation: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/fs.ts`
- Existing error patterns: `src/types/errors.ts`
