# Tasks: Migrate Tool Schemas from Contracts Repo

**Input**: Design documents from feature directory
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Ready

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Foundation — Dependencies and Infrastructure

### T001 [DONE] Add new dependencies to agency package
**File**: `packages/agency/package.json`
- Add `ulid` ^3.0.2 to `dependencies`
- Add `zod-to-json-schema` ^3.23.5 to `devDependencies`
- Add `tsx` to `devDependencies` (if not already present — needed for running generation scripts)
- Run `pnpm install` and verify lockfile updates

### T002 [DONE] Add generation scripts to package.json
**File**: `packages/agency/package.json`
- Add `"generate:schemas"` script: `tsx src/scripts/generate-tool-result-schema.ts && tsx src/scripts/generate-tool-naming-schemas.ts`
- Add `"prebuild"` script: `pnpm generate:schemas`
- Verify `tsx` or equivalent runner is available for ESM TypeScript execution

### T003 [DONE] Configure .gitignore for generated schemas
**File**: `packages/agency/.gitignore`
- Create `packages/agency/.gitignore` (or append to existing)
- Add `src/schemas/generated/` to ignore generated JSON schema output
- Verify `.gitignore` works correctly with `git status`

### T004 [DONE] Create directory structure with barrel files
**Files**:
- `packages/agency/src/tools/naming/index.ts`
- `packages/agency/src/schemas/index.ts`
- `packages/agency/src/schemas/common/index.ts`
- `packages/agency/src/schemas/extension-comms/index.ts`
- `packages/agency/src/schemas/github-app/index.ts`
- `packages/agency/src/schemas/platform-api/index.ts`
- `packages/agency/src/schemas/knowledge-store/index.ts`
- `packages/agency/src/schemas/learning-loop/index.ts`
- `packages/agency/src/schemas/decision-model/index.ts`
- `packages/agency/src/schemas/attribution-metrics/index.ts`
- `packages/agency/src/schemas/data-export/index.ts`
- `packages/agency/src/schemas/generated/` (empty dir)
- `packages/agency/src/scripts/` (empty dir)
- Create empty barrel `index.ts` files in each directory (will be populated in later phases)
- Remove existing `src/schemas/README.md` and `src/tools/naming/README.md` placeholder files once real code replaces them

---

## Phase 2: Shared Common Types

### T005 [DONE] Create shared common types module
**Files**:
- `packages/agency/src/schemas/common/ids.ts`
- `packages/agency/src/schemas/common/timestamps.ts`
- `packages/agency/src/schemas/common/index.ts`
- Migrate `createPrefixedIdSchema()` factory from contracts' `knowledge-store/shared-types.ts` — this is used by 5+ domain schema modules
- Migrate `UserIdSchema`, `TimestampSchema`, `OptionalTimestampSchema` from contracts' `knowledge-store/shared-types.ts`
- Migrate `ISOTimestampSchema` from contracts' `common/timestamps.ts` (used by platform-api, extension-comms)
- Migrate ID schemas from contracts' `common/ids.ts` (`SessionIdSchema`, `OrganizationIdSchema`, etc.) used by platform-api
- Create `ULID_REGEX` constant using `ulid` package for ID validation
- Create barrel `index.ts` re-exporting all common types
- These are foundational types — must be completed before any domain schema phase

### T006 [DONE] Write tests for shared common types
**File**: `packages/agency/src/schemas/common/__tests__/ids.test.ts`
- Test `createPrefixedIdSchema()` with various prefixes
- Test ULID validation regex
- Test `UserIdSchema`, `TimestampSchema` parsing
- Test `ISOTimestampSchema` valid/invalid formats
- Use vitest 3.x with explicit `import { describe, it, expect } from 'vitest'`

---

## Phase 3: Tool Naming Schemas (P1 — Core)

