# Tasks: Bundle Canonical Workflows in Spec Kit Plugin

**Input**: `spec.md`, `plan.md` from feature directory
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Ready

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = single source of truth for workflows)

---

## Phase 1: Add Workflow Files and Package Configuration

### T001 [DONE] [P] [US1] Copy canonical feature workflow into plugin package
**File**: `packages/agency-plugin-spec-kit/workflows/speckit-feature.yaml`
- Copy `/workspaces/agency/.generacy/speckit-feature.yaml` (v1.3.0) to `packages/agency-plugin-spec-kit/workflows/speckit-feature.yaml`
- Verify the file is valid YAML and contains expected top-level fields (`name`, `description`, `version`, `inputs`, `phases`)

### T002 [DONE] [P] [US1] Copy canonical bugfix workflow into plugin package
**File**: `packages/agency-plugin-spec-kit/workflows/speckit-bugfix.yaml`
- Copy `/workspaces/agency/.generacy/speckit-bugfix.yaml` (v1.3.0) to `packages/agency-plugin-spec-kit/workflows/speckit-bugfix.yaml`
- Verify the file is valid YAML and contains expected top-level fields (`name`, `description`, `version`, `inputs`, `phases`)

### T003 [DONE] [US1] Update package.json to include workflows and add yaml devDependency
**File**: `packages/agency-plugin-spec-kit/package.json`
- Add `"workflows"` to the `files` array: change `"files": ["dist"]` to `"files": ["dist", "workflows"]`
- Add `"yaml": "^2.8.2"` to `devDependencies` (for test-time YAML parsing; already in monorepo lockfile)
- Run `pnpm install` to update the lockfile

---

## Phase 2: Create Workflows Module

### T004 [DONE] [US1] Create workflows.ts with path resolution and helpers
**File**: `packages/agency-plugin-spec-kit/src/workflows.ts`
- Define `BuiltinWorkflowName` type union: `'speckit-feature' | 'speckit-bugfix'`
- Create `BUILTIN_WORKFLOWS` constant mapping names to absolute file paths using `import.meta.url` + `fileURLToPath` + `resolve(__dirname, '../workflows/<name>.yaml')`
- Implement `getBuiltinWorkflowPath(name: string): string | undefined` — returns path for known names, `undefined` otherwise
- Implement `resolveWorkflow(name: string, repoRoot: string): string | undefined` — checks `<repoRoot>/.generacy/<name>.yaml` first (via `existsSync`), falls back to bundled, returns `undefined` for unknown names with no local override
- Use lazy `existsSync` in `resolveWorkflow()` only (not at import time)

---

## Phase 3: Wire Into Plugin Lifecycle

### T005 [DONE] [US1] Register bundled workflows during plugin initialization
**File**: `packages/agency-plugin-spec-kit/src/plugin.ts`
- Add import: `import { BUILTIN_WORKFLOWS } from './workflows.js'`
- At end of `initialize()` method (after tool registration and mode subscription), add workflow registration loop
- Use optional chaining on `core` cast to `Record<string, unknown>` to call `registerWorkflow?.(name, filePath, { priority: 'fallback' })` — this is a no-op today since `AgencyCoreAPI` lacks this method
- Wrap each registration call in try/catch; on error, call `core.recordEvent({ type: 'plugin.workflow.registration_failed', data: { workflow: name, error: String(error) } })` and continue

---

## Phase 4: Update Barrel Export

### T006 [DONE] [US1] Re-export workflow utilities from package entry point
**File**: `packages/agency-plugin-spec-kit/src/index.ts`
- Add named exports: `BUILTIN_WORKFLOWS`, `getBuiltinWorkflowPath`, `resolveWorkflow`
- Add type export: `BuiltinWorkflowName`
- All from `'./workflows.js'`
- Place in a new `// Workflows` section after existing export groups

---

## Phase 5: Add Tests

