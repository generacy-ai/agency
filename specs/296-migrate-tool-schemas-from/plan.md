# Implementation Plan: Migrate Tool Schemas from Contracts Repo

**Branch**: `296-migrate-tool-schemas-from` | **Date**: 2026-02-25

## Summary

Migrate all tool-related schemas, platform schemas, domain schemas, and generation scripts from `@generacy-ai/contracts` into `@generacy-ai/agency`. Agency owns tool execution, so these schemas belong here. No active repo depends on contracts, making this a clean "move to proper home" migration with no live dependency swap concerns.

The migration reconciles schema differences per the clarification answers: agency's conventions win for field names and signatures, contracts' Zod schemas replace plain interfaces as the source of truth, prefixes are unioned (10 total), telemetry switches to ULID, and tests are merged.

## Technical Context

- **Language**: TypeScript (ESM, `"type": "module"`)
- **Framework**: Zod for runtime validation, vitest 3.x for testing
- **Build**: `tsc` (agency), `turbo` (monorepo orchestration)
- **Package**: `@generacy-ai/agency` in `packages/agency/`
- **Source repo**: `/workspaces/contracts/src/schemas/` (~180 TS files)
- **Target repo**: `/workspaces/agency/packages/agency/src/`

### Key Dependencies
- `zod` ^3.24.1 (already in agency)
- `zod-to-json-schema` ^3.23.5 (new — needed for generation scripts)
- `ulid` ^3.0.2 (new — needed for ULID-based event IDs)

## Architecture Overview

### Current Agency Structure
```
src/
├── tools/          # Tool registry, validation, prefixes, types
├── telemetry/      # Event schemas, recording, storage
├── output/         # Terse output pattern (TerseToolResult)
├── schemas/        # Empty placeholder (README only)
└── index.ts        # ~120 exports
```

### Target Structure After Migration
```
src/
├── tools/
│   ├── naming/                    # FROM contracts tool-naming/ (P1)
│   │   ├── prefix.ts
│   │   ├── action.ts
│   │   ├── tool-name.ts
│   │   ├── validation-error.ts
│   │   ├── tool-definition.ts
│   │   ├── tool-catalog.ts
│   │   └── index.ts
│   ├── prefixes.ts                # MODIFIED — 10 prefixes (union)
│   ├── validation.ts              # MODIFIED — Zod internals, same signature
│   ├── validation.test.ts         # MODIFIED — merged tests
│   ├── registry.ts                # unchanged
│   └── types.ts                   # unchanged
├── schemas/
│   ├── tool-result.ts             # FROM contracts (Zod schema, source of truth)
│   ├── tool-result.test.ts        # FROM contracts tests
│   ├── extension-comms/           # FROM contracts (P2 — subpath export)
│   │   ├── coaching/
│   │   ├── decision-queue/
│   │   ├── sse/
│   │   ├── workflow/
│   │   └── index.ts
│   ├── github-app/                # FROM contracts (P2 — subpath export)
│   │   ├── permission-scope.ts
│   │   ├── progressive-permission.ts
│   │   ├── webhook-event.ts
│   │   └── index.ts
│   ├── platform-api/              # FROM contracts (P1 — root export)
│   │   ├── auth/
│   │   ├── organization/
│   │   ├── subscription/
│   │   └── index.ts
│   ├── knowledge-store/           # FROM contracts (P2 — subpath export)
│   ├── learning-loop/             # FROM contracts (P2 — subpath export)
│   ├── decision-model/            # FROM contracts (P2 — subpath export)
│   ├── attribution-metrics/       # FROM contracts (P2 — subpath export)
│   ├── data-export/               # FROM contracts (P2 — subpath export)
│   ├── generated/                 # Generated JSON schemas (.gitignored)
│   └── index.ts                   # Barrel for all schemas
├── telemetry/
│   ├── schemas.ts                 # MODIFIED — ULID, extra fields
│   └── ...                        # rest unchanged
├── output/
│   ├── types.ts                   # MODIFIED — re-exports from schemas/tool-result.ts
│   └── ...                        # rest unchanged
├── scripts/
│   ├── generate-tool-result-schema.ts
│   ├── generate-tool-naming-schemas.ts
│   └── generate-json-schemas.ts
└── index.ts                       # MODIFIED — new exports
```