### T007 [DONE] Migrate tool-naming prefix schema
**File**: `packages/agency/src/tools/naming/prefix.ts`
- Copy from `/workspaces/contracts/src/schemas/tool-naming/prefix.ts`
- Set `ToolPrefixValues` to the union of both repos' prefixes (10 total): `['source_control', 'build', 'run', 'test', 'debug', 'deploy', 'humancy', 'file', 'database', 'docs']`
- Create `ToolPrefixSchema` Zod enum from `ToolPrefixValues`
- Export `ToolPrefix` inferred type
- Fix all imports to use `.js` extensions for ESM

### T008 [DONE] [P] Migrate tool-naming action schema
**File**: `packages/agency/src/tools/naming/action.ts`
- Copy from `/workspaces/contracts/src/schemas/tool-naming/action.ts`
- Migrate `ActionNameSchema` (snake_case validation via Zod)
- Fix imports for ESM (`.js` extensions)

### T009 [DONE] [P] Migrate tool-naming validation-error schema
**File**: `packages/agency/src/tools/naming/validation-error.ts`
- Copy from `/workspaces/contracts/src/schemas/tool-naming/validation-error.ts`
- Migrate `ToolValidationErrorSchema` and structured error types
- Fix imports for ESM

### T010 [DONE] Migrate tool-naming tool-name schema
**File**: `packages/agency/src/tools/naming/tool-name.ts`
- Copy from `/workspaces/contracts/src/schemas/tool-naming/tool-name.ts`
- Migrate `ToolNameSchema`, `parseToolName()`, `createToolName()` functions
- Import from local `prefix.ts` and `action.ts` (not contracts)
- Fix imports for ESM

### T011 [DONE] [P] Migrate tool-naming tool-definition schema
**File**: `packages/agency/src/tools/naming/tool-definition.ts`
- Copy from `/workspaces/contracts/src/schemas/tool-naming/tool-definition.ts`
- Migrate `ToolDefinitionSchema` and associated types
- Fix imports for ESM

### T012 [DONE] [P] Migrate tool-naming tool-catalog schema
**File**: `packages/agency/src/tools/naming/tool-catalog.ts`
- Copy from `/workspaces/contracts/src/schemas/tool-naming/tool-catalog.ts`
- Migrate `ToolCatalogSchema` and associated types
- Fix imports for ESM

### T013 [DONE] Create tool-naming barrel export
**File**: `packages/agency/src/tools/naming/index.ts`
- Re-export all schemas, types, and functions from the naming module
- Export: `ToolPrefixValues`, `ToolPrefixSchema`, `ToolPrefix`, `ActionNameSchema`, `ToolNameSchema`, `ToolValidationErrorSchema`, `ToolDefinitionSchema`, `ToolCatalogSchema`, `parseToolName`, `createToolName`
- Verify no name collisions with existing tools exports

### T014 [DONE] Reconcile prefixes — update `prefixes.ts`
**File**: `packages/agency/src/tools/prefixes.ts`
- Import `ToolPrefixValues` from `./naming/prefix.js`
- Re-export as `STANDARD_PREFIXES` for backward compatibility: `export { ToolPrefixValues as STANDARD_PREFIXES }`
- Keep `StandardPrefix` type derived from the imported values
- Keep `LENGTH_THRESHOLDS` as-is (contracts has no equivalent)
- Ensure all existing consumers of `STANDARD_PREFIXES` still compile

### T015 [DONE] Reconcile validateToolName — use Zod internally
**File**: `packages/agency/src/tools/validation.ts`
- Replace regex-based implementation with contracts' Zod schema validation internally
- Import `ToolNameSchema`, `ToolPrefixSchema` from `./naming/index.js`
- **Keep the existing function signature**: `validateToolName(name, options?) → ValidationResult`
- Map Zod validation errors to the existing `{ valid, errors, warnings }` format
- Keep `strict` option behavior (custom prefix = error in strict, warning in permissive)
- Keep length threshold warnings from `LENGTH_THRESHOLDS`
- The existing `ValidationResult` and `ValidationOptions` types stay in `types.ts` unchanged

