# Feature Specification: Set up CI/CD and npm publishing for @generacy-ai/agency packages

Configure automated CI and npm publishing for the agency monorepo's @generacy-ai scoped packages.

**Branch**: `295-set-up-ci-cd` | **Date**: 2026-02-25 | **Status**: Draft

---

## Summary

The agency monorepo currently has no CI/CD infrastructure. This feature adds three GitHub Actions workflows (CI, preview publish, stable release), configures changesets for version management, and updates all publishable packages with correct `publishConfig`. The goal is a fully automated pipeline: CI validates every PR, preview versions publish on merge to `develop`, and stable releases publish via a changesets-managed "Version Packages" PR on `main`.

### Current State

- **9 packages** exist under `packages/`, all at version `0.0.0`
- **8 are npm-publishable** (`@generacy-ai/*` scope); 1 is a Claude plugin (not publishable)
- **No GitHub workflows** exist (`.github/workflows/` directory is absent)
- **Changesets CLI** is already a devDependency (`@changesets/cli@^2.28.1`)
- **Changesets config** exists at `.changeset/config.json` but has `baseBranch: "main"` (needs to be `"develop"`)
- **No `publishConfig`** on any package
- **`@generacy-ai/agency`** depends on `@generacy-ai/latency` via local filesystem link (`link:/workspaces/latency/packages/latency`)
- **Build tooling** uses Turborepo with `pnpm` workspaces

### Publishable Packages

| Package | Current Version | External Dependencies |
|---------|----------------|----------------------|
| `@generacy-ai/agency` | 0.0.0 | `@generacy-ai/latency` (local link) |
| `@generacy-ai/agency-extension` | 0.0.0 | — (VS Code extension, published via VSCE separately) |
| `@generacy-ai/agency-plugin-docker` | 0.0.0 | peer: `@generacy-ai/agency` |
| `@generacy-ai/agency-plugin-firebase` | 0.0.0 | peer: `@generacy-ai/agency` |
| `@generacy-ai/agency-plugin-git` | 0.0.0 | peer: `@generacy-ai/agency` |
| `@generacy-ai/agency-plugin-humancy` | 0.0.0 | peer: `@generacy-ai/agency` |
| `@generacy-ai/agency-plugin-npm` | 0.0.0 | peer: `@generacy-ai/agency` |
| `@generacy-ai/agency-plugin-spec-kit` | 0.0.0 | peer: `@generacy-ai/agency` |

> **Note**: `@generacy-ai/agency-extension` is a VS Code extension published via VSCE, not npm. It should be excluded from changesets/npm publishing and handled separately if needed.

---

## User Stories

### US1: Automated CI on Pull Requests

**As a** developer contributing to the agency repo,
**I want** CI to automatically run lint, typecheck, tests, and build on every PR,
**So that** I get fast feedback on code quality before merging.

**Acceptance Criteria**:
- [ ] CI workflow triggers on PRs targeting `develop` and `main`
- [ ] CI workflow also triggers on pushes to `develop` and `main`
- [ ] Workflow runs `pnpm install --frozen-lockfile` (no lockfile mutations)
- [ ] Workflow runs lint, typecheck, test, and build via Turborepo
- [ ] Workflow uses Node 20 and pnpm 9
- [ ] CI failure blocks PR merge (via branch protection)

### US2: Preview Versions on Develop

**As a** developer or downstream consumer,
**I want** preview versions to publish automatically when changesets merge to `develop`,
**So that** I can test unreleased changes without waiting for a stable release.

**Acceptance Criteria**:
- [ ] On push to `develop`, workflow checks for `.changeset/*.md` files
- [ ] If changesets exist, publishes snapshot versions with `@preview` dist-tag
- [ ] Version format: `X.Y.Z-preview.YYYYMMDDHHMMSS` (datetime-based snapshot)
- [ ] If no changesets exist, workflow exits cleanly without publishing
- [ ] Build and test pass before any publish attempt
- [ ] `@generacy-ai/latency` dependencies are verified as available on npm before publishing

### US3: Stable Releases via Changesets

