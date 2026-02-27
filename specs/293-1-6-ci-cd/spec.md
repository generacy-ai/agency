# Feature Specification: 1.6 — CI/CD for Agency VS Code Extension

**Branch**: `293-1-6-ci-cd` | **Date**: 2026-02-27 | **Status**: Draft

## Summary

Implement CI/CD automation to build, package, and publish the Agency VS Code extension (`generacy-ai.agency`) to the VS Code Marketplace via GitHub Actions. The pipeline integrates into the existing CI infrastructure, adding extension-specific publishing for both preview (pre-release) and stable release streams. On merge to `develop`, the extension auto-publishes as a VS Code pre-release; on merge to `main`, it publishes as a stable release. This makes the extension discoverable and installable directly from the VS Code Marketplace.

### Dependencies

- **generacy-ai/generacy#244**: Register VS Code Marketplace publisher (`generacy-ai`)
- **generacy-ai/agency#294**: Agency VS Code extension MVP (the extension must exist before it can be published)

### Plan Reference

[onboarding-buildout-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/onboarding-buildout-plan.md) — Issue 1.6

---

## User Stories

### US1: Automated Preview Publishing

**As a** developer on the Agency team,
**I want** the VS Code extension to automatically publish as a pre-release to the Marketplace when code merges to `develop`,
**So that** testers and early adopters can install the latest preview directly from VS Code without manual packaging.

**Acceptance Criteria**:
- [ ] Merging a PR to `develop` triggers extension publishing after CI passes
- [ ] The extension is published with the `--pre-release` flag via `vsce`
- [ ] The Marketplace listing clearly indicates pre-release status
- [ ] Publishing only occurs after lint, typecheck, test, and build jobs succeed
- [ ] A failed publish does not block the CI summary status check

### US2: Automated Stable Release Publishing

**As a** developer on the Agency team,
**I want** the VS Code extension to automatically publish as a stable release when code merges to `main`,
**So that** end users receive production-quality updates through the normal VS Code update mechanism.

**Acceptance Criteria**:
- [ ] Merging to `main` triggers a stable extension publish after CI passes
- [ ] The extension is published via `vsce publish` (without `--pre-release`)
- [ ] Version bumps are coordinated with the existing changesets workflow
- [ ] The Marketplace listing reflects the latest stable version

### US3: Extension Discoverability

**As a** VS Code user,
**I want** to find and install the Agency extension from the VS Code Marketplace,
**So that** I can set up AI agent plugin management without manual `.vsix` file handling.

**Acceptance Criteria**:
- [ ] Extension is listed on the VS Code Marketplace under publisher `generacy-ai`
- [ ] Extension ID is `generacy-ai.agency`
- [ ] Marketplace listing includes icon, description, and category metadata
- [ ] Extension can be installed via `ext install generacy-ai.agency` in VS Code

### US4: CI Gate for Extension Quality

**As a** maintainer,
**I want** the extension to only publish when all CI checks pass,
**So that** broken builds never reach the Marketplace.

**Acceptance Criteria**:
- [ ] Extension publish is gated on successful completion of lint, typecheck, test, and build
- [ ] A failing test or type error prevents extension publication
- [ ] The publish step uses the same built artifacts (no redundant rebuilds if possible)

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `ci.yml` includes a `publish-extension` job that runs `vsce publish --pre-release --no-dependencies` on pushes to `develop` | P1 | Already partially implemented in current `ci.yml` |
| FR-002 | `release.yml` includes a step to run `vsce publish --no-dependencies` for stable releases on `main` | P1 | Extends existing release workflow |
| FR-003 | The `VSCE_PAT` secret is configured in the repository with a valid Personal Access Token for the `generacy-ai` publisher | P1 | Requires generacy#244 to complete first |
| FR-004 | The `publish-extension` job depends on all CI jobs (`lint`, `typecheck`, `test`, `build`) passing | P1 | Already implemented via `needs: [lint, typecheck, test, build]` |
| FR-005 | Extension versioning uses changesets — `vsce publish` reads the version from `package.json` as bumped by changesets | P1 | Consistent with npm package versioning in this repo |
| FR-006 | The `--no-dependencies` flag is used for `vsce package` and `vsce publish` since dependencies are bundled via esbuild | P2 | Already configured in extension's `package.json` scripts |
| FR-007 | Preview publish uses concurrency group to prevent overlapping publishes | P2 | Existing `ci.yml` uses `cancel-in-progress: true` which is acceptable for the embedded job |
| FR-008 | Stable release publish does not use `cancel-in-progress` to avoid aborting a mid-publish | P2 | Consistent with existing `release.yml` concurrency strategy |
| FR-009 | Extension publish failures produce clear error output with the `VSCE_PAT` secret masked | P2 | GitHub Actions masks secrets by default |
| FR-010 | The `vscode:prepublish` script in `package.json` runs `pnpm run build` to ensure the extension is compiled before packaging | P2 | Already configured |

