# Implementation Plan: C1: Implement get_paths tool

**Feature**: Implement the `spec_kit.get_paths` MCP tool for resolving feature-related file paths
**Branch**: `155-c1-implement-get-paths`
**Status**: Complete

## Summary

This feature implements the `get_paths` tool for the `@generacy-ai/agency-plugin-spec-kit` package. The tool resolves all feature-related file paths based on the current branch, an explicit feature name, or the `SPECIFY_FEATURE` environment variable. It returns a complete `FeaturePaths` object containing paths to spec files, plan files, tasks, and other specification artifacts.

## Technical Context

**Language**: TypeScript
**Runtime**: Node.js
**Framework**: Agency Plugin System with MCP (Model Context Protocol)
**Dependencies**:
- `@generacy-ai/agency` - Core types (AgencyTool, AgencyCoreAPI)
- `simple-git` - Git operations for branch detection
- `zod` - Schema validation (already used in config)

**Key Patterns**:
- Tools are created via factory functions that take config and core API
- Tools return `ToolResult` with `content` array containing text with JSON
- Error handling uses `createError` from types/errors.ts
- Configuration is read via Zod schemas with defaults

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── index.ts           # Tool exports (modify)
│   │   └── get-paths.ts       # NEW: get_paths tool implementation
│   ├── utils/
│   │   ├── index.ts           # Utility exports (modify)
│   │   ├── fs.ts              # NEW: File system utilities
│   │   └── git.ts             # NEW: Git utilities
│   ├── types/
│   │   ├── feature.ts         # FeaturePaths type (exists)
│   │   └── index.ts           # Type exports (may modify)
│   └── config.ts              # Configuration parsing (exists)
└── tests/
    └── get-paths.test.ts      # NEW: Unit tests
```

## Dependencies Analysis

The tool depends on several utilities that need to be created or imported:

1. **File System Utilities** (need to create):
   - `exists(path)` - Check if file/directory exists
   - `findRepoRoot(startPath)` - Find repository root from .git or specs/
   - `readDir(path)` - List directory contents

2. **Git Utilities** (need to create):
   - `isGitRepo(path)` - Check if directory has .git
   - `getCurrentBranch(path)` - Get current git branch name

3. **Configuration** (already exists):
   - `SpecKitConfig` - Plugin configuration with paths
   - `FileNamesSchema` - Configurable file names
   - `DirectoryNamesSchema` - Configurable directory names

## Implementation Approach

### Path Resolution Priority
1. Check `SPECIFY_FEATURE` environment variable
2. If not set, get current git branch
3. Extract feature number/name from branch using `FEATURE_NAME_PATTERN`
4. Construct paths using config's `specDirectory` and file name overrides

### Error Handling Strategy
- `FEATURE_DIR_NOT_FOUND` - Could not find repository root
- `INVALID_BRANCH_NAME` - Branch doesn't match required pattern
- Return `{ success: false, error: {...} }` for errors

### Tool Response Format
```typescript
{
  success: true,
  exists: boolean,        // Whether feature directory exists
  ...FeaturePaths         // All path properties
}
```

## Key Files to Reference

**Reference Implementation** (from claude-plugins repo):
- `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/tools/paths.ts`
- `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/fs.ts`
- `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/tools/git.ts`

**Existing Types in This Repo**:
- `packages/agency-plugin-spec-kit/src/types/feature.ts` - FeaturePaths interface
- `packages/agency-plugin-spec-kit/src/types/patterns.ts` - FEATURE_NAME_PATTERN
- `packages/agency-plugin-spec-kit/src/types/config.ts` - Config schemas

## Critical Implementation Details

1. **Tool Name Format**: Must be `spec_kit.get_paths` (namespaced)
2. **Mode Affiliation**: `['coding', 'research']` - available in both modes
3. **Output Pattern**: `'terse'` - concise JSON output
4. **CWD Handling**: Accept optional `cwd` parameter, default to `process.cwd()`
5. **Feature Name Validation**: Use existing `FEATURE_NAME_PATTERN` regex

## Test Strategy

1. **Unit Tests**:
   - Test path resolution with explicit branch parameter
   - Test SPECIFY_FEATURE environment variable override
   - Test current branch detection
   - Test invalid branch name handling
   - Test missing repository root handling
   - Test configuration-based file name customization

2. **Integration Considerations**:
   - Tests should mock file system and git operations
   - Use vitest (already configured in the package)
