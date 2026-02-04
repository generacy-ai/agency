# Tasks: Update Agency Core to Use Latency Facets

**Input**: Design documents from `/specs/211-update-agency-core-use/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story/acceptance criteria this task belongs to

## Phase 1: Setup & Infrastructure

- [X] T001 Add `@generacy-ai/latency` as workspace dependency to `packages/agency/package.json`
- [X] T002 [P] Create `packages/agency/src/facets/index.ts` - Export module for facet types
- [X] T003 [P] Create `packages/agency/src/facets/registry.ts` - FacetRegistry adapter wrapping Latency's registry
- [X] T004 Create `packages/agency/src/facets/binder.ts` - Startup facet resolution logic

## Phase 2: Core Type Extensions

- [X] T005 Extend `PluginManifest` in `packages/agency/src/plugins/types.ts` with `provides`, `requires`, `uses` arrays
- [X] T006 Extend `AgencyCoreAPI` interface in `packages/agency/src/plugins/types.ts` with `provide()`, `require()`, `optional()` methods
- [X] T007 Add facet error types (`FacetNotFoundError`, `AmbiguousFacetError`) to `packages/agency/src/facets/errors.ts`

## Phase 3: Core Implementation

- [X] T008 Implement `provide()` method in `packages/agency/src/core-api/plugin-core-api.ts`
- [X] T009 [P] Implement `require()` method in `packages/agency/src/core-api/plugin-core-api.ts`
- [X] T010 [P] Implement `optional()` method in `packages/agency/src/core-api/plugin-core-api.ts`
- [X] T011 Track per-plugin facet registrations for scoped cleanup in `plugin-core-api.ts`

## Phase 4: Server Integration

- [X] T012 Integrate FacetRegistry into `packages/agency/src/server/agency-server.ts` initialization
- [X] T013 Add facet binding after plugin loading in `agency-server.ts` - validate all `requires` satisfied
- [X] T014 [P] Add startup logging for facet resolution results in `agency-server.ts`
- [X] T015 Implement fail-fast behavior when required facets are missing

## Phase 5: Plugin Updates

- [X] T016 Update `packages/agency-plugin-git/src/index.ts` - Add `provides: [{ facet: 'SourceControl', qualifier: 'git' }]`
- [X] T017 [P] Update `packages/agency-plugin-docker/src/index.ts` - Add `provides: [{ facet: 'ContainerRuntime', qualifier: 'docker' }]`
- [X] T018 [P] Update `packages/agency-plugin-humancy/src/index.ts` - Add `requires: [{ facet: 'DecisionHandler' }]`
- [X] T019 [P] Update `packages/agency-plugin-firebase/src/index.ts` - Add `provides: [{ facet: 'SecretStore' }, { facet: 'StateStore' }]`
- [X] T020 [P] Update `packages/agency-plugin-spec-kit/src/index.ts` - Add `requires: [{ facet: 'IssueTracker' }, { facet: 'SourceControl' }]`
- [X] T021 [P] Update `packages/agency-plugin-npm/src/index.ts` - No facets (confirm self-contained, add empty arrays if needed)

## Phase 6: Exports & Public API

- [X] T022 Update `packages/agency/src/index.ts` - Re-export facet types from Latency
- [X] T023 Verify type exports work correctly from consumer perspective

## Phase 7: Testing

- [X] T024 Add FacetRegistry unit tests in `packages/agency/src/__tests__/facets/registry.test.ts`
- [X] T025 [P] Add facet resolution tests in `packages/agency/src/__tests__/facets/binder.test.ts`
- [X] T026 [P] Add missing facet error handling tests
- [X] T027 Update existing plugin tests to work with new API
- [X] T028 Add integration test for full plugin loading with facets

## Phase 8: Validation

- [X] T029 Run `pnpm build` - verify all packages build successfully
- [X] T030 Run `pnpm test` - verify all tests pass (no regressions)
- [X] T031 Manual verification: Load server, confirm plugins initialize with facets

## Dependencies & Execution Order

**Phase 1** (Setup): T001 must complete first (dependency installation). T002-T003 can run in parallel after T001. T004 depends on T003 (uses registry).

**Phase 2** (Types): Depends on Phase 1 completion. T005-T007 are independent and can run in parallel.

**Phase 3** (Implementation): Depends on Phase 2 (needs types). T008 first (provide is foundational), then T009-T010 in parallel. T011 depends on T008.

**Phase 4** (Integration): Depends on Phase 3 completion. T012 first, then T013-T015 can partially parallel (T13 before T15).

**Phase 5** (Plugins): Depends on Phase 4 (server must support facets). All plugin tasks (T016-T021) can run in parallel.

**Phase 6** (Exports): Depends on Phase 2 types. Can run parallel with Phase 4-5.

**Phase 7** (Testing): Depends on Phase 3-5 completion. T024-T26 can run in parallel. T027-T28 depend on plugin updates.

**Phase 8** (Validation): Depends on all previous phases. Sequential: build → test → manual verification.

## Parallel Opportunities Summary

| Phase | Parallel Tasks |
|-------|----------------|
| 1 | T002, T003 |
| 2 | T005, T006, T007 |
| 3 | T009, T010 |
| 4 | T014 (with T013 partially) |
| 5 | T016, T017, T018, T019, T020, T021 (all) |
| 6 | Can run parallel with Phase 4-5 |
| 7 | T024, T025, T026 |
