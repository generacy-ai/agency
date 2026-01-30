# Research: get_paths Tool Implementation

## Technology Decisions

### 1. Git Library: simple-git

**Decision**: Use `simple-git` for git operations

**Rationale**:
- Already used in the reference implementation (claude-plugins/speckit)
- Provides a clean Promise-based API
- Handles cross-platform git operations
- Minimal overhead for the operations we need (branch detection)

**Alternatives Considered**:
- **Native git commands via exec**: More complex error handling, cross-platform issues
- **isomorphic-git**: Heavier, more features than needed
- **No git dependency**: Would limit functionality (can't auto-detect branch)

### 2. File System Operations: Native Node.js fs/promises

**Decision**: Use `node:fs/promises` for file operations

**Rationale**:
- No external dependencies needed
- Promise-based API aligns with async/await patterns
- Sufficient for checking existence, reading directories

### 3. Configuration Integration

**Decision**: Use existing Zod schemas from `types/config.ts`

**Rationale**:
- Consistency with existing configuration patterns
- Runtime validation with TypeScript inference
- Default values already defined (FileNamesSchema, DirectoryNamesSchema)

## Implementation Patterns

### Pattern 1: Factory Function for Tool Creation

```typescript
export function createGetPathsTool(
  config: SpecKitConfig,
  core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.get_paths',
    // ... tool definition
  };
}
```

**Benefits**:
- Allows dependency injection of config and core API
- Follows existing plugin tool patterns
- Enables testing with mocked dependencies

### Pattern 2: Separation of Concerns

```
get-paths.ts (tool) → uses → fs.ts (file utils) + git.ts (git utils)
```

**Benefits**:
- Utilities can be reused by other tools
- Easier to test in isolation
- Matches reference implementation structure

### Pattern 3: Error Result Objects

```typescript
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      success: false,
      error: createError('ERROR_CODE', 'Message', context)
    })
  }]
};
```

**Benefits**:
- Consistent error format across tools
- Machine-parseable error information
- Context data aids debugging

## Key Sources/References

1. **Reference Implementation**:
   - `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/tools/paths.ts`
   - Provides complete working implementation to adapt

2. **Agency Plugin System**:
   - `/workspaces/agency/packages/agency/src/tools/types.ts`
   - Defines `AgencyTool` interface requirements

3. **Existing Types in Repo**:
   - `/workspaces/agency/packages/agency-plugin-spec-kit/src/types/feature.ts`
   - `FeaturePaths` interface already defined, matches return structure

4. **Configuration Schemas**:
   - `/workspaces/agency/packages/agency-plugin-spec-kit/src/types/config.ts`
   - File names and directory names can be customized

## Open Questions (Resolved)

1. **Q**: Should we add simple-git as a dependency?
   **A**: Yes, check package.json - if not present, it needs to be added

2. **Q**: Where should spec directory be resolved from?
   **A**: From config's `specDirectory` (default: 'specs'), relative to repo root

3. **Q**: How to handle feature directories that don't exist yet?
   **A**: Return `exists: false` but still provide computed paths (allows pre-creation queries)
