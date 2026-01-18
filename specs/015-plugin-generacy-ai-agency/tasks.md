# Tasks: @generacy-ai/agency-plugin-docker

**Input**: Design documents from `/specs/015-plugin-generacy-ai-agency/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Project Setup

- [x] T001 Create package structure `packages/agency-plugin-docker/` with package.json, tsconfig.json
- [x] T002 [P] Add `execa` and `zod` dependencies to package.json
- [x] T003 [P] Create `src/index.ts` plugin entry point with AgencyPlugin export stub
- [x] T004 [P] Create `src/manifest.ts` with PluginManifest definition (name, version, tools list)
- [x] T005 [P] Create `src/config.ts` with DockerPluginConfig zod schema

---

## Phase 2: Utilities

- [x] T006 Create `src/utils/exec.ts` Docker CLI execution wrapper using execa
- [x] T007 [P] Create `src/utils/error-classifier.ts` with DockerErrorCategory classification
- [x] T008 Write tests `src/__tests__/utils/error-classifier.test.ts`

---

## Phase 3: Compose Tools

- [x] T009 Implement `src/tools/compose-up.ts` with run.docker_compose_up tool
- [x] T010 [P] Implement `src/tools/compose-down.ts` with run.docker_compose_down tool
- [x] T011 [P] Implement `src/tools/compose-logs.ts` with run.docker_compose_logs tool
- [x] T012 [P] Implement `src/tools/compose-ps.ts` with run.docker_compose_ps tool
- [x] T013 Write tests `src/__tests__/tools/compose-up.test.ts`
- [x] T014 [P] Write tests `src/__tests__/tools/compose-down.test.ts`
- [x] T015 [P] Write tests `src/__tests__/tools/compose-logs.test.ts`
- [x] T016 [P] Write tests `src/__tests__/tools/compose-ps.test.ts`

---

## Phase 4: Container Tools

- [x] T017 Implement `src/tools/docker-build.ts` with run.docker_build tool
- [x] T018 [P] Implement `src/tools/docker-run.ts` with run.docker_run tool
- [x] T019 [P] Implement `src/tools/docker-stop.ts` with run.docker_stop tool
- [x] T020 [P] Implement `src/tools/docker-exec.ts` with run.docker_exec tool
- [x] T021 Write tests `src/__tests__/tools/docker-build.test.ts`
- [x] T022 [P] Write tests `src/__tests__/tools/docker-run.test.ts`
- [x] T023 [P] Write tests `src/__tests__/tools/docker-stop.test.ts`
- [x] T024 [P] Write tests `src/__tests__/tools/docker-exec.test.ts`

---

## Phase 5: Integration

- [x] T025 Create `src/tools/index.ts` exporting all 8 tools
- [x] T026 Update `src/index.ts` to wire tools with manifest and export complete plugin
- [x] T027 Write integration test `src/__tests__/integration/docker.integration.test.ts`

---

## Phase 6: Finalization

- [x] T028 Verify build with `pnpm build`
- [x] T029 [P] Verify all tests pass with `pnpm test`
- [x] T030 [P] Verify type checking with `pnpm typecheck`

---

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 (Setup) → Phase 2 (Utilities) → Phase 3 (Compose) → Phase 4 (Container) → Phase 5 (Integration) → Phase 6 (Finalization)

**Parallel opportunities within phases**:
- Phase 1: T002-T005 can run in parallel after T001 creates structure
- Phase 2: T007 parallel with T006; T008 depends on T007
- Phase 3: T010-T012 parallel after T009; T014-T016 parallel after T013
- Phase 4: T018-T020 parallel after T017; T022-T024 parallel after T021
- Phase 5: Sequential (T025 → T026 → T027)
- Phase 6: T029-T030 parallel after T028

**Critical path**: T001 → T006 → T009 → T017 → T025 → T026 → T028
