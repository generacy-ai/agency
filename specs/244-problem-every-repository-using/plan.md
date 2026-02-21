# Implementation Plan: Bundle Canonical Workflows in Spec Kit Plugin

**Feature**: 244-problem-every-repository-using
**Date**: 2026-02-21
**Status**: Draft

## Summary

Bundle canonical `speckit-feature.yaml` and `speckit-bugfix.yaml` workflow files inside the `@generacy-ai/agency-plugin-spec-kit` package so they ship automatically with plugin updates. Add a `resolveWorkflow()` helper for immediate local-first resolution (check `.generacy/` then fall back to bundled), and wire up optional `core.registerWorkflow?.()` calls for future generacy engine integration.

## Technical Context

| Aspect | Value |
|--------|-------|
| Language | TypeScript (ES2022, strict mode) |
| Module System | ESM (Node16) |
| Build Tool | `tsc` (no bundler) |
| Test Framework | Vitest 3.x (node environment) |
| Package Manager | pnpm 9.x workspaces |
| Target Package | `packages/agency-plugin-spec-kit` |
| Core Dependency | `@generacy-ai/agency` (workspace peer) |
| YAML Parser (tests) | `yaml@^2.8.2` (already in monorepo lockfile via core agency) |

## Architecture Overview

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── index.ts              # + re-export workflows module
│   ├── plugin.ts             # + workflow registration in initialize()
│   ├── workflows.ts          # NEW: BUILTIN_WORKFLOWS map, getBuiltinWorkflowPath(), resolveWorkflow()
│   └── ...existing...
├── workflows/                # NEW: canonical YAML files (non-compiled, shipped raw)
│   ├── speckit-feature.yaml  # copied from .generacy/speckit-feature.yaml
│   └── speckit-bugfix.yaml   # copied from .generacy/speckit-bugfix.yaml
├── tests/
│   └── workflows.test.ts     # NEW: workflow bundling and resolution tests
├── package.json              # + "workflows" in files array, + yaml devDependency
└── tsconfig.json             # unchanged (workflows/ is not TS source)
```

**Key architectural decisions:**
1. **`workflows/` sits alongside `src/`, not inside it** — YAML files aren't TypeScript source and shouldn't go through `tsc`. They ship as-is via the `files` array in package.json.
2. **Path resolution uses `import.meta.url`** — the standard ESM way to locate files relative to the current module. The project targets Node16 modules which fully supports this.
3. **Barrel export only (no subpath export)** — consistent with all other plugins in the monorepo. The `./workflows` subpath can be added later if tree-shaking becomes a real need.
4. **`resolveWorkflow()` is a standalone helper** — works immediately without the generacy engine, using `fs.existsSync` only at call time (not on import).

## Implementation Phases

### Phase 1: Add Workflow Files and Package Configuration

**Goal**: Bundle the canonical YAML files and ensure they're included in the published package.

**Files to create/modify:**

1. **Create `packages/agency-plugin-spec-kit/workflows/speckit-feature.yaml`**
   - Copy from `/workspaces/agency/.generacy/speckit-feature.yaml` (v1.3.0)
   - This becomes the single source of truth

2. **Create `packages/agency-plugin-spec-kit/workflows/speckit-bugfix.yaml`**
   - Copy from `/workspaces/agency/.generacy/speckit-bugfix.yaml` (v1.3.0)
   - This becomes the single source of truth

3. **Modify `packages/agency-plugin-spec-kit/package.json`**
   - Add `"workflows"` to the `files` array: `"files": ["dist", "workflows"]`
   - Add `yaml` as a devDependency: `"yaml": "^2.8.2"` (for test-time YAML parsing)

### Phase 2: Create Workflows Module

**Goal**: Export workflow paths and provide a `resolveWorkflow()` helper.

**Create `packages/agency-plugin-spec-kit/src/workflows.ts`:**

```typescript
/**
 * Bundled workflow management for the spec-kit plugin.
 *
 * Provides canonical workflow YAML files and a resolution helper that
 * checks for local overrides before falling back to bundled defaults.
 */

import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Names of bundled workflows */
export type BuiltinWorkflowName = 'speckit-feature' | 'speckit-bugfix';

/**
 * Map of bundled workflow names to their absolute file paths.
 *
 * Paths are resolved relative to the compiled module location.
 * The actual YAML files live in `../workflows/` relative to `dist/`.
 */
