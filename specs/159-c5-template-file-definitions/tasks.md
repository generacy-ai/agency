# Tasks: C5 Template File Definitions and Defaults

**Input**: Design documents from `/specs/159-c5-template-file-definitions/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup & Types

- [x] T001 Create `src/templates/` directory structure
- [x] T002 Create `src/templates/types.ts` with `TemplateType`, `TemplateDefinition`, and `TemplateVariables` interfaces

## Phase 2: Default Content Files

- [x] T003 [P] Create `src/templates/defaults/spec.ts` with embedded spec template content
- [x] T004 [P] Create `src/templates/defaults/plan.ts` with embedded plan template content
- [x] T005 [P] Create `src/templates/defaults/tasks.ts` with embedded tasks template content
- [x] T006 [P] Create `src/templates/defaults/checklist.ts` with embedded checklist template content
- [x] T007 [P] Create `src/templates/defaults/agent-file.ts` with embedded agent-file template content

## Phase 3: Core Implementation

- [x] T008 Create `src/templates/variables.ts` with `substituteVariables()` function
- [x] T009 Create `src/templates/index.ts` with `TEMPLATE_TYPES`, `TEMPLATES` registry, and `resolveTemplate()` function

## Phase 4: Integration

- [x] T010 Refactor `src/tools/copy-template.ts` to use `templates/index.ts` instead of local `TEMPLATE_MAPPINGS`
- [x] T011 Add variable substitution call in `copy-template.ts` during template copy operation

## Phase 5: Tests

- [x] T012 [P] Create `tests/templates/types.test.ts` - validate type definitions
- [x] T013 [P] Create `tests/templates/defaults.test.ts` - verify default content exports
- [x] T014 [P] Create `tests/templates/variables.test.ts` - test variable substitution including edge cases
- [x] T015 [P] Create `tests/templates/index.test.ts` - test `resolveTemplate()` with custom and default paths
- [x] T016 Update or create tests for `copy-template.ts` to verify refactored behavior

## Phase 6: Polish

- [x] T017 Run `pnpm build` to verify TypeScript compilation
- [x] T018 Run `pnpm test` to verify all tests pass
- [x] T019 Verify `copy_template` tool works end-to-end with variable substitution

## Dependencies & Execution Order

**Sequential phases**: Phases must be completed in order (1 → 2 → 3 → 4 → 5 → 6).

**Parallel opportunities**:
- Phase 2: All default content files (T003-T007) can be created in parallel
- Phase 5: Test files (T012-T015) can be created in parallel

**Key dependencies**:
- T002 must complete before T003-T007 (types used by defaults)
- T003-T007 must complete before T009 (defaults imported by index)
- T008 must complete before T009 (variables.ts imported by index)
- T009 must complete before T010-T011 (index.ts used by copy-template)
- T010-T011 must complete before T016 (integration tests need implementation)

**Files to create/modify**:
- `packages/agency-plugin-spec-kit/src/templates/types.ts` (new)
- `packages/agency-plugin-spec-kit/src/templates/defaults/spec.ts` (new)
- `packages/agency-plugin-spec-kit/src/templates/defaults/plan.ts` (new)
- `packages/agency-plugin-spec-kit/src/templates/defaults/tasks.ts` (new)
- `packages/agency-plugin-spec-kit/src/templates/defaults/checklist.ts` (new)
- `packages/agency-plugin-spec-kit/src/templates/defaults/agent-file.ts` (new)
- `packages/agency-plugin-spec-kit/src/templates/variables.ts` (new)
- `packages/agency-plugin-spec-kit/src/templates/index.ts` (new)
- `packages/agency-plugin-spec-kit/src/tools/copy-template.ts` (modify)
- `packages/agency-plugin-spec-kit/tests/templates/*.test.ts` (new)
