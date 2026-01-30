# Tasks: Scaffold agency-plugin-spec-kit Package Structure

**Input**: Design documents from `/specs/140-f1-scaffold-agency-plugin/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)

## Phase 1: Package Configuration

- [ ] T001 Create `packages/agency-plugin-spec-kit/` directory
- [ ] T002 Create `packages/agency-plugin-spec-kit/package.json` with agency metadata:
  - name: `@generacy-ai/agency-plugin-spec-kit`
  - version: `0.0.0`
  - type: `module`
  - main: `./dist/index.js`
  - types: `./dist/index.d.ts`
  - exports configuration for `.` and `./package.json`
  - peer dependency on `@generacy-ai/agency` (workspace:*)
  - dev dependencies: typescript, @types/node, vitest
  - scripts: build, test, clean, typecheck
- [ ] T003 Create `packages/agency-plugin-spec-kit/tsconfig.json` extending `../../tsconfig.base.json`:
  - compilerOptions.outDir: `./dist`
  - compilerOptions.rootDir: `./src`
  - include: `["src/**/*"]`
  - exclude: `["node_modules", "dist", "tests"]`
- [ ] T004 [P] Create `packages/agency-plugin-spec-kit/vitest.config.ts` with test configuration

## Phase 2: Source Structure

- [ ] T005 Create `packages/agency-plugin-spec-kit/src/types/index.ts`:
  - Export BaseToolParams interface
  - Export SpecKitPluginConfig interface
  - Re-export Agency types (AgencyPlugin, AgencyCoreAPI, AgencyTool)
- [ ] T006 Create `packages/agency-plugin-spec-kit/src/config.ts`:
  - Define DEFAULT_CONFIG constant
  - Export resolveConfig function
- [ ] T007 Create `packages/agency-plugin-spec-kit/src/manifest.ts`:
  - Define PLUGIN_MANIFEST constant with PluginManifest type
  - Include id, name, version, description, modes, tools (empty array for now)
- [ ] T008 [P] Create `packages/agency-plugin-spec-kit/src/utils/index.ts`:
  - Export placeholder for utility functions
- [ ] T009 [P] Create `packages/agency-plugin-spec-kit/src/providers/index.ts`:
  - Export placeholder for provider interfaces
- [ ] T010 [P] Create `packages/agency-plugin-spec-kit/src/tools/index.ts`:
  - Export createTools function (returns empty array for skeleton)
- [ ] T011 Create `packages/agency-plugin-spec-kit/src/plugin.ts`:
  - Import manifest, config, and tools
  - Implement SpecKitPlugin class with AgencyPlugin interface
  - Implement initialize(), shutdown(), onModeChange() methods
  - Export default and named exports
- [ ] T012 Create `packages/agency-plugin-spec-kit/src/index.ts`:
  - Re-export SpecKitPlugin as default
  - Re-export types from types/index.ts
  - Re-export manifest from manifest.ts
  - Re-export createSpecKitPlugin factory function

## Phase 3: Testing & Validation

- [ ] T013 Create `packages/agency-plugin-spec-kit/tests/plugin.test.ts`:
  - Test plugin instantiation
  - Test manifest properties
  - Test config resolution with defaults
  - Test config resolution with overrides
- [ ] T014 Run `pnpm install` to verify workspace integration
- [ ] T015 Run `pnpm build` in package directory to verify TypeScript compilation
- [ ] T016 Run `pnpm test` in package directory to verify tests pass

## Dependencies & Execution Order

**Sequential dependencies**:
- T001 must complete before T002-T004 (directory must exist)
- T002-T004 must complete before Phase 2 (package.json/tsconfig needed for imports)
- T005-T006 should complete before T011 (types and config used by plugin)
- T007 should complete before T011 (manifest used by plugin)
- T010 should complete before T011 (tools used by plugin)
- T011 should complete before T012 (plugin exported from index)
- Phase 2 must complete before Phase 3 (source files needed for tests)

**Parallel opportunities**:
- T004 can run in parallel with T002-T003
- T008, T009, T010 can run in parallel (independent placeholder files)
- T014, T015, T16 must run sequentially (each validates previous step)