### T016 [DONE] Update tools barrel export
**File**: `packages/agency/src/tools/index.ts`
- Add `export * from './naming/index.js'`
- Verify no name collisions — existing `validateToolName` from `validation.ts` keeps its name
- Contracts' structured validator can be exported as `validateToolNameStructured` from the naming module if needed, or the raw Zod schemas are directly accessible

### T017 [DONE] Merge validation tests
**File**: `packages/agency/src/tools/validation.test.ts`
- Keep all existing ~40 assertions (they test the public API which is unchanged)
- Add tests from contracts for newly migrated functionality:
  - `parseToolName()` / `createToolName()` tests
  - `ToolNameSchema` Zod parsing tests
  - `ToolPrefixSchema` validation tests
  - Tests for the 3 new prefixes (`deploy`, `file`, `database`)
  - Structured error code tests from contracts
- Use vitest 3.x conventions (`import { describe, it, expect } from 'vitest'`, `globals: false`)

### T018 [DONE] Write tool-naming unit tests
**File**: `packages/agency/src/tools/naming/__tests__/naming.test.ts`
- Migrate contracts' tool-naming test files, adapt to vitest 3.x
- Test `ToolPrefixSchema` with all 10 prefixes
- Test `ActionNameSchema` valid/invalid patterns
- Test `ToolNameSchema` parsing and validation
- Test `ToolDefinitionSchema` and `ToolCatalogSchema`
- Test `parseToolName()` round-trip with `createToolName()`

---

## Phase 4: Tool Result Schema (P1 — Core)

### T019 [DONE] Migrate TerseToolResultSchema
**File**: `packages/agency/src/schemas/tool-result.ts`
- Copy from `/workspaces/contracts/src/schemas/tool-result.ts`
- Migrate `TerseToolResultSchema` (Zod object with `.passthrough()`)
- Migrate `TerseToolResult` type (inferred from schema)
- Migrate `TerseToolOptions` interface (if present)
- Migrate `parseTerseToolResult()` / `safeParseTerseToolResult()` functions
- Fix imports for ESM

### T020 [DONE] Update output/types.ts to re-export from schema
**File**: `packages/agency/src/output/types.ts`
- Remove the plain `TerseToolResult` interface definition (lines 25-31)
- Import and re-export `TerseToolResult` from `../schemas/tool-result.js`
- Keep `Verbosity`, `ExecResult`, `TerseOutputConfig`, `DEFAULT_TERSE_CONFIG` unchanged
- Verify `TerseOutput` class (in `terse-output.ts`) still compiles — it uses `TerseToolResult` as a return type

### T021 [DONE] Update schemas barrel export
**File**: `packages/agency/src/schemas/index.ts`
- Export `TerseToolResultSchema`, `TerseToolResult` type, `TerseToolOptions` type, `parseTerseToolResult`, `safeParseTerseToolResult` from `./tool-result.js`

### T022 [DONE] Write tool-result tests
**File**: `packages/agency/src/schemas/__tests__/tool-result.test.ts`
- Migrate contracts' `tool-result.test.ts`, adapt to vitest 3.x
- Test `TerseToolResultSchema.parse()` with valid/invalid data
- Test `parseTerseToolResult()` and `safeParseTerseToolResult()`
- Test `.passthrough()` behavior (extra properties preserved)
- Test structural compatibility with the old `TerseToolResult` interface shape

---

## Phase 5: Telemetry Schema Reconciliation (P1 — Core)

### T023 [DONE] Switch ToolCallEventV1 to ULID
**File**: `packages/agency/src/telemetry/schemas.ts`
- Replace `id: z.string().uuid()` with ULID validation: `z.string().regex(ULID_REGEX)`
- Import `ulid` from the `ulid` package
- Define `ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/`
- Export `generateEventId()` function that returns `ulid()`

