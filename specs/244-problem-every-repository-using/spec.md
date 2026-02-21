# Feature Specification: Bundle Default Speckit Workflows in agency-plugin-spec-kit

**Branch**: `244-problem-every-repository-using` | **Date**: 2026-02-21 | **Status**: Draft

## Summary

Every repository using speckit workflows currently maintains its own copies of `speckit-feature.yaml` and `speckit-bugfix.yaml` in `.generacy/`. Across 7+ repos, these files drift out of sync (three different versions — v1.0.0, v1.1.0, and v1.2.0 — were found in the wild). Any workflow improvement requires manually updating every repo.

This feature bundles canonical workflow YAML files inside the `@generacy-ai/agency-plugin-spec-kit` package so they ship automatically with plugin updates. Repos that don't need customization can delete their local copies entirely. Repos that do need customization retain full override capability via their `.generacy/` directory.

The design follows the same "bundled default with local override" pattern already established by the spec-kit template system (`src/templates/index.ts`), where custom templates in `.specify/templates/` take precedence over embedded defaults.

## User Stories

### US1: Automatic Workflow Updates

**As a** developer maintaining multiple repositories that use speckit workflows,
**I want** canonical workflow definitions bundled in the spec-kit plugin package,
**So that** workflow improvements ship automatically via plugin updates without manually copying YAML files across repos.

**Acceptance Criteria**:
- [ ] The `@generacy-ai/agency-plugin-spec-kit` package includes `workflows/speckit-feature.yaml` and `workflows/speckit-bugfix.yaml`
- [ ] The workflow files are included in the published npm package (listed in `package.json` `files`)
- [ ] Upgrading the plugin version in a consumer repo picks up new workflow definitions without manual file copies

### US2: Local Workflow Override

**As a** developer with repo-specific workflow needs,
**I want** local `.generacy/speckit-*.yaml` files to take precedence over bundled defaults,
**So that** I can customize workflows per-repo without losing the benefits of bundled defaults elsewhere.

**Acceptance Criteria**:
- [ ] When a `.generacy/speckit-feature.yaml` exists locally, the bundled version is ignored for that workflow
- [ ] When no local override exists, the bundled version is used as a fallback
- [ ] Removing a local override file causes the system to fall back to the bundled version seamlessly

### US3: Programmatic Workflow Access

**As a** developer building tooling on top of spec-kit,
**I want** bundled workflow file paths exported from the package,
**So that** I can programmatically locate and read canonical workflow definitions.

**Acceptance Criteria**:
- [ ] `BUILTIN_WORKFLOWS` map is exported from the package with paths to both YAML files
- [ ] Paths resolve correctly regardless of the consuming project's directory structure
- [ ] TypeScript types are exported for the workflow map

### US4: Workflow Validity Assurance

**As a** contributor to the spec-kit plugin,
**I want** automated tests that validate bundled workflow YAML files,
**So that** broken workflows are caught before they ship to all consumer repos.

**Acceptance Criteria**:
- [ ] Unit tests verify both YAML files parse without errors
- [ ] Unit tests verify workflows contain required fields (`name`, `version`, `phases`, `inputs`)
- [ ] Tests run as part of the standard `pnpm test` pipeline

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Add `workflows/` directory to `packages/agency-plugin-spec-kit/` containing `speckit-feature.yaml` and `speckit-bugfix.yaml` | P1 | Copy from current `.generacy/` as canonical v1.3.0 source |
| FR-002 | Create `src/workflows.ts` exporting `BUILTIN_WORKFLOWS` map with resolved absolute paths to each bundled YAML file | P1 | Use `import.meta.url` + `fileURLToPath` pattern for ESM compatibility |
| FR-003 | Re-export `BUILTIN_WORKFLOWS` and related types from `src/index.ts` barrel | P1 | Maintains existing export convention |
| FR-004 | Add `"workflows"` to `package.json` `files` array alongside `"dist"` | P1 | Ensures YAML files are included in npm publish |
| FR-005 | Add `"./workflows"` subpath export to `package.json` `exports` field | P2 | Allows `import { BUILTIN_WORKFLOWS } from '@generacy-ai/agency-plugin-spec-kit/workflows'` |
| FR-006 | Register bundled workflows with the generacy workflow resolver during plugin `initialize()` | P1 | Uses `core.registerWorkflow()` or equivalent API (companion generacy issue) |
| FR-007 | Workflow resolver uses local `.generacy/` files first, falling back to plugin-bundled workflows | P1 | Depends on companion generacy repo changes |
| FR-008 | Add unit tests validating YAML structure and required schema fields for both workflow files | P1 | Use `yaml` package (or lightweight parser) in test |
| FR-009 | Add unit test verifying `BUILTIN_WORKFLOWS` paths resolve to existing files | P1 | `fs.existsSync` check on each path |
| FR-010 | Export a `getBuiltinWorkflowPath(name: string)` helper for safe lookup with type narrowing | P2 | Returns `string | undefined` for unknown workflow names |