**As a** maintainer,
**I want** stable releases to be managed through changesets with an automated "Version Packages" PR,
**So that** releases are predictable, documented, and require explicit approval.

**Acceptance Criteria**:
- [ ] On push to `main`, the changesets action creates/updates a "Version Packages" PR
- [ ] The PR contains version bumps and CHANGELOG updates based on accumulated changesets
- [ ] Merging the "Version Packages" PR triggers npm publish with `@latest` dist-tag
- [ ] All packages publish with `--access public`
- [ ] Re-running the workflow on already-published versions is a no-op (idempotent)

### US4: Changeset-Driven Version Management

**As a** developer,
**I want** to add changeset files in my PRs to describe what changed,
**So that** version bumps and changelogs are generated automatically.

**Acceptance Criteria**:
- [ ] `@changesets/cli` is available (already installed as devDependency)
- [ ] `.changeset/config.json` has `baseBranch: "develop"` and `access: "public"`
- [ ] Developers can run `pnpm changeset` to create changeset files
- [ ] Changeset files are committed alongside code changes in PRs

### US5: Branch Protection

**As a** maintainer,
**I want** the `main` branch to require PRs and passing CI checks,
**So that** only validated code reaches the stable release branch.

**Acceptance Criteria**:
- [ ] `main` requires a pull request for all changes (no direct pushes)
- [ ] `main` requires CI status checks to pass (build, test, lint)
- [ ] `main` is synced to match current `develop` as part of initial setup

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Create `.github/workflows/ci.yml` that runs lint, typecheck, test, and build on PRs and pushes to `develop`/`main` | P1 | Uses `pnpm install --frozen-lockfile`, Node 20, pnpm 9 |
| FR-002 | CI workflow uses Turborepo for task orchestration (`pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`) | P1 | Leverages existing turbo.json config |
| FR-003 | Create `.github/workflows/publish-preview.yml` for snapshot publishes on `develop` push | P1 | Uses `@changesets/cli` snapshot mode with `@preview` dist-tag |
| FR-004 | Preview workflow checks for `.changeset/*.md` presence before publishing | P1 | Prevents noise from docs-only or changeset-free merges |
| FR-005 | Preview version format: `X.Y.Z-preview.YYYYMMDDHHMMSS` | P1 | Achieved via `changesets version --snapshot preview` |
| FR-006 | Create `.github/workflows/release.yml` using `changesets/action` on `main` push | P1 | Creates "Version Packages" PR; merging PR triggers publish |
| FR-007 | All publishable packages include `"publishConfig": { "access": "public" }` | P1 | 7 plugin/core packages (exclude VS Code extension and Claude plugin) |
| FR-008 | Update `.changeset/config.json` to set `baseBranch: "develop"` | P1 | Currently set to "main", must match development branch |
| FR-009 | Verify `@generacy-ai/latency` dependency availability on npm before publishing | P1 | `@generacy-ai/agency` has a local link dependency that must resolve from npm at publish time |
| FR-010 | Replace local `link:` dependency in `@generacy-ai/agency` with a valid npm version specifier | P1 | Current `link:/workspaces/latency/packages/latency` won't resolve for consumers |
| FR-011 | Workflows use `NPM_TOKEN` secret for authentication with npm registry | P1 | Must be configured as GitHub org-level secret |
| FR-012 | Publishing is idempotent — re-running skips already-published versions | P2 | Changesets handles this natively; `npm publish` returns 0 if version exists |
| FR-013 | Configure branch protection rules on `main` (require PR, require CI checks) | P2 | Manual GitHub settings or via `gh api` |
| FR-014 | Sync `main` to match `develop` before enabling the release workflow | P2 | One-time operation before enabling release workflow |
| FR-015 | Exclude `@generacy-ai/agency-extension` from changesets npm publishing | P2 | VS Code extension uses VSCE, not npm publish |
| FR-016 | Exclude `claude-plugin-agency-spec-kit` from changesets | P2 | Not an npm package; is a Claude plugin |

---

## Technical Design

### Workflow 1: CI (`.github/workflows/ci.yml`)

