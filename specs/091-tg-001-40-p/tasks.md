# Tasks: Extension Package Setup

**Input**: Design documents from `/specs/091-tg-001-40-p/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md
**Status**: Complete

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
- [ ] Confirm `name` is `@generacy-ai/agency-extension`
- [ ] Confirm `displayName` is "Agency"
- [ ] Confirm `publisher` is `generacy-ai`
- [ ] Confirm `engines.vscode` is `^1.85.0` or higher
- [ ] Confirm `activationEvents` includes `workspaceContains:.agency/agency.config.json`
- [ ] Confirm `main` points to `./dist/extension.js`
- [ ] Confirm all 5 views are defined: Plugins, Tools, Activity, Containers, Modes
- [ ] Confirm all 14 commands are defined
- [ ] Confirm dependencies include: `@modelcontextprotocol/sdk`, `execa`, `zod`
- [ ] Confirm devDependencies include: `@types/vscode`, `@vscode/vsce`, `esbuild`, `typescript`, `vitest`

### T002 [P] Verify TypeScript configuration
**File**: `packages/agency-extension/tsconfig.json`
**Action**: Read and validate the TypeScript configuration
- [ ] Confirm extends `../../tsconfig.base.json`
- [ ] Confirm `module` is `CommonJS` (VS Code requirement)
- [ ] Confirm `moduleResolution` is `Node`
- [ ] Confirm `verbatimModuleSyntax` is `false`
- [ ] Confirm `outDir` is `./dist`
- [ ] Confirm `rootDir` is `./src`
- [ ] Confirm `lib` includes `ES2022`
- [ ] Confirm `types` includes `node`
- [ ] Confirm excludes: `node_modules`, `dist`, test files

### T003 [P] Verify esbuild configuration
**File**: `packages/agency-extension/esbuild.config.mjs`
**Action**: Read and validate the bundling configuration
- [ ] Confirm entry point is `src/extension.ts`
- [ ] Confirm output is `dist/extension.js`
- [ ] Confirm format is `cjs` (CommonJS)
- [ ] Confirm platform is `node`
- [ ] Confirm target is `node20`
- [ ] Confirm `vscode` is external
- [ ] Confirm source maps enabled in dev mode
- [ ] Confirm minification enabled in production mode
- [ ] Confirm watch mode support exists

### T004 [P] Verify Vitest configuration
**File**: `packages/agency-extension/vitest.config.ts`
**Action**: Read and validate the test configuration
- [ ] Confirm test pattern is `src/**/*.test.ts`
- [ ] Confirm environment is `node`
- [ ] Confirm globals is disabled (explicit imports)

### T005 [P] Verify .vscodeignore
**File**: `packages/agency-extension/.vscodeignore`
**Action**: Read and validate marketplace exclusions
- [ ] Confirm `src/**` is excluded
- [ ] Confirm config files are excluded (tsconfig.json, esbuild.config.mjs, vitest.config.ts)
- [ ] Confirm dev artifacts are excluded (.turbo/, node_modules/)
- [ ] Confirm `dist/`, `media/`, and metadata files are NOT excluded

### T006 [P] Verify CHANGELOG.md
**File**: `packages/agency-extension/CHANGELOG.md`
**Action**: Read and validate changelog format
- [ ] Confirm file exists
- [ ] Confirm follows Keep a Changelog format
- [ ] Confirm version is `0.0.0` (pre-release)

## Phase 2: Monorepo Integration Verification

### T007 Verify pnpm workspace configuration
**File**: `pnpm-workspace.yaml`
**Action**: Confirm extension package is included in workspace
- [ ] Confirm `packages/*` glob pattern exists
- [ ] Confirm this automatically includes `packages/agency-extension/`

### T008 Verify turborepo configuration
**File**: `turbo.json`
**Action**: Confirm extension participates in monorepo tasks
- [ ] Confirm `build` task exists with `^build` dependency
- [ ] Confirm `test` task exists with `build` dependency
- [ ] Confirm `lint` task exists
- [ ] Confirm `typecheck` task exists with `^typecheck` dependency
- [ ] Confirm `clean` task exists

## Phase 3: Build & Test Execution

### T009 Execute build
**Command**: `cd packages/agency-extension && pnpm build`
**Action**: Run build and verify output
- [ ] Build completes without errors
- [ ] `dist/extension.js` is created
- [ ] No TypeScript compilation errors
- [ ] Bundle size is reasonable (< 5MB)

### T010 Execute type check
**Command**: `cd packages/agency-extension && pnpm typecheck`
**Action**: Run type checking
- [ ] Type check passes with no errors
- [ ] No unresolved type references
- [ ] All imports resolve correctly

### T011 Execute tests
**Command**: `cd packages/agency-extension && pnpm test`
**Action**: Run test suite
- [ ] Tests execute successfully
- [ ] All test files are discovered
- [ ] No test failures

### T012 Execute lint
**Command**: `cd packages/agency-extension && pnpm lint`
**Action**: Run linting
- [ ] Lint check passes
- [ ] No linting errors
- [ ] Code style is consistent

### T013 Verify monorepo-level build
**Command**: `cd /workspaces/agency && pnpm build`
**Action**: Run build from monorepo root
- [ ] Turborepo detects agency-extension package
- [ ] Extension builds as part of monorepo
- [ ] Build completes successfully

### T014 Verify monorepo-level test
**Command**: `cd /workspaces/agency && pnpm test`
**Action**: Run tests from monorepo root
- [ ] Turborepo detects agency-extension tests
- [ ] Extension tests run as part of monorepo
- [ ] All tests pass

## Phase 4: Package Structure Verification

### T015 Verify source structure
**Directory**: `packages/agency-extension/src/`
**Action**: Confirm source code organization
- [ ] `extension.ts` exists (entry point)
- [ ] `constants.ts` exists
- [ ] `types/` directory exists with type definitions
- [ ] `status/` directory exists with StatusBarManager
- [ ] `__tests__/` directory exists with test files

### T016 Verify media assets
**Directory**: `packages/agency-extension/media/`
**Action**: Confirm media files exist
- [ ] `media/icons/agency.svg` exists (activity bar icon)
- [ ] Icon file is valid SVG

### T017 Verify documentation
**Files**: README.md, PUBLISHING.md
**Action**: Confirm documentation exists
- [ ] `README.md` exists and has content
- [ ] `PUBLISHING.md` exists and has publishing guide

## Phase 5: Marketplace Packaging (Optional)

### T018 Test package creation
**Command**: `cd packages/agency-extension && pnpm package`
**Action**: Create .vsix package for marketplace
- [ ] Package command executes successfully
- [ ] `.vsix` file is created
- [ ] Package size is reasonable (< 1MB)
- [ ] Package contains `dist/extension.js`
- [ ] Package contains `media/` assets
- [ ] Package does NOT contain `src/` or config files

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