## Implementation Phases

---

### Phase 1: Foundation — Dependencies and Infrastructure
**Goal**: Add dependencies, set up directory structure, configure build pipeline.

#### Step 1.1: Add new dependencies
- Add `ulid` ^3.0.2 to `dependencies` in `packages/agency/package.json`
- Add `zod-to-json-schema` ^3.23.5 to `devDependencies`
- Run `pnpm install`

#### Step 1.2: Create directory structure
Create empty directories with barrel `index.ts` files:
- `src/tools/naming/`
- `src/schemas/`
- `src/schemas/extension-comms/`
- `src/schemas/github-app/`
- `src/schemas/platform-api/`
- `src/schemas/knowledge-store/`
- `src/schemas/learning-loop/`
- `src/schemas/decision-model/`
- `src/schemas/attribution-metrics/`
- `src/schemas/data-export/`
- `src/schemas/generated/`
- `src/scripts/`

#### Step 1.3: Add `.gitignore` for generated schemas
Add `src/schemas/generated/` to `.gitignore` (or create one in `packages/agency/`).

#### Step 1.4: Add generation script to package.json
Add to `packages/agency/package.json` scripts:
```json
{
  "generate:schemas": "tsx src/scripts/generate-tool-result-schema.ts && tsx src/scripts/generate-tool-naming-schemas.ts",
  "prebuild": "pnpm generate:schemas",
  "prepublishOnly": "pnpm build"
}
```
Note: `tsx` is needed as a devDependency for running TS scripts directly, or use `ts-node` / `node --loader ts-node/esm`. Check what contracts uses and align.

**Files created/modified**: `package.json`, `.gitignore`, directory structure

---

### Phase 2: Tool Naming Schemas (P1 — Core)
**Goal**: Migrate tool-naming schemas from contracts, reconcile with agency's existing validation.

#### Step 2.1: Copy tool-naming schemas to `src/tools/naming/`

Copy from `/workspaces/contracts/src/schemas/tool-naming/`:
- `prefix.ts` → `src/tools/naming/prefix.ts`
- `action.ts` → `src/tools/naming/action.ts`
- `tool-name.ts` → `src/tools/naming/tool-name.ts`
- `validation-error.ts` → `src/tools/naming/validation-error.ts`
- `tool-definition.ts` → `src/tools/naming/tool-definition.ts`
- `tool-catalog.ts` → `src/tools/naming/tool-catalog.ts`

Create `src/tools/naming/index.ts` barrel file matching contracts' exports.

#### Step 2.2: Reconcile prefixes (Q4 — Union to 10)

Modify `src/tools/naming/prefix.ts`:
- Set `ToolPrefixValues` to the union of both sets:
  ```typescript
  export const ToolPrefixValues = [
    'source_control', 'build', 'run', 'test', 'debug',
    'deploy', 'humancy', 'file', 'database', 'docs',
  ] as const;
  ```

Modify `src/tools/prefixes.ts`:
- Import `ToolPrefixValues` from `./naming/prefix.js`
- Re-export as `STANDARD_PREFIXES` for backward compatibility:
  ```typescript
  export { ToolPrefixValues as STANDARD_PREFIXES } from './naming/prefix.js';
  export type StandardPrefix = (typeof STANDARD_PREFIXES)[number];
  ```
- Keep `LENGTH_THRESHOLDS` as-is (contracts has no equivalent)

#### Step 2.3: Reconcile `validateToolName()` (Q2 — Keep signature, use Zod internally)

Modify `src/tools/validation.ts`:
- Replace the regex-based implementation with contracts' Zod schema validation internally
- Import `ToolNameSchema`, `ToolPrefixSchema` from `./naming/index.js`
- Keep the existing function signature: `validateToolName(name, options?) → ValidationResult`
- Map Zod validation errors to the existing `{ valid, errors, warnings }` format
- Keep the `strict` option behavior (custom prefix = error in strict, warning in permissive)
- Keep the length threshold warnings from `LENGTH_THRESHOLDS`