```
Triggers: pull_request (develop, main), push (develop, main)
Steps:
  1. Checkout code
  2. Setup pnpm 9 (with caching)
  3. Setup Node 20
  4. pnpm install --frozen-lockfile
  5. pnpm lint
  6. pnpm typecheck
  7. pnpm test
  8. pnpm build
```

**Key decisions**:
- Run lint/typecheck/test/build as separate Turbo tasks (not a single `pnpm ci` script) for granular failure reporting
- Use `pnpm/action-setup` and `actions/setup-node` with built-in pnpm caching
- CI should complete in under 5 minutes for a good developer experience

### Workflow 2: Preview Publish (`.github/workflows/publish-preview.yml`)

```
Triggers: push to develop
Steps:
  1. Checkout code
  2. Setup pnpm + Node
  3. pnpm install --frozen-lockfile
  4. pnpm build
  5. pnpm test
  6. Check for .changeset/*.md files (exit if none)
  7. Verify @generacy-ai/latency is available on npm
  8. Configure npm auth (NPM_TOKEN)
  9. pnpm changeset version --snapshot preview
  10. pnpm changeset publish --tag preview
```

**Key decisions**:
- The changeset check (`ls .changeset/*.md 2>/dev/null | grep -v README.md`) prevents empty publishes
- Snapshot versions use datetime format automatically via changesets
- Build and test run before publish to ensure quality
- Dependency verification step uses `npm view @generacy-ai/latency` to confirm availability

### Workflow 3: Stable Release (`.github/workflows/release.yml`)

```
Triggers: push to main
Steps:
  1. Checkout code
  2. Setup pnpm + Node
  3. pnpm install --frozen-lockfile
  4. pnpm build
  5. pnpm test
  6. Run changesets/action:
     - If changesets exist: creates/updates "Version Packages" PR
     - If no changesets (Version Packages PR was just merged): publish to npm
  7. Verify @generacy-ai/latency before publish
  8. pnpm changeset publish
```

**Key decisions**:
- Uses the official `changesets/action` GitHub Action which handles the PR creation and publish orchestration
- The action detects whether to create a PR or publish based on changeset presence
- Publishing only happens when the "Version Packages" PR is merged (changesets consumed)

### Changesets Configuration Update

`.changeset/config.json` changes:
- `baseBranch`: `"main"` → `"develop"`
- Add `ignore`: `["claude-plugin-agency-spec-kit"]` (not publishable)

### Package Configuration Changes

Add to each publishable `package.json`:
```json
"publishConfig": {
  "access": "public"
}
```

**Packages to update** (7 packages):
- `@generacy-ai/agency`
- `@generacy-ai/agency-plugin-docker`
- `@generacy-ai/agency-plugin-firebase`
- `@generacy-ai/agency-plugin-git`
- `@generacy-ai/agency-plugin-humancy`
- `@generacy-ai/agency-plugin-npm`
- `@generacy-ai/agency-plugin-spec-kit`

**Packages to exclude**:
- `@generacy-ai/agency-extension` — VS Code extension, published via VSCE
- `claude-plugin-agency-spec-kit` — Claude plugin, not an npm package

### Dependency Resolution: `@generacy-ai/latency`

The `@generacy-ai/agency` package currently uses `"@generacy-ai/latency": "link:/workspaces/latency/packages/latency"`. This local link works for development but will fail for npm consumers. This must be updated to a proper npm version specifier (e.g., `"workspace:*"` converted by pnpm, or a specific version like `"^0.1.0"`) once `@generacy-ai/latency` is published to npm.

The publish workflows must verify the latency package is available before attempting to publish agency packages.

