# Implementation Plan: Tool Registry and Naming Convention

**Feature**: Tool registry with enforced naming conventions for agent-ergonomic tool organization
**Branch**: `010-tool-registry-naming-convention`
**Status**: Complete

## Summary

Extend the existing `ToolRegistry` class with naming validation, catalog generation, and prefix-based querying. The current implementation already has basic registration and mode filtering; this adds convention enforcement and discovery capabilities.

## Technical Context

- **Language**: TypeScript 5.x (ES2022 target)
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm
- **Test Framework**: Vitest
- **Existing Dependencies**: minimatch (already used for mode filtering)
- **Build System**: turborepo

## Current State Analysis

The existing implementation in `packages/agency/src/tools/` includes:
- `ToolRegistry` class with register/unregister/get methods
- Mode-based filtering using minimatch glob patterns
- `AgencyTool` interface with name, description, inputSchema, namespace, modes, execute
- MCP format conversion via `toMcpTool()`

**Gap Analysis**:
| Spec Requirement | Current State | Action |
|-----------------|---------------|--------|
| `validateName()` with strict mode | Not implemented | Add method |
| `getByPrefix()` | Not implemented | Add method |
| `getCatalog()` | Not implemented | Add method |
| Duplicate registration warning | Silently overwrites | Add warning log |
| Length warnings | Not implemented | Add to validation |
| Standard prefixes constant | Not defined | Add constant |
| `ValidationResult` type | Not defined | Add type |

## Project Structure

```
packages/agency/src/
├── tools/
│   ├── index.ts              # Re-export new types
│   ├── types.ts              # Add ValidationResult, ValidationOptions, ToolCatalog
│   ├── registry.ts           # Extend with validation and catalog methods
│   ├── registry.test.ts      # Add new test cases
│   ├── validation.ts         # NEW: Name validation logic
│   ├── validation.test.ts    # NEW: Validation unit tests
│   └── prefixes.ts           # NEW: Standard prefixes constant
├── errors/
│   └── agency-error.ts       # Add TOOL_NAME_INVALID error code (if needed)
```

## Implementation Approach

### Phase 1: Types and Constants

1. Add `ValidationResult`, `ValidationOptions`, `ToolCatalog` to `types.ts`
2. Create `prefixes.ts` with `STANDARD_PREFIXES` constant
3. Keep types minimal per clarification decision

### Phase 2: Validation Logic

1. Create `validation.ts` with `validateToolName()` function
2. Implement validation rules:
   - Exactly one dot separator
   - snake_case action name
   - Prefix check (standard vs custom)
   - Length threshold warnings
3. Support `strict` mode option

### Phase 3: Registry Extensions

1. Add `validateName()` method calling validation logic
2. Add `getByPrefix()` method for prefix-based filtering
3. Add `getCatalog()` method returning grouped tools
4. Modify `register()` to log warning on duplicate
5. Add optional Markdown rendering for catalog

### Phase 4: Testing

1. Add validation tests covering all rules
2. Add registry tests for new methods
3. Test strict vs permissive mode behavior
4. Test catalog generation and grouping

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Validation location | Separate `validation.ts` | Keeps registry focused, enables reuse |
| Prefix storage | Simple constant array | Minimal, easy to extend |
| Catalog format | JSON object | Single source of truth per spec |
| Warning mechanism | Return in ValidationResult | Programmatic consumers can decide |
| Duplicate warning | Console.warn | Lightweight, non-blocking |

## API Changes

### New Methods on ToolRegistry

```typescript
validateName(name: string, options?: ValidationOptions): ValidationResult;
getByPrefix(prefix: string): AgencyTool[];
getCatalog(): ToolCatalog;
```

### New Types

```typescript
interface ValidationOptions {
  strict?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ToolCatalog {
  tools: AgencyTool[];
  byPrefix: Record<string, AgencyTool[]>;
  generatedAt: string;
}
```

### New Constants

```typescript
const STANDARD_PREFIXES = [
  'source_control',
  'build',
  'run',
  'test',
  'humancy',
  'debug',
  'docs',
] as const;
```

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `tools/types.ts` | Modify | Add ValidationResult, ValidationOptions, ToolCatalog |
| `tools/prefixes.ts` | Create | Standard prefixes constant |
| `tools/validation.ts` | Create | validateToolName function |
| `tools/validation.test.ts` | Create | Validation unit tests |
| `tools/registry.ts` | Modify | Add validateName, getByPrefix, getCatalog, duplicate warning |
| `tools/registry.test.ts` | Modify | Add tests for new methods |
| `tools/index.ts` | Modify | Export new types and functions |

## Testing Strategy

- Unit tests for each validation rule
- Edge cases: empty string, multiple dots, unicode, max length
- Mode interaction: strict vs permissive
- Catalog grouping correctness
- Duplicate registration warning (spy on console.warn)

## Dependencies

- **#7 MCP server foundation**: Assumed complete (existing code uses MCP types)
- **No new runtime dependencies**: Uses existing minimatch

## Out of Scope (per spec)

- Runtime tool execution
- Tool permission management
- Tool versioning
- Remote tool discovery

---

*Generated by speckit*