### T024 [DONE] Add contracts' extra fields to ToolCallEventV1
**File**: `packages/agency/src/telemetry/schemas.ts`
- Add optional fields from contracts:
  - `errorCategory: z.string().optional()`
  - `errorType: z.string().optional()`
  - `workflowId: z.string().optional()`
  - `issueNumber: z.number().int().optional()`
  - `phase: z.string().optional()`
- Keep `inputs` as optional (unchanged)
- Keep all existing fields unchanged

### T025 [DONE] Create ToolStatsApiSchema
**File**: `packages/agency/src/telemetry/schemas.ts`
- Add `ToolStatsApiSchema` for API-facing stats (separate from runtime `ToolStatsSchema`)
- Fields: `version`, `server`, `tool`, `timeWindow`, `totalCalls`, `successRate`, `avgDurationMs`, optional percentiles, optional `errorBreakdown`
- Create `TimeWindowSchema` if needed (start/end timestamps)
- Export from telemetry barrel

### T026 [DONE] Update telemetry barrel exports
**File**: `packages/agency/src/telemetry/index.ts`
- Add exports for `generateEventId`, `ToolStatsApiSchema`, `ULID_REGEX`
- Add type export for `ToolStatsApi`

### T027 [DONE] Update telemetry tests
**File**: `packages/agency/src/__tests__/telemetry/schemas.test.ts`
- Update `validEvent.id` from UUID format to ULID format in all test data
- Update the "should reject invalid UUID" test to "should reject invalid ULID"
- Add tests for `generateEventId()` — returns valid ULID, is unique across calls
- Add tests for new optional fields (`errorCategory`, `errorType`, `workflowId`, `issueNumber`, `phase`)
- Add tests for `ToolStatsApiSchema`
- Merge any relevant assertions from contracts' telemetry tests

---

## Phase 6: Platform Schemas (P1 — Root Export)

### T028 [DONE] Migrate platform-api auth schemas
**Files**:
- `packages/agency/src/schemas/platform-api/auth/api-key.ts`
- `packages/agency/src/schemas/platform-api/auth/auth-token.ts`
- `packages/agency/src/schemas/platform-api/auth/session.ts`
- `packages/agency/src/schemas/platform-api/auth/index.ts`
- Copy from `/workspaces/contracts/src/schemas/platform-api/auth/`
- Fix imports to use `../../common/` for shared types (IDs, timestamps)
- Fix all `.js` extensions for ESM

### T029 [DONE] [P] Migrate platform-api organization schemas
**Files**:
- `packages/agency/src/schemas/platform-api/organization/organization.ts`
- `packages/agency/src/schemas/platform-api/organization/membership.ts`
- `packages/agency/src/schemas/platform-api/organization/invite.ts`
- `packages/agency/src/schemas/platform-api/organization/index.ts`
- Copy from `/workspaces/contracts/src/schemas/platform-api/organization/`
- Fix imports to use `../../common/` for shared types
- Fix all `.js` extensions for ESM

### T030 [P] Migrate platform-api subscription schemas
**Files**:
- `packages/agency/src/schemas/platform-api/subscription/generacy-tier.ts`
- `packages/agency/src/schemas/platform-api/subscription/humancy-tier.ts`
- `packages/agency/src/schemas/platform-api/subscription/feature-entitlement.ts`
- `packages/agency/src/schemas/platform-api/subscription/usage-limit.ts`
- `packages/agency/src/schemas/platform-api/subscription/index.ts`
- Copy from `/workspaces/contracts/src/schemas/platform-api/subscription/`
- Fix imports to use `../../common/` for shared types
- Fix all `.js` extensions for ESM

### T031 Create platform-api barrel export
**File**: `packages/agency/src/schemas/platform-api/index.ts`
- Re-export from `auth/`, `organization/`, `subscription/` subdirectories
- Match contracts' export structure

