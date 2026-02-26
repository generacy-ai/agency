# Research: Schema Migration Technical Decisions

**Branch**: `296-migrate-tool-schemas-from` | **Date**: 2026-02-25

## 1. Zod `.passthrough()` and Type Compatibility

### Problem
Contracts uses `.passthrough()` on schemas like `TerseToolResultSchema`. The `z.infer` of a `.passthrough()` object produces `objectOutputType` which includes an index signature `[k: string]: unknown`. Agency's current `TerseToolResult` is a plain interface with only `success` and `output`.

### Analysis
TypeScript structural typing means code that consumes `{ success: boolean, output: string }` will accept the Zod-inferred type because it's a superset. However, code that explicitly types a variable as the plain interface and tries to assign from a Zod parse result may encounter issues if the index signature leaks.

### Decision
Use `z.infer<typeof TerseToolResultSchema>` as the canonical type. The structural compatibility is sufficient for all existing usage:
- `TerseOutput.success()` returns `{ success: true, output: string }` — compatible
- `toMcpToolResult()` reads `result.success` and `result.output` — compatible
- Test assertions check `.success` and `.output` properties — compatible

The `data` field (new, optional) is additive and won't break consumers.

### Validation
Verified by reading `src/output/terse-output.ts` — all methods return object literals with `success` and `output` that structurally match the Zod-inferred type.

---

## 2. validateToolName() Reconciliation Strategy

### Problem
Agency's `validateToolName()` returns `ValidationResult { valid, errors[], warnings[] }`.
Contracts' `validateToolName()` returns `ToolValidationError | undefined`.
Per Q2, we keep agency's signature but use contracts' Zod schemas internally.

### Implementation Approach

