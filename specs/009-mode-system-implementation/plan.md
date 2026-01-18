# Implementation Plan: Mode System Implementation

**Feature**: Implement the mode system that controls which tools are active at any given time
**Branch**: `009-mode-system-implementation`
**Status**: Complete

## Summary

Enhance the existing ModeManager to support mode inheritance, full glob pattern matching with excludes, YAML configuration loading, and circular inheritance detection. The current implementation provides basic mode switching and pattern matching; this plan extends it to meet all specification requirements.

## Technical Context

| Aspect | Value |
|--------|-------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20+ |
| Package Manager | pnpm |
| Build System | turborepo |
| Test Framework | Vitest (inferred from existing tests) |
| Key Dependencies | `minimatch` (already in use), `zod`, `yaml` |

## Current State Analysis

The codebase already has:
- `ModeManager` class (`packages/agency/src/modes/manager.ts`) with basic mode switching
- `ToolRegistry` with `getToolsForMode()` using minimatch patterns
- `ConfigLoader` for loading JSON config from `.agency/config.json`
- Error codes for `MODE_NOT_FOUND` and `MODE_ALREADY_REGISTERED`

Missing functionality per spec:
- Mode inheritance (`extends` field)
- Exclude patterns with precedence
- Circular inheritance detection
- YAML config loading from `.agency/modes.yaml`
- API override capability
- Default mode = `coding` with built-in mode definitions

## Project Structure

```text
packages/agency/src/
├── modes/
│   ├── index.ts                  # Re-exports (UPDATE)
│   ├── manager.ts                # ModeManager class (UPDATE)
│   ├── manager.test.ts           # ModeManager tests (UPDATE)
│   ├── types.ts                  # Mode type definitions (NEW)
│   ├── config-loader.ts          # YAML config loading (NEW)
│   ├── config-loader.test.ts     # Config loader tests (NEW)
│   ├── pattern-matcher.ts        # Glob matching with excludes (NEW)
│   ├── pattern-matcher.test.ts   # Pattern matcher tests (NEW)
│   ├── inheritance-resolver.ts   # Inheritance with cycle detection (NEW)
│   └── inheritance-resolver.test.ts # Inheritance tests (NEW)
├── tools/
│   └── registry.ts               # ToolRegistry (UPDATE for excludes)
├── config/
│   └── schema.ts                 # Add ModeDefinition schema (UPDATE)
└── errors/
    └── agency-error.ts           # Add new error codes (UPDATE)
```

## Implementation Approach

### Phase 1: Type Definitions and Error Codes

1. **Add new error codes** to `agency-error.ts`:
   - `MODE_CIRCULAR_INHERITANCE` - Circular extension detected
   - `MODE_CONFIG_INVALID` - Invalid mode configuration

2. **Create `modes/types.ts`** with:
   - `ModeDefinition` interface matching spec
   - `ResolvedMode` interface (flattened includes/excludes)
   - `ModeConfig` type for full configuration

### Phase 2: Pattern Matching with Excludes

1. **Create `pattern-matcher.ts`** with:
   - `matchesTool(toolName, includes, excludes)` function
   - Excludes always win over includes (per spec)
   - Support for glob patterns and negation prefix `!`

### Phase 3: Inheritance Resolution

1. **Create `inheritance-resolver.ts`** with:
   - `resolveInheritance(modes)` function
   - Topological sort with cycle detection
   - Returns `ResolvedMode[]` with flattened patterns
   - Throws `MODE_CIRCULAR_INHERITANCE` on cycles

### Phase 4: YAML Configuration Loading

1. **Create `config-loader.ts`** with:
   - `loadModeConfig(projectRoot)` function
   - Loads from `.agency/modes.yaml`
   - Falls back to `.agency/config.json` modes section
   - Validates with zod schema

2. **Add built-in default modes** in loader:
   - `research`, `coding`, `review`, `debug` as per spec
   - Default mode: `coding`

### Phase 5: ModeManager Enhancement

1. **Update `ModeManager`** to:
   - Accept `ModeConfig` with full mode definitions
   - Resolve inheritance at construction time
   - Use pattern matcher for tool filtering
   - Support API override via `setModeConfig()`

2. **Update `ToolRegistry.getToolsForMode()`** to:
   - Accept resolved includes/excludes from ModeManager
   - Apply exclude patterns with precedence

### Phase 6: Integration

1. **Update `config/schema.ts`** to include `ModeDefinition` schema
2. **Update exports in `modes/index.ts`**
3. **Integration tests** for full workflow

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Inheritance resolution | Load-time validation | Per spec: validate at config load, not runtime |
| Pattern precedence | Excludes always win | Per spec: predictable, no specificity reasoning |
| Default mode | `coding` | Per spec: agents are primary workers |
| Config format | YAML primary, JSON fallback | Per spec: `.agency/modes.yaml` with API override |
| Error handling | Throw on invalid | Per spec: fail fast on misconfiguration |

## Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| minimatch | Glob pattern matching | Already installed |
| yaml | YAML parsing | Needs install |
| zod | Schema validation | Already installed |

## Test Strategy

- Unit tests for each new module
- Integration test for full mode resolution flow
- Edge cases: circular inheritance, empty patterns, overlapping includes/excludes
- Performance test: mode switch < 10ms (per SC-001)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing mode API | Maintain backwards compatibility with current constructor signature |
| YAML parsing errors | Clear error messages with line numbers |
| Pattern matching performance | Cache resolved patterns per mode |

## Next Steps

Run `/speckit:tasks` to generate the implementation task list.