The existing `ValidationResult` type stays in `types.ts` unchanged.

Also export the contracts-style structured validation separately via the naming module:
```typescript
// From src/tools/naming/index.ts — available for consumers who want structured errors
export { validateToolName as validateToolNameStructured } from './validation-error.js';
```

#### Step 2.4: Merge validation tests (Q10)

Modify `src/tools/validation.test.ts`:
- Keep all existing 100+ assertions (they test the public API which is unchanged)
- Add contracts' test assertions that cover newly migrated functionality:
  - Structured error code tests (adapted to test the internal Zod validation path)
  - `parseToolName()` / `createToolName()` tests
  - `ToolNameSchema` Zod parsing tests
  - `ToolPrefixSchema` validation tests
  - Tests for the 3 new prefixes (`deploy`, `file`, `database`)
- Adapt any vitest 4.x-specific syntax to 3.x (Q12)
- Add explicit `import { describe, it, expect } from 'vitest'` (agency uses `globals: false`)

#### Step 2.5: Update `src/tools/index.ts` barrel

Add exports for the naming module:
```typescript
export * from './naming/index.js';
```

Ensure no name collisions with existing exports. The existing `validateToolName` from `validation.ts` keeps its name. Contracts' version is exported as `validateToolNameStructured` from the naming module.

**Files created**: `src/tools/naming/*.ts` (7 files)
**Files modified**: `src/tools/prefixes.ts`, `src/tools/validation.ts`, `src/tools/validation.test.ts`, `src/tools/index.ts`

---

### Phase 3: Tool Result Schema (P1 — Core)
**Goal**: Migrate TerseToolResultSchema, make it the source of truth, re-export from `output/types.ts`.

#### Step 3.1: Create `src/schemas/tool-result.ts`

Copy from `/workspaces/contracts/src/schemas/tool-result.ts`:
- `TerseToolResultSchema` (Zod object with `.passthrough()`)
- `TerseToolResult` type (inferred from schema)
- `TerseToolOptions` interface
- `parseTerseToolResult()` / `safeParseTerseToolResult()` functions

#### Step 3.2: Update `src/output/types.ts` (Q3 — Re-export)

- Remove the plain `TerseToolResult` interface definition
- Import and re-export `TerseToolResult` from `../schemas/tool-result.js`:
  ```typescript
  export type { TerseToolResult } from '../schemas/tool-result.js';
  ```
- Keep `Verbosity`, `ExecResult`, `TerseOutputConfig`, `DEFAULT_TERSE_CONFIG` unchanged
- Verify that `TerseOutput` class (in `terse-output.ts`) still compiles — it uses `TerseToolResult` as a return type, so the structural compatibility should hold since the Zod-inferred type has the same shape plus `.passthrough()` allows extras

#### Step 3.3: Create `src/schemas/tool-result.test.ts`

Migrate contracts' tool-result tests, adapt to vitest 3.x conventions:
- Test `TerseToolResultSchema.parse()` with valid/invalid data
- Test `parseTerseToolResult()` and `safeParseTerseToolResult()`
- Test `.passthrough()` behavior (extra properties preserved)

#### Step 3.4: Add to `src/schemas/index.ts` barrel

```typescript
export {
  TerseToolResultSchema,
  type TerseToolResult,
  type TerseToolOptions,
  parseTerseToolResult,
  safeParseTerseToolResult,
} from './tool-result.js';
```

**Files created**: `src/schemas/tool-result.ts`, `src/schemas/tool-result.test.ts`
**Files modified**: `src/output/types.ts`, `src/schemas/index.ts`

---

### Phase 4: Telemetry Schema Reconciliation (P1 — Core)
**Goal**: Update ToolCallEventV1 to use ULID, add contracts' extra fields, create ToolStatsApiSchema.

