# Tasks: Provider Registry and Factory

**Input**: Design documents from `/specs/145-a1-provider-registry-factory/`
**Prerequisites**: plan.md (required), spec.md (required), research.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Error Class

- [x] T001 [US1] Add `ProviderNotFoundError` class to `packages/agency-plugin-spec-kit/src/providers/errors.ts` extending `ProviderError`

## Phase 2: Registry Implementation

- [x] T002 [US1] Add provider cache Map to `packages/agency-plugin-spec-kit/src/providers/index.ts`
- [x] T003 [US1] Implement `createProvider(config: BacklogConfig): BacklogProvider` factory function in `packages/agency-plugin-spec-kit/src/providers/index.ts`
- [x] T004 [US1] Implement `getProvider(name: string): BacklogProvider` lookup function in `packages/agency-plugin-spec-kit/src/providers/index.ts`
- [x] T005 [US1] Implement `getConfiguredProvider(config: BacklogConfig): BacklogProvider` with lazy caching in `packages/agency-plugin-spec-kit/src/providers/index.ts`

## Phase 3: Exports

- [x] T006 [US1] Update `packages/agency-plugin-spec-kit/src/index.ts` to re-export registry functions

## Phase 4: Testing

- [x] T007 [P] [US1] Create unit tests for `createProvider` factory in `packages/agency-plugin-spec-kit/tests/providers/registry.test.ts`
- [x] T008 [P] [US1] Create unit tests for `getProvider` lookup in `packages/agency-plugin-spec-kit/tests/providers/registry.test.ts`
- [x] T009 [P] [US1] Create unit tests for `getConfiguredProvider` caching behavior in `packages/agency-plugin-spec-kit/tests/providers/registry.test.ts`
- [x] T010 [P] [US1] Create unit tests for `ProviderNotFoundError` in `packages/agency-plugin-spec-kit/tests/providers/errors.test.ts`

## Dependencies & Execution Order

1. **T001** (error class) must complete first - registry functions depend on `ProviderNotFoundError`
2. **T002-T005** are sequential within the same file but depend on T001
3. **T006** depends on T002-T005 (must have functions to export)
4. **T007-T010** can run in parallel after T001-T006 complete (different test scenarios)

**Parallel opportunities**:
- Phase 4 tests (T007-T010) can all be written in parallel