### T032 Write platform-api tests
**Files**:
- `packages/agency/src/schemas/platform-api/__tests__/auth.test.ts`
- `packages/agency/src/schemas/platform-api/__tests__/organization.test.ts`
- `packages/agency/src/schemas/platform-api/__tests__/subscription.test.ts`
- Migrate contracts' platform-api test files (~10 tests)
- Adapt to vitest 3.x with explicit imports
- Test all schema parsing, valid/invalid cases

---

## Phase 7: Domain Schemas (P2 — Subpath Exports)

All tasks T033–T046 can run in parallel since each domain is independent.

### T033 [P] Migrate knowledge-store schemas
**Files**:
- `packages/agency/src/schemas/knowledge-store/shared-types.ts`
- `packages/agency/src/schemas/knowledge-store/philosophy.ts`
- `packages/agency/src/schemas/knowledge-store/principle.ts`
- `packages/agency/src/schemas/knowledge-store/pattern.ts`
- `packages/agency/src/schemas/knowledge-store/context.ts`
- `packages/agency/src/schemas/knowledge-store/individual-knowledge.ts`
- `packages/agency/src/schemas/knowledge-store/index.ts`
- Copy from `/workspaces/contracts/src/schemas/knowledge-store/`
- Update `shared-types.ts` to import `createPrefixedIdSchema` from `../common/ids.js` instead of keeping it inline (it was already extracted to common in T005)
- Fix all imports for ESM

### T034 [P] Migrate knowledge-store tests
**File**: `packages/agency/src/schemas/knowledge-store/__tests__/`
- Migrate 5 test files from contracts
- Adapt to vitest 3.x conventions

### T035 [P] Migrate decision-model schemas
**Files**:
- `packages/agency/src/schemas/decision-model/shared-types.ts`
- `packages/agency/src/schemas/decision-model/decision-request.ts`
- `packages/agency/src/schemas/decision-model/baseline-recommendation.ts`
- `packages/agency/src/schemas/decision-model/protege-recommendation.ts`
- `packages/agency/src/schemas/decision-model/human-decision.ts`
- `packages/agency/src/schemas/decision-model/three-layer-decision.ts`
- `packages/agency/src/schemas/decision-model/index.ts`
- Copy from `/workspaces/contracts/src/schemas/decision-model/`
- Fix cross-domain imports: `knowledge-store/shared-types.ts` → `../knowledge-store/shared-types.js` or `../common/`
- Fix all imports for ESM

### T036 [P] Migrate decision-model tests
**File**: `packages/agency/src/schemas/decision-model/__tests__/`
- Migrate 6 test files from contracts
- Adapt to vitest 3.x conventions

### T037 [P] Migrate learning-loop schemas
**Files**:
- `packages/agency/src/schemas/learning-loop/shared-types.ts`
- `packages/agency/src/schemas/learning-loop/coaching-data.ts`
- `packages/agency/src/schemas/learning-loop/knowledge-update.ts`
- `packages/agency/src/schemas/learning-loop/pattern-candidate.ts`
- `packages/agency/src/schemas/learning-loop/learning-event.ts`
- `packages/agency/src/schemas/learning-loop/learning-session.ts`
- `packages/agency/src/schemas/learning-loop/index.ts`
- Copy from `/workspaces/contracts/src/schemas/learning-loop/`
- Fix cross-domain imports: use `../common/` for shared ID/timestamp utilities
- Fix all imports for ESM

### T038 [P] Migrate learning-loop tests
**File**: `packages/agency/src/schemas/learning-loop/__tests__/`
- Migrate 6 test files from contracts
- Adapt to vitest 3.x conventions