#### Step 4.1: Switch ToolCallEventV1 to ULID (Q1)

Modify `src/telemetry/schemas.ts`:
- Replace `id: z.string().uuid()` with ULID validation:
  ```typescript
  import { ulid } from 'ulid';

  const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

  export const ToolCallEventV1 = z.object({
    id: z.string().regex(ULID_REGEX, 'Must be a valid ULID'),
    // ... rest unchanged
  });
  ```
- Export `generateEventId()` function:
  ```typescript
  export function generateEventId(): string {
    return ulid();
  }
  ```

#### Step 4.2: Add contracts' extra fields (Q5, Q6)

Add optional fields from contracts to `ToolCallEventV1`:
```typescript
// Existing fields unchanged (toolName, serverName, etc.)
// New optional fields from contracts:
errorCategory: z.string().optional(),
errorType: z.string().optional(),
workflowId: z.string().optional(),
issueNumber: z.number().int().optional(),
phase: z.string().optional(),
```

Keep `inputs` as optional (Q6).

#### Step 4.3: Create ToolStatsApiSchema (Q8)

Add to `src/telemetry/schemas.ts` (or a new file `src/telemetry/stats-api.ts`):
```typescript
export const ToolStatsApiSchema = z.object({
  version: z.string(),
  server: z.string(),
  tool: z.string(),
  timeWindow: TimeWindowSchema,
  totalCalls: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  avgDurationMs: z.number().nonnegative(),
  p50DurationMs: z.number().nonnegative().optional(),
  p95DurationMs: z.number().nonnegative().optional(),
  errorBreakdown: z.record(z.number().int().nonnegative()).optional(),
}).passthrough();
```

Keep existing `ToolStatsSchema` unchanged (runtime aggregation use case).

#### Step 4.4: Update telemetry tests

Modify `src/__tests__/telemetry/schemas.test.ts`:
- Update test data to use ULID format instead of UUID
- Add tests for new optional fields
- Add tests for `generateEventId()`
- Add tests for `ToolStatsApiSchema`
- Merge any relevant assertions from contracts' telemetry tests

**Files modified**: `src/telemetry/schemas.ts`, `src/__tests__/telemetry/schemas.test.ts`
**Files possibly created**: `src/telemetry/stats-api.ts` (if separating API stats)

---

### Phase 5: Platform Schemas (P1 — Root Export)
**Goal**: Migrate platform-api schemas to `src/schemas/platform-api/`, export from root.

#### Step 5.1: Copy platform-api schemas

Copy from `/workspaces/contracts/src/schemas/platform-api/`:
- `auth/` subdirectory (api-key.ts, auth-token.ts, session.ts, index.ts)
- `organization/` subdirectory (organization.ts, membership.ts, invite.ts, index.ts)
- `subscription/` subdirectory (generacy-tier.ts, humancy-tier.ts, feature-entitlement.ts, usage-limit.ts, index.ts)
- Root `index.ts` barrel

Destination: `src/schemas/platform-api/`

#### Step 5.2: Fix imports

- Update all relative imports (`.js` extensions for ESM)
- Replace any `ulid` imports to use the new dependency
- Remove any contracts-specific common type imports and inline or adapt them

#### Step 5.3: Copy and adapt tests

Copy platform-api `__tests__/` files, adapt to vitest 3.x with explicit imports.

#### Step 5.4: Export from root

Add to `src/schemas/index.ts`:
```typescript
export * from './platform-api/index.js';
```

Add to `src/index.ts`:
```typescript
// Platform schemas
export * from './schemas/platform-api/index.js';
```

**Files created**: `src/schemas/platform-api/**/*.ts` (~14 files + tests)

---

### Phase 6: Domain Schemas (P2 — Subpath Exports)
**Goal**: Migrate remaining domain schemas, each with its own subpath export.

These are migrated in parallel since they are independent of each other:

#### Step 6.1: Extension Comms (`src/schemas/extension-comms/`)
- Copy: coaching/, decision-queue/, sse/, workflow/ subdirectories
- Fix imports, adapt tests
- Create barrel `index.ts`

