# Tasks: create_feature Tool Implementation

**Input**: Design documents from `/specs/153-b4-implement-create-feature/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which acceptance criterion this task addresses

## Phase 1: Setup & Utilities

- [X] T001 [P] Create `src/utils/slug.ts` with slug generation utilities
  - Implement `generateSlug(description: string, options?: SlugOptions): string`
  - Define STOP_WORDS constant list
  - Handle edge cases: empty input, all stop words, special characters
  - Export via `src/utils/index.ts`

- [X] T002 [P] Create `src/utils/numbering.ts` with auto-numbering utilities
  - Implement `findNextFeatureNumber(repoRoot: string, specsDir: string): Promise<number>`
  - Scan specs directory for `###-*` patterns
  - Scan git branches (local + remote) for feature patterns
  - Return max + 1, default to 1 if no existing features

## Phase 2: Core Implementation

- [X] T003 Create `src/tools/create-feature.ts` main tool implementation
  - Define Zod schema for input validation
  - Implement `createCreateFeatureTool(config, core)` function
  - Handle input parameters: description, short_name, number, parent_epic_branch, cwd
  - Build branch name using config.branches.pattern
  - Create feature directory at `{specsDir}/{paddedNumber}-{slug}/`
  - Generate spec.md from template
  - Create git branch and checkout
  - Return CreateFeatureResult with all required fields

- [X] T004 Integrate template handling in create-feature tool
  - Check for custom template at `config.paths.templates/spec.md`
  - Fall back to default bundled template
  - Populate template with: title, branch name, description, date
  - Write spec.md to feature directory

- [X] T005 Implement parent epic branch support
  - When `parent_epic_branch` provided, branch from epic instead of current
  - Fetch all remotes first
  - Handle case where epic branch is remote-only
  - Set `branched_from_epic: true` in result
  - Add epic reference to generated spec.md

## Phase 3: Error Handling & Validation

- [X] T006 [P] Implement pre-creation validation checks
  - Check repo root exists (FEATURE_DIR_NOT_FOUND)
  - Check feature directory doesn't exist (BRANCH_EXISTS)
  - Check git branch doesn't exist (BRANCH_EXISTS_FOR_ISSUE)
  - Validate generated branch name against pattern (INVALID_BRANCH_NAME)
  - Validate number <= 999 (INVALID_FEATURE_NUMBER)

- [X] T007 [P] Implement git operation error handling
  - Wrap git operations in try/catch
  - Return GIT_OPERATION_FAILED with context
  - Handle race conditions (re-check before create)

## Phase 4: Integration

- [X] T008 Update `src/tools/index.ts` to register create-feature tool
  - Import createCreateFeatureTool
  - Add to createTools() return array
  - Ensure proper ordering with dependencies

- [X] T009 Update `src/utils/index.ts` to export slug utilities
  - Export generateSlug function
  - Export SlugOptions type
  - Export findNextFeatureNumber function

## Phase 5: Testing

- [X] T010 [P] Write unit tests for slug generation (`src/utils/slug.test.ts`)
  - Test basic slug generation
  - Test stop word removal
  - Test special character handling
  - Test max words/length truncation
  - Test empty/edge case inputs

- [X] T011 [P] Write unit tests for auto-numbering (`src/utils/numbering.test.ts`)
  - Test scanning specs directory
  - Test scanning git branches
  - Test taking max of both sources
  - Test default to 1 when no features exist

- [X] T012 Write integration tests for create-feature tool (`src/tools/create-feature.test.ts`)
  - Test basic feature creation
  - Test creation with explicit number
  - Test creation with short_name override
  - Test creation from epic branch
  - Test error cases: dir exists, branch exists, invalid number

## Dependencies & Execution Order

**Phase 1 → Phase 2**: Utilities must exist before tool uses them
- T001 and T002 are parallel (different files)
- T003 depends on T001, T002

**Phase 2 → Phase 3**: Core implementation before error handling refinement
- T003 is the foundation
- T004 and T005 build on T003 sequentially

**Phase 3**: Validation tasks are parallel
- T006 and T007 can run in parallel

**Phase 4 → Phase 5**: Integration before testing
- T008 and T009 can be done with Phase 3 tasks
- T010, T011 can run in parallel
- T012 should run after all implementation complete

**Parallel opportunities**:
- T001 || T002 (Phase 1)
- T006 || T007 (Phase 3)
- T010 || T011 (Phase 5)
