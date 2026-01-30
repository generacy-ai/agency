# Tasks: F4: Plugin manifest, config schema, plugin.ts skeleton

**Input**: Design documents from `/specs/143-f4-plugin-manifest-config/`
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which acceptance criterion this task belongs to

## Phase 1: Core Files

- [ ] T001 [P] [AC1] Create `packages/agency-plugin-spec-kit/src/manifest.ts` with PluginManifest definition
- [ ] T002 [P] [AC2] Create `packages/agency-plugin-spec-kit/src/config.ts` with Zod schema
- [ ] T003 [P] [AC3] Create `packages/agency-plugin-spec-kit/src/plugin.ts` with SpecKitPlugin class
- [ ] T004 [P] [AC4] Create `packages/agency-plugin-spec-kit/src/index.ts` with exports

## Phase 2: Validation

- [ ] T005 [AC5] Build the package and verify TypeScript compilation succeeds
- [ ] T006 [AC5] Verify plugin initializes without errors (manual smoke test)

## Dependencies & Execution Order

**Phase 1** tasks (T001-T004) can all run in parallel as they create independent files. However, `index.ts` (T004) imports from the other files, so while it can be created in parallel, it must reference the correct exports.

**Recommended order for single-session implementation**:
1. T001 (manifest.ts) - No dependencies
2. T002 (config.ts) - No dependencies
3. T003 (plugin.ts) - Imports manifest and config
4. T004 (index.ts) - Re-exports from all modules
5. T005 (build) - Requires all source files
6. T006 (verify) - Requires successful build

**Parallel opportunities**:
- T001, T002 can be created simultaneously (no shared imports)
- T003, T004 must follow T001, T002 (import dependencies)