#### Step 6.2: GitHub App (`src/schemas/github-app/`)
- Copy: permission-scope.ts, progressive-permission.ts, webhook-event.ts
- Fix imports, adapt tests
- Create barrel `index.ts`

#### Step 6.3: Knowledge Store (`src/schemas/knowledge-store/`)
- Copy: shared-types.ts, philosophy.ts, principle.ts, pattern.ts, context.ts, individual-knowledge.ts
- Fix imports, adapt tests
- Create barrel `index.ts`

#### Step 6.4: Learning Loop (`src/schemas/learning-loop/`)
- Copy: shared-types.ts, coaching-data.ts, knowledge-update.ts, pattern-candidate.ts, learning-event.ts, learning-session.ts
- Fix imports, adapt tests
- Create barrel `index.ts`

#### Step 6.5: Decision Model (`src/schemas/decision-model/`)
- Copy: shared-types.ts, decision-request.ts, baseline-recommendation.ts, protege-recommendation.ts, human-decision.ts, three-layer-decision.ts
- Fix imports, adapt tests
- Create barrel `index.ts`

#### Step 6.6: Attribution Metrics (`src/schemas/attribution-metrics/`)
- Copy: shared-types.ts, metrics-period.ts, decision-outcome.ts, domain-metrics.ts, volume-metrics.ts, metrics-trend.ts, individual-metrics.ts, leaderboard-entry.ts, metrics-report.ts
- Fix imports, adapt tests
- Create barrel `index.ts`

#### Step 6.7: Data Export (`src/schemas/data-export/`)
- Copy: shared-types.ts, decision-history.ts, knowledge-export.ts, protege-export.ts, workflow-cloud-state.ts, queue-state.ts
- Fix imports, adapt tests
- Create barrel `index.ts`