```typescript
// src/tools/validation.ts — revised implementation sketch
import { ToolPrefixSchema } from './naming/prefix.js';
import { ActionNameSchema } from './naming/action.js';
import { STANDARD_PREFIXES, LENGTH_THRESHOLDS } from './prefixes.js';

export function validateToolName(
  name: string,
  options: ValidationOptions = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Format check (dot separator)
  const dotIndex = name.indexOf('.');
  if (dotIndex === -1 || name.indexOf('.', dotIndex + 1) !== -1) {
    errors.push('Tool name must contain exactly one dot separator (prefix.action)');
    return { valid: false, errors, warnings };
  }

  const [prefix, action] = name.split('.');

  if (!prefix || !action) {
    errors.push('Both prefix and action must be non-empty');
    return { valid: false, errors, warnings };
  }

  // Step 2: Use Zod schemas for format validation
  const actionResult = ActionNameSchema.safeParse(action);
  if (!actionResult.success) {
    errors.push(`Action "${action}" must be snake_case (lowercase letters, numbers, underscores)`);
  }

  // Validate prefix format (snake_case) using same regex
  const prefixFormatResult = ActionNameSchema.safeParse(prefix);
  if (!prefixFormatResult.success) {
    errors.push(`Prefix "${prefix}" must be snake_case`);
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Step 3: Check if prefix is standard (using Zod enum)
  const prefixResult = ToolPrefixSchema.safeParse(prefix);
  if (!prefixResult.success) {
    if (options.strict) {
      errors.push(`Unknown prefix "${prefix}". Standard prefixes: ${STANDARD_PREFIXES.join(', ')}`);
    } else {
      warnings.push(`Custom prefix "${prefix}". Standard prefixes: ${STANDARD_PREFIXES.join(', ')}`);
    }
  }

  // Step 4: Length threshold warnings (agency-specific, not in contracts)
  if (prefix.length > LENGTH_THRESHOLDS.prefix) {
    warnings.push(`Prefix "${prefix}" exceeds recommended length of ${LENGTH_THRESHOLDS.prefix} (actual: ${prefix.length})`);
  }
  if (action.length > LENGTH_THRESHOLDS.action) {
    warnings.push(`Action "${action}" exceeds recommended length of ${LENGTH_THRESHOLDS.action} (actual: ${action.length})`);
  }
  if (name.length > LENGTH_THRESHOLDS.total) {
    warnings.push(`Tool name "${name}" exceeds recommended total length of ${LENGTH_THRESHOLDS.total} (actual: ${name.length})`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

This preserves the exact same behavior as the current implementation (all 100+ tests pass) while using contracts' Zod schemas (`ActionNameSchema`, `ToolPrefixSchema`) for the actual format validation logic. The snake_case regex is effectively the same in both codebases.

---

## 3. Contracts `common/` Types Dependency Analysis

### Problem
Domain schemas in contracts import from `../../common/` for shared ID schemas, timestamp schemas, and enums. These imports must be redirected.

### Analysis of Cross-References

| Common Type | Used By |
|-------------|---------|
| ULID regex/generator | extension-comms, github-app, telemetry |
| `createPrefixedIdSchema()` | knowledge-store, learning-loop, decision-model, attribution-metrics, data-export |
| ISO timestamp schema | All domain schemas |
| Branded ID types | All domain schemas |

### Decision
Create `src/schemas/common/` with three files:
- `ids.ts` — ULID regex, `createPrefixedIdSchema()`, branded ID factory
- `timestamps.ts` — ISO 8601 datetime schema
- `index.ts` — barrel

These are internal utilities, not exported from the package root. Domain schemas import from `../common/`.

### Risk
If contracts' `common/` has more types than expected, some domain schemas may fail to compile. Mitigation: compile each domain module incrementally and fix missing imports.

---

## 4. Versioned Namespace Pattern

### Observation
Contracts uses a namespace-based versioning pattern:
```typescript
export namespace SchemaName {
  export const V1 = z.object({ ... });
  export type V1 = z.infer<typeof V1>;
  export const Latest = V1;
  export type Latest = V1;
}
```

### Decision
Preserve this pattern as-is during migration. It's used extensively in extension-comms, github-app, platform-api, and data-export. Changing it would require rewriting all consuming code.

Agency's existing schemas don't use this pattern (they use flat exports like `ToolCallEventV1`). The two styles coexist without conflict.

---

## 5. ULID vs UUID Migration Path

### Current State
- Agency uses `z.string().uuid()` for `ToolCallEventV1.id`
- Agency has test fixtures with UUID-format IDs
- Agency's `telemetry/` produces events internally (no external consumers)

### Migration Steps
1. Add `ulid` package to dependencies
2. Change `id` field from `z.string().uuid()` to `z.string().regex(ULID_REGEX)`
3. Add `generateEventId()` function using `ulid()`
4. Update all test fixtures to use ULID format
5. Update any telemetry producers (in `interceptor.ts`, `manager.ts`) to use `generateEventId()` instead of UUID generation

### Verifying Existing Producers
Files that create event IDs:
- `src/telemetry/interceptor.ts` — creates ToolCallEvent objects
- `src/telemetry/manager.ts` — may create events
- `src/__tests__/telemetry/` — test fixtures

Search for `uuid` or `crypto.randomUUID` in telemetry files to find all production sites.

---

## 6. Subpath Export Configuration

### package.json Exports
Node.js subpath exports require exact path mapping. For TypeScript consumers, both `import` and `types` conditions must be specified.

### tsconfig.json Considerations
Consumers using TypeScript need `moduleResolution: "node16"` or `"bundler"` to resolve subpath exports. This is a consumer concern, not something we control.

### Build Output
`tsc` will output `.js` and `.d.ts` files in `dist/` preserving the `src/` directory structure. Subpath exports point to `dist/schemas/<domain>/index.js` which maps to `src/schemas/<domain>/index.ts`.

Verify that `tsconfig.json` includes the new `src/schemas/` directories in compilation (it should, since it uses `src/**/*` include pattern).

---

## 7. Generation Script Runtime

### Problem
Generation scripts are TypeScript files that import Zod schemas and produce JSON. They need a TypeScript-aware runtime to execute.

### Options
1. **tsx** — Modern, fast TS execution. Add as devDependency.
2. **ts-node with ESM loader** — `node --loader ts-node/esm script.ts`. More established.
3. **Compile first, run JS** — Build the project, then run the compiled JS scripts. No extra dependency.

### Decision
Use option 3 (compile first) if scripts are in `src/` and get compiled by `tsc`. The `prebuild` script order would be:
1. `tsc` compiles everything including scripts
2. `node dist/scripts/generate-tool-result-schema.js` generates JSON schemas

But this creates a chicken-and-egg: we need the build to run the scripts, but may want schemas before the build. Solution: use `tsx` as a devDependency for running generation scripts directly:

```json
{
  "devDependencies": {
    "tsx": "^4.0.0"
  },
  "scripts": {
    "generate:schemas": "tsx src/scripts/generate-tool-result-schema.ts && tsx src/scripts/generate-tool-naming-schemas.ts"
  }
}
```

This matches how contracts runs its generation scripts (via `tsup` build then node, but `tsx` is simpler for agency's `tsc`-based build).

---

## 8. Test Adaptation Notes (vitest 3.x vs 4.x)

### Known Differences
- vitest 4.x has improved `toMatchObject` inference
- vitest 4.x changed some mock typing
- Core APIs (`describe`, `it`, `expect`, `vi`) are stable across versions

### Adaptation Checklist for Migrated Tests
- [ ] Add explicit `import { describe, it, expect, vi } from 'vitest'` (agency uses `globals: false`)
- [ ] Replace any `.js` test imports with correct relative paths for agency structure
- [ ] Update any `@generacy-ai/contracts` imports to local relative imports
- [ ] Replace `ulid()` calls in tests with the new `generateEventId()` or import `ulid` directly
- [ ] Verify `toMatchObject`, `toEqual`, `toStrictEqual` behave the same

### Test Count Estimates
| Domain | Contract Tests | Migrated Tests (est.) |
|--------|---------------|----------------------|
| tool-naming | ~4 files | ~2 files (merged with agency) |
| tool-result | ~1 file | 1 file |
| extension-comms | ~8 files | ~8 files |
| github-app | ~3 files | ~3 files |
| platform-api | ~9 files | ~9 files |
| knowledge-store | ~5 files | ~5 files |
| learning-loop | ~6 files | ~6 files |
| decision-model | ~6 files | ~6 files |
| attribution-metrics | ~9 files | ~9 files |
| data-export | ~5 files | ~5 files |
| telemetry | merged | merged into existing |
| **Total** | **~56 files** | **~54 files** |
