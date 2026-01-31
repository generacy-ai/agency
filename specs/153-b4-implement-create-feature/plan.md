# Implementation Plan: create_feature Tool

**Feature**: Implement the `spec_kit.create_feature` MCP tool for agency-plugin-spec-kit
**Branch**: `153-b4-implement-create-feature`
**Status**: Complete

## Summary

Implement the `spec_kit.create_feature` MCP tool that creates a new feature branch and initializes the spec directory with template files. The tool generates a branch name from a description (slug generation), auto-numbers features by scanning both branches and directories, creates the spec directory structure, and supports parent epic branches for hierarchical features.

## Technical Context

- **Language**: TypeScript
- **Framework**: Agency MCP Plugin System
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **Dependencies**:
  - `simple-git` - Git operations
  - `zod` - Schema validation
  - `@generacy-ai/agency` - Core tool types

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── create-feature.ts      # NEW: Main tool implementation
│   │   └── index.ts               # MODIFY: Add tool export
│   ├── utils/
│   │   ├── slug.ts                # NEW: Slug generation helper
│   │   └── index.ts               # MODIFY: Export slug utilities
│   ├── types/
│   │   └── errors.ts              # No changes needed (existing codes)
│   └── config.ts                  # Reference for branch config
```

## Key Implementation Decisions

### 1. Branch Naming Format (Clarification Q1: Option C)
- **Decision**: Configurable via speckit config with default pattern `{paddedNumber}-{slug}`
- **Implementation**: Use existing `BranchesConfigSchema` from `config.ts`
- **Pattern variables**: `{paddedNumber}`, `{number}`, `{slug}`, `{type}`

### 2. Auto-Numbering Strategy (Clarification Q2: Option C)
- **Decision**: Scan both branches (local + remote) and spec directories, take higher max + 1
- **Implementation**:
  1. Scan `specs/` directory for `###-*` patterns
  2. Scan git branches matching the feature pattern
  3. Take maximum of both, add 1 for next number

### 3. Subdirectory Creation (Clarification Q3: Option B)
- **Decision**: Only create `spec.md` initially, no empty subdirectories
- **Implementation**: Create only `{featureDir}/spec.md` on feature creation

### 4. Template Source Location (Clarification Q4: Option C)
- **Decision**: Configurable path in speckit config with fallback to bundled
- **Implementation**:
  1. Check `config.paths.templates` for custom template
  2. Fall back to default spec template content

### 5. Epic Child Behavior (Clarification Q5: Pending → Default to A)
- **Decision**: Same naming as regular features, relationship tracked only in spec.md
- **Implementation**: When `parent_epic_branch` is provided:
  - Branch from the epic branch instead of current branch
  - No special naming prefix
  - Add epic reference in generated spec.md

## Integration Points

### Tool Registration
The tool is registered in `createTools()` in `src/tools/index.ts`:
```typescript
import { createCreateFeatureTool } from './create-feature.js';

// In createTools():
return [
  // ... existing tools
  createCreateFeatureTool(resolvedConfig, core),
];
```

### Existing Utilities to Reuse
- `findRepoRoot()` from `utils/fs.ts`
- `exists()`, `writeFile()`, `mkdir()`, `readDir()` from `utils/fs.ts`
- `isGitRepo()`, `getCurrentBranch()` from `utils/git.ts`
- `FEATURE_NAME_PATTERN` from `types/patterns.ts`
- `createError()` from `types/errors.ts`

## Algorithm Details

### Slug Generation Algorithm
```
1. Convert description to lowercase
2. Replace non-alphanumeric with spaces
3. Split into words
4. Remove stop words (the, a, an, and, or, to, for, of, in, on, at, by, etc.)
5. Take first N words (config.branches.maxSlugWords, default 4)
6. Join with hyphens
7. Truncate to maxLength if needed (30 chars default)
8. Handle empty result → "feature"
```

### Auto-Number Algorithm
```
1. Initialize maxNumber = 0
2. Scan specs directory for entries matching /^\d{3}-/
3. Extract numbers, update maxNumber if higher
4. Scan git branches (local + remote) matching feature pattern
5. Extract numbers, update maxNumber if higher
6. Return (maxNumber + 1).padStart(3, '0')
```

## Error Handling

| Error Code | Condition |
|------------|-----------|
| `FEATURE_DIR_NOT_FOUND` | Cannot find repo root |
| `BRANCH_EXISTS` | Feature directory already exists |
| `BRANCH_EXISTS_FOR_ISSUE` | Branch exists for the issue number |
| `INVALID_BRANCH_NAME` | Generated branch name fails validation |
| `INVALID_FEATURE_NUMBER` | Number > 999 |
| `GIT_OPERATION_FAILED` | Git branch operations fail |

## Output Format

```typescript
interface CreateFeatureResult {
  success: true;
  branch_name: string;        // e.g., "153-implement-create-feature"
  feature_num: string;        // e.g., "153"
  spec_file: string;          // Full path to spec.md
  feature_dir: string;        // Full path to feature directory
  git_branch_created: boolean;
  branched_from_epic: boolean;
  parent_epic_branch?: string; // If branched from epic
}
```

## Testing Strategy

1. **Unit tests** for slug generation
2. **Unit tests** for auto-numbering logic
3. **Integration tests** for full tool execution
4. **Test cases**:
   - Basic feature creation
   - Creation with explicit number
   - Creation with short_name override
   - Creation from epic branch
   - Error: directory already exists
   - Error: branch already exists
   - Auto-numbering with existing features

## Implementation Order

1. Create `src/utils/slug.ts` - Slug generation utilities
2. Create `src/tools/create-feature.ts` - Main tool implementation
3. Update `src/utils/index.ts` - Export slug utilities
4. Update `src/tools/index.ts` - Register the tool
5. Write tests for slug generation
6. Write tests for create-feature tool