export const BUILTIN_WORKFLOWS: Record<BuiltinWorkflowName, string> = {
  'speckit-feature': resolve(__dirname, '../workflows/speckit-feature.yaml'),
  'speckit-bugfix': resolve(__dirname, '../workflows/speckit-bugfix.yaml'),
};

/**
 * Get the absolute path to a bundled workflow file.
 *
 * @param name - The workflow name
 * @returns The absolute path, or undefined if the name is not a known bundled workflow
 */
export function getBuiltinWorkflowPath(name: string): string | undefined {
  return BUILTIN_WORKFLOWS[name as BuiltinWorkflowName];
}

/**
 * Resolve a workflow by name, checking for a local override first.
 *
 * Resolution order:
 * 1. `<repoRoot>/.generacy/<name>.yaml` (local override)
 * 2. Bundled workflow from this package (fallback)
 *
 * @param name - Workflow name (e.g. 'speckit-feature')
 * @param repoRoot - Absolute path to the repository root
 * @returns The absolute path to the resolved workflow, or undefined if not found
 */
export function resolveWorkflow(name: string, repoRoot: string): string | undefined {
  // Check for local override
  const localPath = join(repoRoot, '.generacy', `${name}.yaml`);
  if (existsSync(localPath)) {
    return localPath;
  }

  // Fall back to bundled workflow
  return getBuiltinWorkflowPath(name);
}
```

### Phase 3: Wire Into Plugin Lifecycle

**Goal**: Register bundled workflows during plugin initialization (future-proofing for generacy engine).

**Modify `packages/agency-plugin-spec-kit/src/plugin.ts`:**

Add workflow registration at the end of `initialize()`:

```typescript
// At top of file, add import:
import { BUILTIN_WORKFLOWS } from './workflows.js';

// Inside initialize(), after tool registration:

    // Register bundled workflows with engine (when available)
    for (const [name, filePath] of Object.entries(BUILTIN_WORKFLOWS)) {
      try {
        (core as Record<string, unknown>).registerWorkflow?.(name, filePath, { priority: 'fallback' });
      } catch (error) {
        // Log and continue — workflow registration is supplementary to core plugin functionality
        core.recordEvent({
          type: 'plugin.workflow.registration_failed',
          data: { workflow: name, error: String(error) },
        });
      }
    }
```

**Note on `registerWorkflow` call**: `AgencyCoreAPI` does not currently have a `registerWorkflow()` method. The optional-chaining approach `(core as Record<string, unknown>).registerWorkflow?.()` ensures this is a no-op today. When the companion generacy issue (#211) lands and adds the method, this code becomes a live integration point without requiring a spec-kit plugin update.

### Phase 4: Update Barrel Export

**Goal**: Re-export workflow utilities from the package entry point.

**Modify `packages/agency-plugin-spec-kit/src/index.ts`:**

Add a new section after the existing exports:

```typescript
// ============================================================================
// Workflows - Bundled canonical workflow files
// ============================================================================

export {
  BUILTIN_WORKFLOWS,
  getBuiltinWorkflowPath,
  resolveWorkflow,
} from './workflows.js';

export type { BuiltinWorkflowName } from './workflows.js';
```

### Phase 5: Add Tests

**Goal**: Validate workflow files exist, are valid YAML, match expected schema (one level deep), and resolution logic works correctly.

**Create `packages/agency-plugin-spec-kit/tests/workflows.test.ts`:**

Tests to implement:

1. **Bundled file existence**
   - `BUILTIN_WORKFLOWS` paths point to files that exist on disk
   - Both `speckit-feature` and `speckit-bugfix` entries are present

2. **YAML validity and schema (one level deep)**
   - Each file parses as valid YAML
   - Top-level fields: `name` (string), `version` (string), `inputs` (array), `phases` (array)
   - Each phase has `name` (string) and `steps` (array)
   - Each step has `name` (string) and `uses` (string)
   - Each input has `name` (string) and `description` (string)

3. **`getBuiltinWorkflowPath()`**
   - Returns a string for known workflow names
   - Returns `undefined` for unknown names

4. **`resolveWorkflow()`**
   - Returns local override path when `.generacy/<name>.yaml` exists
   - Falls back to bundled path when no local override exists
   - Returns `undefined` for unknown names with no local override

5. **Plugin initialization (workflow registration)**
   - `initialize()` does not throw when `core.registerWorkflow` does not exist
   - `initialize()` calls `core.registerWorkflow` for each workflow if method exists
   - `initialize()` logs warning and continues when registration throws

### Phase 6: Update README

**Goal**: Document the bundled workflow system, override mechanism, and migration steps.

**Modify `packages/agency-plugin-spec-kit/README.md`** (or create if absent):

Add a "Workflow Management" section explaining:
- What bundled workflows are and why they exist
- How local overrides work (`.generacy/<name>.yaml` takes priority)
- Migration steps: delete local `.generacy/speckit-*.yaml` files to use bundled defaults
- How to check which version is bundled: look at `version` field in the YAML

## API Contract

### Exported Functions

```typescript
// Get path to a bundled workflow by name
function getBuiltinWorkflowPath(name: string): string | undefined;