#### Step 6.8: Add subpath exports to `package.json`

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./cli": {
      "import": "./dist/cli.js"
    },
    "./schemas/extension-comms": {
      "import": "./dist/schemas/extension-comms/index.js",
      "types": "./dist/schemas/extension-comms/index.d.ts"
    },
    "./schemas/github-app": {
      "import": "./dist/schemas/github-app/index.js",
      "types": "./dist/schemas/github-app/index.d.ts"
    },
    "./schemas/knowledge-store": {
      "import": "./dist/schemas/knowledge-store/index.js",
      "types": "./dist/schemas/knowledge-store/index.d.ts"
    },
    "./schemas/learning-loop": {
      "import": "./dist/schemas/learning-loop/index.js",
      "types": "./dist/schemas/learning-store/index.d.ts"
    },
    "./schemas/decision-model": {
      "import": "./dist/schemas/decision-model/index.js",
      "types": "./dist/schemas/decision-model/index.d.ts"
    },
    "./schemas/attribution-metrics": {
      "import": "./dist/schemas/attribution-metrics/index.js",
      "types": "./dist/schemas/attribution-metrics/index.d.ts"
    },
    "./schemas/data-export": {
      "import": "./dist/schemas/data-export/index.js",
      "types": "./dist/schemas/data-export/index.d.ts"
    }
  }
}
```

#### Step 6.9: Handle shared dependencies across domain schemas

Contracts uses `common/` types (IDs, timestamps, errors) shared across domain schemas. These need to be consolidated:

- Create `src/schemas/common/` with shared types:
  - `ids.ts` — `createPrefixedIdSchema()` factory, ULID regex, branded ID pattern
  - `timestamps.ts` — ISO 8601 timestamp schema
  - `enums.ts` — Shared enums used across domains
- Each domain schema imports from `../common/` instead of contracts' `../../common/`

**Files created**: ~80+ schema files, ~40+ test files, common utilities
**Files modified**: `package.json` (exports)

---

### Phase 7: Generation Scripts
**Goal**: Migrate schema generation scripts and wire them into the build pipeline.

#### Step 7.1: Migrate generation scripts to `src/scripts/`

Copy and adapt from `/workspaces/contracts/scripts/`:
- `generate-tool-result-schema.ts` → `src/scripts/generate-tool-result-schema.ts`
  - Update import path to `../schemas/tool-result.js`
  - Update output path to `../schemas/generated/tool-result.schema.json`
- `generate-tool-naming-schemas.ts` → `src/scripts/generate-tool-naming-schemas.ts`
  - Update import paths to `../tools/naming/`
  - Update output path to `../schemas/generated/tool-naming/`
- `generate-json-schemas.ts` → `src/scripts/generate-json-schemas.ts`
  - Update import paths to `../telemetry/schemas.js`
  - Update output path to `../schemas/generated/telemetry/`

#### Step 7.2: Verify generation works

Run each script and verify JSON schema output is correct:
```bash
pnpm generate:schemas
```

#### Step 7.3: Add JSON schema export to package.json (optional)

If needed for downstream consumers:
```json
{
  "exports": {
    "./schemas/tool-result.json": "./src/schemas/generated/tool-result.schema.json"
  },
  "files": ["dist", "src/schemas/generated"]
}
```

**Files created**: `src/scripts/*.ts` (3 files)
**Files modified**: `package.json`

---

### Phase 8: Root Export Updates and Final Wiring
**Goal**: Wire everything into `src/index.ts`, ensure backward compatibility.

#### Step 8.1: Update `src/index.ts`

Add P1 schema exports to the root barrel:
```typescript
// Tool naming (via tools/index.ts which re-exports from naming/)
// Already covered by existing tools export if tools/index.ts is updated

// Schemas — Tool result
export {
  TerseToolResultSchema,
  type TerseToolOptions,
  parseTerseToolResult,
  safeParseTerseToolResult,
} from './schemas/index.js';

// Schemas — Platform API (P1, root export)
export * from './schemas/platform-api/index.js';

// Note: P2 domain schemas are only available via subpath exports
// e.g., import { ... } from '@generacy-ai/agency/schemas/knowledge-store'
```

Verify no name collisions with existing exports. The `TerseToolResult` type is already exported via `output/index.js` (which now re-exports from schemas).

#### Step 8.2: Verify backward compatibility

Ensure all existing import paths still work:
- `import { validateToolName, STANDARD_PREFIXES } from '@generacy-ai/agency'` — still works
- `import { TerseToolResult, Verbosity } from '@generacy-ai/agency'` — still works
- `import { ToolCallEventV1 } from '@generacy-ai/agency'` — still works (schema shape compatible, ID format changed per Q1)

**Files modified**: `src/index.ts`

---

### Phase 9: Verification
**Goal**: Ensure everything builds, tests pass, and types check.

#### Step 9.1: Type checking
```bash
cd packages/agency && pnpm typecheck
```
Fix any type errors from the migration.

#### Step 9.2: Run all tests
```bash
cd packages/agency && pnpm test
```
All existing tests must pass. New migrated tests must pass.

#### Step 9.3: Build verification
```bash
cd packages/agency && pnpm build
```
Verify `dist/` output includes all new schema files.

#### Step 9.4: Schema generation verification
```bash
cd packages/agency && pnpm generate:schemas
```
Verify JSON schema files are generated correctly in `src/schemas/generated/`.

#### Step 9.5: Export verification
Write a quick smoke test or manual check that:
- Root exports resolve correctly
- Subpath exports resolve correctly
- No circular dependencies

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ULID vs UUID for event IDs | ULID (Q1-B) | No active consumers; ULID is sortable, embeds timestamp |
| validateToolName signature | Keep agency's (Q2-A) | 100+ existing tests; Zod internals improve without breaking API |
| TerseToolResult source of truth | Zod schema (Q3-A) | Schema in schemas/, re-export from output/types.ts |
| Prefix count | Union = 10 (Q4-A) | Keep `docs` from agency, add `deploy/file/database` from contracts |
| Telemetry field names | Agency's names (Q5-A) | Active producers use `toolName`/`serverName` |
| `inputs` field | Optional (Q6-A) | Agency producers may omit; no consumer demands required |
| Generated schemas | Not committed (Q7-A) | `.gitignore`, generate in `prebuild`/`prepublishOnly` |
| ToolStats divergence | Separate schemas (Q8-B) | Runtime vs API are different use cases |
| Export naming | Agency conventions (Q9-B) | Living codebase takes precedence |
| Overlapping tests | Merge (Q10-A) | Best of both test suites |
| P2 schema exports | Subpath exports (Q11-C) | Avoid bloating root API surface |
| Vitest version | Keep 3.x (Q12-B) | Monorepo-wide consistency; adapt migrated tests |

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Circular dependencies between schemas/ and tools/ | Medium | High | Strict dependency direction: `tools/naming/` has no deps on `tools/validation.ts`; `validation.ts` imports from `naming/` |
| Type incompatibility from Zod `.passthrough()` | Low | Medium | Use explicit type annotations where needed; `.passthrough()` produces structurally compatible types |
| Name collisions in root export | Medium | Medium | Audit all exported names before adding; use explicit named exports, not `export *` from schemas |
| Contracts shared `common/` types missing | High | Medium | Identify all cross-references in Phase 6; create `schemas/common/` with shared utilities |
| vitest 3.x incompatibility with migrated tests | Low | Low | Most test APIs are stable across 3.x-4.x; adapt matcher syntax if needed |
| Build time increase from 180+ new files | Low | Low | TypeScript incremental compilation handles this well |
| ULID change breaks existing telemetry data | Low | Low | No external consumers (Q1 answer); update agency's own test fixtures |

## Estimated File Counts

| Category | New Files | Modified Files |
|----------|-----------|----------------|
| Tool naming schemas | ~7 | 0 |
| Tool result schema | ~2 | 1 (output/types.ts) |
| Platform-api schemas | ~14 | 0 |
| Domain schemas (7 modules) | ~60 | 0 |
| Common/shared types | ~3 | 0 |
| Generation scripts | ~3 | 0 |
| Tests (migrated + merged) | ~40 | 3 |
| Barrel/index files | ~12 | 3 (tools/index, schemas/index, src/index) |
| Config files | 0 | 2 (package.json, .gitignore) |
| **Total** | **~141** | **~9** |

## Dependency Graph

```
src/index.ts
  ├── tools/index.ts
  │   ├── tools/naming/index.ts        ← NEW (from contracts)
  │   │   ├── prefix.ts               ← 10 unified prefixes
  │   │   ├── action.ts
  │   │   ├── tool-name.ts
  │   │   ├── validation-error.ts
  │   │   ├── tool-definition.ts
  │   │   └── tool-catalog.ts
  │   ├── tools/prefixes.ts            ← MODIFIED (re-exports from naming/)
  │   ├── tools/validation.ts          ← MODIFIED (uses Zod internally)
  │   ├── tools/types.ts
  │   └── tools/registry.ts
  ├── schemas/index.ts                 ← NEW barrel
  │   ├── schemas/tool-result.ts       ← NEW (from contracts)
  │   └── schemas/platform-api/        ← NEW (from contracts, root export)
  ├── telemetry/index.ts
  │   └── telemetry/schemas.ts         ← MODIFIED (ULID, extra fields)
  └── output/index.ts
      └── output/types.ts              ← MODIFIED (re-export TerseToolResult)

Subpath exports (not in root):
  schemas/extension-comms/             ← NEW
  schemas/github-app/                  ← NEW
  schemas/knowledge-store/             ← NEW
  schemas/learning-loop/               ← NEW
  schemas/decision-model/              ← NEW
  schemas/attribution-metrics/         ← NEW
  schemas/data-export/                 ← NEW
```

## Out of Scope

- Upgrading vitest to 4.x (Q12)
- Live dependency swap for consumers (no active consumers exist)
- Migrating non-schema contracts code (orchestration, version-compatibility, agency-humancy, agency-generacy)
- Deprecating/archiving the contracts repo itself
- Shared/cross-component types migration (separate issue for Latency)
