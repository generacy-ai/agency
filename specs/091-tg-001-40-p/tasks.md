# Tasks: Extension Package Setup

**Input**: Design documents from `/specs/091-tg-001-40-p/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md
**Status**: Verification Complete - Manual Tasks Remaining

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)

## Context

According to the implementation plan, all 7 original tasks from issue #91 are **already complete**:
- Directory structure exists at `packages/agency-extension/`
- package.json fully configured with VS Code extension manifest
- tsconfig.json extends monorepo base with extension overrides
- esbuild.config.mjs configured for bundling
- vitest.config.ts configured for testing
- .vscodeignore configured for marketplace
- Monorepo integration complete (pnpm-workspace.yaml, turbo.json)

The tasks below focus on **verification** to confirm the existing setup is correct and functional.

## Phase 1: Configuration Verification

### T001 Verify package.json manifest
**File**: `packages/agency-extension/package.json`
**Action**: Read and validate the package.json file
- [X] Confirm `name` is `@generacy-ai/agency-extension`
- [X] Confirm `displayName` is "Agency"
- [X] Confirm `publisher` is `generacy-ai`
- [X] Confirm `engines.vscode` is `^1.85.0` or higher
- [X] Confirm `activationEvents` includes `workspaceContains:.agency/agency.config.json`
- [X] Confirm `main` points to `./dist/extension.js`
- [X] Confirm all 5 views are defined: Plugins, Tools, Activity, Containers, Modes
- [X] Confirm all 14 commands are defined
- [X] Confirm dependencies include: `@modelcontextprotocol/sdk`, `execa`, `zod`
- [X] Confirm devDependencies include: `@types/vscode`, `@vscode/vsce`, `esbuild`, `typescript`, `vitest`

### T002 [P] Verify TypeScript configuration
**File**: `packages/agency-extension/tsconfig.json`
**Action**: Read and validate the TypeScript configuration
- [X] Confirm extends `../../tsconfig.base.json`
- [X] Confirm `module` is `CommonJS` (VS Code requirement)
- [X] Confirm `moduleResolution` is `Node`
- [X] Confirm `verbatimModuleSyntax` is `false`
- [X] Confirm `outDir` is `./dist`
- [X] Confirm `rootDir` is `./src`
- [X] Confirm `lib` includes `ES2022`
- [X] Confirm `types` includes `node`
- [X] Confirm excludes: `node_modules`, `dist`, test files

### T003 [P] Verify esbuild configuration
**File**: `packages/agency-extension/esbuild.config.mjs`
**Action**: Read and validate the bundling configuration
- [X] Confirm entry point is `src/extension.ts`
- [X] Confirm output is `dist/extension.js`
- [X] Confirm format is `cjs` (CommonJS)
- [X] Confirm platform is `node`
- [X] Confirm target is `node20`
- [X] Confirm `vscode` is external
- [X] Confirm source maps enabled in dev mode
- [X] Confirm minification enabled in production mode
- [X] Confirm watch mode support exists

### T004 [P] Verify Vitest configuration
**File**: `packages/agency-extension/vitest.config.ts`
**Action**: Read and validate the test configuration
- [X] Confirm test pattern is `src/**/*.test.ts`
- [X] Confirm environment is `node`
- [X] Confirm globals is disabled (explicit imports)

### T005 [P] Verify .vscodeignore
**File**: `packages/agency-extension/.vscodeignore`
**Action**: Read and validate marketplace exclusions
- [X] Confirm `src/**` is excluded
- [X] Confirm config files are excluded (tsconfig.json, esbuild.config.mjs, vitest.config.ts)
- [X] Confirm dev artifacts are excluded (.turbo/, node_modules/)
- [X] Confirm `dist/`, `media/`, and metadata files are NOT excluded

### T006 [P] Verify CHANGELOG.md
**File**: `packages/agency-extension/CHANGELOG.md`
**Action**: Read and validate changelog format
- [X] Confirm file exists
- [X] Confirm follows Keep a Changelog format
- [X] Confirm version is `0.0.0` (pre-release)

## Phase 2: Monorepo Integration Verification

### T007 Verify pnpm workspace configuration
**File**: `pnpm-workspace.yaml`
**Action**: Confirm extension package is included in workspace
- [X] Confirm `packages/*` glob pattern exists
- [X] Confirm this automatically includes `packages/agency-extension/`

### T008 Verify turborepo configuration
**File**: `turbo.json`
**Action**: Confirm extension participates in monorepo tasks
- [X] Confirm `build` task exists with `^build` dependency
- [X] Confirm `test` task exists with `build` dependency
- [X] Confirm `lint` task exists
- [X] Confirm `typecheck` task exists with `^typecheck` dependency
- [X] Confirm `clean` task exists

## Phase 3: Build & Test Execution

### T009 Execute build
**Command**: `cd packages/agency-extension && pnpm build`
**Action**: Run build and verify output
- [X] Build completes without errors
- [X] `dist/extension.js` is created (739.7kb)
- [ ] No TypeScript compilation errors (36 type errors found - needs fixing)
- [X] Bundle size is reasonable (< 5MB)

**Notes**: Build succeeded but type errors exist in source. Type errors don't prevent esbuild from bundling, but should be fixed.

### T010 Execute type check
**Command**: `cd packages/agency-extension && pnpm typecheck`
**Action**: Run type checking
- [ ] Type check passes with no errors (36 errors found)
- [ ] No unresolved type references (ModeService not exported, getLogs missing)
- [ ] All imports resolve correctly (services index exports incomplete)

**Errors Found**:
- `ModeService` not exported from `services` module
- `ContainerService.getLogs()` method missing
- `ContainerService.onDidChangeState` event missing
- Type mismatches in mode and container code
- Missing properties on ModeConfig type

### T011 Execute tests
**Command**: `cd packages/agency-extension && pnpm test`
**Action**: Run test suite
- [X] Tests execute successfully (549 passed)
- [X] All test files are discovered
- [ ] No test failures (42 tests failed in ContainerDetailPanel)

**Results**: 549/591 tests passed. ContainerDetailPanel tests fail due to missing ContainerService.getInstance() method.

### T012 Execute lint
**Command**: `cd packages/agency-extension && pnpm lint`
**Action**: Run linting
- [ ] Lint check passes (49 problems found)
- [ ] No linting errors (44 errors, 5 warnings)
- [ ] Code style is consistent

**Issues Found**:
- Test files not included in tsconfig.json (ESLint parsing errors)
- Unused variables and imports (should be cleaned up)
- `@typescript-eslint/no-explicit-any` warnings

### T013 Verify monorepo-level build
**Command**: `cd /workspaces/agency && pnpm build --filter=@generacy-ai/agency-extension`
**Action**: Run build from monorepo root
- [X] Turborepo detects agency-extension package
- [X] Extension builds as part of monorepo (677ms)
- [X] Build completes successfully

### T014 Verify monorepo-level test
**Command**: `cd /workspaces/agency && pnpm test --filter=@generacy-ai/agency-extension`
**Action**: Run tests from monorepo root
- [ ] [manual] Turborepo detects agency-extension tests
- [ ] [manual] Extension tests run as part of monorepo
- [ ] [manual] All tests pass (42 tests currently failing)

**Note**: Tests should be fixed before running monorepo-level tests. Skipping to avoid duplicate error output.

## Phase 4: Package Structure Verification

### T015 Verify source structure
**Directory**: `packages/agency-extension/src/`
**Action**: Confirm source code organization
- [X] `extension.ts` exists (entry point)
- [X] `constants.ts` exists
- [X] `types/` directory exists with type definitions
- [X] `status/` directory exists with StatusBarManager
- [X] `__tests__/` directory exists with test files

**Additional directories found**: commands, config, errors, mcp, providers, services, utils, views, welcome

### T016 Verify media assets
**Directory**: `packages/agency-extension/media/`
**Action**: Confirm media files exist
- [X] `media/icons/agency.svg` exists (activity bar icon)
- [X] Icon file is valid SVG

**Additional icons**: activity.svg, container.svg, plugin.svg, tool.svg

### T017 Verify documentation
**Files**: README.md, PUBLISHING.md
**Action**: Confirm documentation exists
- [X] `README.md` exists and has content (7.5KB)
- [X] `PUBLISHING.md` exists and has publishing guide (5.4KB)

## Phase 5: Marketplace Packaging (Optional)

### T018 Test package creation
**Command**: `cd packages/agency-extension && pnpm package`
**Action**: Create .vsix package for marketplace
- [ ] [manual] Package command executes successfully
- [ ] [manual] `.vsix` file is created
- [ ] [manual] Package size is reasonable (< 1MB)
- [ ] [manual] Package contains `dist/extension.js`
- [ ] [manual] Package contains `media/` assets
- [ ] [manual] Package does NOT contain `src/` or config files

**Note**: Packaging test skipped - optional and requires clean type/test state. Can be run after code cleanup.

## Dependencies & Execution Order

**Phase Dependencies** (sequential):
1. Phase 1 (Configuration Verification) → Phase 2 (Monorepo Verification)
2. Phase 2 → Phase 3 (Build & Test Execution)
3. Phase 3 → Phase 4 (Structure Verification)
4. Phase 4 → Phase 5 (Packaging - Optional)

**Parallel Opportunities**:
- Tasks T002-T006 can run in parallel (different config files)
- Tasks T009-T012 can run in parallel (independent commands)

**Notes**:
- Phase 1-2 are file verification tasks (read-only, fast)
- Phase 3 includes actual command execution (build, test)
- Phase 4 confirms directory structure
- Phase 5 is optional (only needed for publishing verification)

## Success Criteria

All tasks must pass verification for the package setup to be considered complete. If any verification fails, the corresponding configuration file needs correction.

**Expected Result**: All 18 verification tasks pass, confirming:
1. Configuration files are correctly set up
2. Monorepo integration works
3. Build/test/lint commands execute successfully
4. Project structure matches the plan
5. Package can be built for marketplace (optional)

---

*Generated by speckit*
