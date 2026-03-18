# Feature Specification: Add discovery-based build.validate tool to npm plugin

**Branch**: `323-problem-agency-npm-plugin` | **Date**: 2026-03-18 | **Status**: Draft

## Summary

Add a `build.validate` tool to `agency-plugin-npm` that automatically discovers and runs all configured validation scripts (lint, format check, typecheck) from a project's `package.json`. This replaces the current approach where consumers must manually enumerate validation steps, which leads to gaps — most notably, format checking is never run during verification, causing PRs to fail CI after the fact.

## Problem

The Agency npm plugin provides individual `build.lint` and `build.format` tools, but there is no unified validation tool that **discovers** what validations a project has configured and runs them automatically. Consumers (e.g., Generacy workflows) must manually enumerate which validation steps to call, which leads to gaps — most notably, `format:check` is never run during the verification phase, causing PRs to fail CI format checks after the fact.

The tools are used by developers across different projects, so validation must be **discovery-based** — it should detect what's configured, not assume or require specific tooling.

## Proposed Solution

### 1. Add `build.validate` tool

A new tool in `agency-plugin-npm` that:

- Reads `package.json` to discover available validation-related scripts
- Auto-detects the package manager (npm/yarn/pnpm) via existing lockfile detection
- Runs each discovered validation script in check/read-only mode
- Reports aggregated pass/fail results per script

**Discovery candidates** (configurable, with sensible defaults):
- `validate` — if present, run it as the single validation entry point and skip individual discovery
- `lint` — run as-is
- `format:check` — run as-is
- `format` — run with `--check` flag appended (fallback if `format:check` doesn't exist)
- `typecheck` — run as-is

**Schema:**
```typescript
ValidateSchema = BaseParamsSchema.extend({
  /** Override which scripts to discover/run */
  scripts: z.array(z.string()).optional(),
})
```

**Behavior:**
- Scripts that don't exist in package.json are silently skipped (not errors)
- All discovered scripts run regardless of individual failures (collect all results)
- Output summarizes: which validations ran, which passed, which failed, with failure details
- Exit as error if any validation failed

### 2. Add `review` mode to `build.format`

Currently `build.format` has `modes: ['default', 'coding']` while `build.lint` includes `'review'`. Format checking is equally relevant during review. Add `'review'` to the format tool's modes array.

### 3. Register `build.validate` in manifest

- Add `'build.validate'` to `manifest.tools` array
- Add to `modeAffiliations` for `coding` and `review` modes
- Update `createTools()` in `tools/index.ts`

## Files to modify

- `packages/agency-plugin-npm/src/tools/build/validate.ts` — new file
- `packages/agency-plugin-npm/src/tools/schemas.ts` — add `ValidateSchema`
- `packages/agency-plugin-npm/src/tools/index.ts` — register new tool
- `packages/agency-plugin-npm/src/manifest.ts` — add to tools list and mode affiliations
- `packages/agency-plugin-npm/src/tools/build/format.ts` — add `'review'` to modes
- `packages/agency-plugin-npm/src/config.ts` — add `validate` script config entry
- `packages/agency-plugin-npm/tests/tools/build.test.ts` — add tests

## Context

The Generacy workflow verification phase (`speckit-feature.yaml`, `speckit-bugfix.yaml`) currently hardcodes `pnpm run test` and `pnpm run lint`. This misses format validation and assumes pnpm. A `build.validate` tool would let workflows delegate validation discovery to Agency, which already has the PM detection and script validation infrastructure.

## User Stories

### US1: Unified project validation

**As a** developer or automated workflow using Agency tools,
**I want** a single `build.validate` tool that automatically discovers and runs all configured validation scripts,
**So that** I don't have to manually enumerate each validation step and risk missing checks (like format verification) that cause CI failures.

**Acceptance Criteria**:
- [ ] `build.validate` reads `package.json` scripts to discover available validations
- [ ] Auto-detects the package manager via existing lockfile detection
- [ ] Runs all discovered scripts and reports aggregated pass/fail results
- [ ] Scripts not present in `package.json` are silently skipped
- [ ] If a `validate` script exists, it is used as the sole entry point (skips individual discovery)
- [ ] Supports optional `scripts` parameter to override default discovery

### US2: Format checking during review mode

**As a** developer reviewing code through Agency's review mode,
**I want** format checking to be available during review,
**So that** formatting issues are caught at review time rather than failing CI later.

**Acceptance Criteria**:
- [ ] `build.format` tool includes `'review'` in its modes array
- [ ] Format tool is invocable during review mode workflows

### US3: Validation tool registered in plugin manifest

**As a** consumer of the Agency npm plugin,
**I want** `build.validate` to be properly registered and available in `coding` and `review` modes,
**So that** it is discoverable and usable through standard Agency tool interfaces.

**Acceptance Criteria**:
- [ ] `build.validate` appears in `manifest.tools`
- [ ] `build.validate` is affiliated with `coding` and `review` modes in `modeAffiliations`
- [ ] `createTools()` includes the validate tool

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Discover validation scripts from `package.json` | P1 | Default candidates: validate, lint, format:check, format, typecheck |
| FR-002 | Auto-detect package manager via lockfile | P1 | Reuse existing PM detection infrastructure |
| FR-003 | Run all discovered scripts, collecting all results | P1 | Don't short-circuit on first failure |
| FR-004 | Short-circuit on `validate` script if present | P1 | Skip individual discovery when unified script exists |
| FR-005 | Append `--check` flag to `format` script when `format:check` is absent | P1 | Ensures format runs in read-only mode |
| FR-006 | Accept optional `scripts` override parameter | P2 | Allows consumers to customize which scripts to run |
| FR-007 | Report aggregated results with per-script pass/fail and failure details | P1 | Clear summary output |
| FR-008 | Return error status if any validation failed | P1 | Enables workflow gating on validation results |
| FR-009 | Add `'review'` mode to `build.format` tool | P1 | Parity with `build.lint` review mode |
| FR-010 | Register `build.validate` in manifest for `coding` and `review` modes | P1 | Plugin discovery and mode affiliation |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | All existing validation scripts discovered | 100% of configured scripts detected | Run against projects with various script combinations |
| SC-002 | Format check no longer missed in verification | 0 CI format failures after validate pass | Run `build.validate` in verification workflow |
| SC-003 | Graceful handling of missing scripts | No errors for unconfigured candidates | Test with minimal `package.json` |
| SC-004 | All tests pass | 100% | `pnpm test` in agency-plugin-npm package |

## Assumptions

- Projects using Agency npm plugin have a `package.json` with standard script naming conventions
- The existing package manager detection logic in the plugin is reliable and reusable
- Validation scripts are idempotent and safe to run in read-only/check mode
- The `--check` flag is a widely supported convention for format tools (Prettier, Biome, etc.)

## Out of Scope

- Running test suites (handled by existing `build.test` tool)
- Auto-fixing lint or format issues (this tool is check-only)
- Workspace/monorepo-aware validation (runs against the target project's `package.json` only)
- Custom validation script configuration beyond the `scripts` override parameter
- Updating Generacy workflow YAML files to use `build.validate` (separate task)

---

*Generated by speckit*
