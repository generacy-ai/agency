# Research: check_prereqs Implementation

## Technology Decisions

### Tool Pattern: Factory Function
**Decision**: Use factory function pattern `createCheckPrereqsTool(config, core)`

**Rationale**:
- Consistent with existing `createGetPathsTool` in `get-paths.ts`
- Allows dependency injection of config and core API
- Enables testing with mock dependencies

### Response Format: JSON in ToolResult
**Decision**: Return JSON-serialized `PrerequisiteResult` via `ToolResult`

**Rationale**:
- Matches existing tool response patterns
- Type safety with `PrerequisiteResult` interface
- Easy parsing by MCP clients

### Error Handling: Structured Errors
**Decision**: Use `createError()` from `types/errors.ts`

**Rationale**:
- Consistent error format across all tools
- Typed error codes enable client-side handling
- Context field allows additional debugging info

## Alternatives Considered

### Alternative 1: Separate Tool for Each File Check
**Rejected**: Would require multiple MCP calls for what should be a single operation.

### Alternative 2: Return File Contents
**Rejected**: Out of scope - this tool validates existence, not reads content.

### Alternative 3: Custom PrereqsResult Type
**Rejected**: `PrerequisiteResult` already exists in `types/feature.ts`.

## Implementation Patterns

### Path Resolution
```typescript
// Follow get-paths.ts pattern
const specsDir = join(repoRoot, config.paths.specs);
const featureDir = join(specsDir, featureName);
```

### File Existence Check
```typescript
// Use utility from utils/fs.ts
import { isFile, isDirectory, exists, readDir } from '../utils/index.js';
```

### Feature Name Resolution
```typescript
// Priority order from get-paths.ts
1. params.branch (explicit parameter)
2. process.env['SPECIFY_FEATURE']
3. Current git branch
4. Most recent feature directory
```

## Key Sources

### Reference Implementation
- `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/tools/prereqs.ts`
  - Complete implementation with all required functionality
  - Includes getAvailableDocs helper
  - Uses zod for schema validation

### Existing Patterns
- `packages/agency-plugin-spec-kit/src/tools/get-paths.ts`
  - Factory function pattern
  - Feature name resolution
  - Error handling with createError
  - ToolResult response format

### Type Definitions
- `packages/agency-plugin-spec-kit/src/types/feature.ts`
  - `PrerequisiteResult` interface already defined
  - Fields: valid, featureDir, availableDocs, error

### File Utilities
- `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - `exists()` - Check path existence
  - `isFile()` - Check if path is file
  - `isDirectory()` - Check if path is directory
  - `readDir()` - List directory contents
  - `findRepoRoot()` - Find git repository root
