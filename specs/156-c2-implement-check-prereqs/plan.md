# Implementation Plan: C2: Implement check_prereqs tool

**Feature**: Implement the `spec_kit.check_prereqs` MCP tool for validating required files
**Branch**: `156-c2-implement-check-prereqs`
**Status**: Complete

## Summary

Implement the `spec_kit.check_prereqs` tool that validates required specification files exist before workflow operations. This tool is essential for gating workflow steps by checking prerequisites like spec.md, plan.md, and tasks.md, while also reporting available optional documents, contracts, and checklists.

## Technical Context

| Aspect | Detail |
|--------|--------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20+ |
| Package | `@generacy-ai/agency-plugin-spec-kit` |
| Location | `packages/agency-plugin-spec-kit/src/tools/` |
| Build System | pnpm + turbo |
| Test Framework | Vitest |

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── index.ts              # Tool exports (MODIFY)
│   │   ├── get-paths.ts          # Existing get_paths tool (reference)
│   │   └── check-prereqs.ts      # NEW: check_prereqs tool
│   ├── types/
│   │   ├── feature.ts            # PrerequisiteResult interface (EXISTS)
│   │   ├── errors.ts             # Error utilities (USE)
│   │   └── patterns.ts           # FEATURE_NAME_PATTERN (USE)
│   ├── utils/
│   │   ├── fs.ts                 # File system utilities (USE)
│   │   ├── git.ts                # Git utilities (USE)
│   │   └── index.ts              # Utility exports (USE)
│   └── config.ts                 # SpecKitConfig (USE)
├── tests/
│   └── tools/
│       └── check-prereqs.test.ts # NEW: Unit tests
└── package.json
```

## Dependencies

### Internal Dependencies (same package)
- `../types/feature.js` - `PrerequisiteResult` interface
- `../types/errors.js` - `createError` function
- `../types/patterns.js` - `FEATURE_NAME_PATTERN`
- `../utils/index.js` - File system and git utilities
- `../config.js` - `SpecKitConfig` type

### External Dependencies
- `@generacy-ai/agency` - `AgencyTool`, `ToolResult`, `AgencyCoreAPI` types
- `node:path` - Path manipulation

### Epic Dependencies
- C1 (get_paths) - Path resolution pattern (implemented)
- B1 (fs utilities) - File system operations (implemented)
- F2 (types) - Type definitions (implemented)

## Implementation Approach

### Pattern Reference
Follow the established pattern from `get-paths.ts`:
1. Tool factory function `createCheckPrereqsTool(config, core)`
2. Parameters interface for type safety
3. JSON-serialized response via `ToolResult`
4. Error handling with `createError()` for structured errors

### Key Functions

#### `createCheckPrereqsTool(config, core): AgencyTool`
Main factory function that creates the tool instance.

#### `getFeatureName(repoRoot, specsDir): Promise<string | null>`
Reuse or extract from get-paths.ts - determines feature name from:
1. SPECIFY_FEATURE environment variable
2. Current git branch
3. Most recent feature directory

#### `getAvailableDocs(featureDir): Promise<string[]>`
Check for optional documentation files:
- research.md
- data-model.md
- quickstart.md
- contracts/ directory (if has files)
- checklists/ directory (if has files)

## Response Format

```typescript
interface CheckPrereqsResult {
  valid: boolean;
  featureDir: string;
  availableDocs: string[];
  missingRequired?: string[];  // Only if valid=false
  error?: string;              // Only if valid=false
}
```

## Error Handling

Use existing error codes from `types/errors.ts`:
- `FEATURE_DIR_NOT_FOUND` - Repository root not found
- `INVALID_BRANCH_NAME` - Branch name doesn't match pattern
- `PREREQUISITE_NOT_MET` - Required files missing

## Testing Strategy

Unit tests with Vitest covering:
1. Valid prerequisites - all required files exist
2. Missing spec.md (default required)
3. Missing plan.md (when required)
4. Missing tasks.md (when required)
5. Available optional docs detection
6. Contracts and checklists directory detection
7. Feature directory not found
8. Invalid branch name
9. include_tasks parameter behavior

## Constraints

- Follow existing tool patterns in the codebase
- No breaking changes to existing interfaces
- Maximum 3 MCP tool calls per operation
- Support both branch parameter and auto-detection