---

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | CI runs on every PR | 100% of PRs to develop/main trigger CI | GitHub Actions workflow run history |
| SC-002 | CI provides clear pass/fail signal | All 4 checks (lint, typecheck, test, build) report individually | GitHub check status on PRs |
| SC-003 | Preview versions publish on develop merge with changesets | Within 10 minutes of merge | npm registry `@preview` dist-tag presence |
| SC-004 | No spurious preview publishes | 0 publishes when no changeset files are present | Workflow run logs show early exit |
| SC-005 | Stable release workflow creates Version Packages PR | PR created/updated on every push to main with pending changesets | GitHub PR history |
| SC-006 | Stable versions publish on Version Packages PR merge | All packages with changesets publish to `@latest` | npm registry version check |
| SC-007 | Publishing is idempotent | Re-running publish workflow succeeds without errors | Workflow re-run completes successfully |
| SC-008 | Main branch is protected | Direct pushes blocked, CI required | GitHub branch protection settings |

---

## Assumptions

- `NPM_TOKEN` will be configured as a GitHub Actions secret at the organization level before the publish workflows are used
- The `@generacy-ai/latency` package will be published to npm before agency packages attempt to publish (latency repo CI/CD is set up separately)
- The `@generacy-ai/agency-extension` VS Code extension will have its own separate publish mechanism (VSCE) and is excluded from this npm publishing pipeline
- `claude-plugin-agency-spec-kit` is not an npm package and is excluded from all publishing
- All packages start at version `0.0.0`; the first changeset will bump them to their initial release version
- The `develop` branch is the primary development branch; `main` is the stable release branch
- Turborepo caching and pnpm store caching will keep CI times reasonable
- The monorepo will continue using pnpm workspaces with `workspace:*` protocol for internal dependencies

---

## Out of Scope

- **VS Code extension publishing** — `@generacy-ai/agency-extension` uses VSCE and has a different publish pipeline
- **Claude plugin distribution** — `claude-plugin-agency-spec-kit` is not an npm package
- **Latency repo CI/CD** — The `@generacy-ai/latency` packages have their own repo and CI/CD setup
- **Generacy repo CI/CD** — Downstream `@generacy-ai/generacy` packages are out of scope
- **npm org/scope creation** — Assumes `@generacy-ai` scope already exists on npm
- **GitHub Actions billing/runners** — Assumes the org has sufficient Actions minutes
- **Monorepo migration or restructuring** — Package structure remains as-is
- **Automated changelog formatting** — Uses default changesets changelog format
- **Release notes on GitHub Releases** — Only npm publishing; GitHub Releases are optional follow-up
- **Canary/nightly builds** — Only preview (snapshot on develop) and stable (on main) are in scope
- **Rollback procedures** — npm unpublish/deprecate workflows are not included
- **Code signing or provenance** — npm provenance attestation is not included in this iteration

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `@generacy-ai/latency` not published when agency tries to publish | Publish fails; consumers can't install | Medium | Dependency verification step in workflows; clear error message |
| `NPM_TOKEN` not configured or expired | All publishes fail | Low | Document secret setup; workflows fail fast with clear error |
| `main` branch out of sync with `develop` | Changesets action produces unexpected results | Medium | One-time sync of main to develop before enabling release workflow |
| Local `link:` dependency on latency breaks npm install for consumers | Published package is unusable | High | Must replace `link:` with proper npm version before first publish |
| Changeset not added to PR | No version bump or publish on merge | Medium | Consider adding a CI check or bot reminder (future enhancement) |

---

## Implementation Tasks

1. **Update `.changeset/config.json`** — Set `baseBranch` to `"develop"`, add `claude-plugin-agency-spec-kit` to `ignore` list
2. **Add `publishConfig` to 7 publishable packages** — Add `{ "access": "public" }` to each package.json
3. **Create `.github/workflows/ci.yml`** — Lint, typecheck, test, build on PRs and pushes
4. **Create `.github/workflows/publish-preview.yml`** — Snapshot publish on develop with changeset detection
5. **Create `.github/workflows/release.yml`** — Changesets action for stable releases on main
6. **Address `@generacy-ai/latency` link dependency** — Update to npm version specifier or document the dependency chain requirement
7. **Sync `main` branch to `develop`** — One-time operation before enabling release workflow
8. **Configure branch protection on `main`** — Require PR and CI status checks
9. **Verify `NPM_TOKEN` secret exists** — Confirm org-level secret is configured

---

*Generated by speckit*