// Resolve workflow with local-first override
function resolveWorkflow(name: string, repoRoot: string): string | undefined;
```

### Exported Constants

```typescript
// Map of workflow names to absolute file paths
const BUILTIN_WORKFLOWS: Record<BuiltinWorkflowName, string>;
```

### Exported Types

```typescript
type BuiltinWorkflowName = 'speckit-feature' | 'speckit-bugfix';
```

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `workflows/` placement | Alongside `src/`, not inside | YAML files are not TypeScript; `tsc` should not process them. They ship raw via `files` array. |
| Path resolution | `import.meta.url` + `fileURLToPath` | Standard ESM pattern. Project targets Node16 modules which fully supports `import.meta.url`. |
| Export strategy | Barrel only (no subpath) | No other plugin uses subpath exports beyond `./package.json`. Keeps consistency. |
| Runtime validation | Static paths only | Publish correctness is verified by tests. Runtime `fs.existsSync` only in `resolveWorkflow()` at call time, not on import. |
| `registerWorkflow` call | Optional-chained cast to `Record<string, unknown>` | API doesn't exist yet. No-op today; becomes live when generacy engine ships. |
| Registration error handling | Log via `recordEvent` and continue | Plugin's primary value is its 11 tools. Workflow registration is supplementary. |
| YAML test parser | `yaml@^2.8.2` as devDependency | Already in monorepo lockfile via core agency package. Consistent API. |
| Schema validation depth | One level deep | Catches structural errors (phases have steps, steps have `uses`) without being brittle to step-level `with`/`output` changes. |
| Version drift detection | Out of scope | Deferred to companion generacy issue (#211) which owns the resolution engine. |

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `workflows/` not included in published package | Low | High | Test verifies `BUILTIN_WORKFLOWS` paths exist on disk. CI catches missing files pre-publish. |
| `import.meta.url` path resolution breaks in different environments | Low | High | Well-established ESM pattern; all existing code targets Node16 modules. Test verifies paths resolve correctly. |
| Workflow YAML schema changes break tests | Medium | Low | Tests validate one level deep only — not brittle to `with`/`output` field changes within steps. |
| `core.registerWorkflow?.()` call causes type errors | Low | Medium | Cast to `Record<string, unknown>` before optional chaining bypasses TypeScript type checking for the non-existent method. |
| Consumer repos confused about local vs bundled workflows | Medium | Low | README "Workflow Management" section explains override mechanism and migration steps. |

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `workflows/speckit-feature.yaml` | **Create** | Copy canonical feature workflow (v1.3.0) |
| `workflows/speckit-bugfix.yaml` | **Create** | Copy canonical bugfix workflow (v1.3.0) |
| `src/workflows.ts` | **Create** | `BUILTIN_WORKFLOWS`, `getBuiltinWorkflowPath()`, `resolveWorkflow()` |
| `tests/workflows.test.ts` | **Create** | Workflow file existence, schema validation, resolution tests |
| `package.json` | **Modify** | Add `"workflows"` to `files`, add `yaml` devDependency |
| `src/index.ts` | **Modify** | Re-export workflows module |
| `src/plugin.ts` | **Modify** | Add workflow registration in `initialize()` |
| `README.md` | **Create/Modify** | Add "Workflow Management" section |

## Verification

After implementation, verify:

1. `pnpm build` succeeds — TypeScript compiles without errors
2. `pnpm test` passes — all existing + new tests green
3. `pnpm pack --dry-run` output includes `workflows/*.yaml` files
4. Importing `{ BUILTIN_WORKFLOWS, resolveWorkflow }` from the package works
5. `resolveWorkflow('speckit-feature', '/some/repo')` returns the bundled path when no local override exists
