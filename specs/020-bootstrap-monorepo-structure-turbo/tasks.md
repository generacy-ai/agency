# Tasks: Bootstrap Monorepo Structure

**Input**: Design documents from `/specs/020-bootstrap-monorepo-structure-turbo/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Root Configuration

- [ ] T001 Create `pnpm-workspace.yaml` with `packages/*` glob
- [ ] T002 [P] Create root `package.json` with workspace scripts and devDependencies
- [ ] T003 [P] Create `tsconfig.base.json` with shared TypeScript compiler options
- [ ] T004 [P] Create `eslint.config.mjs` with flat config for TypeScript

---

## Phase 2: Build Orchestration

- [ ] T005 Create `turbo.json` with build/test/lint/typecheck/clean pipelines

---

## Phase 3: Core Package Scaffold

- [ ] T006 Create `packages/agency/` directory structure
- [ ] T007 Create `packages/agency/package.json` with name, exports, dependencies
- [ ] T008 [P] Create `packages/agency/tsconfig.json` extending base
- [ ] T009 [P] Create `packages/agency/src/index.ts` (empty export placeholder)

---

## Phase 4: Plugin Package Scaffolds

- [ ] T010 [P] Create `packages/agency-plugin-git/` scaffold (package.json, tsconfig.json, src/index.ts)
- [ ] T011 [P] Create `packages/agency-plugin-docker/` scaffold (package.json, tsconfig.json, src/index.ts)
- [ ] T012 [P] Create `packages/agency-plugin-firebase/` scaffold (package.json, tsconfig.json, src/index.ts)
- [ ] T013 [P] Create `packages/agency-plugin-npm/` scaffold (package.json, tsconfig.json, src/index.ts)
- [ ] T014 [P] Create `packages/agency-plugin-humancy/` scaffold (package.json, tsconfig.json, src/index.ts)

---

## Phase 5: Testing Infrastructure

- [ ] T015 Create root `vitest.config.ts` with workspace mode configuration

---

## Phase 6: Version Management

- [ ] T016 Create `.changeset/config.json` for changesets initialization

---

## Phase 7: CI/CD

- [ ] T017 Create `.github/workflows/ci.yml` for build/test/lint workflow

---

## Phase 8: Verification

- [ ] T018 Run `pnpm install` and verify no errors
- [ ] T019 Run `pnpm build` and verify all packages compile
- [ ] T020 Run `pnpm test` and verify test runner works
- [ ] T021 Run `pnpm lint` and verify linting passes
- [ ] T022 Run `pnpm typecheck` and verify type checking passes

---

## Dependencies & Execution Order

**Sequential dependencies:**
1. T001 (pnpm-workspace.yaml) must complete before package installation
2. T002-T004 can run in parallel after T001
3. T005 (turbo.json) can run after T002 (needs root package.json context)
4. T006 must complete before T007-T009
5. T007 must complete before T008-T009 (tsconfig extends, index needs package context)
6. T010-T014 (plugin scaffolds) can all run in parallel, after T003 (need base tsconfig)
7. T015-T017 can run in parallel after Phase 4 completes
8. T018-T022 (verification) must run sequentially after all prior tasks

**Parallel opportunities:**
- T002, T003, T004 can run concurrently (independent root config files)
- T008, T009 can run concurrently (independent package files)
- T010-T014 can run concurrently (independent plugin packages)
- T015, T016, T017 can run concurrently (independent infrastructure files)
