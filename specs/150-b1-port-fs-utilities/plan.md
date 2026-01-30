# Implementation Plan: B1: Port fs utilities from speckit

**Feature**: Port file system utilities from speckit to agency-plugin-spec-kit
**Branch**: `150-b1-port-fs-utilities`
**Status**: Complete

## Summary

Port the file system utilities from the speckit plugin to the new `@generacy-ai/agency-plugin-spec-kit` package. This involves creating a new `fs.ts` module with async/await functions and custom error classes that integrate with the existing error handling patterns in the package.

## Technical Context

| Aspect | Value |
|--------|-------|
| Language | TypeScript 5.7+ |
| Runtime | Node.js 20+ |
| Module System | ES Modules |
| Build Tool | tsc |
| Test Framework | Vitest |
| Package | `@generacy-ai/agency-plugin-spec-kit` |

### Dependencies

- `node:fs/promises` - Native async file system operations
- `node:path` - Path manipulation utilities

### Key Design Decisions

1. **Custom Error Classes vs McpError** - The spec requires custom error classes (`FileNotFoundError`, `PermissionError`, `RepoNotFoundError`) which extend the native `Error` class. These complement the existing `McpError` type in `types/errors.ts` but are purpose-built for file system operations.

2. **Error Throwing vs Returning** - `findRepoRoot()` throws `RepoNotFoundError` instead of returning `null` (as the reference implementation does). This aligns with the spec requirement and provides clearer error handling.

3. **No copyFile()** - The reference implementation includes `copyFile()` but the spec explicitly excludes it. We'll implement only the 8 specified functions.

4. **Recursive mkdir by default** - The `mkdir()` function accepts an optional `recursive` parameter (default: `true`) to match the spec signature while maintaining sensible defaults.

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── utils/
│   │   ├── fs.ts          # NEW: File system utilities
│   │   └── index.ts       # MODIFY: Add fs exports
│   └── types/
│       └── errors.ts      # REFERENCE: Existing error patterns
└── package.json
```

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/utils/fs.ts` | File system utilities with custom error classes |

### Modified Files

| File | Changes |
|------|---------|
| `src/utils/index.ts` | Export all fs utilities |

## Implementation Approach

### Phase 1: Error Classes

Create three custom error classes that extend `Error`:
- `FileNotFoundError` - Thrown when a file doesn't exist
- `PermissionError` - Thrown when file access is denied
- `RepoNotFoundError` - Thrown when no repository root is found

Each class should:
- Set the `name` property to the class name
- Accept a message and optionally a `path` property
- Support `cause` chaining for underlying errors

### Phase 2: Core Functions

Implement the 8 specified functions:

1. **`exists(path)`** - Check if path exists using `fs.access()`
2. **`isDirectory(path)`** - Check if path is a directory using `fs.stat()`
3. **`isFile(path)`** - Check if path is a file using `fs.stat()`
4. **`readFile(path)`** - Read file as UTF-8 string, throw `FileNotFoundError` if not exists
5. **`writeFile(path, content)`** - Write string to file, create parent dirs
6. **`mkdir(path, recursive?)`** - Create directory, recursive by default
7. **`readDir(path)`** - List directory contents
8. **`findRepoRoot(startPath?)`** - Find repository root, throw `RepoNotFoundError` if not found

### Phase 3: Integration

Export all utilities from `src/utils/index.ts`.

## Testing Strategy

Unit tests should cover:
- Each function's happy path
- Error cases (file not found, permission denied, no repo root)
- Edge cases (empty directories, nested paths, filesystem root)

## Constitution Check

No constitution.md file found. Proceeding without governance constraints.

## Next Steps

Run `/speckit:tasks` to generate the task list from this plan.