### T039 [P] Migrate attribution-metrics schemas
**Files**:
- `packages/agency/src/schemas/attribution-metrics/shared-types.ts`
- `packages/agency/src/schemas/attribution-metrics/metrics-period.ts`
- `packages/agency/src/schemas/attribution-metrics/decision-outcome.ts`
- `packages/agency/src/schemas/attribution-metrics/domain-metrics.ts`
- `packages/agency/src/schemas/attribution-metrics/volume-metrics.ts`
- `packages/agency/src/schemas/attribution-metrics/metrics-trend.ts`
- `packages/agency/src/schemas/attribution-metrics/individual-metrics.ts`
- `packages/agency/src/schemas/attribution-metrics/leaderboard-entry.ts`
- `packages/agency/src/schemas/attribution-metrics/metrics-report.ts`
- `packages/agency/src/schemas/attribution-metrics/index.ts`
- Copy from `/workspaces/contracts/src/schemas/attribution-metrics/`
- Fix cross-domain imports: uses both `knowledge-store/shared-types.ts` and `decision-model/shared-types.ts`
- Fix all imports for ESM

### T040 [P] Migrate attribution-metrics tests
**File**: `packages/agency/src/schemas/attribution-metrics/__tests__/`
- Migrate 8 test files from contracts
- Adapt to vitest 3.x conventions

### T041 [P] Migrate extension-comms schemas
**Files**:
- `packages/agency/src/schemas/extension-comms/coaching/feedback.ts`
- `packages/agency/src/schemas/extension-comms/coaching/index.ts`
- `packages/agency/src/schemas/extension-comms/decision-queue/filter.ts`
- `packages/agency/src/schemas/extension-comms/decision-queue/index.ts`
- `packages/agency/src/schemas/extension-comms/sse/event.ts`
- `packages/agency/src/schemas/extension-comms/sse/workflow-status.ts`
- `packages/agency/src/schemas/extension-comms/sse/index.ts`
- `packages/agency/src/schemas/extension-comms/workflow/definition.ts`
- `packages/agency/src/schemas/extension-comms/workflow/execution.ts`
- `packages/agency/src/schemas/extension-comms/workflow/debug-state.ts`
- `packages/agency/src/schemas/extension-comms/workflow/index.ts`
- `packages/agency/src/schemas/extension-comms/index.ts`
- Copy from `/workspaces/contracts/src/schemas/extension-comms/`
- Fix imports: use `../common/timestamps.js` for `ISOTimestampSchema`
- Fix all imports for ESM

### T042 [P] Migrate extension-comms tests
**File**: `packages/agency/src/schemas/extension-comms/__tests__/`
- Migrate 7 test files from contracts
- Adapt to vitest 3.x conventions

### T043 [P] Migrate github-app schemas
**Files**:
- `packages/agency/src/schemas/github-app/permission-scope.ts`
- `packages/agency/src/schemas/github-app/progressive-permission.ts`
- `packages/agency/src/schemas/github-app/webhook-event.ts`
- `packages/agency/src/schemas/github-app/index.ts`
- Copy from `/workspaces/contracts/src/schemas/github-app/`
- Self-contained — no cross-domain dependencies
- Fix all imports for ESM

### T044 [P] Migrate github-app tests
**File**: `packages/agency/src/schemas/github-app/__tests__/`
- Migrate 3 test files from contracts
- Adapt to vitest 3.x conventions

### T045 [P] Migrate data-export schemas
**Files**:
- `packages/agency/src/schemas/data-export/shared-types.ts`
- `packages/agency/src/schemas/data-export/decision-history.ts`
- `packages/agency/src/schemas/data-export/knowledge-export.ts`
- `packages/agency/src/schemas/data-export/protege-export.ts`
- `packages/agency/src/schemas/data-export/workflow-cloud-state.ts`
- `packages/agency/src/schemas/data-export/queue-state.ts`
- `packages/agency/src/schemas/data-export/index.ts`
- Copy from `/workspaces/contracts/src/schemas/data-export/`
- Self-contained (uses simplified/flattened schemas for portability)
- Fix all imports for ESM

### T046 [P] Migrate data-export tests
**File**: `packages/agency/src/schemas/data-export/__tests__/`
- Migrate 5 test files from contracts
- Adapt to vitest 3.x conventions

---

## Phase 8: Subpath Exports Configuration

