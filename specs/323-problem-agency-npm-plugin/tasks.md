# Tasks: Discovery-Based build.validate Tool

**Input**: Design documents from `/specs/323-problem-agency-npm-plugin/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, clarifications.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Schema & Config

- [ ] T001 Add `ValidateSchema` to `packages/agency-plugin-npm/src/tools/schemas.ts` — extend `BaseParamsSchema` with optional `scripts: z.array(z.string())`
- [ ] T002 [P] Add `ZodArray` support to `getJsonSchemaType()` in `packages/agency-plugin-npm/src/tools/schemas.ts` — handle `z.ZodArray` returning `{ type: 'array', items: ... }`
- [ ] T003 [P] Add `validate?: string` to `ScriptConfig` interface in `packages/agency-plugin-npm/src/config.ts` — add default `validate: 'validate'` to `DEFAULT_CONFIG.scripts`

## Phase 2: Core Implementation

- [ ] T004 Create `packages/agency-plugin-npm/src/tools/build/validate.ts` — implement `createValidateTool(config)` following existing factory pattern:
  - Parse params with `ValidateSchema.safeParse()`
  - Implement discovery algorithm: explicit `scripts` param → `validate` short-circuit → auto-discover candidates (lint, format:check/format+--check, typecheck)
  - Detect package manager via existing `detectPackageManager()`
  - Run discovered scripts sequentially with `exec()`, collecting `ValidationResult[]`
  - Silently skip scripts not found in package.json
  - Aggregate results into terse output (pass/fail per script, failure details)
  - Return success if all pass or no scripts found; error if any fail
  - Set `modes: ['default', 'coding', 'review']`

## Phase 3: Registration & Mode Fix

- [ ] T005 Add `'review'` to `modes` array in `packages/agency-plugin-npm/src/tools/build/format.ts` — change `['default', 'coding']` to `['default', 'coding', 'review']`
- [ ] T006 [P] Register `build.validate` in `packages/agency-plugin-npm/src/manifest.ts` — add to `tools[]` array, add to `modeAffiliations.coding[]`, add `build.validate` and `build.format` to `modeAffiliations.review[]`
- [ ] T007 [P] Register `createValidateTool` in `packages/agency-plugin-npm/src/tools/index.ts` — import from `./build/validate.js` and add to returned array in `createTools()`

## Phase 4: Test Fixtures & Tests

- [ ] T008 Create test fixture `packages/agency-plugin-npm/tests/fixtures/validate-project/package.json` — include `lint`, `format`, `format:check`, and `typecheck` scripts with `pnpm-lock.yaml`
- [ ] T009 [P] Create test fixture `packages/agency-plugin-npm/tests/fixtures/validate-shortcircuit/package.json` — include a `validate` script with `pnpm-lock.yaml`
- [ ] T010 Add `build.validate` tests to `packages/agency-plugin-npm/tests/tools/build.test.ts`:
  - Metadata test: verify name, namespace, modes (`['default', 'coding', 'review']`), outputPattern
  - Tool count: update assertion from 8 → 9 (5 build tools, 4 test tools)
  - Discovery: test auto-discovery with validate-project fixture (lint, format:check, typecheck found)
  - Short-circuit: test that `validate` script in package.json is used as sole entry point
  - Override: test explicit `scripts` param bypasses discovery and short-circuit
  - Empty discovery: test returns success when no validation scripts exist
  - Format fallback: test that `format` gets `--check` appended when `format:check` is absent
- [ ] T011 [P] Add `build.format` review mode test to `packages/agency-plugin-npm/tests/tools/build.test.ts` — verify `format.modes` includes `'review'`

## Phase 5: Build & Verify

- [ ] T012 Run `pnpm build` from repo root — verify TypeScript compilation succeeds with no errors
- [ ] T013 Run `pnpm test` for `agency-plugin-npm` — verify all tests pass including new validate tests

## Dependencies & Execution Order

```
Phase 1 (parallel):
  T001, T002 → same file but independent sections (can be done together)
  T003 → independent file

Phase 2 (depends on Phase 1):
  T004 → depends on T001 (ValidateSchema), T002 (ZodArray), T003 (config)

Phase 3 (depends on Phase 2):
  T005 → independent (format.ts change)
  T006 → depends on T004 (tool must exist to register)
  T007 → depends on T004 (tool must exist to import)
  T005, T006, T007 are parallel with each other

Phase 4 (depends on Phases 2-3):
  T008, T009 → parallel fixture creation
  T010 → depends on T004, T007, T008, T009
  T011 → depends on T005, parallel with T010

Phase 5 (depends on all above):
  T012 → T013 (build before test)
```

**Parallel opportunities**: T001+T002+T003 | T005+T006+T007 | T008+T009 | T010+T011
