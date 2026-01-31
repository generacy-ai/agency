# Tasks: E4: Claude Code plugin: specify command

**Input**: Design documents from `/specs/168-e4-claude-code-plugin/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

- [ ] T001 [P] Create `packages/agency-plugin-spec-kit/src/tools/create-feature.ts` with tool skeleton and parameter validation
- [ ] T002 [P] Add create-feature tool registration to `packages/agency-plugin-spec-kit/src/tools/index.ts`

## Phase 2: Core Implementation

- [ ] T003 Implement feature number generation in `create-feature.ts` - scan branches and directories for next available number
- [ ] T004 Implement short name generation in `create-feature.ts` - word extraction with stop-word removal
- [ ] T005 Implement git branch creation in `create-feature.ts` - use simple-git following git-ops.ts patterns
- [ ] T006 Implement directory structure creation in `create-feature.ts` - feature dir with checklists/ and contracts/
- [ ] T007 Implement spec.md initialization in `create-feature.ts` - copy template and apply variable substitution

## Phase 3: Integration

- [ ] T008 Add error handling for all create_feature error codes defined in data-model.md
- [ ] T009 [P] Export CreateFeatureParams and CreateFeatureResult types from package

## Phase 4: Testing

- [ ] T010 [P] Create `packages/agency-plugin-spec-kit/tests/tools/create-feature.test.ts` with test setup and mocks
- [ ] T011 Add happy path test - create feature with description only
- [ ] T012 Add test for explicit feature number parameter
- [ ] T013 Add test for explicit short name parameter
- [ ] T014 Add test for number collision handling (existing feature number)
- [ ] T015 Add test for not in git repo error case
- [ ] T016 Add test for invalid description (empty/too long)

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 → Phase 2 → Phase 3 → Phase 4 (must complete in order)

**Within Phase 1**:
- T001 and T002 can run in parallel (different files, no dependencies)

**Within Phase 2** (sequential):
- T003 first (number generation is needed by T005)
- T004 can follow T003 (short name used by T005)
- T005 depends on T003 and T004 (branch name = number + short name)
- T006 depends on T005 (directory created after branch)
- T007 depends on T006 (spec.md written to feature dir)

**Within Phase 3**:
- T008 sequential (wraps all implementations)
- T009 parallel (just type exports, no dependencies)

**Within Phase 4**:
- T010 first (test setup)
- T011-T016 can run sequentially after T010 (each test is independent but use shared setup)

**Parallel opportunities**:
- T001 || T002
- T009 || T008

**Total**: 16 tasks across 4 phases