### T047 Add subpath exports to package.json
**File**: `packages/agency/package.json`
- Add `exports` entries for each P2 domain schema:
  - `./schemas/extension-comms` → `dist/schemas/extension-comms/index.js` + types
  - `./schemas/github-app` → `dist/schemas/github-app/index.js` + types
  - `./schemas/knowledge-store` → `dist/schemas/knowledge-store/index.js` + types
  - `./schemas/learning-loop` → `dist/schemas/learning-loop/index.js` + types
  - `./schemas/decision-model` → `dist/schemas/decision-model/index.js` + types
  - `./schemas/attribution-metrics` → `dist/schemas/attribution-metrics/index.js` + types
  - `./schemas/data-export` → `dist/schemas/data-export/index.js` + types
- Keep existing `.` and `./cli` exports unchanged
- Note: Fix typo from plan — learning-loop types should point to `learning-loop/index.d.ts` (not `learning-store`)

---

## Phase 9: Generation Scripts

### T048 Migrate generate-tool-result-schema script
**File**: `packages/agency/src/scripts/generate-tool-result-schema.ts`
- Copy from `/workspaces/contracts/scripts/generate-tool-result-schema.ts`
- Update import path to `../schemas/tool-result.js`
- Update output path to `../schemas/generated/tool-result.schema.json`
- Use `zod-to-json-schema` to convert `TerseToolResultSchema`
- Ensure script runs correctly with `tsx`

### T049 [P] Migrate generate-tool-naming-schemas script
**File**: `packages/agency/src/scripts/generate-tool-naming-schemas.ts`
- Copy from `/workspaces/contracts/scripts/generate-tool-naming-schemas.ts`
- Update import paths to `../tools/naming/`
- Update output path to `../schemas/generated/tool-naming/`
- Generate JSON schemas for: ToolPrefix, ActionName, ToolName, ToolValidationError, ToolDefinition

### T050 [P] Migrate generate-json-schemas script (telemetry)
**File**: `packages/agency/src/scripts/generate-json-schemas.ts`
- Copy from `/workspaces/contracts/scripts/generate-json-schemas.ts`
- Update import paths to `../telemetry/schemas.js`
- Update output path to `../schemas/generated/telemetry/`
- Generate JSON schemas for: ToolCallEvent, ToolStats, ToolStatsApi

### T051 Verify schema generation
**Command**: `pnpm generate:schemas`
- Run all generation scripts
- Verify JSON schema output files exist in `src/schemas/generated/`
- Verify generated schemas are valid JSON Schema format
- Verify `.gitignore` correctly excludes the generated files

---

## Phase 10: Root Export Updates and Final Wiring

### T052 Update schemas barrel with all exports
**File**: `packages/agency/src/schemas/index.ts`
- Export tool-result schemas: `TerseToolResultSchema`, types, parse functions
- Export platform-api schemas (P1 — root export): `export * from './platform-api/index.js'`
- Export common types that may be useful to consumers
- Do NOT export P2 domain schemas from root (they use subpath exports only)

