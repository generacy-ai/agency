# Clarification Questions

## Status: Resolved

## Questions

### Q1: Workflow Resolution Ownership
**Context**: FR-006 and FR-007 describe registering bundled workflows with the generacy workflow resolver and implementing local-first resolution. However, `AgencyCoreAPI` has no `registerWorkflow()` method today, and the spec references a "companion generacy issue" for the resolution logic. This creates ambiguity about what this feature actually delivers versus what is deferred.
**Question**: Should this feature implement any workflow resolution logic within the spec-kit plugin itself (e.g., a `resolveWorkflow()` function that checks `.generacy/` then falls back to bundled paths), or should it strictly only bundle the files and export paths — deferring all resolution to the companion generacy issue?
**Options**:
- A) Bundle + resolve in plugin: Add a `resolveWorkflow(name, repoRoot)` function in the plugin that checks `.generacy/<name>.yaml` first, then falls back to the bundled path. This makes the feature self-contained and useful immediately even without the generacy engine changes.
- B) Bundle + export only: Only bundle the YAML files and export `BUILTIN_WORKFLOWS` paths. All resolution logic (local override, fallback) is deferred entirely to the companion generacy issue. The plugin's `initialize()` includes the optional-chained `core.registerWorkflow?.()` call but it's a no-op until the engine API exists.
- C) Bundle + resolve + register: Implement both a standalone `resolveWorkflow()` helper and the `core.registerWorkflow?.()` call, so the plugin works immediately for direct consumers and will also integrate with the engine when ready.
**Answer**: **Option C (Bundle + resolve + register)**. `AgencyCoreAPI` currently has no `registerWorkflow()` method, and the companion generacy issue (#211) won't land simultaneously. Shipping a standalone `resolveWorkflow(name, repoRoot)` helper makes this feature immediately useful — consumers can resolve workflows without waiting for the engine. The optional-chained `core.registerWorkflow?.()` call costs nothing now and becomes a live integration point when the engine API ships. This avoids a dead period where workflows are bundled but not usable.

### Q2: Workflow YAML Schema Validation Depth
**Context**: US4/FR-008 require tests that validate "required fields" in the bundled YAML, listing `name`, `version`, `phases`, and `inputs`. The actual workflow files have rich structure — phases contain steps with `uses`, `with`, and `output` fields; inputs have `required` and `description` properties. The appropriate validation depth affects test maintenance burden and defect coverage.
**Question**: How deeply should the unit tests validate workflow YAML structure?
**Options**:
- A) Top-level only: Verify `name`, `version`, `phases` (is array/object), and `inputs` (is object) exist. Minimal maintenance, catches gross corruption.
- B) One level deeper: Also verify each phase has `name` and `steps`, each step has `uses`, and each input has `description`. Catches structural errors without being brittle to step-level changes.
- C) Full schema validation: Define a Zod/JSON schema for the complete workflow format and validate exhaustively. Maximum coverage but tightly couples tests to workflow structure, increasing maintenance cost.
**Answer**: **Option B (One level deeper)**. Top-level only (A) would miss common structural problems like a phase missing `steps` or a step missing `uses`. Full schema validation (C) tightly couples tests to every field in the workflow YAML, creating churn whenever workflow structure evolves. One level deeper catches meaningful structural errors (phases have steps, steps have `uses`, inputs have `description`) without being brittle to step-level changes in `with`/`output` fields.

### Q3: `yaml` Dev Dependency Choice
**Context**: The spec assumes a `yaml` package will be used for test-time YAML parsing but doesn't specify which one. The core agency package already depends on `yaml` (the `yaml` npm package, formerly `yaml@2`). Using the same package avoids version conflicts, but since it's only for tests, a lighter alternative could work.
**Question**: Which YAML parsing package should be added as a dev dependency for workflow tests?
**Options**:
- A) `yaml` (same as core agency): Consistent with the monorepo, well-maintained, full YAML 1.2 support. Already resolved in the pnpm lockfile.
- B) `js-yaml`: Popular alternative, slightly different API. Adds a new dependency to the lockfile.
**Answer**: **Option A (`yaml`, same as core agency)**. The core agency package already depends on `yaml@^2.8.2` — it's in the pnpm lockfile and well-understood in this monorepo. Introducing `js-yaml` would add a second YAML library with a different API, creating unnecessary inconsistency. Since this is test-only usage, the dependency weight is irrelevant.

### Q4: Subpath Export Necessity
**Context**: FR-005 adds a `./workflows` subpath export so consumers can `import { BUILTIN_WORKFLOWS } from '@generacy-ai/agency-plugin-spec-kit/workflows'`. However, the main barrel (`src/index.ts`) already re-exports everything per FR-003. The subpath export creates a second entry point to maintain and test.
**Question**: Is the `./workflows` subpath export needed, or is the barrel re-export from the main entry point sufficient?
**Options**:
- A) Both: Keep the subpath export for tree-shaking and explicit imports, plus the barrel re-export for convenience. Matches common package conventions.
- B) Barrel only: Re-export from `src/index.ts` only. Simpler, one entry point. Consumers who only want workflows still import from the main entry.
- C) Subpath only: Export workflows only from the subpath, not the barrel. Keeps the main entry point focused on plugin API.
**Answer**: **Option B (Barrel only)**. No other plugin in the monorepo uses subpath exports beyond `./package.json`. The barrel at `src/index.ts` already re-exports everything per FR-003. Adding a `./workflows` subpath creates a second entry point to maintain, build, and test — for an internal monorepo package with a small consumer base, the tree-shaking benefit doesn't justify the maintenance cost. If tree-shaking becomes a real need later, the subpath export can be added without breaking consumers.

