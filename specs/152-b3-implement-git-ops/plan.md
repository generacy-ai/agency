# Implementation Plan: B3 - Implement git_ops tool

**Feature**: Implement the `spec_kit.git_ops` MCP tool for git operations
**Branch**: `152-b3-implement-git-ops`
**Status**: Complete

## Summary

Implement a new `spec_kit.git_ops` MCP tool in the `agency-plugin-spec-kit` package that provides git operations for spec-kit workflows. The tool will support `create_branch`, `checkout`, `fetch`, `status`, and `current_branch` operations using the existing `simple-git` library.

## Technical Context

- **Language**: TypeScript (ESM)
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **Framework**: MCP (Model Context Protocol) via `@modelcontextprotocol/sdk`
- **Git Library**: `simple-git` (already a dependency)
- **Validation**: Zod (already a dependency)
- **Build**: TypeScript 5.7.x, Vitest for testing

## Project Structure

```
packages/agency-plugin-spec-kit/src/
├── tools/
│   ├── index.ts           # Export git-ops tool (modify)
│   ├── git-ops.ts         # NEW: git_ops tool implementation
│   ├── get-paths.ts       # Existing tool (pattern reference)
│   ├── check-prereqs.ts   # Existing tool (pattern reference)
│   └── ...
├── utils/
│   ├── git.ts             # Existing git utilities (extend if needed)
│   └── ...
└── types/
    └── errors.ts          # Error codes (already has GIT_OPERATION_FAILED)
```

## Dependencies

- **B2 (git utilities)**: Uses `packages/agency-plugin-spec-kit/src/utils/git.ts`
- **F2 (types)**: Uses existing types from `@generacy-ai/agency` and local `types/`
- **simple-git**: Already available as a dependency

## Constitution Check

No constitution.md file found - proceeding with standard patterns.

## Implementation Approach

### 1. Create git-ops.ts Tool File

Follow the pattern from `get-paths.ts` and `check-prereqs.ts`:
- Define input parameters interface
- Create factory function `createGitOpsTool()`
- Implement operation handlers for each git operation
- Return structured JSON results
- Use `createError()` for error handling

### 2. Operation Implementations

| Operation | Input | Output |
|-----------|-------|--------|
| `create_branch` | `branch_name` (required) | `{ success, branch }` |
| `checkout` | `branch_name` (required) | `{ success, branch }` |
| `fetch` | `fetch_all`, `prune` (optional) | `{ success, fetched }` |
| `status` | none | `{ success, clean, staged, unstaged, untracked }` |
| `current_branch` | none | `{ success, branch }` |

### 3. Update tools/index.ts

- Import `createGitOpsTool`
- Add to the `createTools()` function return array
- Re-export for direct access

## Key Technical Decisions

1. **Use simple-git directly**: The tool will use `simple-git` for all git operations since it's already a dependency and provides a clean async API.

2. **Validation with Zod**: Input parameters validated using Zod schemas matching the input schema definition.

3. **Error handling pattern**: Follow existing pattern using `createError()` from `types/errors.ts` with `GIT_OPERATION_FAILED` error code.

4. **Working directory resolution**: Use `cwd` parameter with fallback to `process.cwd()`, consistent with other tools.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/tools/git-ops.ts` | Create | New git operations tool |
| `src/tools/index.ts` | Modify | Export new tool |

## Risk Assessment

- **Low risk**: Using existing patterns and dependencies
- **Testing**: Unit tests should mock `simple-git` to avoid actual git operations