## Technical Design

### Directory Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── workflows.ts          # NEW: BUILTIN_WORKFLOWS export + helper
│   ├── index.ts              # MODIFIED: re-export workflows
│   └── plugin.ts             # MODIFIED: register workflows on initialize
├── workflows/
│   ├── speckit-feature.yaml  # NEW: canonical feature workflow (v1.3.0)
│   └── speckit-bugfix.yaml   # NEW: canonical bugfix workflow (v1.3.0)
├── tests/
│   └── workflows.test.ts     # NEW: workflow validation tests
└── package.json              # MODIFIED: files, exports
```

### New Module: `src/workflows.ts`

```typescript
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Names of bundled workflows */
export type BuiltinWorkflowName = 'speckit-feature' | 'speckit-bugfix';

/** Map of bundled workflow names to their absolute file paths */
export const BUILTIN_WORKFLOWS: Record<BuiltinWorkflowName, string> = {
  'speckit-feature': resolve(__dirname, '../workflows/speckit-feature.yaml'),
  'speckit-bugfix': resolve(__dirname, '../workflows/speckit-bugfix.yaml'),
};

/**
 * Get the absolute path to a bundled workflow file.
 * Returns undefined if the name is not a known bundled workflow.
 */
export function getBuiltinWorkflowPath(name: string): string | undefined {
  return BUILTIN_WORKFLOWS[name as BuiltinWorkflowName];
}
```

### Package.json Changes

```jsonc
{
  "files": ["dist", "workflows"],
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./workflows": { "import": "./dist/workflows.js", "types": "./dist/workflows.d.ts" },
    "./package.json": "./package.json"
  }
}
```

### Plugin Registration (in `plugin.ts` `initialize()`)

```typescript
// Register bundled workflows as fallbacks
import { BUILTIN_WORKFLOWS } from './workflows.js';

for (const [name, path] of Object.entries(BUILTIN_WORKFLOWS)) {
  core.registerWorkflow?.(name, path, { priority: 'fallback' });
}
```

Note: `core.registerWorkflow()` is part of the companion generacy issue. If the API is not yet available, registration is skipped gracefully via optional chaining.

### Resolution Precedence (companion generacy issue)

1. **Local** `.generacy/speckit-feature.yaml` (highest priority — repo-specific override)
2. **Plugin-bundled** `workflows/speckit-feature.yaml` (fallback from spec-kit package)

This mirrors the existing template resolution in `src/templates/index.ts:resolveTemplate()`.

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Workflow version consistency | All consumer repos use same workflow version after upgrade | Compare `version` field in resolved workflow YAML across repos |
| SC-002 | Repo-local workflow file count | 0 local `.generacy/speckit-*.yaml` files in repos that don't customize | `find` across repos after migration |
| SC-003 | Test coverage | Both bundled YAML files validated by automated tests | `pnpm test` in spec-kit package passes with workflow tests |
| SC-004 | Publish correctness | `workflows/` directory present in published package | `npm pack --dry-run` includes workflow files |

## Assumptions

- The companion generacy repo issue will provide a workflow resolution API (e.g., `core.registerWorkflow()`) or equivalent mechanism for plugins to register fallback workflows. If this API is delayed, the bundled files and exports are still useful — consumers can read paths directly.
- The current v1.3.0 workflow YAML files in `.generacy/` are the canonical source of truth and should be copied as-is into the plugin package.
- The `yaml` package (or equivalent) will be available as a dev dependency for test-time YAML parsing. It is not needed at runtime — the generacy engine handles YAML parsing.
- All consumer repos use the spec-kit plugin via pnpm workspace or npm dependency, meaning the `workflows/` directory will be accessible via `node_modules` at runtime.
- The `import.meta.url` pattern for ESM path resolution works in all supported Node.js versions (18+).

## Out of Scope

- **Workflow inheritance/composition engine**: Merging base workflows with local overrides at the field level (e.g., adding a step to a phase) is a separate generacy-engine concern, not part of this feature.
- **Workflow versioning UI**: No user-facing mechanism to select which workflow version to use. Override is binary: local file exists or it doesn't.
- **Auto-migration tooling**: No automated script to detect and remove stale `.generacy/speckit-*.yaml` files from consumer repos. This will be a manual cleanup step documented in release notes.
- **Additional workflow types**: This feature only bundles `speckit-feature` and `speckit-bugfix`. Other workflow types (e.g., epic, hotfix) are future work.
- **Runtime YAML parsing in the plugin**: The plugin exports file paths, not parsed workflow objects. Parsing is the generacy engine's responsibility.
- **Generacy engine workflow resolver implementation**: The resolution logic (local-first, plugin-fallback) lives in the generacy repo. This feature only provides the bundled files and registration call.

---

*Generated by speckit*