### T007 [DONE] [US1] Write unit tests for workflow bundling and resolution
**File**: `packages/agency-plugin-spec-kit/tests/workflows.test.ts`
- **Bundled file existence tests:**
  - `BUILTIN_WORKFLOWS` contains entries for both `speckit-feature` and `speckit-bugfix`
  - Each path in `BUILTIN_WORKFLOWS` points to a file that exists on disk (`existsSync`)
- **YAML validity and schema tests (one level deep):**
  - Each workflow file parses as valid YAML (using `yaml` package)
  - Top-level fields present: `name` (string), `version` (string), `inputs` (array), `phases` (array)
  - Each phase has `name` (string) and `steps` (array)
  - Each step has `name` (string) and `uses` (string)
  - Each input has `name` (string) and `description` (string)
- **`getBuiltinWorkflowPath()` tests:**
  - Returns a string for `'speckit-feature'`
  - Returns a string for `'speckit-bugfix'`
  - Returns `undefined` for `'unknown-workflow'`
- **`resolveWorkflow()` tests:**
  - Returns local override path when `.generacy/<name>.yaml` exists in a temp directory
  - Falls back to bundled path when no local override exists
  - Returns `undefined` for unknown names with no local override
  - Uses `fs.mkdtempSync` for temp dirs and cleans up in `afterEach`

### T008 [DONE] [US1] Add plugin initialization tests for workflow registration
**File**: `packages/agency-plugin-spec-kit/tests/plugin.test.ts`
- Add test: `initialize()` does not throw when `core` lacks `registerWorkflow` method (existing behavior preserved)
- Add test: `initialize()` calls `core.registerWorkflow` for each workflow when method exists on core mock
- Add test: `initialize()` logs event via `core.recordEvent` and continues when `registerWorkflow` throws

---

## Phase 6: Update Documentation

### T009 [DONE] [US1] Add Workflow Management section to README
**File**: `packages/agency-plugin-spec-kit/README.md`
- Add a "Bundled Workflows" section explaining:
  - What bundled workflows are (canonical `speckit-feature.yaml` and `speckit-bugfix.yaml` shipped with the plugin)
  - Why they exist (eliminates version drift across repos)
  - How local overrides work (`.generacy/<name>.yaml` in repo root takes priority over bundled)
  - Migration steps: delete local `.generacy/speckit-*.yaml` files to use bundled defaults
  - How to check bundled version: `version` field in the YAML files
- Add API reference for exported functions: `resolveWorkflow()`, `getBuiltinWorkflowPath()`, `BUILTIN_WORKFLOWS`

---

## Phase 7: Verification

### T010 [DONE] Build and test
**Files**:
- All modified/created files
- Verify `pnpm build` succeeds (TypeScript compiles without errors)
- Verify `pnpm test` passes (all existing + new tests green)
- Verify `pnpm pack --dry-run` includes `workflows/*.yaml` in output
- Verify importing `{ BUILTIN_WORKFLOWS, resolveWorkflow }` from the compiled package works

---

## Dependencies & Execution Order

**Phase dependencies (sequential)**:
- Phase 1 must complete before Phase 2 (workflows module references YAML files)
- Phase 2 must complete before Phase 3 (plugin.ts imports from workflows.ts)
- Phase 2 must complete before Phase 4 (index.ts re-exports from workflows.ts)
- Phases 3 and 4 can run in parallel (independent files)
- Phase 5 depends on Phases 1–4 (tests exercise all new code)
- Phase 6 can run in parallel with Phase 5 (documentation is independent)
- Phase 7 depends on all prior phases

**Parallel opportunities within phases**:
- T001 and T002 can run in parallel (independent file copies)
- T005 and T006 can run in parallel (different source files, no interdependence)
- T007 and T009 can run in parallel (test file vs documentation)

**Critical path**:
T001/T002 → T003 → T004 → T005/T006 → T007/T008 → T010