### T053 Update root index.ts with new exports
**File**: `packages/agency/src/index.ts`
- Add tool naming exports (via `tools/index.ts` which already re-exports from `naming/`)
- Add schema exports: `TerseToolResultSchema`, `TerseToolOptions`, `parseTerseToolResult`, `safeParseTerseToolResult` from `./schemas/index.js`
- Add platform-api schema exports from `./schemas/platform-api/index.js`
- Verify `TerseToolResult` type is not double-exported (it's already in `output/index.js` which now re-exports from schemas)
- Audit for name collisions with existing ~120 exports
- Verify the existing `export * from './telemetry/index.js'` picks up new telemetry exports (`generateEventId`, `ToolStatsApiSchema`)

### T054 Verify backward compatibility
**Manual verification**:
- `import { validateToolName, STANDARD_PREFIXES } from '@generacy-ai/agency'` — still works
- `import { TerseToolResult, Verbosity } from '@generacy-ai/agency'` — still works
- `import { ToolCallEventV1 } from '@generacy-ai/agency'` — still works (shape compatible, ID format changed to ULID)
- `import { ToolRegistry, toMcpTool } from '@generacy-ai/agency'` — still works
- All other existing exports remain accessible

---

## Phase 11: Verification

### T055 Run type checking
**Command**: `cd packages/agency && pnpm typecheck` (or `tsc --noEmit`)
- Fix any type errors from the migration
- Pay special attention to:
  - `TerseToolResult` type compatibility after switching to Zod-inferred
  - `ToolCallEventV1` shape after ULID change
  - Cross-domain schema imports resolving correctly
  - No circular dependencies between `schemas/` and `tools/`

### T056 Run all existing tests
**Command**: `cd packages/agency && pnpm test`
- All existing 32+ test files must pass
- Focus on regressions in:
  - `src/tools/validation.test.ts` (validateToolName signature unchanged)
  - `src/__tests__/telemetry/schemas.test.ts` (ULID format change)
  - `src/output/*.test.ts` (TerseToolResult re-export)

### T057 Run all migrated tests
**Command**: `cd packages/agency && pnpm test`
- All newly migrated test files must pass (~55 migrated test files)
- Domain schema tests across all 10 modules
- Tool naming tests
- Tool result tests

### T058 Build verification
**Command**: `cd packages/agency && pnpm build`
- Verify `dist/` output includes all new schema files
- Verify generated schemas are produced during prebuild
- Verify subpath exports resolve to correct dist paths
- Check that build output size is reasonable

### T059 Export verification
**Verification steps**:
- Verify root exports resolve correctly (spot-check key imports)
- Verify each subpath export resolves correctly:
  - `@generacy-ai/agency/schemas/extension-comms`
  - `@generacy-ai/agency/schemas/github-app`
  - `@generacy-ai/agency/schemas/knowledge-store`
  - `@generacy-ai/agency/schemas/learning-loop`
  - `@generacy-ai/agency/schemas/decision-model`
  - `@generacy-ai/agency/schemas/attribution-metrics`
  - `@generacy-ai/agency/schemas/data-export`
- Verify no circular dependencies (can use `madge` or manual inspection)
- Run `pnpm build` from monorepo root to verify turbo orchestration

---

## Dependencies & Execution Order

**Phase dependencies (sequential)**:
- Phase 1 (Foundation) must complete before all other phases
- Phase 2 (Common Types) must complete before Phase 6 (Platform) and Phase 7 (Domain Schemas)
- Phase 3 (Tool Naming) can start after Phase 1
- Phase 4 (Tool Result) can start after Phase 1
- Phase 5 (Telemetry) can start after Phase 1
- Phase 6 (Platform) requires Phase 2 (Common Types)
- Phase 7 (Domain Schemas) requires Phase 2 (Common Types) and Phase 6's `knowledge-store` for `decision-model`, `learning-loop`, and `attribution-metrics`
- Phase 8 (Subpath Exports) requires Phase 7
- Phase 9 (Generation Scripts) requires Phases 3, 4, 5
- Phase 10 (Root Exports) requires Phases 3, 4, 5, 6
- Phase 11 (Verification) requires all previous phases

**Parallel opportunities within phases**:
- T007-T012: Tool naming schema files (T008, T009, T011, T012 are parallel)
- T028-T030: Platform-api subdirectories (auth, organization, subscription are parallel)
- T033-T046: All domain schema modules are parallel (7 modules)
- T048-T050: Generation scripts are parallel
- T055-T059: Some verification steps are parallel (typecheck + test can run together)

**Critical path**:
T001 → T004 → T005 → T007 → T010 → T013 → T014 → T015 → T016 → T019 → T020 → T023 → T033 → T035 → T039 → T047 → T052 → T053 → T055 → T056 → T058

**Estimated scope**:
- ~141 new files
- ~9 modified files
- ~77 schema files + ~55 test files migrated
- 3 generation scripts
- ~12 barrel/index files
