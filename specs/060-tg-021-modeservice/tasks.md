# Tasks: ModeService

**Input**: Design documents from `/specs/060-tg-021-modeservice/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)

---

## Phase 1: Core Service Implementation

### T001 Create ModeService class skeleton
**File**: `packages/agency-extension/src/services/ModeService.ts`

- [X] Create `ModeService` class with singleton pattern (private constructor, getInstance())
- [X] Add private `configService: ConfigService` field
- [X] Add private event emitter for `onModeChange`
- [X] Implement `dispose()` method to clean up event listeners
- [X] Add JSDoc comments for the class

### T002 Implement inheritance resolution logic
**File**: `packages/agency-extension/src/services/ModeService.ts`

- [X] Implement private `resolveInheritance(mode: ModeConfig, allModes: ModeConfig[], visited?: Set<string>): string[]`
- [X] Handle base case: root mode (no parentId) returns unique includedTools
- [X] Handle recursive case: resolve parent, apply includedTools and excludedTools
- [X] Track visited modes to detect circular inheritance
- [X] Throw error with clear message if circular inheritance detected
- [X] Throw error if parent mode not found

### T003 Implement getModes() method
**File**: `packages/agency-extension/src/services/ModeService.ts`

- [X] Load mode configs from ConfigService.getConfig().modes
- [X] Get current mode ID from ConfigService.getConfig().currentModeId
- [X] For each mode config, resolve inheritance to compute effectiveTools
- [X] Determine isActive based on currentModeId
- [X] Build parent/child relationships
- [X] Compute depth for each mode
- [X] Return array of ModeInfo objects

### T004 Implement getMode() and getCurrentMode() methods
**File**: `packages/agency-extension/src/services/ModeService.ts`

- [X] Implement `getMode(id: string): ModeInfo | undefined` by filtering getModes()
- [X] Implement `getCurrentMode(): ModeInfo` by finding the active mode in getModes()
- [X] Handle case where no mode is active (return default mode)

### T005 Implement setCurrentMode() method
**File**: `packages/agency-extension/src/services/ModeService.ts`

- [X] Validate that target mode exists using getMode()
- [X] Get previous mode with getCurrentMode()
- [X] Compute tool diff (addedTools, removedTools) by comparing effectiveTools
- [X] Save new currentModeId to ConfigService
- [X] Emit ModeStateEvent with type 'activated'
- [X] Return ModeSwitchResult with success=true, tool diffs, and timestamp
- [X] Handle errors: return ModeSwitchResult with success=false and error message

### T006 Implement buildModeTree() method
**File**: `packages/agency-extension/src/services/ModeService.ts`

- [X] Get all modes with getModes()
- [X] Create a map of modeId → ModeInfo for lookup
- [X] Filter for root modes (no parentId)
- [X] Implement recursive buildNode() helper function:
  - Compute inheritedToolCount, addedToolCount, excludedToolCount
  - Find child modes by parentId
  - Recursively build children
- [X] Return array of root ModeTreeNode objects

### T007 Implement validate() method
**File**: `packages/agency-extension/src/services/ModeService.ts`

- [X] Check for duplicate mode IDs (create Set, check size vs array length)
- [X] Check for missing parents (for each mode with parentId, verify parent exists)
- [X] Check for circular inheritance (call resolveInheritance, catch errors)
- [X] Collect errors and warnings
- [X] Return ModeValidationResult with valid=true if no errors

---

## Phase 2: Testing

### T008 [P] Create test fixtures
**File**: `packages/agency-extension/src/__tests__/services/ModeService.test.ts`

- [X] Create fixture: simple root mode (no parent)
- [X] Create fixture: single-level inheritance (A → B)
- [X] Create fixture: multi-level inheritance (A → B → C)
- [X] Create fixture: circular inheritance (A → B → C → A) for error cases
- [X] Create fixture: missing parent (mode references non-existent parent)
- [X] Create fixture: duplicate IDs (two modes with same id)
- [X] Create mock ConfigService that returns fixture configs

### T009 Write unit tests for inheritance resolution
**File**: `packages/agency-extension/src/__tests__/services/ModeService.test.ts`

- [X] Test: root mode returns only its includedTools
- [X] Test: single-level inheritance (child inherits parent tools + adds own)
- [X] Test: multi-level inheritance (grandchild inherits all ancestor tools)
- [X] Test: excludedTools properly remove tools from parent
- [X] Test: circular inheritance throws error
- [X] Test: missing parent throws error

### T010 Write unit tests for query methods
**File**: `packages/agency-extension/src/__tests__/services/ModeService.test.ts`

- [X] Test: getModes() returns all modes with resolved effectiveTools
- [X] Test: getModes() correctly sets isActive for current mode
- [X] Test: getMode(id) returns correct mode
- [X] Test: getMode(id) returns undefined for non-existent mode
- [X] Test: getCurrentMode() returns the active mode
- [X] Test: getCurrentMode() returns default mode if no active mode set

### T011 Write unit tests for setCurrentMode()
**File**: `packages/agency-extension/src/__tests__/services/ModeService.test.ts`

- [X] Test: setCurrentMode() switches mode successfully
- [X] Test: setCurrentMode() returns correct tool diff (added/removed)
- [X] Test: setCurrentMode() saves to ConfigService
- [X] Test: setCurrentMode() emits ModeStateEvent
- [X] Test: setCurrentMode() fails gracefully for non-existent mode
- [X] Test: setCurrentMode() returns error in ModeSwitchResult on failure

### T012 Write unit tests for buildModeTree()
**File**: `packages/agency-extension/src/__tests__/services/ModeService.test.ts`

- [X] Test: buildModeTree() creates correct hierarchy (roots with children)
- [X] Test: buildModeTree() computes correct toolCount
- [X] Test: buildModeTree() computes correct inheritedToolCount
- [X] Test: buildModeTree() computes correct addedToolCount
- [X] Test: buildModeTree() computes correct excludedToolCount
- [X] Test: buildModeTree() sets isActive correctly

### T013 Write unit tests for validate()
**File**: `packages/agency-extension/src/__tests__/services/ModeService.test.ts`

- [X] Test: validate() detects duplicate IDs
- [X] Test: validate() detects missing parent
- [X] Test: validate() detects circular inheritance
- [X] Test: validate() returns valid=true for valid configs
- [X] Test: validate() collects multiple errors if present

---

## Phase 3: Integration

### T014 Export ModeService from barrel file
**File**: `packages/agency-extension/src/services/index.ts`

- [X] Add export for ModeService: `export { ModeService } from './ModeService';`
- [X] Verify other services are still exported

### T015 [P] Run tests and verify build
**Command**: Run in repository root

- [X] Run `pnpm test` to execute all unit tests
- [X] Verify all ModeService tests pass (29/29 passed)
- [X] Run `pnpm typecheck` to verify TypeScript compilation
- [X] Run `pnpm lint` to check code style
- [X] Fix any linting or type errors

---

## Dependencies & Execution Order

**Sequential phases**:
- Phase 1 (Implementation) → Phase 2 (Testing) → Phase 3 (Integration)

**Within Phase 1** (sequential):
- T001 (skeleton) must complete first
- T002 (resolveInheritance) must complete before T003 (getModes)
- T003 (getModes) must complete before T004, T005, T006, T007
- T004, T005, T006, T007 can run in parallel after T003

**Within Phase 2** (mostly parallel):
- T008 (fixtures) can run in parallel with T001-T007
- T009-T013 (test files) must wait for T008 (fixtures) but can run in parallel with each other

**Within Phase 3**:
- T014 and T015 can run in parallel

**Parallel opportunities**:
- T008 (test fixtures) can be created while implementing T001-T007
- T009-T013 (test suites) can be written in parallel
- T014 (export) and T015 (verification) can run in parallel

---

*Generated by speckit*
