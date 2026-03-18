# Implementation Plan: Discovery-Based build.validate Tool

**Feature**: Add a discovery-based `build.validate` tool to agency-plugin-npm that auto-detects and runs validation scripts from package.json
**Branch**: `323-problem-agency-npm-plugin`
**Status**: Complete

## Summary

Add a `build.validate` meta-tool to the npm plugin that reads `package.json` to discover validation-related scripts (lint, format:check, typecheck), runs them sequentially, and reports aggregated pass/fail results. Also add `'review'` mode to `build.format` and register everything in the manifest.

## Technical Context

- **Language**: TypeScript (ESM, `.js` extensions in imports)
- **Framework**: Agency plugin system (`@generacy-ai/agency`)
- **Package Manager**: pnpm workspaces
- **Validation**: Zod schemas → JSON Schema conversion
- **Testing**: Vitest with mocked `exec` module
- **Build**: `pnpm build` (TypeScript compilation)

## Design Decisions

### DD-1: Sequential Execution
Run discovered scripts sequentially (not parallel). Matches existing tool patterns, produces clearer non-interleaved output. Validation scripts are individually fast. *(Clarification Q1)*

### DD-2: Explicit `scripts` Override Takes Precedence
When user provides `scripts` parameter, it overrides the `validate` short-circuit. Explicit user intent > auto-discovery defaults. *(Clarification Q2)*

### DD-3: Simple Config Entry
Config entry is just `validate: 'validate'` (the short-circuit script name). Discovery candidates remain hardcoded as sensible defaults. The `scripts` parameter already provides an escape hatch. *(Clarification Q3)*

### DD-4: Format --check Auto-Append (Pending)
When `format` is discovered (not `format:check`), `--check` should be appended since the validate tool is inherently read-only. Recommend option A (always append). *(Clarification Q4 — pending, implement as A)*

### DD-5: Empty Discovery Returns Success (Pending)
When no validation scripts are found, return success with a message listing what was searched for. No scripts = nothing to fail. *(Clarification Q5 — pending, implement as A)*

### DD-6: ZodArray Support in zodToJsonSchema
The `ValidateSchema` uses `z.array(z.string())` which the current `getJsonSchemaType` function doesn't handle. Must add `ZodArray` support.

## Project Structure

### New Files
```
packages/agency-plugin-npm/src/tools/build/validate.ts    # Tool implementation
```

### Modified Files
```
packages/agency-plugin-npm/src/tools/schemas.ts            # Add ValidateSchema + ZodArray support
packages/agency-plugin-npm/src/tools/index.ts              # Register createValidateTool
packages/agency-plugin-npm/src/manifest.ts                 # Add to tools[] and modeAffiliations
packages/agency-plugin-npm/src/config.ts                   # Add validate to ScriptConfig
packages/agency-plugin-npm/src/tools/build/format.ts       # Add 'review' to modes
packages/agency-plugin-npm/tests/tools/build.test.ts       # Add validate tests
```

## Implementation Details

### 1. ValidateSchema (schemas.ts)

```typescript
export const ValidateSchema = BaseParamsSchema.extend({
  /** Override which scripts to discover/run */
  scripts: z.array(z.string()).optional(),
});
```

Also update `getJsonSchemaType()` to handle `z.ZodArray`:
```typescript
if (zodType instanceof z.ZodArray) {
  return { type: 'array', items: getJsonSchemaType(zodType.element), description: zodType.description };
}
```

### 2. validate.ts — Core Logic

```
Discovery algorithm:
1. Parse params (ValidateSchema)
2. Read available scripts from package.json via getAvailableScripts()
3. Determine script list:
   a. If params.scripts provided → use those (DD-2)
   b. Else if 'validate' script exists → use only ['validate'] (short-circuit)
   c. Else → auto-discover from candidates: lint, format:check (fallback format+--check), typecheck
4. Detect package manager (same pattern as lint/format)
5. Run each script sequentially, collecting results
6. Aggregate: which ran, which passed, which failed (with stderr/stdout)
7. Return success if all passed, error if any failed
```

Key behaviors:
- Scripts not in package.json are **silently skipped** (not errors)
- `format` without `format:check` gets `--check` appended (DD-4)
- Empty discovery → success message (DD-5)
- All scripts run regardless of individual failures

### 3. format.ts — Add Review Mode

Change `modes: ['default', 'coding']` to `modes: ['default', 'coding', 'review']`.

### 4. manifest.ts — Registration

- Add `'build.validate'` to `tools[]`
- Add `'build.validate'` to `modeAffiliations.coding[]`
- Add `'build.validate'` and `'build.format'` to `modeAffiliations.review[]`

### 5. config.ts — Config Entry

Add `validate?: string` to `ScriptConfig` interface with default `'validate'`.

### 6. tools/index.ts — Factory Registration

Import `createValidateTool` and add to the returned array.

### 7. Tests — build.test.ts

- Metadata test: name, namespace, modes, outputPattern
- Tool count: update from 8 → 9 (5 build tools, 4 test tools)
- Discovery: test with fixture that has lint+format scripts
- Short-circuit: test validate script takes over when present
- Override: test scripts param bypasses discovery
- Empty discovery: test with fixture with no validation scripts
- Format review mode: verify format.modes includes 'review'

## Test Fixtures

Need new fixture(s):
- `tests/fixtures/validate-project/package.json` — with lint, format, format:check, typecheck scripts
- Optionally: `tests/fixtures/validate-shortcircuit/package.json` — with a `validate` script

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `zodToJsonSchema` doesn't support arrays | Add ZodArray case to `getJsonSchemaType()` |
| Pending clarifications Q4/Q5 | Implement sensible defaults (append --check, return success) |
| Format `--check` doesn't work for all formatters | Only auto-append when `format:check` is absent; user can override via `scripts` param |

## Implementation Order

1. Schema + zodToJsonSchema array support
2. Config entry
3. validate.ts implementation
4. format.ts review mode
5. manifest + tools/index.ts registration
6. Test fixtures + tests
7. Build + verify