### Q5: Handling Corrupted or Missing Bundled Workflow Files at Runtime
**Context**: `BUILTIN_WORKFLOWS` exports absolute paths resolved at module load time via `import.meta.url`. If the `workflows/` directory is missing from the installed package (e.g., due to a bad publish or pnpm store corruption), consumers get paths to non-existent files with no error until they try to read them. The spec doesn't address runtime file-existence checks.
**Question**: Should `getBuiltinWorkflowPath()` or module initialization validate that the bundled YAML files actually exist on disk, or is static path export sufficient?
**Options**:
- A) Static paths only: Export paths as-is. If files are missing, consumers get a file-not-found error when they try to read. Simpler, and the "publish correctness" test (SC-004) catches this pre-publish.
- B) Lazy validation: `getBuiltinWorkflowPath()` checks `fs.existsSync()` and returns `undefined` if the file doesn't exist, giving callers a clean signal. Small runtime cost.
- C) Eager validation: On module import, verify all bundled files exist and throw/warn if any are missing. Fails fast but adds startup overhead and side effects on import.
**Answer**: **Option A (Static paths only)**. The publish correctness test (SC-004) catches missing files before they reach consumers. Adding runtime `fs.existsSync()` checks introduces I/O on every call (Option B) or side effects on import (Option C) for a failure mode that should never occur in a correctly published package. A standard file-not-found error is already a clear signal.

### Q6: Workflow Version Synchronization Strategy
**Context**: SC-001 targets "all consumer repos use same workflow version after upgrade." However, the spec doesn't define how to detect or communicate version drift. When a consumer repo has a local `.generacy/speckit-feature.yaml` override at v1.2.0 and the bundled version is v1.3.0, there's no mechanism to warn the user that their override is outdated.
**Question**: Should the plugin detect and warn when a local workflow override has a different `version` field than the bundled default?
**Options**:
- A) No detection: Local overrides are fully the user's responsibility. The plugin has no opinion on override versions.
- B) Log a warning: During `initialize()`, if local overrides exist, compare version fields and log a warning (e.g., "Local speckit-feature.yaml is v1.2.0, bundled is v1.3.0"). Informational only, no blocking.
- C) Out of scope: Explicitly defer this to the companion generacy issue or future work, and document it as such.
**Answer**: **Option C (Out of scope)**. Version drift detection between local overrides and bundled defaults is squarely in the domain of the companion generacy issue (#211), which handles the resolution engine and workflow inheritance. Implementing partial version checking here would create logic that either gets duplicated or conflicts with the engine's approach. Explicitly deferring and documenting it as future work signals that the concern was considered.

### Q7: Plugin `initialize()` Error Handling for Registration
**Context**: The spec shows `core.registerWorkflow?.(name, path, { priority: 'fallback' })` with optional chaining. But there are more failure modes than just a missing method — the method could exist but throw (e.g., duplicate registration, invalid path). The spec doesn't specify whether registration errors should be fatal (fail plugin init), logged and swallowed, or silently ignored.
**Question**: How should errors from `core.registerWorkflow()` calls be handled during plugin initialization?
**Options**:
- A) Swallow silently: Wrap in try/catch, ignore errors. Workflow registration is non-critical; the plugin's primary value is its tools.
- B) Log and continue: Wrap in try/catch, log a warning, continue initialization. Users see the issue but aren't blocked.
- C) Fail initialization: Let errors propagate. If workflow registration fails, something is wrong and the plugin should not proceed.
**Answer**: **Option B (Log and continue)**. The plugin's primary value is its tools (the 11 spec-kit tools), not workflow registration. Silent swallowing (A) hides real issues like duplicate registration or invalid paths. Failing initialization (C) blocks the entire plugin over a supplementary feature. Logging a warning gives visibility without degrading the plugin's core functionality.

### Q8: Consumer Repo Migration Guidance
**Context**: The spec explicitly puts "auto-migration tooling" out of scope and says manual cleanup will be "documented in release notes." However, there's no detail on what that documentation should say — especially for the transition period where some repos have local files and some don't, and the generacy engine may or may not have the resolution API yet.
**Question**: Should this feature include a migration guide (e.g., in the package README or a MIGRATION.md) explaining how consumer repos should remove their local `.generacy/speckit-*.yaml` files, or is a brief release note sufficient?
**Options**:
- A) Release note only: A few sentences in the changelog/release notes explaining that local workflow files can be removed.
- B) README section: Add a "Workflow Management" section to the package README explaining the bundled workflow system, override mechanism, and migration steps.
- C) Separate migration doc: Create a `MIGRATION.md` with step-by-step instructions, including how to verify the bundled workflows are being used correctly.
**Answer**: **Option B (README section)**. A release note (A) is ephemeral — new consumers won't see it, and existing consumers may miss it. A separate `MIGRATION.md` (C) is overkill for what amounts to "you can now delete your local `.generacy/speckit-*.yaml` files." A README section titled "Workflow Management" is discoverable, lives with the package, and can explain the bundled workflow system, override mechanism, and cleanup steps in a few paragraphs.