## Technical Design

### Existing Infrastructure

The CI/CD pipeline already has most of the required structure:

1. **`ci.yml`** — Contains a `publish-extension` job that triggers on `develop` pushes, gated behind all CI jobs. It runs `pnpm --filter @generacy-ai/agency-extension publish --pre-release`.

2. **`release.yml`** — Handles stable releases via `changesets/action@v1`. Currently publishes npm packages but does not publish the VS Code extension.

3. **Extension `package.json`** — Already defines `publish` script as `vsce publish --no-dependencies` and `vscode:prepublish` as `pnpm run build`.

### Required Changes

| Area | Change | Rationale |
|------|--------|-----------|
| `release.yml` | Add a step after changesets publish to run `pnpm --filter @generacy-ai/agency-extension publish` | Stable extension releases need to publish to Marketplace on `main` merges |
| `release.yml` | Pass `VSCE_PAT` secret to the extension publish step | Authentication for Marketplace upload |
| Repository secrets | Add `VSCE_PAT` with a PAT scoped to the `generacy-ai` publisher | Required for `vsce` authentication |
| Publisher registration | Register `generacy-ai` on the VS Code Marketplace via Azure DevOps | Prerequisite — tracked by generacy#244 |

### Version Strategy

- **Preview**: The existing `ci.yml` job publishes on every `develop` push. VS Code Marketplace treats `--pre-release` versions as a separate channel — users opt in via "Switch to Pre-Release Version".
- **Stable**: The `release.yml` workflow publishes after changesets bumps the version in `package.json`. The version number in `package.json` is the source of truth.
- **Version format**: VS Code requires `major.minor.patch` semver. Changesets handles this. Pre-release publishes use the same version number but are flagged as pre-release on the Marketplace.

### Secret Management

| Secret | Purpose | Scope |
|--------|---------|-------|
| `VSCE_PAT` | Personal Access Token for VS Code Marketplace publishing | Repository secret, used in `ci.yml` and `release.yml` |

The PAT must be created in Azure DevOps with the **Marketplace (Manage)** scope for the `generacy-ai` publisher.

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Extension listed on VS Code Marketplace | Published and installable | Search for `generacy-ai.agency` on Marketplace |
| SC-002 | Preview auto-publish on `develop` merge | Every successful CI run on `develop` publishes pre-release | Check GitHub Actions logs and Marketplace version history |
| SC-003 | Stable auto-publish on `main` merge | Every changesets release publishes stable version | Check GitHub Actions logs and Marketplace version history |
| SC-004 | CI gate effectiveness | Zero broken publishes reach Marketplace | No publish runs when any CI job fails |
| SC-005 | Publish latency | < 5 minutes from CI completion to Marketplace availability | GitHub Actions workflow duration |

## Assumptions

- The `generacy-ai` publisher will be registered on the VS Code Marketplace before this feature is implemented (generacy#244)
- The `VSCE_PAT` secret will be provisioned with sufficient permissions (Marketplace Manage scope)
- The Agency VS Code extension MVP (agency#294) will be merged and functional before publishing is enabled
- The extension uses esbuild bundling, so `--no-dependencies` is correct for `vsce` (no need to bundle `node_modules`)
- VS Code Marketplace accepts pre-release publishes at the same version as stable (they are tracked as separate channels)
- The existing changesets versioning workflow is the source of truth for version numbers

## Out of Scope

- **Marketplace publisher registration** — Handled by generacy#244, not this spec
- **Extension feature development** — Handled by agency#294 and subsequent feature issues
- **Automated version bumping outside changesets** — We use changesets, not custom version scripts
- **Open VSX Registry publishing** — Only VS Code Marketplace is targeted initially
- **Signing or attestation of `.vsix` packages** — Not required for initial Marketplace presence
- **Marketplace badge or README generation** — Extension metadata is already defined in `package.json`
- **Rollback automation** — If a bad version is published, it will be unpublished manually via `vsce`
- **Matrix testing across VS Code versions** — Single `vscode:^1.85.0` engine target is sufficient for now
- **Nightly or scheduled builds** — Only event-driven publishing (merge to `develop`/`main`)

---

*Generated by speckit*
