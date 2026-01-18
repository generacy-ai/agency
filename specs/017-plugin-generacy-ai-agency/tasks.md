# Tasks: Plugin: @generacy-ai/agency-plugin-npm

**Input**: Design documents from `/specs/017-plugin-generacy-ai-agency/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Package Setup

- [x] T001 Create `packages/agency-plugin-npm/package.json` with workspace dependencies (@generacy-ai/agency, typescript, vitest)
- [x] T002 [P] Create `packages/agency-plugin-npm/tsconfig.json` extending workspace base config
- [x] T003 [P] Create `packages/agency-plugin-npm/vitest.config.ts` with test configuration

## Phase 2: Core Types and Configuration

- [x] T010 [US1] Create `src/pm/types.ts` with PackageManager type and DetectionResult interface
- [x] T011 [P] [US1] Create `src/config.ts` with NpmPluginConfig interface and default values
- [x] T012 [P] Create `src/manifest.ts` with plugin manifest definition (tools list, mode affiliations)

## Phase 3: Package Manager Detection

- [x] T020 [US1] Create `src/pm/detect.ts` with lockfile-based detection logic (pnpm-lock.yaml > yarn.lock > package-lock.json)
- [x] T021 [US2] Create `src/pm/commands.ts` with CommandBuilder for each PM (install, run, workspace flags)
- [x] T022 [P] Create `src/pm/index.ts` exporting detection and command modules

## Phase 4: Script Validation and Execution

- [x] T030 [US1] Create `src/scripts/validate.ts` to check package.json for script existence
- [x] T031 [P] Create `src/scripts/index.ts` exporting validation module
- [x] T032 [US1] Create `src/exec/runner.ts` with spawn-based command execution and output capture
- [x] T033 [P] Create `src/exec/index.ts` exporting runner module

## Phase 5: Tool Parameter Schemas

- [x] T040 Create `src/tools/schemas.ts` with Zod schemas for all 8 tools (BaseParams, InstallDependencies, Compile, Lint, Format, RunTest, RunCoverage)

## Phase 6: Build Tools Implementation

- [x] T050 [US1] Create `src/tools/build/install-dependencies.ts` implementing build.install_dependencies tool
- [x] T051 [P] [US1] Create `src/tools/build/compile.ts` implementing build.compile tool
- [x] T052 [P] [US1] Create `src/tools/build/lint.ts` implementing build.lint tool
- [x] T053 [P] [US1] Create `src/tools/build/format.ts` implementing build.format tool

## Phase 7: Test Tools Implementation

- [x] T060 [US1] Create `src/tools/test/run-unit.ts` implementing test.run_unit tool
- [x] T061 [P] [US1] Create `src/tools/test/run-integration.ts` implementing test.run_integration tool
- [x] T062 [P] [US1] Create `src/tools/test/run-e2e.ts` implementing test.run_e2e tool
- [x] T063 [P] [US1] Create `src/tools/test/run-coverage.ts` implementing test.run_coverage tool

## Phase 8: Tool Registration

- [x] T070 Create `src/tools/index.ts` registering all 8 tools with tool factory pattern

## Phase 9: Plugin Entry Point

- [x] T080 Create `src/index.ts` as plugin entry point implementing AgencyPlugin interface with initialize function

## Phase 10: Test Fixtures

- [x] T090 Create `tests/fixtures/npm-project/` with package.json and package-lock.json
- [x] T091 [P] Create `tests/fixtures/yarn-project/` with package.json and yarn.lock
- [x] T092 [P] Create `tests/fixtures/pnpm-project/` with package.json and pnpm-lock.yaml
- [x] T093 [P] Create `tests/fixtures/monorepo/` with workspace setup for testing workspace parameter

## Phase 11: Unit Tests

- [x] T100 [US1] Create `tests/pm/detect.test.ts` testing package manager detection from lockfiles
- [x] T101 [P] Create `tests/scripts/validate.test.ts` testing script validation logic
- [x] T102 [P] [US1] Create `tests/tools/build.test.ts` testing build tools (install, compile, lint, format)
- [x] T103 [P] [US1] Create `tests/tools/test.test.ts` testing test tools (unit, integration, e2e, coverage)

## Dependencies & Execution Order

**Sequential dependencies:**
- Phase 1 (Setup) must complete before Phase 2 (Types)
- Phase 2 (Types) must complete before Phase 3 (Detection)
- Phase 3 (Detection) and Phase 4 (Validation/Execution) can run in parallel
- Phase 5 (Schemas) depends on Phase 2 (Types)
- Phases 6-7 (Tools) depend on Phases 3-5
- Phase 8 (Registration) depends on Phases 6-7
- Phase 9 (Entry Point) depends on Phase 8
- Phases 10-11 (Tests) can start after Phase 4, but full tests depend on Phase 9

**Parallel opportunities within phases:**
- T002 and T003 can run in parallel (independent config files)
- T010, T011, T012 can run in parallel (independent type/config files)
- T020, T021, T022 - T022 can run parallel with others (just re-exports)
- T030-T033 - Index files can run parallel with implementation
- T050-T053 - All build tools can run in parallel (different files)
- T060-T063 - All test tools can run in parallel (different files)
- T090-T093 - All fixtures can run in parallel (independent directories)
- T100-T103 - All unit tests can run in parallel (test different modules)

**Total tasks**: 32
**Phases**: 11
**Parallel opportunities**: 20 tasks marked with [P]

---

*Generated by speckit*
