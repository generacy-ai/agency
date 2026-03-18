# Clarifications: Update canonical workflow templates to use build.validate

## Batch 1 — 2026-03-18

### Q1: Test Script Discovery Gap
**Context**: The `build.validate` tool (from #323) auto-discovers `lint`, `format:check`, and `typecheck` scripts — but **not `test`**. The current workflow runs both `pnpm run test` and `pnpm run lint`. The spec (FR-005) states "build.validate should replace both test and lint steps (single step replaces two)" and assumes "build.validate discovers and runs test + lint scripts automatically." This assumption is incorrect based on the actual implementation.
**Question**: How should test execution be handled in the verification phase?
**Options**:
- A: Use `build.validate` with explicit `scripts: ['test', 'lint']` parameter to override auto-discovery and include test
- B: Keep a separate test step (e.g., `test.run-unit` or `verification.check` with detected PM) alongside `build.validate` for lint/typecheck
- C: Add `test` to `build.validate`'s default candidates in the npm plugin (scope change to #323)

**Answer**: B — Keep test as a separate step. Tests are fundamentally different from static validation: longer-running, may need specific environments (databases, emulators), different failure semantics. `build.validate` was designed for static quality checks (lint, format, typecheck). The verification phase should have two steps: the existing test step, and `build.validate` replacing the hardcoded `pnpm run lint`.

### Q2: Expanded Validation Scope
**Context**: The current verification phase runs exactly 2 scripts: `test` and `lint`. The `build.validate` tool auto-discovers up to 3 additional script types (`format:check`, `typecheck`, plus format fallback). Replacing the current steps with `build.validate` would expand the verification scope — repos with `format:check` or `typecheck` scripts would now have those run automatically during workflow verification.
**Question**: Is the expanded validation scope (discovering format:check and typecheck beyond the current test+lint) intentional and desired, or should the replacement be scoped to only what was there before?
**Options**:
- A: Expanded scope is desired — discover and run all available quality scripts (lint, format:check, typecheck)
- B: Constrain to current scope — use `scripts` parameter to limit to only test and lint

**Answer**: A — Expanded scope is desired. This is the whole point. The original problem was that `format:check` was configured in projects but never caught during verification. Discovery-based validation means if a project configures it, it gets run.

### Q3: Cross-Plugin Tool Dependency
**Context**: The workflow templates live in `agency-plugin-spec-kit` but `build.validate` is provided by `agency-plugin-npm`. Currently, `verification.check` is referenced in the workflows without any explicit plugin dependency declaration. If `agency-plugin-npm` is not loaded in a given environment, `build.validate` would be unavailable.
**Question**: Is the cross-plugin dependency acceptable (i.e., is `agency-plugin-npm` always expected to be loaded alongside spec-kit), or does the workflow engine handle tool resolution across plugins transparently?
**Options**:
- A: Cross-plugin reference is fine — both plugins are always loaded together in practice
- B: The workflow engine resolves tools from any loaded plugin, so no explicit dependency needed
- C: We need to add a dependency declaration from spec-kit to npm plugin

**Answer**: B — The workflow engine resolves tools from any loaded plugin. The current `verification.check` references aren't plugin-scoped either. Tool resolution happens at the engine level across all loaded plugins.
